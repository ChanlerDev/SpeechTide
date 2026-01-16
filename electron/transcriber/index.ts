import type { SenseVoiceTranscriberConfig } from '../config'
import type { OnlineTranscriptionConfig } from '../../shared/app-state'
import { SenseVoiceTranscriber } from './sensevoice-transcriber'
import { OpenAITranscriber } from './openai-transcriber'

// 类型定义
export interface TranscriptionResult {
  text: string
  modelId: string
  durationMs: number
  language?: string
}

export interface Transcriber {
  transcribe(filePath: string): Promise<TranscriptionResult>
  destroy?(): void
}

export interface OpenAITranscriberConfig extends OnlineTranscriptionConfig {
  engine: 'openai'
}

export type TranscriberConfig = SenseVoiceTranscriberConfig | OpenAITranscriberConfig

export function createTranscriber(config: TranscriberConfig, options: { supportDir: string }): Transcriber {
  if (config.engine === 'openai') {
    return new OpenAITranscriber(config)
  }
  return new SenseVoiceTranscriber(config, { supportDir: options.supportDir })
}
