import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as onnx from 'onnx-proto'
import { app } from 'electron'
const ModelProto = onnx.onnx.ModelProto
import type { SenseVoiceTranscriberConfig } from '../config'
import type { Transcriber, TranscriptionResult } from './index'

// 判断是否为开发模式
const isDev = !!process.env.VITE_DEV_SERVER_URL
import {
  AUDIO_SAMPLE_RATE,
  FEATURE_DIM,
  LFR_WINDOW_SIZE,
  LFR_WINDOW_SHIFT,
  LOW_FREQ,
  HIGH_FREQ,
  DITHER,
  NORMALIZE_SAMPLES,
  SNIP_EDGES,
} from './constants'

interface WorkerReadyMessage {
  type: 'ready'
}

interface WorkerInitErrorMessage {
  type: 'init-error'
  error: string
}

interface WorkerResultMessage {
  type: 'transcribe-success'
  id: string
  text: string
  durationMs: number
  language?: string
}

interface WorkerFailureMessage {
  type: 'transcribe-error'
  id: string
  error: string
}

type WorkerMessage = WorkerReadyMessage | WorkerInitErrorMessage | WorkerResultMessage | WorkerFailureMessage

interface PendingRequest {
  resolve: (result: TranscriptionResult) => void
  reject: (error: Error) => void
}

interface TokensInfo {
  path: string
  count: number
}

export class SenseVoiceTranscriber implements Transcriber {
  private cachedTokens: TokensInfo | null = null
  private readonly worker: ChildProcess
  private readonly pending = new Map<string, PendingRequest>()
  private readyResolver: { resolve: () => void; reject: (reason: Error) => void } | null = null
  private readonly ready: Promise<void>
  private workerExited = false

