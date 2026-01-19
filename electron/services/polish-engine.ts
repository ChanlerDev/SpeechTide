/**
 * SpeechTide AI 纠正引擎
 *
 * 使用 OpenAI-compatible API 对语音转写文本进行纠正
 * 支持 OpenAI、DeepSeek 等兼容 API
 * 采用 Function Calling 强制结构化输出
 */

import type { PolishConfig } from '../../shared/app-state'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('polish-engine')

export interface PolishResult {
  success: boolean
  text?: string
  error?: string
  durationMs?: number
  filtered?: boolean
  filterReason?: string
}

const CORRECTION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'return_correction',
    description: 'Return the processed result for the transcription as structured data.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['ok', 'filtered'],
          description: 'Use ok when the processing succeeds. Use filtered when safety policies prevent modification and the original text must be kept.',
        },
        text: {
          type: 'string',
          description: 'The processed transcription text, or the original text when status is filtered or no change is required.',
        },
        reason: {
          type: 'string',
          description: 'Optional explanation when status is filtered. Leave empty otherwise.',
        },
      },
      required: ['status', 'text'],
    },
  },
}

const DEFAULT_CORRECTION_PROMPT = `你是一个语音转写文本纠正助手。

你的任务：
- 修正语音识别文本中的识别错误、同音字错误、错别字和标点问题
- 保持原意，不增删信息
- 当识别结果中出现与用户词典中词汇发音相似、拼写接近或语义相关的词时，将其替换为词典中的标准形式
- 不要更改词典中词汇的拼写、大小写或符号

输出：
调用一次名为 return_correction 的函数，参数：
status: "ok" 或 "filtered"
text: 纠正后的文本或原文
reason: 可选（若触发内容安全限制，说明原因）`

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
   * 执行纠正（使用 Function Calling）
   */
  async polish(rawText: string): Promise<PolishResult> {
    if (!this.isConfigValid()) {
      return { success: false, error: '纠正配置无效或未启用' }
    }

    const startTime = Date.now()
    const baseUrl = getBaseUrl(this.config)
    const url = `${baseUrl}/chat/completions`

    logger.info('开始纠正', { provider: this.config.provider, modelId: this.config.modelId, textLength: rawText.length })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

      try {
        const systemPrompt = this.config.systemPrompt || DEFAULT_CORRECTION_PROMPT

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: rawText },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            tools: [CORRECTION_TOOL],
            tool_choice: {
              type: 'function',
              function: { name: 'return_correction' },
            },
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error(new Error(`API 请求失败: HTTP ${response.status}`), { status: response.status, body: errorText })
          return { success: false, error: `API 请求失败: HTTP ${response.status}` }
        }

        interface ToolCall {
          function?: { name?: string; arguments?: string }
        }
        interface ApiResponse {
          choices?: Array<{ message?: { tool_calls?: ToolCall[] } }>
          error?: { message?: string }
        }

        const data = await response.json() as ApiResponse

        if (data.error) {
          logger.error(new Error(`API 返回错误: ${data.error.message}`), { error: data.error })
          return { success: false, error: data.error.message || 'API 返回错误' }
        }

        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
        if (!toolCall?.function?.arguments) {
          logger.error(new Error('API 未返回 function call'), { data })
          return { success: false, error: 'API 未返回有效的纠正结果' }
        }

        interface CorrectionResult {
          status: 'ok' | 'filtered'
          text: string
          reason?: string
        }

        let result: CorrectionResult
        try {
          result = JSON.parse(toolCall.function.arguments) as CorrectionResult
        } catch {
          logger.error(new Error('解析 function call 参数失败'), { arguments: toolCall.function.arguments })
          return { success: false, error: '解析纠正结果失败' }
        }

        const durationMs = Date.now() - startTime

        if (result.status === 'filtered') {
          logger.warn('内容被过滤', { reason: result.reason })
          return {
            success: true,
            text: result.text,
            durationMs,
            filtered: true,
            filterReason: result.reason,
          }
        }

        logger.info('纠正完成', { durationMs, inputLength: rawText.length, outputLength: result.text.length })

        return { success: true, text: result.text, durationMs }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      const durationMs = Date.now() - startTime
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(new Error('纠正超时'), { timeoutMs: this.config.timeoutMs })
          return { success: false, error: `纠正超时（${this.config.timeoutMs / 1000}秒）`, durationMs }
        }
        logger.error(error, { context: 'polish' })
        return { success: false, error: error.message, durationMs }
      }
      return { success: false, error: '未知错误', durationMs }
    }
  }
}
