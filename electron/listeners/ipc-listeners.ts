/**
 * SpeechTide IPC 监听器
 *
 * 负责注册和处理渲染进程的 IPC 请求
 */

import { ipcMain } from 'electron'
import type { ShortcutConfig, SpeechTideState } from '../../shared/app-state'
import { loadAppSettings } from '../config'

export interface IPCHandlers {
  getState: () => SpeechTideState
  toggleRecording: () => SpeechTideState
  toggleWindow: () => boolean
  getShortcut: () => ShortcutConfig
  updateShortcut: (shortcut: ShortcutConfig) => Promise<{ success: boolean; error?: string }>
  setShortcutRecording: (recording: boolean) => void
  getSettings: () => ReturnType<typeof loadAppSettings>
  updateSettings: (settings: Partial<{
    autoInsertText: boolean
    clipboardMode: boolean
    notificationEnabled: boolean
    autoShowOnStart: boolean
    cacheTTLMinutes: number
  }>) => Promise<{ success: boolean; error?: string }>
  checkAppleScriptPermission: () => Promise<{
    available: boolean
    hasPermission: boolean
    message: string
    guide?: string
  }>
  testTranscription: () => Promise<{
    success: boolean
    data?: {
      text: string
      duration: number
      processingTime: number
      modelId: string
      language: string
    }
    error?: string
  }>
  playTestAudio: () => Promise<{ success: boolean; error?: string }>
  getHistoryStats: () => Promise<{ count: number; sizeBytes: number }>
  clearHistory: (options: { maxAgeDays?: number }) => Promise<{ success: boolean; deletedCount?: number; error?: string }>
}

/**
 * IPC 监听器类
 */
export class IPCListeners {
  private handlers: IPCHandlers | null = null
  private registered = false

  /**
   * 注册 IPC 处理器
   */
  register(handlers: IPCHandlers): void {
    if (this.registered) {
      console.log('[IPCListeners] IPC 处理器已注册，跳过')
      return
    }

    this.handlers = handlers

    // 状态获取
    ipcMain.handle('speech:get-state', () => {
      return this.handlers?.getState()
    })

    // 录音切换
    ipcMain.handle('speech:toggle-recording', () => {
      return this.handlers?.toggleRecording()
    })

    // 窗口切换
    ipcMain.handle('speech:toggle-window', () => {
      return this.handlers?.toggleWindow()
    })

    // 获取快捷键配置
    ipcMain.handle('speech:get-shortcut', () => {
      return this.handlers?.getShortcut()
    })

    // 更新快捷键配置
    ipcMain.handle('speech:update-shortcut', async (_event, shortcut: ShortcutConfig) => {
      console.log('[IPCListeners] 更新快捷键:', shortcut)
      return this.handlers?.updateShortcut(shortcut)
    })

    // 获取设置
    ipcMain.handle('speech:get-settings', () => {
      return this.handlers?.getSettings()
    })

    // 更新设置
    ipcMain.handle('speech:update-settings', async (_event, settings) => {
      console.log('[IPCListeners] 更新设置:', settings)
      return this.handlers?.updateSettings(settings)
    })

    // 检查 AppleScript 权限
    ipcMain.handle('speech:check-applescript-permission', async () => {
      return this.handlers?.checkAppleScriptPermission()
    })

    // 测试转写
    ipcMain.handle('speech:test-transcription', async () => {
      return this.handlers?.testTranscription()
    })

    // 播放测试音频
    ipcMain.handle('speech:play-test-audio', async () => {
      return this.handlers?.playTestAudio()
    })

    // 设置快捷键录入状态（暂停/恢复键盘监听）
    ipcMain.handle('speech:set-shortcut-recording', (_event, recording: boolean) => {
      this.handlers?.setShortcutRecording(recording)
    })

    // 获取历史记录统计
    ipcMain.handle('speech:get-history-stats', async () => {
      return this.handlers?.getHistoryStats()
    })

    // 清除历史记录
    ipcMain.handle('speech:clear-history', async (_event, options: { maxAgeDays?: number }) => {
      return this.handlers?.clearHistory(options)
    })

    this.registered = true
    console.log('[IPCListeners] ✓ IPC 处理器注册完成')
  }

  /**
   * 移除所有 IPC 处理器
   */
  unregister(): void {
    if (!this.registered) return

    ipcMain.removeHandler('speech:get-state')
    ipcMain.removeHandler('speech:toggle-recording')
    ipcMain.removeHandler('speech:toggle-window')
    ipcMain.removeHandler('speech:get-shortcut')
    ipcMain.removeHandler('speech:update-shortcut')
    ipcMain.removeHandler('speech:get-settings')
    ipcMain.removeHandler('speech:update-settings')
    ipcMain.removeHandler('speech:check-applescript-permission')
    ipcMain.removeHandler('speech:test-transcription')
    ipcMain.removeHandler('speech:play-test-audio')
    ipcMain.removeHandler('speech:set-shortcut-recording')
    ipcMain.removeHandler('speech:get-history-stats')
    ipcMain.removeHandler('speech:clear-history')

    this.handlers = null
    this.registered = false
    console.log('[IPCListeners] IPC 处理器已移除')
  }
}
