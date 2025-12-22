import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { SpeechTideState } from '../shared/app-state'
import type { ShortcutConfig } from '../shared/app-state'

console.log('[Preload] 脚本开始执行')

const speechAPI = {
  /** 订阅状态变化，返回取消函数 */
  onStateChange(callback: (state: SpeechTideState) => void) {
    const listener = (_event: IpcRendererEvent, state: SpeechTideState) => {
      callback(state)
    }
    ipcRenderer.on('speech:state', listener)
    return () => {
      ipcRenderer.off('speech:state', listener)
    }
  },
  /** 主动获取当前状态 */
  getState() {
    return ipcRenderer.invoke('speech:get-state')
  },
  /** 切换录音流程（用于按钮/快捷键模拟） */
  toggleRecording() {
    return ipcRenderer.invoke('speech:toggle-recording')
  },
  /** 显示或隐藏浮窗 */
  toggleWindow() {
    return ipcRenderer.invoke('speech:toggle-window')
  },
  /** 查询当前快捷键配置 */
  getShortcut() {
    return ipcRenderer.invoke('speech:get-shortcut')
  },
  /** 运行测试转写 */
  testTranscription() {
    return ipcRenderer.invoke('speech:test-transcription')
  },
  /** 更新快捷键配置 */
  updateShortcut(shortcut: ShortcutConfig) {
    return ipcRenderer.invoke('speech:update-shortcut', shortcut)
  },
  /** 设置是否正在录入快捷键（暂停/恢复键盘监听） */
  setShortcutRecording(recording: boolean) {
    return ipcRenderer.invoke('speech:set-shortcut-recording', recording)
  },
  /** 设置面板模式（动态调整窗口高度） */
  setPanelMode(mode: 'main' | 'withSettings' | 'withTest' | 'history') {
    return ipcRenderer.invoke('speech:set-panel-mode', mode)
  },
  /** 获取应用设置 */
  getSettings() {
    return ipcRenderer.invoke('speech:get-settings')
  },
  /** 更新应用设置 */
  updateSettings(settings: Record<string, unknown>) {
    return ipcRenderer.invoke('speech:update-settings', settings)
  },
  /** 检查 AppleScript 权限 */
  checkAppleScriptPermission() {
    return ipcRenderer.invoke('speech:check-applescript-permission')
  },
  /** 播放测试音频 */
  playTestAudio() {
    return ipcRenderer.invoke('speech:play-test-audio')
  },
  /** 获取历史记录统计信息 */
  getHistoryStats(options?: { maxAgeDays?: number }) {
    return ipcRenderer.invoke('speech:get-history-stats', options || {})
  },
  /** 清除历史记录 */
  clearHistory(options?: { maxAgeDays?: number }) {
    return ipcRenderer.invoke('speech:clear-history', options || {})
  },
  /** 获取历史记录列表 */
  getHistoryList(options?: { limit?: number; offset?: number }) {
    return ipcRenderer.invoke('speech:get-history-list', options || {})
  },
  /** 删除单条历史记录 */
  deleteHistoryItem(sessionId: string) {
    return ipcRenderer.invoke('speech:delete-history-item', sessionId)
  },
  /** 播放历史录音 */
  playHistoryAudio(sessionId: string) {
    return ipcRenderer.invoke('speech:play-history-audio', sessionId)
  },
  /** 监听音频播放事件 */
  onPlayAudio(callback: (audioPath: string) => void) {
    const listener = (_event: IpcRendererEvent, audioPath: string) => {
      callback(audioPath)
    }
    ipcRenderer.on('speech:play-audio', listener)
    return () => {
      ipcRenderer.off('speech:play-audio', listener)
    }
  },
}

// Onboarding API
// Native Recorder API - 用于渲染进程录音
const nativeRecorderAPI = {
  onStart(callback: (config: unknown) => void) {
    const listener = (_event: IpcRendererEvent, config: unknown) => callback(config)
    ipcRenderer.on('native-recorder:start', listener)
    return () => ipcRenderer.off('native-recorder:start', listener)
  },
  onStop(callback: () => void) {
    const listener = () => callback()
    ipcRenderer.on('native-recorder:stop', listener)
    return () => ipcRenderer.off('native-recorder:stop', listener)
  },
  sendChunk(data: ArrayBuffer) {
    ipcRenderer.send('native-recorder:chunk', data)
  },
  sendComplete(data: ArrayBuffer | null = null) {
    ipcRenderer.send('native-recorder:complete', data)
  },
}

