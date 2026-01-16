import fs from 'node:fs/promises'
import path from 'node:path'
import type { OnlineTranscriptionConfig } from '../../shared/app-state'
import { TRANSCRIPTION_PROVIDERS } from '../../shared/app-state'
import type { Transcriber, TranscriptionResult } from './index'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('openai-transcriber')

function getDefaultBaseUrl(provider: string): string {
  const meta = TRANSCRIPTION_PROVIDERS.find(p => p.id === provider)
  return meta?.defaultBaseUrl || 'https://api.openai.com/v1'
}

function normalizeBaseUrl(baseUrl: string | undefined, provider: string): string {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return getDefaultBaseUrl(provider)
  return trimmed.replace(/\/+$/, '')
}

function getTimeoutMs(config: OnlineTranscriptionConfig): number {
  return Number.isFinite(config.timeoutMs) && (config.timeoutMs as number) > 0
    ? (config.timeoutMs as number)
    : 120000
}

export class OpenAITranscriber implements Transcriber {
  constructor(private config: OnlineTranscriptionConfig) {}

  updateConfig(config: OnlineTranscriptionConfig): void {
    this.config = config
  }

  private isConfigValid(): boolean {
    return !!(this.config.apiKey && this.config.modelId)
  }

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    if (!this.isConfigValid()) {
      throw new Error('在线转写配置无效：请检查 API Key 和模型 ID')
    }

    const startTime = Date.now()
    const baseUrl = normalizeBaseUrl(this.config.baseUrl, this.config.provider)
    const url = `${baseUrl}/audio/transcriptions`

    logger.info('开始在线转写', { provider: this.config.provider, modelId: this.config.modelId })

    const fileBuffer = await fs.readFile(filePath)
    const fileName = path.basename(filePath)
    const file = new File([fileBuffer], fileName, { type: 'audio/wav' })

    const form = new FormData()
    form.append('file', file)
    form.append('model', this.config.modelId)

    if (this.config.language) {
      form.append('language', this.config.language)
    }
    if (this.config.responseFormat) {
      form.append('response_format', this.config.responseFormat)
    }
    if (this.config.temperature !== undefined && this.config.temperature !== null) {
      form.append('temperature', String(this.config.temperature))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs(this.config))

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: form,
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `API 请求失败: HTTP ${response.status}`
        try {
          const parsed = JSON.parse(errorText) as { error?: { message?: string } }
          if (parsed.error?.message) {
            errorMessage = parsed.error.message
          }
        } catch {
          // ignore json parse
        }
        throw new Error(errorMessage)
      }

      const durationMs = Date.now() - startTime
      if (this.config.responseFormat === 'text') {
        const text = (await response.text()).trim()
        if (!text) {
          throw new Error('API 返回空内容')
        }
        logger.info('在线转写完成', { durationMs, outputLength: text.length })
        return {
          text,
          modelId: this.config.modelId,
          durationMs,
        }
      }

      const data = await response.json() as { text?: string; language?: string }
      const text = data.text?.trim()
      if (!text) {
        throw new Error('API 返回空内容')
      }

      logger.info('在线转写完成', { durationMs, outputLength: text.length })
      return {
        text,
        modelId: this.config.modelId,
        durationMs,
        language: data.language,
      }
    } catch (error) {
      const durationMs = Date.now() - startTime
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`在线转写超时（${Math.round(getTimeoutMs(this.config) / 1000)}秒）`)
        }
        logger.error(error, { durationMs })
        throw error
      }
      throw new Error('在线转写失败：未知错误')
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
