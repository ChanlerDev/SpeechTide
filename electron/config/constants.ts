/**
 * SpeechTide 常量定义
 *
 * 包含应用状态提示、标签、默认配置等常量
 */

import type { SpeechFlowStatus, ShortcutConfig } from '../../shared/app-state'

/**
 * 状态提示信息
 * 用于在 UI 中显示详细的状态说明
 */
export const STATUS_HINT: Record<SpeechFlowStatus, string> = {
  idle: '待命，可通过快捷键开始录音',
  recording: '录音中，松开快捷键停止',
  transcribing: '转写中，请稍候……',
  polishing: 'AI 润色中……',
  ready: '转写完成，文本已准备就绪',
  error: '发生异常，请重试或查看日志',
} as const

/**
 * 状态标签
 * 用于在托盘菜单、简短提示中显示
 */
export const STATUS_LABEL: Record<SpeechFlowStatus, string> = {
  idle: '待命',
  recording: '录音中',
  transcribing: '转写中',
  polishing: '润色中',
  ready: '完成',
  error: '异常',
} as const

/**
 * 默认快捷键配置
 */
export const DEFAULT_SHORTCUT: ShortcutConfig = {
  accelerator: 'MetaRight',
  description: '切换录音流程',
  holdThresholdMs: 300,
} as const

/**
 * 测试音频 URL
 * 用于测试转写功能
 */
export const DEFAULT_TEST_AUDIO_URL = 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/test_wavs/zh.wav?download=true'

/**
 * 应用常量
 */
export const APP_CONSTANTS = {
  /** 默认空闲恢复延迟（毫秒） */
  IDLE_DELAY_MS: 2500,
  /** 错误后空闲恢复延迟（毫秒） */
  ERROR_IDLE_DELAY_MS: 4000,
  /** 快捷键防抖延迟（毫秒） */
  SHORTCUT_DEBOUNCE_MS: 500,
} as const

/**
 * 窗口配置
 */
export const WINDOW_CONFIG = {
  /** 基础宽度 */
  width: 360,
  /** 基础高度（主面板折叠状态） */
  height: 370,
  /** 最小宽度 */
  minWidth: 340,
  /** 最小高度 */
  minHeight: 320,
  /** 最大宽度 */
  maxWidth: 420,
  /** 最大高度（历史面板或展开状态） */
  maxHeight: 660,
} as const

/**
 * 面板高度预设
 */
export const PANEL_HEIGHTS = {
  /** 主面板基础高度 */
  main: 370,
  /** 设置面板展开时的高度（4个选项） */
  withSettings: 540,
  /** AI 润色面板展开时的高度 */
  withPolish: 580,
  /** 测试面板展开时的高度（按钮+结果） */
  withTest: 540,
  /** 历史面板高度 */
  history: 580,
} as const
