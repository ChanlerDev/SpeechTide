/**
 * SpeechTide 应用控制器
 *
 * 整合所有服务，协调应用的核心业务逻辑
 */

import { app, clipboard } from 'electron'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { SpeechTideState, TranscriptionMeta, TriggerType } from '../../shared/app-state'
import { DEFAULT_TAP_POLISH_ENABLED, DEFAULT_HOLD_POLISH_ENABLED } from '../../shared/app-state'
import type { ConversationRecord } from '../../shared/conversation'
import { StateMachine } from './state-machine'
import { WindowService } from '../services/window-service'
import { TrayService } from '../services/tray-service'
import { KeyboardHookService } from '../services/keyboard-hook-service'
import { IPCListeners } from '../listeners/ipc-listeners'
import { ipcMain } from 'electron'
import { AudioRecorder, RecordingHandle, RecordingResult, NativeRecordingHandle } from '../audio/audio-recorder'
import { createTranscriber, Transcriber, type OpenAITranscriberConfig } from '../transcriber'
import { getDefaultSupportDirectory, loadRecorderConfig, loadTranscriberConfig, loadAppSettings, saveAppSettings } from '../config'
import { ConversationStore } from '../storage/conversation-store'
import { AppleScriptTextInserter } from '../utils/apple-script'
import { STATUS_LABEL, DEFAULT_TEST_AUDIO_URL, APP_CONSTANTS } from '../config/constants'
import { createModuleLogger } from '../utils/logger'
import { metrics } from '../utils/metrics'
import { onboardingService } from '../services/onboarding-service'
import { updateService } from '../services/update-service'
import { PolishEngine } from '../services/polish-engine'

const logger = createModuleLogger('app-controller')

const isMac = process.platform === 'darwin'

export class AppController {
  // 服务实例
  private stateMachine = new StateMachine()
  private windowService: WindowService | null = null
  private trayService: TrayService | null = null
  private keyboardHookService: KeyboardHookService | null = null
  private ipcListeners = new IPCListeners()

  // 业务组件
  private readonly recorderConfig = loadRecorderConfig()
  private readonly senseVoiceConfig = loadTranscriberConfig()
  private readonly supportDir = getDefaultSupportDirectory()
  private readonly conversationsDir = path.join(this.supportDir, 'conversations')
  // 测试音频存储在 assets 目录（持久化，不会被系统清空）
  private readonly testAudioPath = path.join(this.supportDir, 'assets', 'test-audio.wav')
  private readonly audioRecorder = new AudioRecorder(this.conversationsDir, this.recorderConfig)
  private transcriber: Transcriber | null = null  // 懒加载，支持动态卸载
  private readonly conversationStore = new ConversationStore(this.conversationsDir)
  private readonly appleScriptInserter = new AppleScriptTextInserter()
  private polishEngine: PolishEngine | null = null  // 润色引擎

  // 状态
  private initialized = false
  private activeRecording: { sessionId: string; handle: RecordingHandle | NativeRecordingHandle; timeout?: NodeJS.Timeout; recordingTimer?: string } | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private cacheTimer: NodeJS.Timeout | null = null  // 模型缓存卸载计时器
  private testInProgress = false
  private settings = loadAppSettings()

  constructor() {
    fs.mkdirSync(this.supportDir, { recursive: true })
    fs.mkdirSync(this.conversationsDir, { recursive: true })
    fs.mkdirSync(path.dirname(this.testAudioPath), { recursive: true })
    // 初始化润色引擎
    if (this.settings.polish) {
      this.polishEngine = new PolishEngine(this.settings.polish)
    }
  }

  /**
   * 初始化应用
   */
  async init(): Promise<void> {
    if (this.initialized) {
      logger.info('应用已初始化，跳过')
      return
    }

    const initTimer = metrics.startTimer('model_load', 'app_init')
    logger.info('开始初始化...')

    // 单实例锁
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
      logger.info('检测到已有实例，退出')
      app.quit()
      return
    }

