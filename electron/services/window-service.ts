/**
 * SpeechTide 窗口服务
 *
 * 负责管理应用窗口的创建、显示、隐藏等操作
 */

import { BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { WINDOW_CONFIG } from '../config/constants'

const isMac = process.platform === 'darwin'

export interface WindowServiceOptions {
  preloadPath: string
  isDev: boolean
  devServerUrl?: string
  rendererDist: string
  autoShowOnStart?: boolean
}

/**
 * 窗口服务类
 */
export class WindowService {
  private window: BrowserWindow | null = null
  private options: WindowServiceOptions
  private isQuitting = false

  constructor(options: WindowServiceOptions) {
    this.options = options
  }

  /**
   * 标记应用正在退出，允许窗口真正关闭
   */
  setQuitting(quitting: boolean): void {
    this.isQuitting = quitting
  }

  /**
   * 创建窗口
   */
  createWindow(): BrowserWindow {
    // 如果窗口已存在，先销毁它
    if (this.window) {
      this.window.destroy()
      this.window = null
    }

    // 检查 preload 文件是否存在
    const preloadExists = fs.existsSync(this.options.preloadPath)
    console.log('[WindowService] Preload 配置:', {
      path: this.options.preloadPath,
      exists: preloadExists,
    })
    if (!preloadExists) {
      console.error('[WindowService] ⚠️ Preload 文件不存在!')
    }

    const windowConfig = {
      ...WINDOW_CONFIG,
      show: false,
      frame: false,
      resizable: true,
      transparent: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      roundedCorners: true,
      vibrancy: (isMac ? 'under-window' : undefined) as 'under-window' | undefined,
      titleBarStyle: 'hidden' as const,
      webPreferences: {
        preload: this.options.preloadPath,
        devTools: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: false,
        allowRunningInsecureContent: true,
        experimentalFeatures: false,
      },
    }

    this.window = new BrowserWindow(windowConfig)

    this.setupWindowEvents()
    this.loadContent()

    return this.window
  }

  /**
   * 设置窗口事件
   */
  private setupWindowEvents(): void {
    if (!this.window) return

    // 拦截关闭事件，只隐藏不关闭（保持托盘运行）
    // 但如果正在退出应用，则允许真正关闭
    this.window.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault()
        this.window?.hide()
      }
    })

    this.window.webContents.on('did-finish-load', () => {
      // 窗口页面加载完成 - 不再默认打开 DevTools
      // 如需调试可通过菜单或快捷键手动打开
    })

    // 监听渲染进程的控制台输出
    this.window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelStr = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'LOG'
      console.log(`[Renderer ${levelStr}] ${message} (${sourceId}:${line})`)
    })

    this.window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[WindowService] 页面加载失败:', { errorCode, errorDescription, validatedURL })
    })

    this.window.webContents.on('render-process-gone', (_event, details) => {
      console.error('[WindowService] 渲染进程崩溃:', details)
    })
  }

  /**
   * 加载窗口内容
   */
  private loadContent(): void {
    if (!this.window) return

    if (this.options.isDev && this.options.devServerUrl) {
      this.window.loadURL(this.options.devServerUrl)
    } else {
      const indexPath = path.join(this.options.rendererDist, 'index.html')
      this.window.loadFile(indexPath)
    }

    // 根据设置决定是否自动显示窗口
    if (this.options.autoShowOnStart || this.options.isDev) {
      this.window.once('ready-to-show', () => {
        this.window?.show()
      })
    }
  }

  /**
   * 确保窗口存在
   */
  ensureWindow(): BrowserWindow {
    if (!this.window || this.window.isDestroyed()) {
      return this.createWindow()
    }
    return this.window
  }

  /**
   * 获取窗口实例
   */
  getWindow(): BrowserWindow | null {
    return this.window
  }

  /**
   * 切换窗口显示/隐藏
   */
  toggleWindow(forceShow?: boolean): void {
    this.ensureWindow()
    if (!this.window) return

    const shouldShow = forceShow ?? !this.window.isVisible()
    if (shouldShow) {
      this.window.show()
      this.window.focus()
    } else {
      this.window.hide()
    }
  }

  /**
   * 显示窗口
   */
  show(): void {
    this.toggleWindow(true)
  }

  /**
   * 隐藏窗口
   */
  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  /**
   * 窗口是否可见
   */
  isVisible(): boolean {
    return this.window?.isVisible() ?? false
  }

  /**
   * 向渲染进程发送消息
   */
  send(channel: string, ...args: unknown[]): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, ...args)
    }
  }

  /**
   * 销毁窗口（真正退出时调用）
   */
  destroy(): void {
    if (this.window) {
      // 移除 close 事件拦截，允许真正关闭
      this.window.removeAllListeners('close')
      this.window.destroy()
      this.window = null
    }
  }

}