// Update API - 自动更新
const updateAPI = {
  /** 获取更新状态 */
  getState() {
    return ipcRenderer.invoke('update:getState')
  },
  /** 检查更新 */
  check() {
    return ipcRenderer.invoke('update:check')
  },
  /** 下载更新 */
  download() {
    return ipcRenderer.invoke('update:download')
  },
  /** 立即安装（重启应用） */
  install() {
    return ipcRenderer.invoke('update:install')
  },
  /** 打开 GitHub Releases 页面 */
  openReleasePage() {
    return ipcRenderer.invoke('update:openReleasePage')
  },
  /** 获取当前版本 */
  getVersion() {
    return ipcRenderer.invoke('update:getVersion')
  },
  /** 监听状态变化 */
  onStateChange(callback: (state: unknown) => void) {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.off('update:state', listener)
  },
  /** 监听下载进度 */
  onProgress(callback: (progress: unknown) => void) {
    const listener = (_event: IpcRendererEvent, progress: unknown) => callback(progress)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.off('update:progress', listener)
  },
}

const onboardingAPI = {
  /** 获取 Onboarding 状态 */
  getState() {
    return ipcRenderer.invoke('onboarding:getState')
  },
  /** 检查是否需要显示 Onboarding */
  shouldShow() {
    return ipcRenderer.invoke('onboarding:shouldShow')
  },
  /** 完成步骤 */
  completeStep(step: string) {
    return ipcRenderer.invoke('onboarding:completeStep', step)
  },
  /** 跳过 Onboarding */
  skip() {
    return ipcRenderer.invoke('onboarding:skip')
  },
  /** 检查权限 */
  checkPermissions() {
    return ipcRenderer.invoke('onboarding:checkPermissions')
  },
  /** 请求麦克风权限 */
  requestMicrophonePermission() {
    return ipcRenderer.invoke('onboarding:requestMicrophonePermission')
  },
  /** 请求辅助功能权限 */
  requestAccessibilityPermission() {
    return ipcRenderer.invoke('onboarding:requestAccessibilityPermission')
  },
  /** 打开麦克风设置 */
  openMicrophoneSettings() {
    return ipcRenderer.invoke('onboarding:openMicrophoneSettings')
  },
  /** 打开辅助功能设置 */
  openAccessibilitySettings() {
    return ipcRenderer.invoke('onboarding:openAccessibilitySettings')
  },
  /** 检查模型状态 */
  checkModel() {
    return ipcRenderer.invoke('onboarding:checkModel')
  },
  /** 下载模型 */
  downloadModel() {
    return ipcRenderer.invoke('onboarding:downloadModel')
  },
  /** 取消下载 */
  cancelDownload() {
    return ipcRenderer.invoke('onboarding:cancelDownload')
  },
  /** 监听下载进度 */
  onDownloadProgress(callback: (progress: number) => void) {
    const listener = (_event: IpcRendererEvent, progress: number) => callback(progress)
    ipcRenderer.on('onboarding:downloadProgress', listener)
    return () => ipcRenderer.off('onboarding:downloadProgress', listener)
  },
  /** 获取可用模型列表 */
  getAvailableModels() {
    return ipcRenderer.invoke('onboarding:getAvailableModels')
  },
  /** 完成 Onboarding */
  finish() {
    return ipcRenderer.invoke('onboarding:finish')
  },
}

try {
  contextBridge.exposeInMainWorld('speech', speechAPI)
  contextBridge.exposeInMainWorld('onboarding', onboardingAPI)
  contextBridge.exposeInMainWorld('nativeRecorder', nativeRecorderAPI)
  contextBridge.exposeInMainWorld('update', updateAPI)
  console.log('[Preload] ✓ API 暴露成功')
} catch (error) {
  console.error('[Preload] ❌ API 暴露失败:', error)
}
