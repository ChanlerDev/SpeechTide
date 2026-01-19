/**
 * AI 润色设置组件
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

const DEFAULT_PROMPT = ''

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
      setLocalConfig(config)
    }
  }, [config])

  const handleProviderChange = useCallback(async (provider: 'openai' | 'deepseek') => {
    const defaultModel = PROVIDER_OPTIONS.find(p => p.value === provider)?.defaultModel || 'gpt-4o-mini'
    const newConfig = { ...localConfig, provider, modelId: defaultModel, baseUrl: undefined }
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
        <span className="text-xs text-orange-700">在「快捷键」标签页的录音模式中可单独控制各模式是否启用 AI 润色</span>
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
                placeholder={localConfig.provider === 'openai' ? 'sk-...' : 'sk-...'}
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
              placeholder="gpt-4o-mini"
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
                    rows={4}
                    placeholder="留空使用内置默认提示词（语音转写纠正助手）"
                    className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 状态提示 */}
          {!isConfigValid && (
            <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">
              请填写 API 密钥以启用润色功能
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
