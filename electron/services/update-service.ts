/**
 * 自动更新服务
 *
 * 负责检查、下载和安装应用更新
 * 使用 electron-updater 实现增量更新（blockmap）
 */

import { BrowserWindow, ipcMain, app, shell } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import { createModuleLogger } from '../utils/logger'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

const logger = createModuleLogger('update-service')

/** 更新状态 */
export type UpdateStatus =
  | 'idle'           // 空闲
  | 'checking'       // 检查中
  | 'available'      // 有可用更新
  | 'not-available'  // 已是最新
  | 'downloading'    // 下载中
  | 'downloaded'     // 下载完成
  | 'installing'     // 安装中
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
  private isInstalling = false  // 安装中标志，忽略此期间的错误

  constructor() {
    this.autoUpdater = getAutoUpdater()
    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
    }
    this.configureAutoUpdater()
    this.checkPendingUpdate()  // 检查是否有待安装的更新
  }

  /**
   * 检查是否有待安装的更新（启动时恢复状态）
   */
  private checkPendingUpdate(): void {
    try {
      const homeDir = app.getPath('home')
      const pendingPath = path.join(homeDir, 'Library', 'Caches', 'speechtide-updater', 'pending')
      const infoPath = path.join(pendingPath, 'update-info.json')

      if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'))
        const zipFile = info.fileName
        const zipPath = path.join(pendingPath, zipFile)

        if (fs.existsSync(zipPath)) {
          // 从文件名提取版本号，如 SpeechTide-1.3.10-mac-arm64.zip
          const match = zipFile.match(/SpeechTide-([0-9.]+)-/)
          const version = match ? match[1] : 'unknown'

          this.state = {
            ...this.state,
            status: 'downloaded',
            availableVersion: version,
          }
          logger.info('检测到待安装的更新', { version, zipPath })
        }
      }
    } catch (e) {
      logger.warn('检查待安装更新失败', { error: e instanceof Error ? e.message : String(e) })
    }
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
    // 禁用退出时自动安装（我们使用自定义安装脚本，不依赖 Squirrel.Mac）
    this.autoUpdater.autoInstallOnAppQuit = false
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
      // 以下情况忽略错误：
      // 1. isInstalling: 自定义安装器接管后，quitAndInstall 的错误可忽略
      // 2. downloaded: 下载完成后 autoUpdater 可能继续验证/处理，失败不应覆盖 "已就绪" 状态
      if (this.isInstalling || this.state.status === 'downloaded') {
        logger.warn('忽略 autoUpdater 错误（状态保护）', {
          error: error.message,
          status: this.state.status,
          isInstalling: this.isInstalling,
        })
        return
      }
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
      // 设置旧文件路径，启用差分下载
      this.setupDifferentialDownload()

      await this.autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(error instanceof Error ? error : new Error(message), { context: 'downloadUpdate' })
      return { success: false, error: message }
    }
  }

  /**
   * 设置差分下载环境变量
   * electron-updater 通过 BLOCK_MAP_OLD_FILE 环境变量查找旧文件进行差分下载
   * blockmap 数据嵌入在 ZIP 文件尾部，无需单独的 .blockmap 文件
   */
  private setupDifferentialDownload(): void {
    try {
      const homeDir = app.getPath('home')
      const cacheDir = path.join(homeDir, 'Library', 'Caches', 'speechtide-updater')

      if (!fs.existsSync(cacheDir)) {
        logger.info('缓存目录不存在，将进行全量下载')
        return
      }

      const files = fs.readdirSync(cacheDir)
      const zipFile = files.find(f => f.endsWith('.zip') && f.startsWith('SpeechTide-'))

      if (zipFile) {
        const oldFilePath = path.join(cacheDir, zipFile)
        process.env.BLOCK_MAP_OLD_FILE = oldFilePath
        logger.info('已设置差分下载旧文件', { oldFile: zipFile })
      } else {
        logger.info('未找到旧版本文件，将进行全量下载')
      }
    } catch (e) {
      logger.warn('设置差分下载失败', { error: e instanceof Error ? e.message : String(e) })
    }
  }

  /**
   * 退出并安装（自定义实现，绕过 Squirrel.Mac）
   */
  quitAndInstall(): void {
    logger.info('准备退出并安装更新...')

    // 设置安装中状态，防止错误事件干扰
    this.isInstalling = true
    this.updateState({ status: 'installing' })

    // 未签名应用直接使用自定义安装，跳过必然失败的标准方式
    this.customInstall()
  }

  /**
   * 自定义安装（用于未签名应用）
   */
  private customInstall(): void {
    // 正确的缓存路径: ~/Library/Caches/speechtide-updater/pending
    const homeDir = app.getPath('home')
    const cachePath = path.join(homeDir, 'Library', 'Caches', 'speechtide-updater', 'pending')
    const cacheParentPath = path.dirname(cachePath)
    const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '')
    const version = this.state.availableVersion || 'unknown'

    // 查找下载的 ZIP 文件
    let zipPath = ''
    let zipFileName = ''
    try {
      const files = fs.readdirSync(cachePath)
      const zipFile = files.find(f => f.endsWith('.zip'))
      if (zipFile) {
        zipPath = path.join(cachePath, zipFile)
        zipFileName = zipFile
      }
    } catch (e) {
      logger.error(e instanceof Error ? e : new Error(String(e)), { context: 'customInstall:findZip' })
    }

    if (!zipPath || !fs.existsSync(zipPath)) {
      logger.error(new Error('找不到更新文件'), { cachePath })
      this.updateState({ status: 'error', error: '找不到更新文件，请重新下载' })
      return
    }

    logger.info('使用自定义安装', { zipPath, appPath, version })

    // 创建安装脚本
    const script = `#!/bin/bash
# SpeechTide 更新安装脚本
sleep 1

# 解压更新
unzip -o -q "${zipPath}" -d /tmp/speechtide-update/

# 查找解压后的 .app
APP_FILE=$(find /tmp/speechtide-update -name "*.app" -maxdepth 1 -type d | head -1)

if [ -z "$APP_FILE" ]; then
  echo "错误：找不到应用文件"
  exit 1
fi

# 删除旧应用
rm -rf "${appPath}"

# 移动新应用
mv "$APP_FILE" "${appPath}"

# 移除隔离属性（绕过 Gatekeeper）
xattr -cr "${appPath}" 2>/dev/null || true

# 清理临时文件
rm -rf /tmp/speechtide-update

# ====== 差分下载文件保留 ======
# 保留当前版本的 ZIP 文件供下次差分下载使用
# blockmap 数据嵌入在 ZIP 文件尾部，无需单独保存

# 清理旧的缓存文件（只保留最新版本）
find "${cacheParentPath}" -maxdepth 1 -name "*.zip" -type f -delete 2>/dev/null || true

# 保留当前版本的 zip（原始文件名）
mv "${zipPath}" "${cacheParentPath}/${zipFileName}" 2>/dev/null || true

# 清理 pending 文件夹
rm -rf "${cachePath}"

# 重新启动应用
open "${appPath}"
`

    const scriptPath = path.join(app.getPath('temp'), 'speechtide-update.sh')
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })

    // 执行安装脚本（后台运行）
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    logger.info('安装脚本已启动，准备退出应用')

    // 退出应用
    app.removeAllListeners('window-all-closed')
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      win.removeAllListeners('close')
      win.destroy()
    })
    app.quit()
  }

  /**
   * 启动定时检查
   * @param intervalMs 检查间隔（毫秒），默认 1 小时
   */
  startScheduledCheck(intervalMs: number = 60 * 60 * 1000): void {
    this.stopScheduledCheck()

    // 启动时延迟检查，避免启动时网络阻塞
    setTimeout(() => {
      // 如果已下载或正在安装，不要检查（避免干扰）
      if (this.state.status === 'downloaded' || this.state.status === 'installing') {
        logger.info('已有下载完成的更新，跳过启动检查')
        return
      }
      this.checkForUpdates().catch((e) => logger.error(e))
    }, 5000)

    // 定时检查
    this.checkInterval = setInterval(() => {
      // 如果已下载或正在安装，不要检查
      if (this.state.status === 'downloaded' || this.state.status === 'installing') {
        return
      }
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