    app.on('second-instance', () => {
      logger.info('第二实例尝试启动，聚焦当前窗口')
      this.focusWindow(true)
    })

    await app.whenReady()
    logger.info('Electron 已就绪')

    if (isMac) {
      app.dock.hide()
    }

    this.initServices()
    this.registerIPC()
    this.registerNativeRecordingIPC()
    this.setupStateListeners()

    // 应用 beta 更新设置
    updateService.setAllowBetaUpdates(this.settings.allowBetaUpdates)

    this.initialized = true
    metrics.endTimer(initTimer, 'model_load', { stage: 'app_init' })
    logger.info('初始化完成')
  }

  /**
   * 初始化服务
   */
  private initServices(): void {
    const isDev = !!process.env.VITE_DEV_SERVER_URL
    
    // 计算应用根目录
    // __dirname 在打包后指向 dist-electron/，所以只需要向上一级
    const appRoot = isDev
      ? path.resolve(__dirname, '..')
      : app.getAppPath()
    
    // preload 脚本路径
    const preloadPath = isDev
      ? path.join(appRoot, 'dist-electron', 'preload.cjs')
      : path.join(appRoot + '.unpacked', 'dist-electron', 'preload.cjs')
    
    const rendererDist = path.join(appRoot, 'dist')
    const publicPath = isDev ? path.join(appRoot, 'public') : rendererDist
    
    logger.info('路径配置', { appRoot, preloadPath, rendererDist, isDev })

    // 窗口服务
    this.windowService = new WindowService({
      preloadPath,
      isDev,
      devServerUrl: process.env.VITE_DEV_SERVER_URL,
      rendererDist,
      autoShowOnStart: this.settings.autoShowOnStart,
    })
    this.windowService.createWindow()

    // 托盘服务
    this.trayService = new TrayService({ publicPath, rendererDist })
    this.trayService.createTray({
      onToggleRecording: () => this.handleToggleRecording(),
      onStopRecording: () => this.handleToggleRecording(),
      onOpenPanel: () => this.focusWindow(true),
      onQuit: () => app.quit(),
      onDownloadUpdate: () => this.handleUpdateAction(),
    })
    this.refreshTrayMenu()

    // 键盘钩子服务（延迟启动，等待权限检查）
    this.keyboardHookService = new KeyboardHookService(this.settings.shortcut)
    this.tryStartKeyboardHook()

    // Onboarding 服务
    const mainWindow = this.windowService.getWindow()
    if (mainWindow) {
      onboardingService.initialize(mainWindow)
      logger.info('Onboarding 服务已初始化')

      // 更新服务
      updateService.initialize(mainWindow)
      // 设置状态回调，用于刷新托盘菜单
      updateService.setStateCallback(() => {
        this.refreshTrayMenu()
      })
      // 生产环境启动定时检查
      if (!isDev) {
        updateService.startScheduledCheck(60 * 60 * 1000)  // 1小时
      }
      logger.info('更新服务已初始化')
    }
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIPC(): void {
    this.ipcListeners.register({
      getState: () => this.stateMachine.getState(),
      toggleRecording: () => {
        this.handleToggleRecording()
        return this.stateMachine.getState()
      },
      toggleWindow: () => {
        this.windowService?.toggleWindow()
        return this.windowService?.isVisible() ?? false
      },
      getShortcut: () => this.settings.shortcut,
      updateShortcut: async (shortcut) => {
        try {
          saveAppSettings({ shortcut })
          this.settings.shortcut = shortcut
          this.keyboardHookService?.updateConfig(shortcut)
          return { success: true }
        } catch (error) {
          return { success: false, error: String(error) }
        }
      },
      getSettings: () => loadAppSettings(),
      updateSettings: async (settings) => {
        try {
          // 校验 cacheTTLMinutes 入参
          if (settings.cacheTTLMinutes !== undefined) {
            const validValues = [0, 5, 15, 30, 60]
            if (!Number.isFinite(settings.cacheTTLMinutes) || !validValues.includes(settings.cacheTTLMinutes)) {
              logger.warn(`无效的缓存时间值: ${settings.cacheTTLMinutes}，回退到默认值 30`)
              settings.cacheTTLMinutes = 30
            }
          }

          if (settings.transcription) {
            settings.transcription = {
              ...this.settings.transcription,
              ...settings.transcription,
              online: {
                ...this.settings.transcription?.online,
                ...settings.transcription.online,
              },
            }
          }

          if (settings.polish) {
            settings.polish = {
              ...this.settings.polish,
              ...settings.polish,
            }
          }

          const transcriptionChanged = settings.transcription !== undefined

          saveAppSettings(settings)
          const oldTTL = this.settings.cacheTTLMinutes
          Object.assign(this.settings, settings)
          logger.debug('设置已更新', { settings })

          // 如果缓存时间变更，重新调度卸载计时器
          if (settings.cacheTTLMinutes !== undefined && settings.cacheTTLMinutes !== oldTTL) {
            logger.info(`缓存时间变更：${oldTTL} -> ${settings.cacheTTLMinutes} 分钟`)
            if (this.transcriber) {
              this.scheduleTranscriberUnload()
            }
          }

          // 如果 beta 更新设置变更，更新 UpdateService
          if (settings.allowBetaUpdates !== undefined) {
            updateService.setAllowBetaUpdates(settings.allowBetaUpdates)
          }

          if (transcriptionChanged) {
            this.unloadTranscriber()
            this.cancelTranscriberUnload()
            logger.info('转写配置已更新', { mode: this.settings.transcription?.mode })
          }

          // 如果润色配置变更，更新 PolishEngine
          if (settings.polish !== undefined) {
            if (!this.polishEngine) {
              this.polishEngine = new PolishEngine(settings.polish)
            } else {
              this.polishEngine.updateConfig(settings.polish)
            }
            logger.info('润色配置已更新', { provider: settings.polish.provider, modelId: settings.polish.modelId })
          }

          return { success: true }
        } catch (error) {
          logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'updateSettings' })
          return { success: false, error: String(error) }
        }
      },
      checkAppleScriptPermission: async () => {
        if (!this.appleScriptInserter.isAvailable()) {
          return { available: false, hasPermission: false, message: '仅在 macOS 上可用' }
        }
        const check = await this.appleScriptInserter.checkPermissions()
        return {
          available: true,
          hasPermission: check.hasAccessibility,
          message: check.hasAccessibility ? '权限正常' : (check.details || '权限不足'),
          guide: this.appleScriptInserter.getPermissionGuide(),
        }
      },
      testTranscription: () => this.runTestTranscription(),
      playTestAudio: () => this.playTestAudio(),
      setShortcutRecording: (recording) => this.setShortcutRecording(recording),
      getHistoryStats: async (options) => {
        try {
          const maxAgeDays = options?.maxAgeDays ?? 0
          return await this.conversationStore.getStats(maxAgeDays)
        } catch (error) {
          logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'getHistoryStats' })
          return { count: 0, sizeBytes: 0, error: '加载历史统计失败' }
        }
      },
      clearHistory: async (options) => {
        try {
          const maxAgeDays = options?.maxAgeDays ?? 0
          // 排除当前正在进行的会话，避免删除活跃录音
          const excludeSessionId = this.activeRecording?.sessionId
          const result = await this.conversationStore.clearByAge(maxAgeDays, excludeSessionId)
          logger.info('历史记录已清除', { maxAgeDays, deletedCount: result.deletedCount, excludeSessionId })
          return { success: true, deletedCount: result.deletedCount }
        } catch (error) {
          logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'clearHistory' })
          return { success: false, error: String(error) }
        }
      },
      getHistoryList: async (options) => {
        try {
          const records = await this.conversationStore.list({
            limit: options?.limit ?? 50,
            offset: options?.offset ?? 0,
            excludeTest: true,
          })
          return { records }
        } catch (error) {
          logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'getHistoryList' })
          return { records: [], error: '加载历史记录失败' }
        }
      },
      deleteHistoryItem: async (sessionId) => {
        try {
          // 不允许删除当前正在进行的会话
          if (this.activeRecording?.sessionId === sessionId) {
            return { success: false, error: '无法删除正在进行的录音' }
          }
          const success = await this.conversationStore.delete(sessionId)
          return { success }
        } catch (error) {
          logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'deleteHistoryItem', sessionId })
          return { success: false, error: String(error) }
        }
      },
      playHistoryAudio: async (sessionId) => {
        try {
          const record = await this.conversationStore.get(sessionId)
          if (!record) {
            return { success: false, error: '记录不存在' }
          }
          if (!record.audioPath || !fs.existsSync(record.audioPath)) {
            return { success: false, error: '音频文件不存在' }
          }
          this.windowService?.send('speech:play-audio', record.audioPath)
          return { success: true }
        } catch (error) {
          logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'playHistoryAudio', sessionId })
          return { success: false, error: String(error) }
        }
      },
    })
  }

  /**
   * 设置状态监听
   */
  private setupStateListeners(): void {
    this.stateMachine.addListener((state) => {
      this.broadcastState(state)
      this.refreshTrayMenu()
    })
  }

  /**
   * 注册原生录音 IPC 处理器
   */
  private registerNativeRecordingIPC(): void {
    // 接收音频数据块
    ipcMain.on('native-recorder:chunk', (_event, data: ArrayBuffer) => {
      this.audioRecorder.receiveNativeChunk(Buffer.from(data))
    })

    // 录音完成
    ipcMain.on('native-recorder:complete', (_event, data: ArrayBuffer | null) => {
      this.audioRecorder.finishNativeRecording(data ? Buffer.from(data) : undefined)
    })
  }

  /**
   * 广播状态到渲染进程
   */
  private broadcastState(state: SpeechTideState): void {
    const tooltip = `SpeechTide · ${STATUS_LABEL[state.status]}`
    this.trayService?.setToolTip(tooltip)
    this.windowService?.send('speech:state', state)
  }

  /**
   * 刷新托盘菜单
   */
  private refreshTrayMenu(): void {
    const updateState = updateService.getState()
    const updateInfo = {
      available: updateState.status === 'available'
        || updateState.status === 'downloading'
        || updateState.status === 'downloaded'
        || updateState.status === 'installing',
      version: updateState.availableVersion,
      downloaded: updateState.status === 'downloaded',
      downloading: updateState.status === 'downloading',
      installing: updateState.status === 'installing',
    }
    this.trayService?.refreshMenu(this.stateMachine.getStatus(), this.settings.shortcut, updateInfo)
  }

  /**
   * 处理更新操作（托盘菜单点击）
   */
  private handleUpdateAction(): void {
    const state = updateService.getState()
    if (state.status === 'downloaded') {
      // 已下载，执行安装
      updateService.quitAndInstall()
    } else if (state.status === 'available') {
      // 有更新，开始下载
      updateService.downloadUpdate()
    }
  }

  /**
   * 处理录音切换
   */
  private handleToggleRecording(): void {
    const status = this.stateMachine.getStatus()
    if (status === 'recording') {
      this.stopRecording('录音已手动终止，开始转写…')
    } else if (status === 'transcribing') {
      // 正在转写，不做操作
    } else {
      this.startRecording()
    }
  }

  /**
   * 开始录音
   */
  private async startRecording(): Promise<void> {
    if (this.activeRecording) return

    try {
      const sessionId = crypto.randomUUID()
      const recordingTimer = metrics.startTimer('recording', sessionId)
      // 传入 window 以支持原生录音，确保窗口有效
      const mainWindow = this.windowService?.ensureWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('窗口未初始化或已销毁，无法录音')
      }
      const handle = await this.audioRecorder.start(sessionId, mainWindow)
      const timeout = undefined

      this.cancelIdleTimer()
      this.activeRecording = { sessionId, handle, timeout, recordingTimer }

      const meta: TranscriptionMeta = { sessionId }
      this.stateMachine.setRecording(meta)
      logger.info('开始录音', { sessionId })
    } catch (error) {
      this.handleError('启动录音失败', error)
    }
  }

  /**
   * 停止录音
   * @param message 状态消息
   * @param triggerType 触发类型：'tap' = 短按（AI润色），'hold' = 长按（直接输出）
   */
  private async stopRecording(message?: string, triggerType: TriggerType = 'hold'): Promise<void> {
    if (!this.activeRecording) return

    const { handle, sessionId, timeout, recordingTimer } = this.activeRecording
    if (timeout) clearTimeout(timeout)
    if (recordingTimer) {
      metrics.endTimer(recordingTimer, 'recording', { sessionId })
    }
    this.activeRecording = null

    const meta: TranscriptionMeta = { sessionId }
    this.stateMachine.setTranscribing(message, meta)
    logger.info('停止录音，开始转写', { sessionId, triggerType })

    const transcriptionTimer = metrics.startTimer('transcription', sessionId)
    let recordingResult: RecordingResult | undefined

    try {
      recordingResult = await handle.stop()
      const transcriber = this.ensureTranscriber()
      const transcription = await transcriber.transcribe(recordingResult.audioPath)
      metrics.endTimer(transcriptionTimer, 'transcription', {
        sessionId,
        durationMs: transcription.durationMs,
        modelId: transcription.modelId,
      })

      let finalText = transcription.text
      let polished = false

      // 根据触发类型和配置决定是否润色
      const shortcutConfig = this.settings.shortcut
      const polishEnabled = triggerType === 'tap'
        ? (shortcutConfig.tapPolishEnabled ?? DEFAULT_TAP_POLISH_ENABLED)
        : (shortcutConfig.holdPolishEnabled ?? DEFAULT_HOLD_POLISH_ENABLED)
      const shouldPolish = polishEnabled && this.polishEngine?.isConfigValid()
      if (shouldPolish) {
        const nextMeta: TranscriptionMeta = {
          sessionId,
          durationMs: transcription.durationMs,
          modelId: transcription.modelId,
          language: transcription.language,
        }
        this.stateMachine.setPolishing(undefined, nextMeta)
        logger.info('开始 AI 润色', { sessionId })

        const polishResult = await this.polishEngine!.polish(transcription.text)
        if (polishResult.success && polishResult.text) {
          finalText = polishResult.text
          polished = true
          logger.info('AI 润色完成', { sessionId, durationMs: polishResult.durationMs })
        } else {
          logger.warn('AI 润色失败，回退到原始文本', { error: polishResult.error })
        }
      }

      const record: ConversationRecord = {
        id: sessionId,
        startedAt: recordingResult.startedAt,
        finishedAt: Date.now(),
        durationMs: transcription.durationMs,
        audioPath: recordingResult.audioPath,
        transcript: finalText,
        modelId: transcription.modelId,
        language: transcription.language,
      }
      await this.conversationStore.save(record)

      const nextMeta: TranscriptionMeta = {
        sessionId,
        durationMs: transcription.durationMs,
        modelId: polished ? `${transcription.modelId} + AI` : transcription.modelId,
        language: transcription.language,
      }

      this.insertTextAtCursor(finalText)
      this.stateMachine.setReady(finalText, nextMeta)
      this.scheduleIdle()
    } catch (error) {
      if (recordingResult) {
        await this.conversationStore.save({
          id: sessionId,
          startedAt: recordingResult.startedAt,
          finishedAt: Date.now(),
          durationMs: recordingResult.durationMs,
          audioPath: recordingResult.audioPath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      this.handleError('转写失败', error, sessionId)
    } finally {
      // 无论成功失败都刷新缓存计时器
      this.scheduleTranscriberUnload()
    }
  }

  /**
   * 插入文本到光标位置
   */
  private async insertTextAtCursor(text: string): Promise<void> {
    const { autoInsertText = true, clipboardMode = false } = this.settings
    const insertTimer = metrics.startTimer('text_insert')

    if (clipboardMode || !autoInsertText) {
      clipboard.writeText(text)
      logger.debug('文本已写入剪贴板')
      metrics.endTimer(insertTimer, 'text_insert', { method: 'clipboard_only' })
      return
    }

    if (isMac) {
      try {
        const possiblePaths = [
          // 开发模式：从源码目录加载
          path.join(process.cwd(), 'native', 'ax-insert', 'build', 'Release', 'ax_insert.node'),
          path.join(__dirname, '..', '..', 'native', 'ax-insert', 'build', 'Release', 'ax_insert.node'),
          // 生产模式：从 Resources 目录加载
          path.join(process.resourcesPath, 'native', 'ax_insert.node'),
        ]

        let axInsertModule = null
        for (const modulePath of possiblePaths) {
          try {
            axInsertModule = require(modulePath)
            break
          } catch {
            // 尝试下一个路径
          }
        }

        if (axInsertModule) {
          const result = await axInsertModule.insertText({ text })
          if (result.success) {
            logger.debug('键盘模拟插入成功')
            metrics.endTimer(insertTimer, 'text_insert', { method: 'ax_insert' })
            return
          }
        }

        // 回退到剪贴板方案
        const clipboardResult = await this.appleScriptInserter.insertText(text)
        if (clipboardResult.success) {
          logger.debug('剪贴板插入成功')
          metrics.endTimer(insertTimer, 'text_insert', { method: 'applescript' })
        }
      } catch (error) {
        logger.error(error instanceof Error ? error : new Error(String(error)), { context: 'insertTextAtCursor' })
        metrics.endTimer(insertTimer, 'text_insert', { method: 'failed' })
      }
    }
  }

  /**
   * 运行测试转写
   */
  private async runTestTranscription(): Promise<{ success: boolean; data?: { text: string; duration: number; processingTime: number; modelId: string; language: string }; error?: string }> {
    if (this.testInProgress) {
      return { success: false, error: '测试正在进行中' }
    }
    if (this.activeRecording) {
      return { success: false, error: '请先停止当前录音' }
    }

    this.testInProgress = true
    const sessionId = crypto.randomUUID()
    const startTime = Date.now()

    try {
      // 检查是否需要下载
      const needsDownload = !fs.existsSync(this.testAudioPath)
      const message = needsDownload ? '正在下载测试音频...' : '正在转写测试音频...'
      this.stateMachine.setTranscribing(message, { sessionId })

      if (needsDownload) {
        await this.downloadTestAudio(this.testAudioPath)
      }

      const transcriber = this.ensureTranscriber()
      const transcription = await transcriber.transcribe(this.testAudioPath)
      const processingTime = Date.now() - startTime

      const record: ConversationRecord = {
        id: sessionId,
        startedAt: startTime,
        finishedAt: Date.now(),
        durationMs: transcription.durationMs,
        audioPath: this.testAudioPath,
        transcript: transcription.text,
        modelId: transcription.modelId,
        language: transcription.language,
        test: true,
      }
      await this.conversationStore.save(record)

      this.stateMachine.setReady(transcription.text, {
        sessionId,
        durationMs: transcription.durationMs,
        modelId: transcription.modelId,
        language: transcription.language,
      })
      this.scheduleIdle()

      return {
        success: true,
        data: {
          text: transcription.text,
          duration: transcription.durationMs,
          processingTime,
          modelId: transcription.modelId,
          language: transcription.language || 'unknown',
        },
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.stateMachine.setError(`测试转写失败：${detail}`)
      this.scheduleIdle(4000)
      return { success: false, error: detail }
    } finally {
      this.testInProgress = false
      // 无论成功失败都刷新缓存计时器
      this.scheduleTranscriberUnload()
    }
  }

  /**
   * 下载测试音频（支持重定向，30秒超时）
   */
  private async downloadTestAudio(targetPath: string): Promise<void> {
    const https = await import('node:https')
    const http = await import('node:http')
    const TIMEOUT_MS = 30000 // 30秒超时

    const download = (urlString: string, redirectCount = 0): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
          reject(new Error('Download failed: too many redirects'))
          return
        }

        let parsedUrl: URL
        try {
          parsedUrl = new URL(urlString)
        } catch {
          reject(new Error(`Invalid URL: ${urlString}`))
          return
        }

        let fileStream: fs.WriteStream | null = null
        let settled = false

        const cleanup = () => {
          if (fileStream) {
            fileStream.destroy()
            fileStream = null
          }
          fs.unlink(targetPath, () => {})
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http
        const request = protocol.get(parsedUrl, (response) => {
          // Handle redirects (301, 302, 307, 308)
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume() // Consume response body to free up socket
            const redirectUrl = new URL(response.headers.location, parsedUrl).href
            download(redirectUrl, redirectCount + 1).then(resolve).catch(reject)
            return
          }

          if (response.statusCode !== 200) {
            response.resume() // Consume response body to free up socket
            reject(new Error(`Download failed: HTTP ${response.statusCode}`))
            return
          }

          fileStream = fs.createWriteStream(targetPath)
          response.pipe(fileStream)
          fileStream.on('finish', () => {
            if (settled) return
            settled = true
            fileStream?.close()
            resolve()
          })
          fileStream.on('error', (err) => {
            if (settled) return
            settled = true
            cleanup()
            reject(err)
          })
        })

        // Set timeout
        request.setTimeout(TIMEOUT_MS, () => {
          if (settled) return
          settled = true
          request.destroy()
          cleanup()
          reject(new Error('Download timeout (30s), please check network'))
        })

        request.on('error', (err) => {
          if (settled) return
          settled = true
          cleanup()
          reject(err)
        })
      })
    }

    return download(DEFAULT_TEST_AUDIO_URL)
  }

  /**
   * 播放测试音频
   */
  private async playTestAudio(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(this.testAudioPath)) {
        await this.downloadTestAudio(this.testAudioPath)
      }
      this.windowService?.send('speech:play-audio', this.testAudioPath)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  /**
   * 处理错误
   */
  private handleError(context: string, error: unknown, sessionId?: string): void {
    logger.error(error instanceof Error ? error : new Error(String(error)), { context, sessionId })
    const detail = error instanceof Error ? error.message : String(error)
    const state = this.stateMachine.getState()
    const meta: TranscriptionMeta | undefined = sessionId
      ? { sessionId, durationMs: state.meta?.durationMs, modelId: state.meta?.modelId, language: state.meta?.language }
      : state.meta
    this.stateMachine.setError(`${context}${detail ? `：${detail}` : ''}`, detail, meta)
    this.scheduleIdle(4000)
  }

  /**
   * 定时恢复空闲状态
   */
  private scheduleIdle(delay: number = APP_CONSTANTS.IDLE_DELAY_MS): void {
    this.cancelIdleTimer()
    this.idleTimer = setTimeout(() => {
      this.stateMachine.setIdle()
      this.idleTimer = null
    }, delay)
  }

  /**
   * 取消空闲定时器
   */
  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private resolveTranscriberConfig() {
    const mode = this.settings.transcription?.mode ?? 'offline'
    if (mode === 'online') {
      const online = this.settings.transcription?.online
      const config: OpenAITranscriberConfig = {
        engine: 'openai',
        provider: 'openai',
        apiKey: online?.apiKey ?? '',
        modelId: online?.modelId ?? 'whisper-1',
        baseUrl: online?.baseUrl,
        language: online?.language,
        responseFormat: online?.responseFormat,
        temperature: online?.temperature,
        timeoutMs: online?.timeoutMs,
      }
      return config
    }
    return this.senseVoiceConfig
  }

  /**
   * 确保转写器可用（懒加载）
   * 如果已销毁或未初始化，则重新创建
   * 同时取消任何待执行的卸载计时器，防止转写过程中被卸载
   */
  private ensureTranscriber(): Transcriber {
    // 关键：取消待执行的卸载计时器，防止转写过程中被卸载
    this.cancelTranscriberUnload()

    if (!this.transcriber) {
      logger.info('创建转写器实例...')
      this.transcriber = createTranscriber(this.resolveTranscriberConfig(), { supportDir: this.supportDir })
    }
    return this.transcriber
  }

  /**
   * 调度转写器卸载
   * 根据 cacheTTLMinutes 设置延迟销毁计时器
   */
  private scheduleTranscriberUnload(): void {
    this.cancelTranscriberUnload()

    if (this.settings.transcription?.mode === 'online') {
      return
    }

    // 验证从配置加载的 TTL 值，防止损坏的 settings.json 导致 NaN
    const validValues = [0, 5, 15, 30, 60]
    const rawTTL = this.settings.cacheTTLMinutes
    const ttlMinutes = Number.isFinite(rawTTL) && validValues.includes(rawTTL) ? rawTTL : 30

    if (ttlMinutes <= 0) {
      // 0 或负数表示永不卸载
      logger.debug('模型缓存设置为永不卸载')
      return
    }

    const ttlMs = ttlMinutes * 60 * 1000
    logger.info(`模型将在 ${ttlMinutes} 分钟后卸载`)

    this.cacheTimer = setTimeout(() => {
      this.unloadTranscriber()
    }, ttlMs)
  }

  /**
   * 取消转写器卸载计时器
   */
  private cancelTranscriberUnload(): void {
    if (this.cacheTimer) {
      clearTimeout(this.cacheTimer)
      this.cacheTimer = null
    }
  }

  /**
   * 卸载转写器（终止 Worker 进程）
   */
  private unloadTranscriber(): void {
    if (!this.transcriber) return

    logger.info('卸载模型缓存，终止 Worker 进程')
    this.transcriber.destroy?.()
    this.transcriber = null
    this.cacheTimer = null
  }

  /**
   * 尝试启动键盘钩子
   * 检查辅助功能权限后再启动，避免权限不足时进程退出
   */
  private async tryStartKeyboardHook(): Promise<void> {
    if (!this.keyboardHookService) return

    // 检查辅助功能权限
    const permCheck = await this.appleScriptInserter.checkPermissions()
    if (!permCheck.hasAccessibility) {
      logger.warn('辅助功能权限未授予，跳过键盘钩子启动')
      logger.info('请在系统偏好设置 → 安全性与隐私 → 辅助功能中授权')
      return
    }

    // 权限已授予，启动键盘钩子
    const started = this.keyboardHookService.start({
      onRecordingStart: () => this.startRecording(),
      onRecordingStop: (triggerType) => this.stopRecording('松开按键，停止录音', triggerType),
    })

    if (started) {
      logger.info('键盘钩子已启动')
    } else {
      logger.warn('键盘钩子启动失败')
    }
  }

  /**
   * 设置快捷键录入状态（暂停/恢复键盘监听）
   */
  private setShortcutRecording(recording: boolean): void {
    if (recording) {
      this.keyboardHookService?.stop()
      logger.debug('键盘钩子已暂停（录入快捷键）')
    } else {
      this.tryStartKeyboardHook()
      logger.debug('键盘钩子已恢复')
    }
  }

  /**
   * 聚焦窗口
   */
  focusWindow(forceShow?: boolean): void {
    this.windowService?.toggleWindow(forceShow)
  }

  /**
   * 准备退出（设置退出标志，允许窗口关闭）
   */
  prepareQuit(): void {
    this.windowService?.setQuitting(true)
  }

  /**
   * 销毁控制器
   */
  destroy(): void {
    this.cancelIdleTimer()
    this.cancelTranscriberUnload()  // 清理缓存计时器
    if (this.activeRecording) {
      this.activeRecording.handle.forceStop()
      this.activeRecording = null
    }
    this.keyboardHookService?.destroy()
    this.trayService?.destroy()
    this.windowService?.destroy()
    this.ipcListeners.unregister()
    updateService.destroy()
    // 终止 transcriber worker 进程
    this.transcriber?.destroy?.()
    this.transcriber = null
    this.initialized = false
  }
}
