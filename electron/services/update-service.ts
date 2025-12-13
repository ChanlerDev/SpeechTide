/**
 * 自动更新服务
 *
 * 负责检查、下载和安装应用更新
 * 使用 electron-updater 实现增量更新（blockmap）
 */

import { BrowserWindow, ipcMain, app, shell } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('update-service')

/** 更新状态 */
export type UpdateStatus =
  | 'idle'           // 空闲
  | 'checking'       // 检查中
  | 'available'      // 有可用更新
  | 'not-available'  // 已是最新
  | 'downloading'    // 下载中
  | 'downloaded'     // 下载完成
  | 'error'          // 错误

/** 更新进度 */
export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

/** 更新状态信息 */
export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  releaseNotes?: string
  progress?: UpdateProgress
  error?: string
}

/** 状态变更回调 */
export type UpdateStateCallback = (state: UpdateState) => void

/**
 * ESM 兼容的 autoUpdater 获取方式
 * electron-updater 是 CommonJS 模块，需要特殊处理
 */
function getAutoUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater
  return autoUpdater
}

const GITHUB_RELEASES_URL = 'https://github.com/ChanlerDev/speechtide/releases'

/**
 * 更新服务类
 */
export class UpdateService {
  private window: BrowserWindow | null = null
  private autoUpdater: AppUpdater
  private state: UpdateState
  private checkInterval: NodeJS.Timeout | null = null
  private stateCallback: UpdateStateCallback | null = null

  constructor() {
    this.autoUpdater = getAutoUpdater()
    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
    }
    this.configureAutoUpdater()
  }

  /**
   * 初始化服务
   */
  initialize(window: BrowserWindow): void {
    this.window = window
    this.registerIPCHandlers()
    logger.info('更新服务已初始化', { version: this.state.currentVersion })
  }

  /**
   * 设置状态变更回调（用于托盘等外部组件）
   */
  setStateCallback(callback: UpdateStateCallback): void {
    this.stateCallback = callback
  }

  /**
   * 获取当前状态
   */
  getState(): UpdateState {
    return { ...this.state }
  }

  /**
   * 配置 autoUpdater
   */
  private configureAutoUpdater(): void {
    // 不自动下载，让用户决定
    this.autoUpdater.autoDownload = false
    // 退出时自动安装已下载的更新
    this.autoUpdater.autoInstallOnAppQuit = true
    // 不允许降级
    this.autoUpdater.allowDowngrade = false

    // 注册事件监听
    this.autoUpdater.on('checking-for-update', () => {
      this.updateState({ status: 'checking' })
      logger.info('正在检查更新...')
    })

    this.autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateState({
        status: 'available',
        availableVersion: info.version,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : undefined,
      })
      logger.info('发现新版本', { version: info.version })
    })

    this.autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.updateState({ status: 'not-available' })
      logger.info('当前已是最新版本', { version: info.version })
    })

    this.autoUpdater.on('download-progress', (progress) => {
      this.updateState({
        status: 'downloading',
        progress: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          total: progress.total,
          transferred: progress.transferred,
        },
      })
      this.sendToRenderer('update:progress', progress)
    })

    this.autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateState({
        status: 'downloaded',
        availableVersion: info.version,
        progress: undefined,
      })
      logger.info('更新已下载完成', { version: info.version })
    })

    this.autoUpdater.on('error', (error) => {
      this.updateState({
        status: 'error',
        error: error.message,
      })
      logger.error(error, { context: 'autoUpdater' })
    })
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIPCHandlers(): void {
    // 获取更新状态
    ipcMain.handle('update:getState', () => {
      return this.state
    })

    // 检查更新
    ipcMain.handle('update:check', async () => {
      return this.checkForUpdates()
    })

    // 下载更新
    ipcMain.handle('update:download', async () => {
      return this.downloadUpdate()
    })

    // 立即安装（重启应用）
    ipcMain.handle('update:install', () => {
      this.quitAndInstall()
    })

    // 打开 GitHub Releases 页面
    ipcMain.handle('update:openReleasePage', () => {
      shell.openExternal(GITHUB_RELEASES_URL)
    })

    // 获取当前版本
    ipcMain.handle('update:getVersion', () => {
      return app.getVersion()
    })
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string; error?: string }> {
    try {
      const result = await this.autoUpdater.checkForUpdates()
      if (result?.updateInfo) {
        const hasUpdate = result.updateInfo.version !== app.getVersion()
        return {
          hasUpdate,
          version: result.updateInfo.version,
        }
      }
      return { hasUpdate: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(error instanceof Error ? error : new Error(message), { context: 'checkForUpdates' })
      return { hasUpdate: false, error: message }
    }
  }

  /**
   * 下载更新
   */
  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(error instanceof Error ? error : new Error(message), { context: 'downloadUpdate' })
      return { success: false, error: message }
    }
  }

  /**
   * 退出并安装
   */
  quitAndInstall(): void {
    logger.info('准备退出并安装更新...')

    try {
      // 移除所有窗口关闭监听，允许真正退出
      app.removeAllListeners('window-all-closed')
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.removeAllListeners('close')
        win.close()
      })

      // isSilent=false: 显示安装进度
      // isForceRunAfter=true: 安装后强制重启应用
      this.autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'quitAndInstall' })
      // 如果 quitAndInstall 失败，尝试直接退出让用户手动重启
      app.quit()
    }
  }

  /**
   * 启动定时检查
   * @param intervalMs 检查间隔（毫秒），默认 1 小时
   */
  startScheduledCheck(intervalMs: number = 60 * 60 * 1000): void {
    this.stopScheduledCheck()

    // 启动时延迟检查，避免启动时网络阻塞
    setTimeout(() => {
      this.checkForUpdates().catch((e) => logger.error(e))
    }, 5000)

    // 定时检查
    this.checkInterval = setInterval(() => {
      this.checkForUpdates().catch((e) => logger.error(e))
    }, intervalMs)

    logger.info(`定时检查已启动，间隔: ${intervalMs / 1000 / 60} 分钟`)
  }

  /**
   * 停止定时检查
   */
  stopScheduledCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  /**
   * 更新状态
   */
  private updateState(partial: Partial<UpdateState>): void {
    this.state = { ...this.state, ...partial }
    this.sendToRenderer('update:state', this.state)
    // 通知外部回调（托盘等）
    this.stateCallback?.(this.state)
  }

  /**
   * 发送消息到渲染进程
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stopScheduledCheck()

    const handlers = [
      'update:getState',
      'update:check',
      'update:download',
      'update:install',
      'update:openReleasePage',
      'update:getVersion',
    ]
    for (const handler of handlers) {
      ipcMain.removeHandler(handler)
    }

    this.window = null
    this.stateCallback = null
    logger.info('更新服务已销毁')
  }
}

// 导出单例
export const updateService = new UpdateService()
