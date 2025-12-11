import type { SenseVoiceTranscriberConfig } from '../config'
import { SenseVoiceTranscriber } from './sensevoice-transcriber'

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

export function createTranscriber(config: SenseVoiceTranscriberConfig, options: { supportDir: string }): Transcriber {
  return new SenseVoiceTranscriber(config, { supportDir: options.supportDir })
}
