import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { AppleDictationStatus } from '../../shared/app-state'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('apple-dictation-service')
const isDev = !!process.env.VITE_DEV_SERVER_URL

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
}

interface AppleDictationStartOptions {
  sessionId: string
  requireOnDevice: boolean
  locale?: string
  audioPath: string
  segmentDurationMs?: number
}

export interface AppleDictationResult {
  text: string
  durationMs: number
  audioPath: string
}

export interface AppleDictationHandle {
  stop: () => Promise<AppleDictationResult>
}

type HelperMessage =
  | { type: 'status'; requestId: string; available: boolean; supportsOnDevice: boolean; locale: string; reason?: string }
  | { type: 'started'; requestId: string; sessionId: string }
  | { type: 'stopped'; requestId: string; sessionId: string }
  | { type: 'partial'; sessionId: string; text: string }
  | { type: 'final'; sessionId: string; text: string; durationMs: number; audioPath?: string }
  | { type: 'error'; requestId?: string; sessionId?: string; message: string }

interface ActiveSession {
  sessionId: string
  audioPath: string
  onPartial: (text: string) => void
  onFinal: (text: string, durationMs: number) => void
  onError: (error: Error) => void
  resolveFinal: (result: AppleDictationResult) => void
  rejectFinal: (error: Error) => void
}

export class AppleDictationService {
  private process: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private pending = new Map<string, PendingRequest<unknown>>()
  private activeSession: ActiveSession | null = null

  destroy(): void {
    if (this.process && !this.process.killed) {
      this.process.kill()
    }
    this.process = null
    this.pending.clear()
    this.activeSession = null
  }

  async getStatus(): Promise<AppleDictationStatus> {
    if (process.platform !== 'darwin') {
      return {
        available: false,
        supportsOnDevice: false,
        locale: '',
        reason: '仅支持 macOS',
      }
    }
    const helperPath = this.resolveHelperPath()
    if (!helperPath) {
      return {
        available: false,
        supportsOnDevice: false,
        locale: '',
        reason: '未找到听写组件',
      }
    }
    try {
      await this.ensureProcess()
      const status = await this.sendRequest<AppleDictationStatus>('status', {})
      return status
    } catch (error) {
      return {
        available: false,
        supportsOnDevice: false,
        locale: '',
        reason: error instanceof Error ? error.message : '检测失败',
      }
    }
  }

  async start(
    options: AppleDictationStartOptions,
    handlers: {
      onPartial: (text: string) => void
      onFinal: (text: string, durationMs: number) => void
      onError: (error: Error) => void
    }
  ): Promise<AppleDictationHandle> {
    if (this.activeSession) {
      throw new Error('已有进行中的 Apple 听写')
    }
    await this.ensureProcess()
    if (!this.process) {
      throw new Error('Apple 听写进程未就绪')
    }

    let currentSession: ActiveSession | null = null
    const finalPromise = new Promise<AppleDictationResult>((resolve, reject) => {
      currentSession = {
        sessionId: options.sessionId,
        audioPath: options.audioPath,
        onPartial: handlers.onPartial,
        onFinal: handlers.onFinal,
        onError: handlers.onError,
        resolveFinal: resolve,
        rejectFinal: reject,
      }
      this.activeSession = currentSession
    })

    try {
      await this.sendRequest('start', options as unknown as Record<string, unknown>)
    } catch (error) {
      if (currentSession && this.activeSession === currentSession) {
        (currentSession as ActiveSession).rejectFinal(error instanceof Error ? error : new Error(String(error)))
        this.activeSession = null
      }
      throw error
    }

    return {
      stop: async () => {
        await this.sendRequest('stop', { sessionId: options.sessionId })
        return finalPromise
      },
    }
  }

  private resolveHelperPath(): string | null {
    const candidates: string[] = []
    if (isDev) {
      const devRoot = process.env.APP_ROOT ?? process.cwd()
      candidates.push(path.join(devRoot, 'native', 'apple-dictation', 'bin', 'apple-dictation-helper'))
    }
    const packagedPath = path.join(process.resourcesPath, 'native', 'apple-dictation-helper')
    candidates.push(packagedPath)
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
    return null
  }

  private async ensureProcess(): Promise<void> {
    if (this.process && !this.process.killed) return

    const helperPath = this.resolveHelperPath()
    if (!helperPath) {
      throw new Error('Apple 听写组件不存在')
    }

    const child = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      logger.warn('听写进程错误输出', { chunk })
    })
    child.on('exit', (code) => {
      logger.warn('听写进程退出', { code })
      const error = new Error(`Apple 听写进程已退出（code=${code ?? 'unknown'}）`)
      for (const [, pending] of this.pending) {
        pending.reject(error)
      }
      this.pending.clear()
      if (this.activeSession) {
        this.activeSession.onError(error)
        this.activeSession.rejectFinal(error)
        this.activeSession = null
      }
      this.process = null
    })
    child.on('error', (error) => {
      logger.error(error, { context: 'apple-dictation-process' })
    })

    this.process = child
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (line) {
        this.handleMessage(line)
      }
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  private handleMessage(raw: string): void {
    let message: HelperMessage
    try {
      message = JSON.parse(raw) as HelperMessage
    } catch (error) {
      logger.warn('听写消息解析失败', { raw })
      return
    }

    if (message.type === 'status') {
      this.resolveRequest(message.requestId, {
        available: message.available,
        supportsOnDevice: message.supportsOnDevice,
        locale: message.locale,
        reason: message.reason,
      })
      return
    }

    if (message.type === 'started' || message.type === 'stopped') {
      this.resolveRequest(message.requestId, { success: true })
      return
    }

    if (message.type === 'partial') {
      if (this.activeSession?.sessionId === message.sessionId) {
        this.activeSession.onPartial(message.text)
      }
      return
    }

    if (message.type === 'final') {
      if (this.activeSession?.sessionId === message.sessionId) {
        const result: AppleDictationResult = {
          text: message.text,
          durationMs: message.durationMs,
          audioPath: message.audioPath || this.activeSession.audioPath,
        }
        this.activeSession.onFinal(message.text, message.durationMs)
        this.activeSession.resolveFinal(result)
        this.activeSession = null
      }
      return
    }

    if (message.type === 'error') {
      const error = new Error(message.message)
      if (message.requestId) {
        this.rejectRequest(message.requestId, error)
        return
      }
      if (message.sessionId && this.activeSession?.sessionId === message.sessionId) {
        this.activeSession.onError(error)
        this.activeSession.rejectFinal(error)
        this.activeSession = null
      }
    }
  }

  private sendRequest<T>(type: string, payload: object): Promise<T> {
    if (!this.process || this.process.killed) {
      return Promise.reject(new Error('Apple 听写进程未启动'))
    }
    const requestId = randomUUID()
    const message = { type, requestId, ...payload }
    const data = `${JSON.stringify(message)}\n`
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as PendingRequest<unknown>['resolve'], reject })
      this.process!.stdin.write(data)
    })
  }

  private resolveRequest(requestId: string, payload: unknown): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    pending.resolve(payload)
    this.pending.delete(requestId)
  }

  private rejectRequest(requestId: string, error: Error): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    pending.reject(error)
    this.pending.delete(requestId)
  }
}
