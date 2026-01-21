/**
 * AI 纠正设置组件
 * 配置 API 提供商、密钥、模型和提示词
 */

import { useState, useCallback, useEffect } from 'react'
import type { PolishConfig } from '../../shared/app-state'

interface PolishSettingsProps {
  config: PolishConfig | null
  onConfigChange: (config: PolishConfig) => Promise<{ success: boolean; error?: string }>
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com/v1' },
] as const

const DEFAULT_PROMPT = `你是一位语音识别（ASR）后处理专家和技术文档校对员。你擅长根据上下文逻辑，修复语音转文字过程中产生的同音错误、标点缺失和格式混乱问题。

你的任务：
请对用户提供的语音识别原始文本进行重构和润色。你的目标是将一段口语化的、可能充满错误的流式文本，转化为准确、通顺、符合书面规范的技术文档/对话记录。

# 核心处理规则

1. 修复同音/音译错误：
   - 必须根据上下文逻辑推断专业术语
   - 示例：瑞艾克特/re act → React，VS扣的 → VS Code，加瓦 → Java，Git hub → GitHub

2. 重建标点与断句：
   - 语音文本通常缺乏标点，请根据语气和语义插入正确的全角标点（，。？！）
   - 将过长的流水账长句拆分为逻辑清晰的短句

3. 清理口语废词：
   - 删除无意义的口语填充词（如：那个、就是说、呃、然后呢），除非它们对语义表达至关重要

4. 严格的中英文混排规范：
   - 空格（盘古之白）：中文与英文/数字之间必须加空格，如 React好用 → React 好用
   - 大小写：英文专有名词必须使用官方标准大小写（如 iOS, MySQL, jQuery）

输出：
调用一次名为 return_correction 的函数，参数：
status: "ok" 或 "filtered"
text: 纠正后的文本或原文
reason: 可选（若触发内容安全限制，说明原因）`

