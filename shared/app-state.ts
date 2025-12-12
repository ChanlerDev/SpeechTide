/**
 * 语音流程状态，覆盖待命/录音/转写/完成/异常等关键节点。
 */
export type SpeechFlowStatus = 'idle' | 'recording' | 'transcribing' | 'ready' | 'error'

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
 * 快捷键触发模式
 * - toggle: 点按开始/结束
 * - hold: 长按录音，松开停止
 * - hybrid: 混合模式，短按=toggle，长按=hold
 */
export type ShortcutMode = 'toggle' | 'hold' | 'hybrid'

/**
 * 全局快捷键信息，用于 UI 指示与后续自定义拓展。
 */
export interface ShortcutConfig {
  accelerator: string
  description: string
  mode: ShortcutMode
  holdThresholdMs?: number  // hybrid 模式长按判定阈值，默认 250ms
}
