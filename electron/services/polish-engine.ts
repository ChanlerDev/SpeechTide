/**
 * SpeechTide AI 润色引擎
 *
 * 使用 OpenAI-compatible API 对转写文本进行润色
 * 支持 OpenAI、DeepSeek 等兼容 API
 */

import type { PolishConfig } from '../config'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('polish-engine')

export interface PolishResult {
  success: boolean
  text?: string
  error?: string
  durationMs?: number
}

/**
 * 根据 provider 获取 base URL
 */
function getBaseUrl(config: PolishConfig): string {
  if (config.baseUrl) {
    return config.baseUrl
  }
  switch (config.provider) {
    case 'deepseek':
      return 'https://api.deepseek.com/v1'
    case 'openai':
    default:
      return 'https://api.openai.com/v1'
  }
}

/**
 * AI 润色引擎类
 */
export class PolishEngine {
  private config: PolishConfig

  constructor(config: PolishConfig) {
    this.config = config
  }

  /**
   * 更新配置
   */
  updateConfig(config: PolishConfig): void {
    this.config = config
    logger.info('润色引擎配置已更新', { provider: config.provider, modelId: config.modelId })
  }

  /**
   * 检查配置是否有效（仅检查 API 密钥和模型，不检查 enabled 字段）
   * enabled 字段已由 shortcut 的 tapPolishEnabled/holdPolishEnabled 替代
   */
  isConfigValid(): boolean {
    return !!(this.config.apiKey && this.config.modelId)
  }

  /**
   * 执行润色
   */
  async polish(rawText: string): Promise<PolishResult> {
    if (!this.isConfigValid()) {
      return { success: false, error: '润色配置无效或未启用' }
    }

    const startTime = Date.now()
    const baseUrl = getBaseUrl(this.config)
    const url = `${baseUrl}/chat/completions`

    logger.info('开始润色', { provider: this.config.provider, modelId: this.config.modelId, textLength: rawText.length })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.modelId,
            messages: [
              { role: 'system', content: this.config.systemPrompt },
              { role: 'user', content: rawText },
            ],
            temperature: 0.3,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error(new Error(`API 请求失败: HTTP ${response.status}`), { status: response.status, body: errorText })
          return { success: false, error: `API 请求失败: HTTP ${response.status}` }
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>
          error?: { message?: string }
        }

        if (data.error) {
          logger.error(new Error(`API 返回错误: ${data.error.message}`), { error: data.error })
          return { success: false, error: data.error.message || 'API 返回错误' }
        }

        const polishedText = data.choices?.[0]?.message?.content?.trim()
        if (!polishedText) {
          logger.error(new Error('API 返回空内容'), { data })
          return { success: false, error: 'API 返回空内容' }
        }

        const durationMs = Date.now() - startTime
        logger.info('润色完成', { durationMs, inputLength: rawText.length, outputLength: polishedText.length })

        return { success: true, text: polishedText, durationMs }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      const durationMs = Date.now() - startTime
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(new Error('润色超时'), { timeoutMs: this.config.timeoutMs })
          return { success: false, error: `润色超时（${this.config.timeoutMs / 1000}秒）`, durationMs }
        }
        logger.error(error, { context: 'polish' })
        return { success: false, error: error.message, durationMs }
      }
      return { success: false, error: '未知错误', durationMs }
    }
  }
}
