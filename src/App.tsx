/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import type { SpeechTideState, ShortcutConfig, PolishConfig, TranscriptionSettings } from '../shared/app-state'
import { DEFAULT_TAP_POLISH_ENABLED, DEFAULT_HOLD_POLISH_ENABLED } from '../shared/app-state'
import { Onboarding } from './components/Onboarding'
import { HistoryPanel } from './components/HistoryPanel'
import { PolishSettings } from './components/PolishSettings'
import { ModelSettings } from './components/ModelSettings'
import { useNativeRecorder } from './hooks/useNativeRecorder'

const INITIAL_STATE: SpeechTideState = {
  status: 'idle',
  message: '正在连接…',
  updatedAt: Date.now(),
}

interface TestResult {
  text: string
  duration: number
  processingTime: number
  modelId: string
  language?: string
}


/**
 * 状态配置
 */
const STATUS_CONFIG = {
  idle: { label: '就绪', class: 'idle' },
  recording: { label: '录音中', class: 'recording' },
  transcribing: { label: '转写中', class: 'transcribing' },
  polishing: { label: '润色中', class: 'transcribing' },
  ready: { label: '完成', class: 'idle' },
  error: { label: '错误', class: 'recording' },
} as const

type TabType = 'shortcut' | 'model' | 'settings' | 'polish'

/**
 * 主应用组件 - 双栏布局设计
 */
