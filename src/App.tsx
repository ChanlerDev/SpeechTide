/**
 * Copyright (c) 2025 SpeechTide Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import type { SpeechTideState, ShortcutConfig } from '../shared/app-state'
import { TranscriptionCard } from './components/TranscriptionCard'
import { ShortcutSettings } from './components/ShortcutSettings'
import { TestTranscription } from './components/TestTranscription'
import { AppSettings } from './components/AppSettings'
import { ErrorDisplay } from './components/ErrorDisplay'
import { UpdateStatus } from './components/UpdateStatus'
import { Onboarding } from './components/Onboarding'
import { useNativeRecorder } from './hooks/useNativeRecorder'

const INITIAL_STATE: SpeechTideState = {
  status: 'idle',
  message: '正在连接主进程…',
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
 * 主应用组件
 *
 * SpeechTide 的主界面，负责状态管理和组件协调
 */
function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [state, setState] = useState<SpeechTideState>(INITIAL_STATE)
  const [shortcut, setShortcut] = useState<ShortcutConfig | null>(null)
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [testCopySuccess, setTestCopySuccess] = useState(false)
  const [clipboardMode, setClipboardMode] = useState(false)
  const [autoShowOnStart, setAutoShowOnStart] = useState(false)
  const [cacheTTLMinutes, setCacheTTLMinutes] = useState(30)
  const [appleScriptPermission, setAppleScriptPermission] = useState<{
    available: boolean
    hasPermission: boolean
    message: string
    guide?: string
  } | null>(null)
  const [historyStats, setHistoryStats] = useState<{ count: number; sizeBytes: number; error?: string } | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 初始化原生录音（无需 SoX）
  useNativeRecorder()

  // 检查是否需要显示 Onboarding
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const shouldShow = await window.onboarding.shouldShow()
        setShowOnboarding(shouldShow)
      } catch (error) {
        console.error('检查 Onboarding 状态失败:', error)
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
      // 兜底处理：防止配置缺字段或损坏
      setCacheTTLMinutes(Number.isFinite(s.cacheTTLMinutes) ? s.cacheTTLMinutes : 30)
    })

    // 检查 AppleScript 权限
    const checkAppleScript = async () => {
      try {
        const result = await window.speech.checkAppleScriptPermission()
        setAppleScriptPermission(result)
      } catch (err) {
        console.error('检查 AppleScript 权限失败:', err)
        setAppleScriptPermission({
          available: false,
          hasPermission: false,
          message: '检查权限失败'
        })
      }
    }
    checkAppleScript()

    // 加载历史记录统计（默认7天前）
    const loadHistoryStats = async () => {
      try {
        const stats = await window.speech.getHistoryStats({ maxAgeDays: 7 })
        setHistoryStats(stats)
      } catch (err) {
        console.error('加载历史记录统计失败:', err)
        setHistoryStats({ count: 0, sizeBytes: 0, error: '加载失败' })
      }
    }
    loadHistoryStats()

    // 监听音频播放事件
    const disposeAudio = window.speech.onPlayAudio((audioPath) => {
      console.log('[App] 收到播放音频事件:', audioPath)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      // 尝试多种方式加载音频
      const audio = new Audio()
      audioRef.current = audio

      // 设置事件监听器
      audio.onended = () => {
        console.log('[App] 音频播放结束')
        setIsPlaying(false)
      }
      audio.onerror = (e) => {
        console.error('[App] 音频播放错误:', e, '路径:', audioPath)
        setIsPlaying(false)
      }
      audio.oncanplay = () => {
        console.log('[App] 音频可以播放')
      }
      audio.onloadstart = () => {
        console.log('[App] 音频开始加载')
      }

      // 尝试不同的路径格式
      const audioSrc = audioPath.startsWith('http') ? audioPath : `file://${audioPath}`
      console.log('[App] 设置音频源:', audioSrc)
      audio.src = audioSrc
      audio.volume = 0.8 // 设置音量

      // 尝试播放
      audio.play()
        .then(() => {
          console.log('[App] 音频开始播放')
          setIsPlaying(true)
        })
        .catch((err) => {
          console.error('[App] 音频播放失败:', err)
          setIsPlaying(false)
        })
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

  const copyToClipboard = async (text: string, setSuccess: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleShortcutChange = useCallback(
    async (newShortcut: ShortcutConfig) => {
      const result = await window.speech.updateShortcut(newShortcut)
      if (result.success) {
        setShortcut(newShortcut)
      }
      return result
    },
    []
  )

  const playTestAudio = async () => {
    if (isPlaying) return
    setIsPlaying(true)
    try {
      await window.speech.playTestAudio()
    } catch (err) {
      console.error('播放失败:', err)
    } finally {
      setIsPlaying(false)
    }
  }

  const updateClipboardMode = async (value: boolean) => {
    setClipboardMode(value)
    try {
      await window.speech.updateSettings({ clipboardMode: value })
    } catch (err) {
      console.error('更新剪贴板模式设置失败:', err)
    }
  }

  const updateAutoShowOnStart = async (value: boolean) => {
    setAutoShowOnStart(value)
    try {
      await window.speech.updateSettings({ autoShowOnStart: value })
    } catch (err) {
      console.error('更新启动显示设置失败:', err)
    }
  }

  const updateCacheTTL = async (value: number) => {
    setCacheTTLMinutes(value)
    try {
      await window.speech.updateSettings({ cacheTTLMinutes: value })
    } catch (err) {
      console.error('更新缓存时间设置失败:', err)
    }
  }

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
      }
    } finally {
      setTestRunning(false)
    }
  }

  const refreshAppleScriptPermission = async () => {
    try {
      const result = await window.speech.checkAppleScriptPermission()
      setAppleScriptPermission(result)
    } catch (err) {
      console.error('检查 AppleScript 权限失败:', err)
    }
  }

  const refreshHistoryStats = async (maxAgeDays: number) => {
    try {
      const stats = await window.speech.getHistoryStats({ maxAgeDays })
      setHistoryStats(stats)
    } catch (err) {
      console.error('刷新历史记录统计失败:', err)
      setHistoryStats({ count: 0, sizeBytes: 0, error: '刷新失败' })
    }
  }

  const clearHistory = async (maxAgeDays: number) => {
    if (isClearing) return
    setIsClearing(true)
    setClearError(null)
    try {
      const result = await window.speech.clearHistory({ maxAgeDays })
      if (result.success) {
        console.log(`已删除 ${result.deletedCount} 条历史记录`)
      } else {
        setClearError(result.error || '清除失败')
      }
    } catch (err) {
      console.error('清除历史记录失败:', err)
      setClearError(err instanceof Error ? err.message : '清除失败')
    } finally {
      setIsClearing(false)
    }
  }

  // 显示加载状态
  if (showOnboarding === null) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    )
  }

  // 显示 Onboarding
  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />
  }

  // 状态指示器颜色
  const statusConfig = {
    idle: { color: 'bg-gray-400', label: '就绪' },
    recording: { color: 'bg-red-500 animate-pulse', label: '录音中' },
    transcribing: { color: 'bg-blue-500 animate-pulse', label: '转写中' },
    ready: { color: 'bg-green-500', label: '完成' },
    error: { color: 'bg-red-500', label: '错误' },
  }
  const currentStatus = statusConfig[state.status as keyof typeof statusConfig] || statusConfig.idle

  return (
    <div className="h-full bg-gradient-to-b from-slate-50 to-white flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {/* 头部状态 */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white text-sm">🎙️</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-gray-800">SpeechTide</h1>
                <p className="text-xs text-gray-400 truncate max-w-[180px]">{state.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${currentStatus.color}`} />
              <span className="text-xs text-gray-500">{currentStatus.label}</span>
            </div>
          </div>

          {/* 转录文本卡片 */}
          <TranscriptionCard
            transcript={state.transcript}
            copySuccess={copySuccess}
            onCopy={() => state.transcript && copyToClipboard(state.transcript, setCopySuccess)}
          />

          {/* 快捷键设置 */}
          <ShortcutSettings
            shortcut={shortcut}
            isRecordingShortcut={isRecordingShortcut}
            onShortcutChange={handleShortcutChange}
            onRecordingChange={(recording) => {
              setIsRecordingShortcut(recording)
              window.speech.setShortcutRecording(recording)
            }}
          />

          {/* 测试转录 */}
          <TestTranscription
            testRunning={testRunning}
            testResult={testResult}
            isPlaying={isPlaying}
            testCopySuccess={testCopySuccess}
            stateStatus={state.status}
            onPlayTestAudio={playTestAudio}
            onRunTest={runTest}
            onCopyTestResult={() => copyToClipboard(testResult?.text || '', setTestCopySuccess)}
          />

          {/* 应用设置 */}
          <AppSettings
            clipboardMode={clipboardMode}
            autoShowOnStart={autoShowOnStart}
            cacheTTLMinutes={cacheTTLMinutes}
            appleScriptPermission={appleScriptPermission}
            historyStats={historyStats}
            isClearing={isClearing}
            clearError={clearError}
            onUpdateClipboardMode={updateClipboardMode}
            onUpdateAutoShowOnStart={updateAutoShowOnStart}
            onUpdateCacheTTL={updateCacheTTL}
            onRefreshAppleScriptPermission={refreshAppleScriptPermission}
            onClearHistory={clearHistory}
            onRefreshHistoryStats={refreshHistoryStats}
          />

          {/* 错误显示 */}
          <ErrorDisplay error={state.error} />

          {/* 更新状态 */}
          <UpdateStatus />
        </div>
      </div>
    </div>
  )
}

export default App
