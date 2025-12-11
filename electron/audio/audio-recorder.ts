import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { RecorderConfig } from '../config'

export interface RecordingResult {
  sessionId: string
  audioPath: string
  durationMs: number
  startedAt: number
}


/**
 * 原生录音句柄（不依赖 SoX）
 */
export class NativeRecordingHandle {
  private stopped = false
  private finished: Promise<RecordingResult> | null = null
  private audioChunks: Buffer[] = []
  private resolvePromise?: (result: RecordingResult) => void
  private rejectPromise?: (error: Error) => void

  constructor(
    private readonly sessionId: string,
    private readonly audioPath: string,
    private readonly startedAt: number,
    private readonly window: BrowserWindow,
    private readonly sampleRate: number,
    private readonly channels: number
  ) {}

  /**
   * 接收音频数据块
   */
  receiveChunk(data: Buffer): void {
    if (this.stopped) return
    this.audioChunks.push(data)
  }

  /**
   * 停止录音
   */
  async stop(): Promise<RecordingResult> {
    if (this.finished) return this.finished

    this.finished = new Promise((resolve, reject) => {
      this.resolvePromise = resolve
      this.rejectPromise = reject
    })

    this.stopped = true
    
    // 通知渲染进程停止录音（检查窗口是否已销毁）
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('native-recorder:stop')
    } else {
      // 窗口已销毁，直接完成录音
      this.finishRecording()
    }

    return this.finished
  }

  /**
   * 完成录音（渲染进程调用）
   */
  finishRecording(finalData?: Buffer): void {
    if (finalData) {
      this.audioChunks.push(finalData)
    }

    try {
      // 合并所有音频块
      const audioData = Buffer.concat(this.audioChunks)
      
      // 创建 WAV 文件
      const header = this.createWavHeader(audioData.length)
      const wavBuffer = Buffer.concat([header, audioData])
      
      // 写入文件
      fs.writeFileSync(this.audioPath, wavBuffer)

      const durationMs = Date.now() - this.startedAt
      this.resolvePromise?.({
        sessionId: this.sessionId,
        audioPath: this.audioPath,
        durationMs,
        startedAt: this.startedAt,
      })
    } catch (error) {
      this.rejectPromise?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * 创建 WAV 文件头
   */
  private createWavHeader(dataLength: number): Buffer {
    const header = Buffer.alloc(44)
    const bitsPerSample = 16
    const byteRate = this.sampleRate * this.channels * (bitsPerSample / 8)
    const blockAlign = this.channels * (bitsPerSample / 8)

    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataLength, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(this.channels, 22)
    header.writeUInt32LE(this.sampleRate, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(bitsPerSample, 34)
    header.write('data', 36)
    header.writeUInt32LE(dataLength, 40)

    return header
  }

  forceStop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('native-recorder:stop')
    } else {
      this.finishRecording()
    }
  }
}

export class AudioRecorder {
  private activeNativeHandle: NativeRecordingHandle | null = null

  constructor(private readonly conversationsDir: string, private readonly config: RecorderConfig) {}

  private async ensureFolder(sessionId: string) {
    const dir = path.join(this.conversationsDir, sessionId)
    await fsPromises.mkdir(dir, { recursive: true })
    return {
      dir,
      audioPath: path.join(dir, 'audio.wav'),
    }
  }

  /**
   * 开始录音（使用 Electron 原生 API）
   */
  async start(sessionId: string, window: BrowserWindow): Promise<NativeRecordingHandle> {
    if (!window) {
      throw new Error('未提供 BrowserWindow，无法录音')
    }
    return this.startNative(sessionId, window)
  }

  /**
   * 使用原生 Web Audio API 录音
   */
  private async startNative(sessionId: string, window: BrowserWindow): Promise<NativeRecordingHandle> {
    const { audioPath } = await this.ensureFolder(sessionId)

    const handle = new NativeRecordingHandle(
      sessionId,
      audioPath,
      Date.now(),
      window,
      this.config.sampleRate,
      this.config.channels
    )

    this.activeNativeHandle = handle

    // 通知渲染进程开始录音
    window.webContents.send('native-recorder:start', {
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
    })

    return handle
  }

  /**
   * 接收原生录音数据块
   */
  receiveNativeChunk(data: Buffer): void {
    this.activeNativeHandle?.receiveChunk(data)
  }

  /**
   * 完成原生录音
   */
  finishNativeRecording(finalData?: Buffer): void {
    this.activeNativeHandle?.finishRecording(finalData)
    this.activeNativeHandle = null
  }

  /**
   * 获取当前活跃的原生录音句柄
   */
  getActiveNativeHandle(): NativeRecordingHandle | null {
    return this.activeNativeHandle
  }
}

// RecordingHandle 别名，兼容旧代码
export type RecordingHandle = NativeRecordingHandle