function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('shortcut')
  const [state, setState] = useState<SpeechTideState>(INITIAL_STATE)
  const [shortcut, setShortcut] = useState<ShortcutConfig | null>(null)
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [clipboardMode, setClipboardMode] = useState(false)
  const [autoShowOnStart, setAutoShowOnStart] = useState(false)
  const [cacheTTLMinutes, setCacheTTLMinutes] = useState(30)
  const [allowBetaUpdates, setAllowBetaUpdates] = useState(false)
  const [polishConfig, setPolishConfig] = useState<PolishConfig | null>(null)
  const [transcriptionSettings, setTranscriptionSettings] = useState<TranscriptionSettings | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const shortcutInputRef = useRef<HTMLInputElement>(null)
  const pressedKeysRef = useRef<Set<string>>(new Set())

  useNativeRecorder()

  // 检查是否需要显示 Onboarding
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const shouldShow = await window.onboarding.shouldShow()
        setShowOnboarding(shouldShow)
      } catch {
        setShowOnboarding(false)
      }
    }
    checkOnboarding()
  }, [])

  useEffect(() => {
    const dispose = window.speech.onStateChange((next) => {
      setState((prev) => {
        // Clear test result when new real transcript arrives
        if (next.transcript && next.transcript !== prev.transcript) {
          setTestResult(null)
        }
        return next
      })
    })
    window.speech.getState().then((snapshot) => setState(snapshot))
    window.speech.getSettings().then((s) => {
      setShortcut(s.shortcut)
      setClipboardMode(s.clipboardMode)
      setAutoShowOnStart(s.autoShowOnStart)
      setCacheTTLMinutes(Number.isFinite(s.cacheTTLMinutes) ? s.cacheTTLMinutes : 30)
      setAllowBetaUpdates(s.allowBetaUpdates ?? false)
      if (s.polish) setPolishConfig(s.polish)
      if (s.transcription) setTranscriptionSettings(s.transcription)
    })

    const disposeAudio = window.speech.onPlayAudio((audioPath) => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      const audio = new Audio()
      audioRef.current = audio
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => setIsPlaying(false)
      const audioSrc = audioPath.startsWith('http') ? audioPath : `file://${audioPath}`
      audio.src = audioSrc
      audio.volume = 0.8
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    })

    return () => {
      dispose()
      disposeAudio()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleShortcutChange = useCallback(async (newShortcut: ShortcutConfig) => {
    const result = await window.speech.updateShortcut(newShortcut)
    if (result.success) setShortcut(newShortcut)
    return result
  }, [])


  const handlePolishConfigChange = useCallback(async (config: PolishConfig) => {
    const result = await window.speech.updateSettings({ polish: config })
    if (result.success) setPolishConfig(config)
    return result
  }, [])

  const handleTranscriptionSettingsChange = useCallback(async (config: TranscriptionSettings) => {
    const result = await window.speech.updateSettings({ transcription: config })
    if (result.success) setTranscriptionSettings(config)
    return result
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecordingShortcut) return
    e.preventDefault()
    e.stopPropagation()
    pressedKeysRef.current.add(e.code)
  }, [isRecordingShortcut])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecordingShortcut) return
    e.preventDefault()
    e.stopPropagation()
    const pressedKeys = Array.from(pressedKeysRef.current)
    pressedKeysRef.current.clear()
    if (pressedKeys.length === 0) return

    const modifierOrder = ['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight']
    const modifiers = pressedKeys.filter(k => modifierOrder.includes(k)).sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b))
    const otherKeys = pressedKeys.filter(k => !modifierOrder.includes(k))
    const accelerator = [...modifiers, ...otherKeys].join('+')

    if (shortcut && accelerator) {
      handleShortcutChange({ ...shortcut, accelerator })
    }
    setIsRecordingShortcut(false)
    window.speech.setShortcutRecording(false)
    shortcutInputRef.current?.blur()
  }, [isRecordingShortcut, shortcut, handleShortcutChange])

  const runTest = async () => {
    if (testRunning) return
    setTestRunning(true)
    setTestResult(null)
    try {
      const result = await window.speech.testTranscription()
      if (result.success && result.data) {
        setTestResult({
          text: result.data.text,
          duration: result.data.duration,
          processingTime: result.data.processingTime,
          modelId: result.data.modelId,
          language: result.data.language,
        })
      } else if (!result.success) {
        setTestResult({ text: `测试失败: ${result.error || '未知错误'}`, duration: 0, processingTime: 0, modelId: '', language: '' })
      }
    } catch {
      setTestResult({ text: '测试失败: 网络或系统错误', duration: 0, processingTime: 0, modelId: '', language: '' })
    } finally {
      setTestRunning(false)
    }
  }

  const [playError, setPlayError] = useState<string | null>(null)

  const playTestAudio = async () => {
    if (isPlaying) return
    setIsPlaying(true)
    setPlayError(null)
    try {
      const result = await window.speech.playTestAudio()
      if (!result.success) {
        setIsPlaying(false)
        setPlayError(result.error || 'Failed to play audio')
      }
    } catch (err) {
      setIsPlaying(false)
      setPlayError(err instanceof Error ? err.message : 'Playback failed')
    }
  }

  const updateSetting = async (key: string, value: boolean | number) => {
    const setters: Record<string, (v: unknown) => void> = {
      clipboardMode: (v) => setClipboardMode(v as boolean),
      autoShowOnStart: (v) => setAutoShowOnStart(v as boolean),
      cacheTTLMinutes: (v) => setCacheTTLMinutes(v as number),
      allowBetaUpdates: (v) => setAllowBetaUpdates(v as boolean),
    }
    setters[key]?.(value)
    try {
      await window.speech.updateSettings({ [key]: value })
    } catch {
      // ignore
    }
  }

  // Loading state
  if (showOnboarding === null) {
    return (
      <div className="h-full flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="animate-spin w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />
  }

  if (showHistory) {
    return <HistoryPanel onBack={() => setShowHistory(false)} />
  }

  const currentStatus = STATUS_CONFIG[state.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.idle
  const activeModelId = testResult?.modelId
    || state.meta?.modelId
    || (transcriptionSettings?.mode === 'online'
      ? transcriptionSettings.online.modelId
      : 'SenseVoice-Small (中文)')

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--background))]">
      {/* macOS 交通灯安全区 + 标题栏 */}
      <header
        className="h-10 flex-shrink-0 flex items-center justify-between px-4 border-b border-[hsl(var(--border))]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3 pl-16">
          <span className="text-base font-semibold text-[hsl(var(--text-primary))]">SpeechTide</span>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--muted))]">
            <span className={`status-dot ${currentStatus.class}`} />
            <span className="text-xs text-[hsl(var(--text-secondary))]">{currentStatus.label}</span>
          </div>
        </div>
      </header>

      {/* 双栏主体 */}
      <div className="flex-1 flex min-h-0">
        {/* 左栏 - 转录结果 */}
        <div className="w-[300px] flex-shrink-0 flex flex-col border-r border-[hsl(var(--border))]">
          {/* 转录结果卡片 */}
          <div className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[hsl(var(--text-secondary))]">
                  {testResult ? '测试结果' : '转录结果'}
                </span>
                {activeModelId && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--text-tertiary))]">
                    {activeModelId}
                  </span>
                )}
                {testResult && testResult.processingTime > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    ✓ {(testResult.processingTime / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {testResult && (
                  <button
                    onClick={() => setTestResult(null)}
                    className="text-xs px-2 py-1 rounded-md text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--muted))] transition-all"
                  >
                    清除
                  </button>
                )}
                <button
                  onClick={() => {
                    const text = testResult?.text || state.transcript
                    if (text) copyToClipboard(text)
                  }}
                  disabled={!testResult?.text && !state.transcript}
                  className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                    copySuccess
                      ? 'text-emerald-600 bg-emerald-50'
                      : (testResult?.text || state.transcript)
                        ? 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]'
                        : 'text-[hsl(var(--text-tertiary))] cursor-not-allowed'
                  }`}
                >
                  {copySuccess ? '已复制 ✓' : '复制'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto transcript-card">
              {testResult ? (
                <div className="p-3">
                  {testResult.processingTime > 0 ? (
                    <p className="text-sm text-[hsl(var(--text-primary))] leading-relaxed whitespace-pre-wrap">
                      {testResult.text}
                    </p>
                  ) : (
                    <p className="text-sm text-rose-600">{testResult.text}</p>
                  )}
                </div>
              ) : state.transcript ? (
                <p className="text-sm text-[hsl(var(--text-primary))] leading-relaxed whitespace-pre-wrap p-3">
                  {state.transcript}
                </p>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-[hsl(var(--text-tertiary))] text-center">
                    {testRunning ? '测试中...' :
                     state.status === 'recording' ? '正在录音...' :
                     state.status === 'transcribing' ? '正在转写...' :
                     state.status === 'polishing' ? '正在润色...' :
                     '按下快捷键开始录音'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 快捷键显示区 */}
          <div className="p-4 border-t border-[hsl(var(--border))]">
            {playError ? (
              <div className="text-center">
                <p className="text-xs text-rose-600">{playError}</p>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-lg font-mono text-[hsl(var(--text-primary))]">
                  {shortcut?.accelerator || '未设置'}
                </span>
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">
                  💡 按下快捷键开始录音
                </p>
              </div>
            )}
          </div>

          {/* 底部工具栏 */}
          <div className="px-4 py-3 border-t border-[hsl(var(--border))] flex items-center justify-between">
            <UpdateIndicator />
            <div className="flex items-center gap-2">
              <button
                onClick={playTestAudio}
                disabled={isPlaying}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 transition-colors"
              >
                {isPlaying ? '▶ 播放中' : '▶ 试听'}
              </button>
              <button
                onClick={runTest}
                disabled={testRunning || state.status === 'recording' || state.status === 'transcribing'}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 transition-colors"
              >
                🎤 {testRunning ? '测试中' : '测试'}
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs">历史</span>
              </button>
            </div>
          </div>
        </div>

        {/* 右栏 - 标签页 */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* 标签栏 */}
          <div className="flex-shrink-0 px-4 pt-3 pb-0 flex gap-1 border-b border-[hsl(var(--border))]">
            <button
              onClick={() => setActiveTab('shortcut')}
              className={`px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors relative whitespace-nowrap ${
                activeTab === 'shortcut'
                  ? 'text-[hsl(var(--primary))] bg-[hsl(var(--card))]'
                  : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              ⌨️ 快捷键
              {activeTab === 'shortcut' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))]" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('model')}
              className={`px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors relative whitespace-nowrap ${
                activeTab === 'model'
                  ? 'text-[hsl(var(--primary))] bg-[hsl(var(--card))]'
                  : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              🧠 模型
              {activeTab === 'model' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))]" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors relative whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'text-[hsl(var(--primary))] bg-[hsl(var(--card))]'
                  : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              ⚙️ 设置
              {activeTab === 'settings' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))]" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('polish')}
              className={`px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors relative whitespace-nowrap ${
                activeTab === 'polish'
                  ? 'text-[hsl(var(--primary))] bg-[hsl(var(--card))]'
                  : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              ✨ AI 润色
              {activeTab === 'polish' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))]" />
              )}
            </button>
          </div>

          {/* 标签页内容 */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'shortcut' && (
              <div className="space-y-6">
                {/* 快捷键设置 */}
                <div>
                  <label className="text-sm font-medium text-[hsl(var(--text-primary))] block mb-2">
                    当前快捷键
                  </label>
                  <input
                    ref={shortcutInputRef}
                    type="text"
                    readOnly
                    value={isRecordingShortcut ? '按下快捷键...' : (shortcut?.accelerator || '')}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onFocus={() => {
                      setIsRecordingShortcut(true)
                      window.speech.setShortcutRecording(true)
                    }}
                    onBlur={() => {
                      setIsRecordingShortcut(false)
                      window.speech.setShortcutRecording(false)
                    }}
                    className={`w-full px-4 py-3 text-center text-base font-mono rounded-lg cursor-pointer transition-all ${
                      isRecordingShortcut
                        ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border-2 border-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--secondary))] border-2 border-transparent'
                    }`}
                    placeholder="点击设置"
                  />
                  <p className="text-xs text-[hsl(var(--text-tertiary))] text-center mt-2">
                    点击上方录制新快捷键
                  </p>
                </div>

                {/* 快捷键行为说明 */}
                <div className="p-4 bg-[hsl(var(--muted)/0.5)] rounded-lg">
                  <label className="text-sm font-medium text-[hsl(var(--text-primary))] block mb-3">
                    录音模式
                  </label>
                  <div className="space-y-3 text-sm text-[hsl(var(--text-secondary))]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-12 h-5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--text-primary))] text-xs flex-shrink-0">点按</span>
                        <span>点击开始，再次点击停止</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[hsl(var(--text-tertiary))]">AI 润色</span>
                        <button
                          onClick={() => {
                            if (!shortcut) return
                            const newShortcut = { ...shortcut, tapPolishEnabled: !(shortcut.tapPolishEnabled ?? DEFAULT_TAP_POLISH_ENABLED) }
                            handleShortcutChange(newShortcut)
                          }}
                          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${(shortcut?.tapPolishEnabled ?? DEFAULT_TAP_POLISH_ENABLED) ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${(shortcut?.tapPolishEnabled ?? DEFAULT_TAP_POLISH_ENABLED) ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-12 h-5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--text-primary))] text-xs flex-shrink-0">长按</span>
                        <span>按住说话，松开停止</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[hsl(var(--text-tertiary))]">AI 润色</span>
                        <button
                          onClick={() => {
                            if (!shortcut) return
                            const newShortcut = { ...shortcut, holdPolishEnabled: !(shortcut.holdPolishEnabled ?? DEFAULT_HOLD_POLISH_ENABLED) }
                            handleShortcutChange(newShortcut)
                          }}
                          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${(shortcut?.holdPolishEnabled ?? DEFAULT_HOLD_POLISH_ENABLED) ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${(shortcut?.holdPolishEnabled ?? DEFAULT_HOLD_POLISH_ENABLED) ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'model' && (
              <ModelSettings
                config={transcriptionSettings}
                onConfigChange={handleTranscriptionSettingsChange}
              />
            )}

            {activeTab === 'settings' && (
              <div className="space-y-4">
                <SettingToggle
                  label="禁用自动插入"
                  description="转录完成后只复制到剪贴板，不自动输入"
                  checked={clipboardMode}
                  onChange={(v) => updateSetting('clipboardMode', v)}
                />
                <SettingToggle
                  label="启动时显示面板"
                  description="应用启动后自动显示主面板"
                  checked={autoShowOnStart}
                  onChange={(v) => updateSetting('autoShowOnStart', v)}
                />
                <SettingToggle
                  label="接收测试版更新"
                  description="测试版可能包含未完善的功能"
                  checked={allowBetaUpdates}
                  onChange={(v) => updateSetting('allowBetaUpdates', v)}
                />
                <div className="border-t border-[hsl(var(--border))] pt-4">
                  <div>
                    <span className="text-sm text-[hsl(var(--text-primary))]">模型缓存时间</span>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">
                      闲置后自动卸载模型以释放内存
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      { value: 5, label: '5 分钟' },
                      { value: 15, label: '15 分钟' },
                      { value: 30, label: '30 分钟' },
                      { value: 60, label: '1 小时' },
                      { value: 0, label: '永不' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting('cacheTTLMinutes', opt.value)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                          cacheTTLMinutes === opt.value
                            ? 'bg-[hsl(var(--primary)/0.1)] border-[hsl(var(--primary)/0.5)] text-[hsl(var(--primary))] font-medium'
                            : 'bg-[hsl(var(--muted))] border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--text-tertiary))]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Display */}
                {state.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                    <p className="text-sm text-rose-700">{state.error}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'polish' && (
              <PolishSettings
                config={polishConfig}
                onConfigChange={handlePolishConfigChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Toggle switch component with description
 */
function SettingToggle({ label, description, checked, onChange }: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex-1">
        <span className="text-sm text-[hsl(var(--text-primary))]">{label}</span>
        {description && (
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  )
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error'

interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  progress?: { percent: number }
}

/**
 * Compact update indicator
 */
function UpdateIndicator() {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    window.update.getState().then(setState)
    const dispose = window.update.onStateChange(setState)
    return dispose
  }, [])

  if (!state) return null

  const { status, currentVersion, availableVersion, progress } = state

  const handleAction = async () => {
    if (status === 'idle' || status === 'not-available' || status === 'error') {
      await window.update.check()
    } else if (status === 'available') {
      await window.update.download()
    } else if (status === 'downloaded') {
      await window.update.install()
    }
  }

  return (
    <button
      onClick={handleAction}
      disabled={status === 'checking' || status === 'downloading' || status === 'installing'}
      className="flex items-center gap-2 text-xs text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))] transition-colors disabled:opacity-60"
    >
      {status === 'checking' && (
        <>
          <span className="w-3 h-3 border border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
          <span>检查中...</span>
        </>
      )}
      {status === 'downloading' && progress && (
        <>
          <span className="w-3 h-3 border border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
          <span>下载 {progress.percent.toFixed(0)}%</span>
        </>
      )}
      {status === 'downloaded' && (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-emerald-600">v{availableVersion} 就绪</span>
        </>
      )}
      {status === 'available' && (
        <>
          <span className="w-2 h-2 rounded-full bg-[hsl(var(--accent))]" />
          <span>v{availableVersion} 可用</span>
        </>
      )}
      {(status === 'idle' || status === 'not-available' || status === 'error') && (
        <span>v{currentVersion}</span>
      )}
    </button>
  )
}

export default App
