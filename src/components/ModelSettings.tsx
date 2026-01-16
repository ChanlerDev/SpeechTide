/**
 * 转录模型设置组件
 * Provider 卡片列表 → 选中后展开配置
 */

import { useCallback, useEffect, useState, useMemo } from 'react'
import type { OnlineTranscriptionConfig, TranscriptionSettings, TranscriptionProvider } from '../../shared/app-state'
import { TRANSCRIPTION_PROVIDERS } from '../../shared/app-state'

interface ModelSettingsProps {
  config: TranscriptionSettings | null
  onConfigChange: (config: TranscriptionSettings) => Promise<{ success: boolean; error?: string }>
}

const DEFAULT_ONLINE_CONFIG: OnlineTranscriptionConfig = {
  provider: 'openai',
  apiKey: '',
  modelId: 'whisper-1',
  responseFormat: 'json',
  temperature: 0,
  timeoutMs: 120000,
}

const DEFAULT_SETTINGS: TranscriptionSettings = {
  mode: 'offline',
  online: DEFAULT_ONLINE_CONFIG,
}

const LANGUAGE_PRESETS = [
  { value: '', label: '自动' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'EN' },
  { value: 'ja', label: '日本語' },
] as const

export const ModelSettings = ({ config, onConfigChange }: ModelSettingsProps) => {
  const [localConfig, setLocalConfig] = useState<TranscriptionSettings>(() => config || DEFAULT_SETTINGS)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [customModelInput, setCustomModelInput] = useState('')
  const [showCustomModel, setShowCustomModel] = useState(false)

  const currentProvider = useMemo(() => {
    return TRANSCRIPTION_PROVIDERS.find(p => p.id === localConfig.online.provider) || TRANSCRIPTION_PROVIDERS[0]
  }, [localConfig.online.provider])

  const isCustomModel = useMemo(() => {
    if (currentProvider.id === 'custom') return true
    return !currentProvider.models.some(m => m.value === localConfig.online.modelId)
  }, [currentProvider, localConfig.online.modelId])

  useEffect(() => {
    if (config) {
      setLocalConfig(config)
      const provider = TRANSCRIPTION_PROVIDERS.find(p => p.id === config.online.provider)
      if (config.online.modelId && provider && !provider.models.some(m => m.value === config.online.modelId)) {
        setCustomModelInput(config.online.modelId)
        setShowCustomModel(true)
      }
    }
  }, [config])

  const commitChange = useCallback(async (next: TranscriptionSettings, fallback?: TranscriptionSettings) => {
    const normalized = next.mode === 'online'
      ? { ...next, online: { ...next.online, responseFormat: 'json' } }
      : next
    setLocalConfig(normalized)
    setSaving(true)
    const result = await onConfigChange(normalized)
    setSaving(false)
    if (!result.success && fallback) {
      setLocalConfig(fallback)
    }
  }, [onConfigChange])

  const handleModeChange = useCallback(async (mode: 'offline' | 'online') => {
    const previous = localConfig
    const next = { ...localConfig, mode }
    setTestResult(null)
    await commitChange(next, previous)
  }, [localConfig, commitChange])

  const updateOnlineField = useCallback((patch: Partial<OnlineTranscriptionConfig>) => {
    setLocalConfig(prev => ({
      ...prev,
      online: { ...prev.online, ...patch },
    }))
    setTestResult(null)
  }, [])

  const handleProviderChange = useCallback(async (providerId: TranscriptionProvider) => {
    const providerMeta = TRANSCRIPTION_PROVIDERS.find(p => p.id === providerId)
    if (!providerMeta) return

    const defaultModel = providerMeta.models[0]?.value || ''
    setShowCustomModel(providerId === 'custom')
    setCustomModelInput('')
    const next: TranscriptionSettings = {
      ...localConfig,
      online: {
        ...localConfig.online,
        provider: providerId,
        modelId: defaultModel,
        baseUrl: undefined,
      },
    }
    setTestResult(null)
    await commitChange(next)
  }, [localConfig, commitChange])

  const handleModelChange = useCallback(async (modelId: string) => {
    setShowCustomModel(false)
    const next = { ...localConfig, online: { ...localConfig.online, modelId } }
    await commitChange(next)
  }, [localConfig, commitChange])

  const handleCustomModelToggle = useCallback(() => {
    setShowCustomModel(true)
    setCustomModelInput('')
    updateOnlineField({ modelId: '' })
  }, [updateOnlineField])

  const handleOnlineBlur = useCallback(async () => {
    if (!config) return
    if (JSON.stringify(localConfig) === JSON.stringify(config)) return
    await commitChange(localConfig)
  }, [config, localConfig, commitChange])

  const handleCustomModelBlur = useCallback(async () => {
    if (customModelInput) {
      updateOnlineField({ modelId: customModelInput })
    }
    await handleOnlineBlur()
  }, [customModelInput, updateOnlineField, handleOnlineBlur])

  const handleLanguageChange = useCallback(async (lang: string) => {
    const next = { ...localConfig, online: { ...localConfig.online, language: lang || undefined } }
    await commitChange(next)
  }, [localConfig, commitChange])

  const handleTestConnection = useCallback(async () => {
    if (!localConfig.online.apiKey || !localConfig.online.modelId) {
      setTestResult({ success: false, message: '请先填写 API Key 和模型' })
      return
    }
    if (currentProvider.requiresBaseUrl && !localConfig.online.baseUrl) {
      setTestResult({ success: false, message: '请填写 Base URL' })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const result = await window.speech.testTranscription()
      if (result.success) {
        setTestResult({
          success: true,
          message: `成功: "${result.text?.slice(0, 20)}${(result.text?.length ?? 0) > 20 ? '...' : ''}"`,
        })
      } else {
        setTestResult({ success: false, message: result.error || '测试失败' })
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : '测试失败' })
    } finally {
      setTesting(false)
    }
  }, [localConfig.online, currentProvider.requiresBaseUrl])

  const isConfigValid = localConfig.online.apiKey && localConfig.online.modelId
    && (currentProvider.id !== 'custom' || localConfig.online.baseUrl)

  const PillButton = ({ active, onClick, disabled, children, title }: {
    active: boolean
    onClick: () => void
    disabled?: boolean
    children: React.ReactNode
    title?: string
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2.5 py-1 text-xs rounded-full border transition-all whitespace-nowrap ${
        active
          ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
        {/* 转录模式 */}
        <div>
          <span className="text-xs font-medium text-gray-600">转录模式</span>
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={() => handleModeChange('offline')}
              disabled={saving}
              className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-all ${
                localConfig.mode === 'offline'
                  ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              } ${saving ? 'opacity-50' : ''}`}
            >
              离线（SenseVoice）
            </button>
            <button
              onClick={() => handleModeChange('online')}
              disabled={saving}
              className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-all ${
                localConfig.mode === 'online'
                  ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              } ${saving ? 'opacity-50' : ''}`}
            >
              在线（云端 API）
            </button>
          </div>
        </div>

        {localConfig.mode === 'offline' && (
          <div className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
            <p className="text-xs text-gray-600">使用本地 SenseVoice 模型，数据不离开设备。</p>
          </div>
        )}

        {localConfig.mode === 'online' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-amber-600 text-xs">⚠️</span>
              <span className="text-[11px] text-amber-700">在线模式会上传音频，可能产生费用</span>
            </div>

            {/* Provider 卡片列表 */}
            <div className="space-y-2">
              {TRANSCRIPTION_PROVIDERS.map((provider) => {
                const isActive = localConfig.online.provider === provider.id
                const isExpanded = isActive && expandedProvider === provider.id
                const selectedModel = isActive
                  ? provider.models.find(m => m.value === localConfig.online.modelId)?.label || localConfig.online.modelId
                  : null
                return (
                  <div
                    key={provider.id}
                    className={`rounded-lg border transition-all ${
                      isActive
                        ? 'border-orange-300 bg-orange-50/30'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {/* Provider 头部 */}
                    <button
                      onClick={() => {
                        if (isActive) {
                          setExpandedProvider(isExpanded ? null : provider.id)
                        } else {
                          handleProviderChange(provider.id)
                          setExpandedProvider(provider.id)
                        }
                      }}
                      disabled={saving}
                      className={`w-full px-3 py-2 flex items-center justify-between ${saving ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-orange-500' : 'bg-gray-300'}`} />
                        <span className={`text-xs font-medium ${isActive ? 'text-orange-700' : 'text-gray-600'}`}>
                          {provider.name}
                        </span>

                        {isActive && selectedModel && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-600 rounded truncate max-w-[120px]">
                            {selectedModel}
                          </span>
                        )}
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Provider 配置（展开时显示） */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t border-orange-200/50">
                        {/* 模型选择 */}
                        {provider.models.length > 0 && (
                          <div className="pt-3">
                            <span className="text-xs font-medium text-gray-600">模型</span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {provider.models.map((model) => (
                                <PillButton
                                  key={model.value}
                                  active={localConfig.online.modelId === model.value && !showCustomModel}
                                  onClick={() => handleModelChange(model.value)}
                                  disabled={saving}
                                  title={model.description}
                                >
                                  {model.label}
                                </PillButton>
                              ))}
                              <PillButton
                                active={showCustomModel || isCustomModel}
                                onClick={handleCustomModelToggle}
                                disabled={saving}
                              >
                                自定义
                              </PillButton>
                            </div>
                          </div>
                        )}

                        {/* 自定义模型输入 */}
                        {(showCustomModel || isCustomModel || provider.id === 'custom') && (
                          <div>
                            <span className="text-xs font-medium text-gray-600">模型 ID</span>
                            <input
                              type="text"
                              value={showCustomModel ? customModelInput : localConfig.online.modelId}
                              onChange={(e) => {
                                if (showCustomModel) {
                                  setCustomModelInput(e.target.value)
                                } else {
                                  updateOnlineField({ modelId: e.target.value })
                                }
                              }}
                              onBlur={showCustomModel ? handleCustomModelBlur : handleOnlineBlur}
                              placeholder="输入模型 ID"
                              className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                            />
                          </div>
                        )}

                        {/* API Key */}
                        <div>
                          <span className="text-xs font-medium text-gray-600">API Key</span>
                          <div className="relative mt-1.5">
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={localConfig.online.apiKey}
                              onChange={(e) => updateOnlineField({ apiKey: e.target.value })}
                              onBlur={handleOnlineBlur}
                              placeholder={provider.id === 'groq' ? 'gsk_...' : 'sk-...'}
                              className="w-full px-3 py-2 pr-14 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 hover:text-gray-600"
                            >
                              {showApiKey ? '隐藏' : '显示'}
                            </button>
                          </div>
                        </div>

                        {/* Base URL（自定义 Provider 必填） */}
                        {provider.requiresBaseUrl && (
                          <div>
                            <span className="text-xs font-medium text-gray-600">
                              Base URL <span className="text-rose-500">*</span>
                            </span>
                            <input
                              type="text"
                              value={localConfig.online.baseUrl || ''}
                              onChange={(e) => updateOnlineField({ baseUrl: e.target.value || undefined })}
                              onBlur={handleOnlineBlur}
                              placeholder="https://your-api.example.com/v1"
                              className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                            />
                          </div>
                        )}

                        {/* 语言选择 */}
                        <div>
                          <span className="text-xs font-medium text-gray-600">语言</span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {LANGUAGE_PRESETS.map((lang) => (
                              <PillButton
                                key={lang.value}
                                active={(localConfig.online.language || '') === lang.value}
                                onClick={() => handleLanguageChange(lang.value)}
                                disabled={saving}
                              >
                                {lang.label}
                              </PillButton>
                            ))}
                          </div>
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
                              {!provider.requiresBaseUrl && (
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Base URL（可选）</span>
                                  <input
                                    type="text"
                                    value={localConfig.online.baseUrl || ''}
                                    onChange={(e) => updateOnlineField({ baseUrl: e.target.value || undefined })}
                                    onBlur={handleOnlineBlur}
                                    placeholder={provider.defaultBaseUrl}
                                    className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                                  />
                                  <p className="text-[11px] text-gray-400 mt-1">留空使用官方地址</p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <span className="text-xs font-medium text-gray-600">温度</span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="1"
                                    value={localConfig.online.temperature ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      updateOnlineField({ temperature: v ? Number(v) : undefined })
                                    }}
                                    onBlur={handleOnlineBlur}
                                    placeholder="0"
                                    className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                                  />
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">超时（秒）</span>
                                  <input
                                    type="number"
                                    step="10"
                                    min="10"
                                    value={localConfig.online.timeoutMs ? Math.round(localConfig.online.timeoutMs / 1000) : ''}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      updateOnlineField({ timeoutMs: v ? Number(v) * 1000 : undefined })
                                    }}
                                    onBlur={handleOnlineBlur}
                                    placeholder="120"
                                    className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 配置验证提示 */}
                        {!isConfigValid && (
                          <div className="text-xs text-rose-600">
                            {!localConfig.online.apiKey && '请填写 API Key'}
                            {!localConfig.online.apiKey && !localConfig.online.modelId && ' · '}
                            {!localConfig.online.modelId && '请填写模型'}
                            {provider.requiresBaseUrl && !localConfig.online.baseUrl && ' · 请填写 Base URL'}
                          </div>
                        )}

                        {/* 测试连接 */}
                        <div className="pt-2 border-t border-orange-200/50">
                          <button
                            onClick={handleTestConnection}
                            disabled={testing || !isConfigValid}
                            className={`w-full px-3 py-2 text-xs rounded-lg border transition-all ${
                              testing
                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-wait'
                                : isConfigValid
                                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                  : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {testing ? '测试中...' : '🔗 测试连接'}
                          </button>

                          {testResult && (
                            <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${
                              testResult.success
                                ? 'bg-green-50 border border-green-200 text-green-700'
                                : 'bg-rose-50 border border-rose-200 text-rose-700'
                            }`}>
                              {testResult.success ? '✅ ' : '❌ '}{testResult.message}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
