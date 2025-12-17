/**
 * SpeechTide 托盘服务
 *
 * 负责管理系统托盘图标和菜单
 * 支持根据应用状态切换图标
 */

import { Tray, Menu, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { SpeechFlowStatus, ShortcutConfig } from '../../shared/app-state'
import { STATUS_LABEL } from '../config/constants'
import { TRAY_ICONS, type TrayIconState } from '../assets/tray-icons'

const isMac = process.platform === 'darwin'

/** 状态到图标的映射 */
const STATUS_TO_ICON: Record<SpeechFlowStatus, TrayIconState> = {
  idle: 'idle',
  recording: 'recording',
  transcribing: 'transcribing',
  ready: 'idle',
  error: 'idle',
}

export interface TrayServiceOptions {
  publicPath: string
  rendererDist: string
}

export interface TrayMenuCallbacks {
  onToggleRecording: () => void
  onStopRecording: () => void
  onOpenPanel: () => void
  onQuit: () => void
  onDownloadUpdate?: () => void
}

/** 更新信息 */
export interface UpdateInfo {
  available: boolean
  version?: string
  downloaded?: boolean
  downloading?: boolean
  installing?: boolean
}

/**
 * 托盘服务类
 */
export class TrayService {
  private tray: Tray | null = null
  private options: TrayServiceOptions
  private callbacks: TrayMenuCallbacks | null = null
  private iconCache = new Map<TrayIconState, Electron.NativeImage>()
  private currentIconState: TrayIconState | null = null

  constructor(options: TrayServiceOptions) {
    this.options = options
  }

  /**
   * 创建托盘
   */
  createTray(callbacks: TrayMenuCallbacks): Tray {
    // 如果 Tray 已存在，先销毁它
    if (this.tray) {
      console.log('[TrayService] Tray 已存在，先销毁旧 Tray')
      this.tray.destroy()
      this.tray = null
    }

    this.callbacks = callbacks
    const trayIcon = this.loadTrayIcon()
    this.tray = new Tray(trayIcon)
    this.tray.setToolTip('SpeechTide')

    console.log('[TrayService] ✓ Tray 创建完成')
    return this.tray
  }

  /**
   * 加载托盘图标（根据状态，带缓存）
   */
  private loadTrayIcon(state: TrayIconState = 'idle'): Electron.NativeImage {
    // 检查缓存
    const cached = this.iconCache.get(state)
    if (cached) {
      return cached
    }

    const searchRoot = this.options.publicPath || this.options.rendererDist

    // 1. 尝试加载 PNG 文件（优先 @2x 版本）
    const pngCandidates = [
      path.join(searchRoot, `tray-${state}Template@2x.png`),
      path.join(searchRoot, `tray-${state}Template.png`),
    ]

    for (const candidate of pngCandidates) {
      if (fs.existsSync(candidate)) {
        const image = nativeImage.createFromPath(candidate)
        if (!image.isEmpty()) {
          image.setTemplateImage(isMac)
          this.iconCache.set(state, image)
          return image
        }
      }
    }

    // 2. 使用内嵌的 Data URL 图标
    const dataUrl = TRAY_ICONS[state]
    if (dataUrl) {
      const image = nativeImage.createFromDataURL(dataUrl)
      if (!image.isEmpty()) {
        image.setTemplateImage(isMac)
        this.iconCache.set(state, image)
        return image
      }
    }

    // 3. macOS 系统图标回退
    if (isMac) {
      const named = nativeImage.createFromNamedImage('NSTouchBarRecordStartTemplate', [-1])
      if (named && !named.isEmpty()) {
        named.setTemplateImage(true)
        this.iconCache.set(state, named)
        return named
      }
    }

    // 4. 最终回退：空图标
    console.warn('[TrayService] 无法加载托盘图标，使用空图标')
    return nativeImage.createEmpty()
  }

  /**
   * 更新托盘图标（根据状态，避免重复设置）
   */
  updateIcon(status: SpeechFlowStatus): void {
    if (!this.tray) return

    const iconState = STATUS_TO_ICON[status]
    // 跳过相同状态的图标更新
    if (this.currentIconState === iconState) return

    this.currentIconState = iconState
    const icon = this.loadTrayIcon(iconState)
    this.tray.setImage(icon)
  }

  /**
   * 刷新托盘菜单（同时更新图标）
   */
  refreshMenu(status: SpeechFlowStatus, shortcut: ShortcutConfig, updateInfo?: UpdateInfo): void {
    if (!this.tray || !this.callbacks) return

    // 更新图标
    this.updateIcon(status)

    // 构建菜单项
    const menuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: `状态：${STATUS_LABEL[status]}`,
        enabled: false,
      },
      {
        label: '开始转录',
        click: () => this.callbacks?.onToggleRecording(),
        enabled: status !== 'recording' && status !== 'transcribing',
      },
      {
        label: '结束转录',
        click: () => this.callbacks?.onStopRecording(),
        enabled: status === 'recording' || status === 'transcribing',
      },
      { type: 'separator' },
    ]

    // 有更新时显示更新菜单项
    if (updateInfo?.available && updateInfo.version) {
      const isBeta = updateInfo.version.includes('-beta')
      const betaTag = isBeta ? ' (BETA)' : ''
      let label: string
      if (updateInfo.installing) {
        label = `⏳ 正在安装 v${updateInfo.version}${betaTag}...`
      } else if (updateInfo.downloading) {
        label = `⬇️ 正在下载 v${updateInfo.version}${betaTag}...`
      } else if (updateInfo.downloaded) {
        label = `✅ v${updateInfo.version}${betaTag} 已就绪，点击安装`
      } else {
        label = `🔄 有新版本 v${updateInfo.version}${betaTag} 可用`
      }

      menuItems.push({
        label,
        click: () => this.callbacks?.onDownloadUpdate?.(),
        enabled: !updateInfo.downloading && !updateInfo.installing,
      })
      menuItems.push({ type: 'separator' })
    }

    menuItems.push(
      {
        label: '打开面板',
        click: () => this.callbacks?.onOpenPanel(),
      },
      { type: 'separator' },
      {
        label: `快捷键：${shortcut.accelerator} (${shortcut.mode === 'toggle' ? '点按' : '长按'})`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '退出 SpeechTide',
        click: () => this.callbacks?.onQuit(),
      }
    )

    const contextMenu = Menu.buildFromTemplate(menuItems)
    this.tray.setContextMenu(contextMenu)
  }

  /**
   * 设置托盘提示文字
   */
  setToolTip(tooltip: string): void {
    this.tray?.setToolTip(tooltip)
  }

  /**
   * 获取托盘实例
   */
  getTray(): Tray | null {
    return this.tray
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
    this.callbacks = null
  }
}
