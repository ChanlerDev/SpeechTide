/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import type { SpeechTideState, ShortcutConfig, ShortcutMode } from '../shared/app-state'
import { Onboarding } from './components/Onboarding'
import { HistoryPanel } from './components/HistoryPanel'
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

const MODE_OPTIONS: { value: ShortcutMode; label: string }[] = [
  { value: 'toggle', label: '点击' },
  { value: 'hold', label: '长按' },
  { value: 'hybrid', label: '混合' },
]

/**
 * 状态配置
 */
const STATUS_CONFIG = {
  idle: { label: '就绪', class: 'idle' },
  recording: { label: '录音中', class: 'recording' },
  transcribing: { label: '转写中', class: 'transcribing' },
  ready: { label: '完成', class: 'idle' },
  error: { label: '错误', class: 'recording' },
} as const

/**
 * 主应用组件 - 极简面板设计
 */
function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showTest, setShowTest] = useState(false)
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
    const dispose = window.speech.onStateChange((next) => setState(next))
    window.speech.getState().then((snapshot) => setState(snapshot))
    window.speech.getSettings().then((s) => {
      setShortcut(s.shortcut)
      setClipboardMode(s.clipboardMode)
      setAutoShowOnStart(s.autoShowOnStart)
      setCacheTTLMinutes(Number.isFinite(s.cacheTTLMinutes) ? s.cacheTTLMinutes : 30)
      setAllowBetaUpdates(s.allowBetaUpdates ?? false)
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

  const handleModeChange = useCallback((mode: ShortcutMode) => {
    if (!shortcut) return
    handleShortcutChange({ ...shortcut, mode })
  }, [shortcut, handleShortcutChange])

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
        // 显示错误提示
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
      // Success: wait for onPlayAudio event to handle state
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
    return <HistoryPanel onBack={() => {
      setShowHistory(false)
      window.speech.setPanelMode('main')
    }} />
  }

  const currentStatus = STATUS_CONFIG[state.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.idle

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--background))]">
      {/* macOS 交通灯安全区 */}
      <div className="h-7 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Header */}
      <header className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-[hsl(var(--text-primary))]">SpeechTide</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[hsl(var(--muted))]">
            <span className={`status-dot ${currentStatus.class}`} />
            <span className="text-xs text-[hsl(var(--text-secondary))]">{currentStatus.label}</span>
          </div>
        </div>
        <button
          onClick={() => {
            setShowHistory(true)
            setShowSettings(false)
            setShowTest(false)
            window.speech.setPanelMode('history')
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">历史</span>
        </button>
      </header>

      {/* Main content */}
      <main className="px-4">
        {/* Transcript Card - Hero */}
        <div className="transcript-card mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-[hsl(var(--text-secondary))]">转录结果</span>
            <button
              onClick={() => state.transcript && copyToClipboard(state.transcript)}
              disabled={!state.transcript}
              className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                copySuccess
                  ? 'text-emerald-600 bg-emerald-50'
                  : state.transcript
                    ? 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]'
                    : 'text-[hsl(var(--text-tertiary))] cursor-not-allowed'
              }`}
            >
              {copySuccess ? '已复制 ✓' : '复制'}
            </button>
          </div>
          <div className="h-[100px] overflow-y-auto">
            {state.transcript ? (
              <p className="text-sm text-[hsl(var(--text-primary))] leading-relaxed whitespace-pre-wrap">
                {state.transcript}
              </p>
            ) : (
              <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-2">
                {state.status === 'recording' ? '正在录音...' :
                 state.status === 'transcribing' ? '正在转写...' :
                 '按下快捷键开始录音'}
              </p>
            )}
          </div>
        </div>

        {/* Shortcut Bar */}
        <div className="mb-3">
          <div className="divider mb-3" />
          <div className="flex items-center justify-between gap-3">
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
              className={`flex-1 px-3 py-2 text-sm font-mono text-center rounded-lg cursor-pointer transition-all ${
                isRecordingShortcut
                  ? 'bg-[hsl(var(--primary))] text-white'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--secondary))]'
              }`}
              placeholder="点击设置"
            />
            <div className="flex gap-1">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleModeChange(option.value)}
                  className={`chip ${shortcut?.mode === option.value ? 'active' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {state.error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <p className="text-sm text-rose-700">{state.error}</p>
          </div>
        )}
      </main>

      {/* Bottom Section */}
      <div className="flex-shrink-0">
        {/* Footer Bar */}
        <div className="px-4 py-2.5 flex items-center justify-between border-t border-[hsl(var(--border))]">
          <UpdateIndicator />
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const newShowSettings = !showSettings
                setShowSettings(newShowSettings)
                setShowTest(false)
                window.speech.setPanelMode(newShowSettings ? 'withSettings' : 'main')
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                showSettings
                  ? 'bg-[hsl(var(--primary))] text-white'
                  : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              设置
            </button>
            <button
              onClick={() => {
                const newShowTest = !showTest
                setShowTest(newShowTest)
                setShowSettings(false)
                window.speech.setPanelMode(newShowTest ? 'withTest' : 'main')
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                showTest
                  ? 'bg-[hsl(var(--primary))] text-white'
                  : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              测试
            </button>
          </div>
        </div>

        {/* Settings Panel (Below buttons) */}
        {showSettings && (
          <div className="px-4 py-3 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
            <div className="space-y-3">
              <SettingToggle
                label="禁用自动插入"
                checked={clipboardMode}
                onChange={(v) => updateSetting('clipboardMode', v)}
              />
              <SettingToggle
                label="启动时显示面板"
                checked={autoShowOnStart}
                onChange={(v) => updateSetting('autoShowOnStart', v)}
              />
              <SettingToggle
                label="接收测试版更新"
                checked={allowBetaUpdates}
                onChange={(v) => updateSetting('allowBetaUpdates', v)}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-[hsl(var(--text-secondary))]">模型缓存</span>
                <select
                  value={cacheTTLMinutes}
                  onChange={(e) => updateSetting('cacheTTLMinutes', Number(e.target.value))}
                  className="text-sm bg-[hsl(var(--muted))] border-none rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                >
                  <option value={5}>5 分钟</option>
                  <option value={15}>15 分钟</option>
                  <option value={30}>30 分钟</option>
                  <option value={60}>1 小时</option>
                  <option value={0}>永不卸载</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Test Panel (Below buttons) */}
        {showTest && (
          <div className="px-4 py-3 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-[hsl(var(--text-secondary))]">测试转录</span>
              <div className="flex gap-2">
                <button
                  onClick={playTestAudio}
                  disabled={isPlaying}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 transition-colors"
                >
                  {isPlaying ? '播放中...' : '▶ 试听'}
                </button>
                <button
                  onClick={runTest}
                  disabled={testRunning || state.status === 'recording' || state.status === 'transcribing'}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(var(--primary))] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {testRunning ? '测试中...' : '开始测试'}
                </button>
              </div>
            </div>
            {playError && (
              <div className="mb-3 p-2 bg-rose-50 border border-rose-200 rounded-lg">
                <p className="text-xs text-rose-600">{playError}</p>
              </div>
            )}
            {testResult ? (
              <div className="p-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${testResult.processingTime > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {testResult.processingTime > 0 ? `${(testResult.processingTime / 1000).toFixed(1)}s` : 'Error'}
                  </span>
                  {testResult.modelId && <span className="text-xs text-[hsl(var(--text-tertiary))]">{testResult.modelId}</span>}
                </div>
                <div className="max-h-[80px] overflow-y-auto">
                  <p className="text-sm text-[hsl(var(--text-primary))]">{testResult.text || '无结果'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-2">点击测试验证模型</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Toggle switch component
 */
function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[hsl(var(--text-secondary))]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'left-5' : 'left-1'}`} />
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
