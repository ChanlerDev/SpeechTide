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

/** 点按模式 AI 润色默认值 */
export const DEFAULT_TAP_POLISH_ENABLED = true
/** 长按模式 AI 润色默认值 */
export const DEFAULT_HOLD_POLISH_ENABLED = false

/**
 * AI 润色配置（共享定义）
 */
export interface PolishConfig {
  provider: 'openai' | 'deepseek'
  apiKey: string
  modelId: string
  systemPrompt: string
  timeoutMs: number
  baseUrl?: string
}

/**
 * 转录模式
 */
export type TranscriptionMode = 'offline' | 'online'

/**
 * 在线转录 Provider 类型
 * - openai: OpenAI 官方
 * - groq: Groq（免费高速）
 * - custom: 自定义 OpenAI 兼容服务
 */
export type TranscriptionProvider = 'openai' | 'groq' | 'custom'

/**
 * Provider 预设模型
 */
export interface ProviderModelPreset {
  value: string
  label: string
  description?: string
}

/**
 * Provider 配置元数据
 */
export interface ProviderMeta {
  id: TranscriptionProvider
  name: string
  defaultBaseUrl: string
  models: ProviderModelPreset[]
  requiresBaseUrl: boolean
}

/**
 * Provider 配置预设
 */
export const TRANSCRIPTION_PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresBaseUrl: false,
    models: [
      { value: 'whisper-1', label: 'whisper-1', description: '经典 Whisper，稳定可靠' },
      { value: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe', description: '更高准确率' },
      { value: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe', description: '更快更便宜' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresBaseUrl: false,
    models: [
      { value: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo', description: '高速，推荐' },
      { value: 'whisper-large-v3', label: 'whisper-large-v3', description: '更高准确率' },
      { value: 'distil-whisper-large-v3-en', label: 'distil-whisper-large-v3-en', description: '英文专用' },
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    defaultBaseUrl: '',
    requiresBaseUrl: true,
    models: [],
  },
]

/**
 * 在线转录配置
 */
export interface OnlineTranscriptionConfig {
  provider: TranscriptionProvider
  apiKey: string
  modelId: string
  baseUrl?: string
  language?: string
  responseFormat?: 'text' | 'json'
  temperature?: number
  timeoutMs?: number
}

export interface TranscriptionSettings {
  mode: TranscriptionMode
  online: OnlineTranscriptionConfig
}

// === File Transcription Types ===

/** File transcription status */
export type FileTranscriptionStatus = 'idle' | 'selected' | 'transcribing' | 'complete' | 'error'

/** File transcription state */
export interface FileTranscriptionState {
  status: FileTranscriptionStatus
  selectedFile?: {
    name: string
    path: string
    size: number
  }
  progress: number
  result?: {
    text: string
    durationMs: number
  }
  error?: string
  outputConfig: {
    directory: string
    fileName: string
  }
}

/** Transcribe file request */
export interface TranscribeFileRequest {
  filePath: string
}

/** Transcribe file response */
export interface TranscribeFileResponse {
  success: boolean
  text?: string
  durationMs?: number
  error?: string
}

/** Export transcription request */
export interface ExportTranscriptionRequest {
  text: string
  outputPath: string
  fileName: string
}

/** Export transcription response */
export interface ExportTranscriptionResponse {
  success: boolean
  fullPath?: string
  error?: string
}

/** Select directory response */
export interface SelectDirectoryResponse {
  path: string | null
  canceled: boolean
}