export const PolishSettings = ({ config, onConfigChange }: PolishSettingsProps) => {
  const [localConfig, setLocalConfig] = useState<PolishConfig>(() => config || {
    provider: 'openai',
    apiKey: '',
    modelId: 'gpt-4o-mini',
    systemPrompt: DEFAULT_PROMPT,
    timeoutMs: 30000,
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)

  // 同步外部配置变化
  useEffect(() => {
    if (config) {
      setLocalConfig({
        ...config,
        systemPrompt: config.systemPrompt || DEFAULT_PROMPT,
      })
    }
  }, [config])

  const handleProviderChange = useCallback(async (provider: 'openai' | 'deepseek') => {
    const providerMeta = PROVIDER_OPTIONS.find(p => p.value === provider)
    const defaultModel = providerMeta?.defaultModel || 'gpt-4o-mini'
    const newConfig = {
      ...localConfig,
      provider,
      modelId: defaultModel,
    }
    setLocalConfig(newConfig)
    setSaving(true)
    const result = await onConfigChange(newConfig)
    setSaving(false)
    if (!result.success) {
      setLocalConfig(localConfig)
      alert('保存失败: ' + result.error)
    }
  }, [localConfig, onConfigChange])

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalConfig(prev => ({ ...prev, apiKey: e.target.value }))
  }, [])

  const handleApiKeyBlur = useCallback(async () => {
    if (localConfig.apiKey === config?.apiKey) return
    setSaving(true)
    const result = await onConfigChange(localConfig)
    setSaving(false)
    if (!result.success) {
      alert('保存失败: ' + result.error)
    }
  }, [localConfig, config?.apiKey, onConfigChange])

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalConfig(prev => ({ ...prev, modelId: e.target.value }))
  }, [])

  const handleModelBlur = useCallback(async () => {
    if (localConfig.modelId === config?.modelId) return
    setSaving(true)
    const result = await onConfigChange(localConfig)
    setSaving(false)
    if (!result.success) {
      alert('保存失败: ' + result.error)
    }
  }, [localConfig, config?.modelId, onConfigChange])

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalConfig(prev => ({ ...prev, systemPrompt: e.target.value }))
  }, [])

  const handlePromptBlur = useCallback(async () => {
    if (localConfig.systemPrompt === config?.systemPrompt) return
    setSaving(true)
    const result = await onConfigChange(localConfig)
    setSaving(false)
    if (!result.success) {
      alert('保存失败: ' + result.error)
    }
  }, [localConfig, config?.systemPrompt, onConfigChange])

  const handleResetPrompt = useCallback(async () => {
    const newConfig = { ...localConfig, systemPrompt: DEFAULT_PROMPT }
    setLocalConfig(newConfig)
    setSaving(true)
    const result = await onConfigChange(newConfig)
    setSaving(false)
    if (!result.success) {
      alert('保存失败: ' + result.error)
    }
  }, [localConfig, onConfigChange])

  const handleBaseUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalConfig(prev => ({ ...prev, baseUrl: e.target.value || undefined }))
  }, [])

  const handleBaseUrlBlur = useCallback(async () => {
    if (localConfig.baseUrl === config?.baseUrl) return
    setSaving(true)
    const result = await onConfigChange(localConfig)
    setSaving(false)
    if (!result.success) {
      alert('保存失败: ' + result.error)
    }
  }, [localConfig, config?.baseUrl, onConfigChange])

  const getDefaultBaseUrl = () => {
    return PROVIDER_OPTIONS.find(p => p.value === localConfig.provider)?.defaultBaseUrl || ''
  }

  const isConfigValid = localConfig.apiKey && localConfig.modelId

  return (
    <div className="space-y-4">
      {/* 提示信息 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg">
        <span className="text-orange-500">💡</span>
        <span className="text-xs text-orange-700">在「快捷键」标签页的录音模式中可单独控制各模式是否启用 AI 纠正</span>
      </div>

      {/* 设置卡片 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
        <div className="space-y-3">
          {/* 提供商选择 */}
          <div>
            <span className="text-xs font-medium text-gray-600">API 提供商</span>
            <div className="flex gap-2 mt-1.5">
              {PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleProviderChange(option.value)}
                  disabled={saving}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-all ${
                    localConfig.provider === option.value
                      ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  } ${saving ? 'opacity-50' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <span className="text-xs font-medium text-gray-600">API 密钥</span>
            <div className="relative mt-1.5">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={localConfig.apiKey}
                onChange={handleApiKeyChange}
                onBlur={handleApiKeyBlur}
                placeholder={localConfig.provider === 'deepseek' ? 'sk-...' : 'sk-proj-...'}
                className="w-full px-3 py-2 pr-16 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {/* 模型 ID */}
          <div>
            <span className="text-xs font-medium text-gray-600">模型 ID</span>
            <input
              type="text"
              value={localConfig.modelId}
              onChange={handleModelChange}
              onBlur={handleModelBlur}
              placeholder={localConfig.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'}
              className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
            />
          </div>

          {/* 高级设置 */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <span>{showAdvanced ? '收起' : '高级设置'}</span>
              <svg
                className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-3">
                {/* Base URL */}
                <div>
                  <span className="text-xs font-medium text-gray-600">Base URL</span>
                  <input
                    type="text"
                    value={localConfig.baseUrl || ''}
                    onChange={handleBaseUrlChange}
                    onBlur={handleBaseUrlBlur}
                    placeholder={getDefaultBaseUrl()}
                    className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                  />
                  <p className="text-xs text-gray-400 mt-1">留空使用默认地址</p>
                </div>

                {/* 系统提示词 */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">系统提示词</span>
                    <button
                      onClick={handleResetPrompt}
                      className="text-xs text-orange-500 hover:text-orange-600"
                    >
                      重置默认
                    </button>
                  </div>
                  <textarea
                    value={localConfig.systemPrompt}
                    onChange={handlePromptChange}
                    onBlur={handlePromptBlur}
                    rows={8}
                    className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 状态提示 */}
          {!isConfigValid && (
            <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">
              请填写 API 密钥以启用纠正功能
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
