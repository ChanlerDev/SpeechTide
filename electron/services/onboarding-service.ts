/**
 * Onboarding 服务
 * 
 * 协调首次启动引导流程的所有功能
 */

import { BrowserWindow, ipcMain } from 'electron'
import {
  loadOnboardingState,
  saveOnboardingState,
  completeStep,
  skipOnboarding,
  shouldShowOnboarding,
  updateMicrophoneStatus,
  updateAccessibilityStatus,
  updateModelStatus,
  type OnboardingState,
} from '../core/onboarding'
import { performFirstLaunchSetup, markInitialized } from '../config/initializer'
import { modelDownloader, type DownloadProgress } from './model-downloader'
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  openMicrophoneSettings,
  openAccessibilitySettings,
} from '../utils/permissions'

/**
 * Onboarding 服务类
 */
export class OnboardingService {
  private window: BrowserWindow | null = null

  /**
   * 初始化服务
   */
  initialize(window: BrowserWindow): void {
    this.window = window
    this.registerIPCHandlers()

    // 执行首次启动设置
    performFirstLaunchSetup()
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIPCHandlers(): void {
    // 获取 Onboarding 状态
    ipcMain.handle('onboarding:getState', async () => {
      return loadOnboardingState()
    })

    // 检查是否需要显示 Onboarding
    ipcMain.handle('onboarding:shouldShow', async () => {
      return shouldShowOnboarding()
    })

    // 完成步骤
    ipcMain.handle('onboarding:completeStep', async (_, step: keyof OnboardingState['steps']) => {
      return completeStep(step)
    })

    // 跳过 Onboarding
    ipcMain.handle('onboarding:skip', async () => {
      markInitialized()
      return skipOnboarding()
    })

    // 检查权限
    ipcMain.handle('onboarding:checkPermissions', async () => {
      const microphone = checkMicrophonePermission()
      const accessibility = checkAccessibilityPermission()
      
      // 转换 'restricted' 为 'denied'
      const micStatus = microphone === 'restricted' ? 'denied' : microphone
      updateMicrophoneStatus(micStatus)
      updateAccessibilityStatus(accessibility)
      
      return { microphone: micStatus, accessibility }
    })

    // 请求麦克风权限
    ipcMain.handle('onboarding:requestMicrophonePermission', async () => {
      const granted = await requestMicrophonePermission()
      const rawStatus = checkMicrophonePermission()
      const status = rawStatus === 'restricted' ? 'denied' : rawStatus
      updateMicrophoneStatus(status)
      return { granted, status }
    })

    // 请求辅助功能权限
    ipcMain.handle('onboarding:requestAccessibilityPermission', async () => {
      requestAccessibilityPermission()
      // 辅助功能权限需要用户手动授权，返回当前状态
      const status = checkAccessibilityPermission()
      updateAccessibilityStatus(status)
      return { status }
    })

    // 打开麦克风设置
    ipcMain.handle('onboarding:openMicrophoneSettings', async () => {
      openMicrophoneSettings()
    })

    // 打开辅助功能设置
    ipcMain.handle('onboarding:openAccessibilitySettings', async () => {
      openAccessibilitySettings()
    })

    // 检查模型状态
    ipcMain.handle('onboarding:checkModel', async () => {
      const status = modelDownloader.getModelStatus()
      updateModelStatus({ downloaded: status.downloaded })
      return status
    })

    // 下载模型
    ipcMain.handle('onboarding:downloadModel', async () => {
      updateModelStatus({ downloading: true, progress: 0, error: undefined })
      
      const result = await modelDownloader.download('sensevoice-small', (progress: DownloadProgress) => {
        updateModelStatus({ progress: progress.percent })
        this.sendToRenderer('onboarding:downloadProgress', progress)
      })
      
      updateModelStatus({
        downloading: false,
        downloaded: result.success,
        error: result.error,
        progress: result.success ? 100 : 0,
      })
      
      return result
    })

    // 取消下载
    ipcMain.handle('onboarding:cancelDownload', async () => {
      modelDownloader.cancel()
      updateModelStatus({ downloading: false, progress: 0 })
    })

    // 获取可用模型列表
    ipcMain.handle('onboarding:getAvailableModels', async () => {
      return modelDownloader.getAvailableModels()
    })

    // 完成 Onboarding
    ipcMain.handle('onboarding:finish', async () => {
      markInitialized()
      return saveOnboardingState({ completed: true, currentStep: 'complete' })
    })
  }

  /**
   * 发送消息到渲染进程
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  /**
   * 检查是否需要显示 Onboarding
   */
  shouldShow(): boolean {
    return shouldShowOnboarding()
  }

  /**
   * 获取当前状态
   */
  getState(): OnboardingState {
    return loadOnboardingState()
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    // 移除所有 IPC 处理器
    const handlers = [
      'onboarding:getState',
      'onboarding:shouldShow',
      'onboarding:completeStep',
      'onboarding:skip',
      'onboarding:checkPermissions',
      'onboarding:requestMicrophonePermission',
      'onboarding:requestAccessibilityPermission',
      'onboarding:openMicrophoneSettings',
      'onboarding:openAccessibilitySettings',
      'onboarding:checkModel',
      'onboarding:downloadModel',
      'onboarding:cancelDownload',
      'onboarding:getAvailableModels',
      'onboarding:finish',
    ]

    for (const handler of handlers) {
      ipcMain.removeHandler(handler)
    }

    this.window = null
  }
}

// 导出单例
export const onboardingService = new OnboardingService()
