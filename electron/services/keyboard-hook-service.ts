/**
 * SpeechTide 键盘钩子服务
 *
 * 使用 uiohook-napi 实现全局键盘监听
 * 统一 hybrid 模式：短按 = tap（AI 润色），长按 = hold（直接输出）
 */

import { uIOhook, UiohookKey } from 'uiohook-napi'
import type { ShortcutConfig, TriggerType } from '../../shared/app-state'

const DEFAULT_HOLD_THRESHOLD_MS = 300

export interface KeyboardHookCallbacks {
  onRecordingStart: () => void
  onRecordingStop: (triggerType: TriggerType) => void
}

/**
 * 将 accelerator 字符串解析为按键组合
 * 例如: "Command+Shift+Space" -> { meta: true, shift: true, key: 'Space' }
 */
interface ParsedShortcut {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  key: string
  keycode: number | null
}

/**
 * 按键名称到 uiohook keycode 的映射
 * 支持 e.code 格式（如 KeyA, MetaRight）和传统格式（如 a, command）
 */
const KEY_MAP: Record<string, number> = {
  // e.code 格式 - 字母键
  'keya': UiohookKey.A,
  'keyb': UiohookKey.B,
  'keyc': UiohookKey.C,
  'keyd': UiohookKey.D,
  'keye': UiohookKey.E,
  'keyf': UiohookKey.F,
  'keyg': UiohookKey.G,
  'keyh': UiohookKey.H,
  'keyi': UiohookKey.I,
  'keyj': UiohookKey.J,
  'keyk': UiohookKey.K,
  'keyl': UiohookKey.L,
  'keym': UiohookKey.M,
  'keyn': UiohookKey.N,
  'keyo': UiohookKey.O,
  'keyp': UiohookKey.P,
  'keyq': UiohookKey.Q,
  'keyr': UiohookKey.R,
  'keys': UiohookKey.S,
  'keyt': UiohookKey.T,
  'keyu': UiohookKey.U,
  'keyv': UiohookKey.V,
  'keyw': UiohookKey.W,
  'keyx': UiohookKey.X,
  'keyy': UiohookKey.Y,
  'keyz': UiohookKey.Z,
  // e.code 格式 - 数字键
  'digit0': UiohookKey[0],
  'digit1': UiohookKey[1],
  'digit2': UiohookKey[2],
  'digit3': UiohookKey[3],
  'digit4': UiohookKey[4],
  'digit5': UiohookKey[5],
  'digit6': UiohookKey[6],
  'digit7': UiohookKey[7],
  'digit8': UiohookKey[8],
  'digit9': UiohookKey[9],
  // e.code 格式 - 修饰键（左右区分）
  'metaleft': UiohookKey.Meta,
  'metaright': UiohookKey.MetaRight,
  'controlleft': UiohookKey.Ctrl,
  'controlright': UiohookKey.CtrlRight,
  'altleft': UiohookKey.Alt,
  'altright': UiohookKey.AltRight,
  'shiftleft': UiohookKey.Shift,
  'shiftright': UiohookKey.ShiftRight,
  // e.code 格式 - 特殊键
  'space': UiohookKey.Space,
  'enter': UiohookKey.Enter,
  'tab': UiohookKey.Tab,
  'escape': UiohookKey.Escape,
  'backspace': UiohookKey.Backspace,
  'delete': UiohookKey.Delete,
  'arrowup': UiohookKey.ArrowUp,
  'arrowdown': UiohookKey.ArrowDown,
  'arrowleft': UiohookKey.ArrowLeft,
  'arrowright': UiohookKey.ArrowRight,
  'home': UiohookKey.Home,
  'end': UiohookKey.End,
  'pageup': UiohookKey.PageUp,
  'pagedown': UiohookKey.PageDown,
  // e.code 格式 - 功能键
  'f1': UiohookKey.F1,
  'f2': UiohookKey.F2,
  'f3': UiohookKey.F3,
  'f4': UiohookKey.F4,
  'f5': UiohookKey.F5,
  'f6': UiohookKey.F6,
  'f7': UiohookKey.F7,
  'f8': UiohookKey.F8,
  'f9': UiohookKey.F9,
  'f10': UiohookKey.F10,
  'f11': UiohookKey.F11,
  'f12': UiohookKey.F12,
  // e.code 格式 - 符号键
  'minus': UiohookKey.Minus,
  'equal': UiohookKey.Equal,
  'bracketleft': UiohookKey.BracketLeft,
  'bracketright': UiohookKey.BracketRight,
  'backslash': UiohookKey.Backslash,
  'semicolon': UiohookKey.Semicolon,
  'quote': UiohookKey.Quote,
  'comma': UiohookKey.Comma,
  'period': UiohookKey.Period,
  'slash': UiohookKey.Slash,
  'backquote': UiohookKey.Backquote,
  // 传统格式兼容
  ' ': UiohookKey.Space,
  'return': UiohookKey.Enter,
  'esc': UiohookKey.Escape,
  'up': UiohookKey.ArrowUp,
  'down': UiohookKey.ArrowDown,
  'left': UiohookKey.ArrowLeft,
  'right': UiohookKey.ArrowRight,
  'a': UiohookKey.A,
  'b': UiohookKey.B,
  'c': UiohookKey.C,
  'd': UiohookKey.D,
  'e': UiohookKey.E,
  'f': UiohookKey.F,
  'g': UiohookKey.G,
  'h': UiohookKey.H,
  'i': UiohookKey.I,
  'j': UiohookKey.J,
  'k': UiohookKey.K,
  'l': UiohookKey.L,
  'm': UiohookKey.M,
  'n': UiohookKey.N,
  'o': UiohookKey.O,
  'p': UiohookKey.P,
  'q': UiohookKey.Q,
  'r': UiohookKey.R,
  's': UiohookKey.S,
  't': UiohookKey.T,
  'u': UiohookKey.U,
  'v': UiohookKey.V,
  'w': UiohookKey.W,
  'x': UiohookKey.X,
  'y': UiohookKey.Y,
  'z': UiohookKey.Z,
  '0': UiohookKey[0],
  '1': UiohookKey[1],
  '2': UiohookKey[2],
  '3': UiohookKey[3],
  '4': UiohookKey[4],
  '5': UiohookKey[5],
  '6': UiohookKey[6],
  '7': UiohookKey[7],
  '8': UiohookKey[8],
  '9': UiohookKey[9],
  '-': UiohookKey.Minus,
  '=': UiohookKey.Equal,
  '[': UiohookKey.BracketLeft,
  ']': UiohookKey.BracketRight,
  '\\': UiohookKey.Backslash,
  ';': UiohookKey.Semicolon,
  "'": UiohookKey.Quote,
  ',': UiohookKey.Comma,
  '.': UiohookKey.Period,
  '/': UiohookKey.Slash,
  '`': UiohookKey.Backquote,
}

