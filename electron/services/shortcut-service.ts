/**
 * SpeechTide 快捷键服务
 *
 * 负责管理全局快捷键的注册和处理
 * 支持点按模式（toggle）和长按模式（hold）
 * 
 * 注意：当前版本仅使用 Electron globalShortcut API。
 * 长按模式使用定时器模拟释放检测。
 */

import { globalShortcut } from 'electron'
import type { ShortcutConfig } from '../../shared/app-state'
import { APP_CONSTANTS } from '../config/constants'

export interface ShortcutCallbacks {
  onTrigger: () => void
  onRelease?: () => void
}

/**
 * 单键快捷键名称列表（需要特殊处理）
 */
const SINGLE_KEY_NAMES = [
  'rightcommand', 'rightcmd', 'leftcommand', 'leftcmd',
  'rightcontrol', 'rightctrl', 'leftcontrol', 'leftctrl',
  'rightalt', 'rightoption', 'leftalt', 'leftoption',
  'rightshift', 'leftshift',
]

/**
 * 将单键快捷键转换为可用的组合键
 */
function convertToFallbackShortcut(accelerator: string): string {
  const normalized = accelerator.toLowerCase().replace(/\s+/g, '')
  
  // 单键快捷键目前不支持，转换为默认组合键
  if (SINGLE_KEY_NAMES.includes(normalized)) {
    console.warn(`[ShortcutService] 单键快捷键 "${accelerator}" 不支持，使用默认快捷键 Cmd+Shift+Space`)
    return 'CommandOrControl+Shift+Space'
  }
  
  return accelerator
}

/**
 * 快捷键服务类
 */
export class ShortcutService {
  private shortcutSettings: ShortcutConfig
  private callbacks: ShortcutCallbacks | null = null
  private shortcutPressed = false
  private shortcutPressTimer: NodeJS.Timeout | null = null
  private maxDurationMs: number
  private isHolding = false  // 长按模式下的按住状态
  private effectiveAccelerator: string  // 实际使用的快捷键

  constructor(shortcutSettings: ShortcutConfig, maxDurationMs: number) {
    this.shortcutSettings = shortcutSettings
    this.maxDurationMs = maxDurationMs
    this.effectiveAccelerator = convertToFallbackShortcut(shortcutSettings.accelerator)
  }

  /**
   * 注册全局快捷键
   */
  register(callbacks: ShortcutCallbacks): boolean {
    this.callbacks = callbacks

    // 取消之前的快捷键注册
    globalShortcut.unregisterAll()

    // 转换快捷键（如果是单键则使用回退方案）
    this.effectiveAccelerator = convertToFallbackShortcut(this.shortcutSettings.accelerator)

    // 使用 Electron globalShortcut
    const registered = globalShortcut.register(
      this.effectiveAccelerator,
      () => this.handleShortcut()
    )

    if (!registered) {
      console.error(`[ShortcutService] 快捷键注册失败: ${this.effectiveAccelerator}`)
      return false
    }

    console.log(
      `[ShortcutService] 快捷键已注册: ${this.effectiveAccelerator} (${this.shortcutSettings.mode}模式)`
    )
    return true
  }

  /**
   * 更新快捷键配置
   */
  updateSettings(settings: ShortcutConfig): boolean {
    this.shortcutSettings = settings
    // 重置所有状态，确保切换模式后能正常工作
    this.shortcutPressed = false
    this.isHolding = false
    if (this.shortcutPressTimer) {
      clearTimeout(this.shortcutPressTimer)
      this.shortcutPressTimer = null
    }
    if (this.callbacks) {
      return this.register(this.callbacks)
    }
    return true
  }

  /**
   * 获取当前快捷键配置
   */
  getSettings(): ShortcutConfig {
    return { ...this.shortcutSettings }
  }

  /**
   * 处理快捷键触发
   */
  private handleShortcut(): void {
    if (this.shortcutSettings.mode === 'hold') {
      // 长按模式：按下开始，再次按下停止（因为 Electron 无法检测 keyup）
      if (this.isHolding) {
        // 已在录音，再次按下停止
        console.log('[ShortcutService] 长按模式：再次按下，停止录音')
        this.handleKeyRelease()
        return
      }

      // 防止重复触发
      if (this.shortcutPressed) {
        return
      }
      this.shortcutPressed = true

      // 开始录音
      this.isHolding = true
      this.callbacks?.onTrigger()

      // 清除之前的计时器
      if (this.shortcutPressTimer) {
        clearTimeout(this.shortcutPressTimer)
      }

      // 设置最大时长计时器，超时自动停止
      this.shortcutPressTimer = setTimeout(() => {
        if (this.isHolding) {
          console.log('[ShortcutService] 长按超时，自动停止')
          this.handleKeyRelease()
        }
      }, this.maxDurationMs)

      // 短暂延迟后重置 pressed 状态，允许再次按下停止
      setTimeout(() => {
        this.shortcutPressed = false
      }, APP_CONSTANTS.SHORTCUT_DEBOUNCE_MS)
    } else {
      // 点按模式：点按一次开始，点按一次结束
      // 防止重复触发
      if (this.shortcutPressed) {
        return
      }
      this.shortcutPressed = true

      this.callbacks?.onTrigger()

      // 重置按键状态（防抖）
      setTimeout(() => {
        this.shortcutPressed = false
      }, APP_CONSTANTS.SHORTCUT_DEBOUNCE_MS)
    }
  }

  /**
   * 处理按键释放（长按模式）
   */
  private handleKeyRelease(): void {
    if (!this.isHolding) return

    console.log('[ShortcutService] 停止录音')

    if (this.shortcutPressTimer) {
      clearTimeout(this.shortcutPressTimer)
      this.shortcutPressTimer = null
    }

    this.isHolding = false
    this.shortcutPressed = false
    this.callbacks?.onRelease?.()
  }

  /**
   * 处理快捷键释放（外部调用，兼容旧接口）
   */
  handleRelease(): void {
    if (this.shortcutSettings.mode === 'hold') {
      this.handleKeyRelease()
    }
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.callbacks = null
    if (this.shortcutPressTimer) {
      clearTimeout(this.shortcutPressTimer)
      this.shortcutPressTimer = null
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.unregisterAll()
  }
}
