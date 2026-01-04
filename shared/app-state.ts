/**
 * 语音流程状态，覆盖待命/录音/转写/润色/完成/异常等关键节点。
 */
export type SpeechFlowStatus = 'idle' | 'recording' | 'transcribing' | 'polishing' | 'ready' | 'error'

/**
 * 快捷键触发类型
 * - tap: 短按（< holdThresholdMs）→ 触发 AI 润色
 * - hold: 长按（≥ holdThresholdMs）→ 直接输出
 */
export type TriggerType = 'tap' | 'hold'

/**
 * 渲染层与托盘共享的统一状态结构。
 */
export interface TranscriptionMeta {
  sessionId: string
  durationMs?: number
  modelId?: string
  language?: string
}

export interface SpeechTideState {
  status: SpeechFlowStatus
  message: string
  updatedAt: number
  transcript?: string
  meta?: TranscriptionMeta
  error?: string
}

/**
 * 全局快捷键信息，用于 UI 指示与后续自定义拓展。
 * 统一使用 hybrid 模式：短按 = AI 润色输出，长按 = 快速输出
 */
export interface ShortcutConfig {
  accelerator: string
  description: string
  holdThresholdMs?: number  // 长按判定阈值，默认 300ms
  tapPolishEnabled?: boolean  // 点按模式是否启用 AI 润色，默认 true
  holdPolishEnabled?: boolean // 长按模式是否启用 AI 润色，默认 false
}