/**
 * 解析 accelerator 字符串
 */
function parseAccelerator(accelerator: string): ParsedShortcut {
  const parts = accelerator.split('+').map(p => p.trim().toLowerCase())
  
  const result: ParsedShortcut = {
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
    key: '',
    keycode: null,
  }

  for (const part of parts) {
    // 优先检查 KEY_MAP 是否有映射（支持 e.code 格式如 MetaRight, KeyA 等）
    if (KEY_MAP[part] !== undefined) {
      result.key = part
      result.keycode = KEY_MAP[part]
      continue
    }

    // 传统修饰键格式
    switch (part) {
      case 'command':
      case 'cmd':
      case 'meta':
      case 'super':
        result.meta = true
        break
      case 'control':
      case 'ctrl':
      case 'commandorcontrol':
      case 'cmdorctrl':
        // 在 macOS 上映射到 meta，在 Windows/Linux 上映射到 ctrl
        if (process.platform === 'darwin') {
          result.meta = true
        } else {
          result.ctrl = true
        }
        break
      case 'alt':
      case 'option':
      case 'opt':
        result.alt = true
        break
      case 'shift':
        result.shift = true
        break
      default:
        // 未知的主键
        result.key = part
        result.keycode = null
        break
    }
  }

  return result
}

/**
 * 键盘钩子服务
 * 统一 hybrid 行为：按下开始录音，松开停止并根据时长决定触发类型
 */
export class KeyboardHookService {
  private config: ShortcutConfig
  private callbacks: KeyboardHookCallbacks | null = null
  private parsedShortcut: ParsedShortcut
  private isRunning = false

  // 状态追踪
  private isShortcutDown = false      // 快捷键是否按下
  private keyDownTime = 0             // 按下时间戳
  private isRecording = false         // 是否正在录音
  private holdThresholdMs: number     // 长按判定阈值

  constructor(config: ShortcutConfig) {
    this.config = config
    this.parsedShortcut = parseAccelerator(config.accelerator)
    this.holdThresholdMs = config.holdThresholdMs ?? DEFAULT_HOLD_THRESHOLD_MS
  }