  constructor(private readonly config: SenseVoiceTranscriberConfig, private readonly options: { supportDir: string }) {
    // 计算 worker 入口路径
    let workerEntry: string
    if (isDev) {
      // 开发模式：使用源码目录
      workerEntry = path.join(
        process.env.APP_ROOT ?? process.cwd(),
        'electron',
        'transcriber',
        'sensevoice-worker.cjs'
      )
    } else {
      // 生产模式：worker 被打包到 app.asar 内
      workerEntry = path.join(
        app.getAppPath(),
        'electron',
        'transcriber',
        'sensevoice-worker.cjs'
      )
    }
    const env = this.buildWorkerEnv()
    this.worker = fork(workerEntry, [], {
      env,
      stdio: 'inherit',
    })
    this.worker.on('message', (message: WorkerMessage) => this.handleWorkerMessage(message))
    this.worker.on('exit', (code) => {
      this.workerExited = true
      const error = new Error(`SenseVoice worker 已退出，code=${code ?? 'unknown'}`)
      this.readyResolver?.reject(error)
      for (const [, pending] of this.pending) {
        pending.reject(error)
      }
      this.pending.clear()
    })
    this.worker.on('error', (error) => {
      this.readyResolver?.reject(error)
      for (const [, pending] of this.pending) {
        pending.reject(error)
      }
      this.pending.clear()
    })

    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolver = { resolve, reject }
    })

    void this.bootstrapWorker()
  }

  private buildWorkerEnv() {
    const env = { ...process.env }
    const runtimeDir = this.resolveRuntimeDirectory()

    if (runtimeDir) {
      const key =
        process.platform === 'win32' ? 'PATH' : process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
      const delimiter = process.platform === 'win32' ? ';' : ':'
      const currentValue = env[key]
      if (!currentValue || !currentValue.split(delimiter).includes(runtimeDir)) {
        env[key] = currentValue ? `${runtimeDir}${delimiter}${currentValue}` : runtimeDir
      }
    }
    return env
  }

  private resolveRuntimeDirectory() {
    if (process.platform === 'darwin') {
      const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'

      // 生产模式：原生库被打包到 Resources/native/
      if (!isDev) {
        // app.getAppPath() 返回 app.asar 路径
        // 原生库在 Resources/native/ 目录（app.asar 的同级目录）
        const resourcesPath = path.dirname(app.getAppPath())
        const candidate = path.join(resourcesPath, 'native', `sherpa-onnx-${arch}`)
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }

      // 开发模式：使用 node_modules
      // 向上遍历查找 node_modules（支持 git worktree 等特殊目录结构）
      let searchDir = process.env.APP_ROOT ?? process.cwd()
      const rootDir = path.parse(searchDir).root
      while (searchDir !== rootDir) {
        const candidate = path.join(searchDir, 'node_modules', `sherpa-onnx-${arch}`)
        if (fs.existsSync(candidate)) {
          return candidate
        }
        searchDir = path.dirname(searchDir)
      }
      return null
    }
    
    if (process.platform === 'linux') {
      const arch = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
      // 向上遍历查找 node_modules（支持 git worktree 等特殊目录结构）
      let searchDir = process.env.APP_ROOT ?? process.cwd()
      const rootDir = path.parse(searchDir).root
      while (searchDir !== rootDir) {
        const candidate = path.join(searchDir, 'node_modules', `sherpa-onnx-${arch}`)
        if (fs.existsSync(candidate)) {
          return candidate
        }
        searchDir = path.dirname(searchDir)
      }
      return null
    }

    if (process.platform === 'win32') {
      const arch = process.arch === 'ia32' ? 'win-ia32' : 'win-x64'
      // 向上遍历查找 node_modules（支持 git worktree 等特殊目录结构）
      let searchDir = process.env.APP_ROOT ?? process.cwd()
      const rootDir = path.parse(searchDir).root
      while (searchDir !== rootDir) {
        const candidate = path.join(searchDir, 'node_modules', `sherpa-onnx-${arch}`)
        if (fs.existsSync(candidate)) {
          return candidate
        }
        searchDir = path.dirname(searchDir)
      }
      return null
    }
    
    return null
  }

  private async bootstrapWorker() {
    try {
      const tokensInfo = await this.resolveTokensInfo()
      const modelPath = await this.resolveModelPath(tokensInfo.count)
      if (this.workerExited) {
        throw new Error('SenseVoice worker 已退出')
      }
      // 明确指定语言为中文，避免自动检测错误
      const language = this.config.language || 'zh'
      console.log(`[Transcriber] 初始化 SenseVoice，语言: ${language}`)
      this.worker.send({
        type: 'init',
        payload: {
          modelPath,
          tokensPath: tokensInfo.path,
          language,
          useITN: this.config.useInverseTextNormalization !== false,
        },
      })
    } catch (error) {
      this.readyResolver?.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleWorkerMessage(message: WorkerMessage) {
    if (message.type === 'ready') {
      this.readyResolver?.resolve()
      this.readyResolver = null
      return
    }
    if (message.type === 'init-error') {
      this.readyResolver?.reject(new Error(message.error))
      this.readyResolver = null
      return
    }
    if (message.type === 'transcribe-success') {
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        pending.resolve({
          text: message.text,
          durationMs: message.durationMs,
          modelId: this.config.modelId ?? 'SenseVoice-Small',
          language: message.language || this.config.language || undefined,
        })
      }
      return
    }
    if (message.type === 'transcribe-error') {
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        pending.reject(new Error(message.error))
      }
    }
  }

  private async resolveModelPath(vocabSize: number) {
    console.log('[Transcriber] 开始解析模型路径，vocabSize:', vocabSize)
    const { modelDir, modelFile } = this.config
    console.log('[Transcriber] 配置:', { modelDir, modelFile })
    const candidates: string[] = []
    if (modelFile && path.isAbsolute(modelFile) && fs.existsSync(modelFile)) {
      // 验证绝对路径是否在安全范围内
      const normalized = path.normalize(modelFile)
      const baseDir = this.options.supportDir
      console.log('[Transcriber] 检查模型文件安全性:', { normalized, baseDir })
      if (!normalized.startsWith(baseDir) && !normalized.startsWith(process.env.APP_ROOT || '')) {
        throw new Error('禁止访问模型文件路径之外的内容')
      }
      console.log('[Transcriber] 使用绝对路径模型:', modelFile)
      return modelFile
    }
    if (modelDir) {
      // 验证 modelDir 的安全性
      const normalizedModelDir = path.normalize(modelDir)
      const allowedDirs = [this.options.supportDir, process.env.APP_ROOT || '']
      const isAllowed = allowedDirs.some((dir) => normalizedModelDir.startsWith(dir))
      console.log('[Transcriber] 检查模型目录安全性:', { normalizedModelDir, allowedDirs, isAllowed })
      if (!isAllowed) {
        throw new Error('禁止访问模型目录路径之外的内容')
      }

      if (modelFile) {
        candidates.push(path.join(modelDir, modelFile))
      }
      candidates.push(path.join(modelDir, 'model.onnx'))
      candidates.push(path.join(modelDir, 'model.int8.onnx'))
    }
    console.log('[Transcriber] 候选模型文件:', candidates)
    const existing = candidates.find((candidate) => candidate && fs.existsSync(candidate))
    if (!existing) {
      console.error('[Transcriber] 未找到任何模型文件，候选列表:', candidates)
      throw new Error('未找到 SenseVoice 模型文件，请检查 transcriber 配置或模型目录')
    }
    console.log('[Transcriber] 找到模型文件:', existing)
    const patched = await this.ensureOnnxMetadata(existing, vocabSize)
    console.log('[Transcriber] 模型路径（可能已打补丁）:', patched)
    return patched
  }

  private async ensureOnnxMetadata(modelPath: string, vocabSize: number) {
    try {
      const data = await fsPromises.readFile(modelPath)
      if (typeof ModelProto?.decode !== 'function') {
        return modelPath
      }
      const proto = ModelProto.decode(data)
      const metadata: Array<{ key: string; value: string }> = Array.isArray(proto.metadataProps)
        ? (proto.metadataProps as Array<{ key: string; value: string }>)
        : []
      const defaults: Record<string, string> = {
        vocab_size: String(vocabSize ?? 0),
        feat_dim: String(FEATURE_DIM),
        lfr_window_size: String(LFR_WINDOW_SIZE),
        lfr_window_shift: String(LFR_WINDOW_SHIFT),
        sampling_rate: String(AUDIO_SAMPLE_RATE),
        low_freq: String(LOW_FREQ),
        high_freq: String(HIGH_FREQ),
        dither: String(DITHER),
        normalize_samples: String(NORMALIZE_SAMPLES),
        snip_edges: String(SNIP_EDGES),
      }
      let patched = false
      for (const [key, value] of Object.entries(defaults)) {
        if (!metadata.some((item) => item.key === key)) {
          metadata.push({ key, value })
          patched = true
        }
      }
      if (!patched) {
        return modelPath
      }
      proto.metadataProps = metadata
      const targetDir = path.join(this.options.supportDir, 'models', 'patched')
      await fsPromises.mkdir(targetDir, { recursive: true })
      const targetPath = path.join(targetDir, `sensevoice-${path.basename(modelPath)}`)
      await fsPromises.writeFile(targetPath, ModelProto.encode(proto).finish())
      return targetPath
    } catch (error) {
      console.warn('[speech] SenseVoice 元数据写入失败，将继续使用原模型', error)
      return modelPath
    }
  }

  private async resolveTokensInfo(): Promise<TokensInfo> {
    if (this.cachedTokens && fs.existsSync(this.cachedTokens.path)) {
      return this.cachedTokens
    }
    const candidates: string[] = []
    if (this.config.tokensFile && path.isAbsolute(this.config.tokensFile)) {
      candidates.push(this.config.tokensFile)
    }
    if (this.config.modelDir) {
      candidates.push(path.join(this.config.modelDir, 'tokens.txt'))
      candidates.push(path.join(this.config.modelDir, 'tokens.json'))
    }
    const existingTxt = candidates.find((candidate) => candidate.endsWith('.txt') && fs.existsSync(candidate))
    if (existingTxt) {
      const count = await this.countTokens(existingTxt)
      this.cachedTokens = { path: existingTxt, count }
      return this.cachedTokens
    }
    const jsonPath = candidates.find((candidate) => candidate.endsWith('.json') && fs.existsSync(candidate))
    if (jsonPath) {
      try {
        const tokensRaw = await fsPromises.readFile(jsonPath, 'utf-8')
        const tokens = JSON.parse(tokensRaw) as string[]
        if (!Array.isArray(tokens)) {
          throw new Error('tokens.json 格式不正确：应包含字符串数组')
        }
        const lines = tokens.map((token, index) => `${token} ${index}`).join('\n')
        const targetDir = path.join(this.options.supportDir, 'cache')
        await fsPromises.mkdir(targetDir, { recursive: true })
        const targetPath = path.join(targetDir, 'sensevoice-tokens.txt')
        await fsPromises.writeFile(targetPath, lines, 'utf-8')
        this.cachedTokens = { path: targetPath, count: tokens.length }
        return this.cachedTokens
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`tokens.json 解析失败：JSON 格式错误`)
        }
        throw error
      }
    }
    throw new Error('未找到 SenseVoice tokens 文件，请确认 tokens.txt 或 tokens.json 是否存在')
  }

  private async countTokens(tokensPath: string) {
    const content = await fsPromises.readFile(tokensPath, 'utf-8')
    return content.split(/\r?\n/).filter(Boolean).length
  }

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    console.log('[Transcriber] 开始转录，文件路径:', filePath)
    await this.ready
    console.log('[Transcriber] Worker 已就绪')
    if (this.workerExited) {
      console.error('[Transcriber] Worker 已退出，无法转录')
      throw new Error('SenseVoice worker 已退出')
    }

    const id = randomUUID()
    console.log('[Transcriber] 创建转录请求，ID:', id)
    return new Promise<TranscriptionResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      console.log('[Transcriber] 发送转录请求到 Worker')
      this.worker.send({
        type: 'transcribe',
        id,
        audioPath: filePath,
      })
    })
  }

  /**
   * 销毁 transcriber，终止 worker 进程
   */
  destroy(): void {
    if (!this.workerExited) {
      console.log('[Transcriber] 正在终止 Worker 进程...')
      this.worker.kill()
      this.workerExited = true
    }
    // 清理所有待处理的请求
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Transcriber 已销毁'))
    }
    this.pending.clear()
  }
}
