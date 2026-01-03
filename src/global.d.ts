import type { SpeechTideState, ShortcutConfig } from '../shared/app-state'
import type { ConversationRecord } from '../shared/conversation'
import type { AppSettings } from '../electron/config'

interface TestTranscriptionResult {
  text: string
  duration: number
  processingTime: number
  modelId: string
  language?: string
}

interface OnboardingState {
  currentStep: string
  completed: boolean
  steps: Record<string, boolean>
  permissions: { microphone: string; accessibility: boolean }
  model: { downloaded: boolean; downloading: boolean; progress: number; error?: string }
}

interface DownloadProgress {
  file: string
  downloaded: number
  total: number
  percent: number
  speed: string
}

interface ModelInfo {
  id: string
  name: string
  description: string
  size: string
}

interface NativeRecorderAPI {
  onStart: (callback: (config: { sampleRate: number; channels: number }) => void) => () => void
  onStop: (callback: () => void) => () => void
  sendChunk: (data: ArrayBuffer) => void
  sendComplete: (data?: ArrayBuffer | null) => void
}

/** 更新状态 */
type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error'

/** 更新进度 */
interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

/** 更新状态信息 */
interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  releaseNotes?: string
  progress?: UpdateProgress
  error?: string
}

interface UpdateAPI {
  getState: () => Promise<UpdateState>
  check: () => Promise<{ hasUpdate: boolean; version?: string; error?: string }>
  download: () => Promise<{ success: boolean; error?: string }>
  install: () => Promise<void>
  openReleasePage: () => Promise<void>
  getVersion: () => Promise<string>
  onStateChange: (callback: (state: UpdateState) => void) => () => void
  onProgress: (callback: (progress: UpdateProgress) => void) => () => void
}

declare global {
  interface Window {
    nativeRecorder: NativeRecorderAPI
    update: UpdateAPI
    speech: {
      onStateChange: (callback: (state: SpeechTideState) => void) => () => void
      getState: () => Promise<SpeechTideState>
      toggleRecording: () => Promise<SpeechTideState>
      toggleWindow: () => Promise<boolean>
      getShortcut: () => Promise<ShortcutConfig>
      testTranscription: () => Promise<{ success: boolean; data?: TestTranscriptionResult; error?: string }>
      updateShortcut: (shortcut: ShortcutConfig) => Promise<{ success: boolean; error?: string }>
      setShortcutRecording: (recording: boolean) => Promise<void>
      getSettings: () => Promise<AppSettings>
      updateSettings: (settings: Partial<Omit<AppSettings, 'shortcut'>>) => Promise<{ success: boolean; error?: string }>
      checkAppleScriptPermission: () => Promise<{ available: boolean; hasPermission: boolean; message: string; guide?: string }>
      playTestAudio: () => Promise<{ success: boolean; error?: string }>
      getHistoryStats: (options?: { maxAgeDays?: number }) => Promise<{ count: number; sizeBytes: number; error?: string }>
      clearHistory: (options?: { maxAgeDays?: number }) => Promise<{ success: boolean; deletedCount?: number; error?: string }>
      getHistoryList: (options?: { limit?: number; offset?: number }) => Promise<{ records: ConversationRecord[]; error?: string }>
      deleteHistoryItem: (sessionId: string) => Promise<{ success: boolean; error?: string }>
      playHistoryAudio: (sessionId: string) => Promise<{ success: boolean; error?: string }>
      onPlayAudio: (callback: (audioPath: string) => void) => () => void
    }
    onboarding: {
      getState: () => Promise<OnboardingState>
      shouldShow: () => Promise<boolean>
      completeStep: (step: string) => Promise<unknown>
      skip: () => Promise<unknown>
      checkPermissions: () => Promise<{ microphone: string; accessibility: boolean }>
      requestMicrophonePermission: () => Promise<{ granted: boolean; status: string }>
      requestAccessibilityPermission: () => Promise<{ status: boolean }>
      openMicrophoneSettings: () => Promise<void>
      openAccessibilitySettings: () => Promise<void>
      checkModel: () => Promise<{ downloaded: boolean; path?: string; size?: number }>
      downloadModel: () => Promise<{ success: boolean; modelPath?: string; error?: string }>
      cancelDownload: () => Promise<void>
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
      getAvailableModels: () => Promise<ModelInfo[]>
      finish: () => Promise<unknown>
    }
  }
}

export {}