  /**
   * 启动键盘监听
   */
  start(callbacks: KeyboardHookCallbacks): boolean {
    if (this.isRunning) {
      console.warn('[KeyboardHookService] 已经在运行中')
      return true
    }

    this.callbacks = callbacks

    // 注册事件监听
    uIOhook.on('keydown', this.handleKeyDown)
    uIOhook.on('keyup', this.handleKeyUp)

    try {
      uIOhook.start()
      this.isRunning = true
      console.log(`[KeyboardHookService] 已启动，快捷键: ${this.config.accelerator}, 阈值: ${this.holdThresholdMs}ms`)
      return true
    } catch (error) {
      console.error('[KeyboardHookService] 启动失败:', error)
      console.warn('[KeyboardHookService] 快捷键功能不可用，请检查辅助功能权限')
      return false
    }
  }

  /**
   * 停止键盘监听
   */
  stop(): void {
    if (!this.isRunning) return

    uIOhook.off('keydown', this.handleKeyDown)
    uIOhook.off('keyup', this.handleKeyUp)
    uIOhook.stop()

    this.isRunning = false
    this.resetState()
    console.log('[KeyboardHookService] 已停止')
  }

  /**
   * 更新配置
   */
  updateConfig(config: ShortcutConfig): void {
    this.config = config
    this.parsedShortcut = parseAccelerator(config.accelerator)
    this.holdThresholdMs = config.holdThresholdMs ?? DEFAULT_HOLD_THRESHOLD_MS
    this.resetState()
    console.log(`[KeyboardHookService] 配置已更新，快捷键: ${config.accelerator}, 阈值: ${this.holdThresholdMs}ms`)
  }

  /**
   * 获取当前配置
   */
  getConfig(): ShortcutConfig {
    return { ...this.config }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stop()
    this.callbacks = null
  }

  /**
   * 重置内部状态
   */
  private resetState(): void {
    this.isShortcutDown = false
    this.keyDownTime = 0
  }

  /**
   * 设置录音状态（供外部同步）
   */
  setRecordingState(isRecording: boolean): void {
    this.isRecording = isRecording
  }

  /**
   * 检查按键事件是否匹配快捷键
   */
  private isShortcutMatch(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; keycode: number }): boolean {
    const { meta, ctrl, alt, shift, keycode, key } = this.parsedShortcut

    // 判断主键是否为修饰键（跳过对应的修饰键状态检查）
    const keyLower = key.toLowerCase()
    const isMetaKey = keyLower.startsWith('meta')
    const isCtrlKey = keyLower.startsWith('control')
    const isAltKey = keyLower.startsWith('alt')
    const isShiftKey = keyLower.startsWith('shift')

    // 检查修饰键（如果主键是该修饰键则跳过检查）
    if (!isMetaKey && meta !== e.metaKey) return false
    if (!isCtrlKey && ctrl !== e.ctrlKey) return false
    if (!isAltKey && alt !== e.altKey) return false
    if (!isShiftKey && shift !== e.shiftKey) return false

    // 检查主键
    if (keycode !== null && keycode !== e.keycode) return false

    return true
  }

  /**
   * 处理按键按下 - 统一 hybrid：按下即开始录音
   */
  private handleKeyDown = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; keycode: number }): void => {
    if (!this.isShortcutMatch(e)) return

    // 防止重复触发（按住不放会持续触发 keydown）
    if (this.isShortcutDown) return

    this.isShortcutDown = true
    this.keyDownTime = Date.now()

    // 未录音时按下，开始录音
    if (!this.isRecording) {
      this.callbacks?.onRecordingStart()
      this.isRecording = true
    }
  }

  /**
   * 处理按键释放 - 根据按住时长决定 triggerType
   */
  private handleKeyUp = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; keycode: number }): void => {
    // 只检查主键释放
    if (this.parsedShortcut.keycode !== null && this.parsedShortcut.keycode !== e.keycode) return

    if (!this.isShortcutDown) return

    const pressDuration = Date.now() - this.keyDownTime
    this.isShortcutDown = false

    // 正在录音时松开，停止录音并传递触发类型
    if (this.isRecording) {
      const triggerType: TriggerType = pressDuration >= this.holdThresholdMs ? 'hold' : 'tap'
      this.callbacks?.onRecordingStop(triggerType)
      this.isRecording = false
    }
  }
}
