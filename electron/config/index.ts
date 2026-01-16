import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ShortcutConfig, PolishConfig, TranscriptionSettings, OnlineTranscriptionConfig } from '../../shared/app-state'
import { DEFAULT_TAP_POLISH_ENABLED, DEFAULT_HOLD_POLISH_ENABLED } from '../../shared/app-state'
import {
  getAppRoot,
  getUserDataPath,
  getConfigDir,
  getBundledConfigDir,
  getModelsDir,
} from './paths'

const DEFAULT_SHORTCUT: ShortcutConfig = {
  accelerator: 'MetaRight',
  description: '切换录音流程',
  holdThresholdMs: 300,
  tapPolishEnabled: DEFAULT_TAP_POLISH_ENABLED,
  holdPolishEnabled: DEFAULT_HOLD_POLISH_ENABLED,
}

export interface RecorderConfig {
  sampleRate: number
  channels: number
  threshold: number
  silence: string
  recorder: 'sox'
  maxDurationMs: number
}

export interface SenseVoiceTranscriberConfig {
  engine: 'sensevoice'
  modelDir: string
  modelFile?: string
  tokensFile?: string
  language?: string
  useInverseTextNormalization?: boolean
  modelId?: string
}

export type TranscriberConfig = SenseVoiceTranscriberConfig

const DEFAULT_MODEL_SUB_DIR = 'sensevoice-small'

// 使用动态路径检测
const appRoot = getAppRoot()
// 优先从用户数据目录读取配置，回退到项目内置配置
const userConfigDir = getConfigDir()
const bundledConfigDir = getBundledConfigDir()

function loadJsonFile<T>(filename: string, defaults: T): T {
  try {
    // 优先从用户配置目录加载
    const userFilePath = path.join(userConfigDir, filename)
    if (fs.existsSync(userFilePath)) {
      const raw = fs.readFileSync(userFilePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...defaults, ...parsed }
    }

    // 回退到项目内置配置
    const bundledFilePath = path.join(bundledConfigDir, filename)
    if (fs.existsSync(bundledFilePath)) {
      const raw = fs.readFileSync(bundledFilePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...defaults, ...parsed }
    }

    return defaults
  } catch (error) {
    console.warn(`[config] Failed to read ${filename}, using defaults`, error)
    return defaults
  }
}

export function loadRecorderConfig(): RecorderConfig {
  const defaults: RecorderConfig = {
    sampleRate: 16000,
    channels: 1,
    threshold: 0,
    silence: '10.0',
    recorder: 'sox',
    maxDurationMs: 0,
  }
  return loadJsonFile<RecorderConfig>('audio.json', defaults)
}

export function getDefaultSupportDirectory() {
  return getUserDataPath()
}

function resolveSenseVoiceBaseDir() {
  const modelsDir = getModelsDir()
  const speechTidePath = path.join(modelsDir, DEFAULT_MODEL_SUB_DIR)

  // 兼容旧版 Shandianshuo 模型目录
  const shandianSegments =
    process.platform === 'darwin'
      ? ['Library', 'Application Support', 'Shandianshuo', 'models', 'sensevoice-small']
      : ['Shandianshuo', 'models', 'sensevoice-small']
  const shandianPath = path.join(os.homedir(), ...shandianSegments)

  const candidates = [speechTidePath]
  if (process.platform === 'darwin') {
    candidates.push(shandianPath)
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return speechTidePath
}

type RawTranscriberConfig = Partial<{
  engine: string
  modelDir: string
  modelPath: string
  modelFile: string
  modelFilename: string
  tokensFile: string
  tokensPath: string
  tokens: string
  language: string
  useInverseTextNormalization: boolean
  modelId: string
}>

function normalizePath(p: string | undefined) {
  if (!p) return undefined
  if (path.isAbsolute(p)) return p
  return path.join(appRoot, p)
}

function buildSenseVoiceConfig(raw: RawTranscriberConfig): SenseVoiceTranscriberConfig {
  const providedModelDir = raw.modelDir ?? raw.modelPath
  let modelDir = normalizePath(providedModelDir) ?? resolveSenseVoiceBaseDir()
  let modelFile = raw.modelFile ?? raw.modelFilename
  if (!modelFile && modelDir && path.extname(modelDir) === '.onnx') {
    modelFile = path.basename(modelDir)
    modelDir = path.dirname(modelDir)
  }
  let tokensFile = normalizePath(raw.tokensFile ?? raw.tokensPath)
  if (!tokensFile && raw.tokens) {
    tokensFile = normalizePath(raw.tokens)
  }
  if (!tokensFile && modelDir) {
    tokensFile = path.join(modelDir, 'tokens.txt')
  }
  const defaultLanguage = 'zh'  // 默认中文
  const language = raw.language ?? defaultLanguage
  console.log('[Config] SenseVoice 语言配置:', { rawLanguage: raw.language, effectiveLanguage: language })
  return {
    engine: 'sensevoice',
    modelDir,
    modelFile,
    tokensFile,
    language,
    useInverseTextNormalization: raw.useInverseTextNormalization ?? true,
    modelId: raw.modelId ?? (language === 'zh' ? 'SenseVoice-Small (中文)' : 'SenseVoice-Small'),
  }
}

export function loadTranscriberConfig(): SenseVoiceTranscriberConfig {
  const raw = loadJsonFile<RawTranscriberConfig>('transcriber.json', {})
  const senseVoiceDir = resolveSenseVoiceBaseDir()
  return buildSenseVoiceConfig({ ...raw, modelDir: raw.modelDir ?? raw.modelPath ?? senseVoiceDir })
}

export interface AppSettings {
  shortcut: ShortcutConfig
  autoInsertText: boolean
  clipboardMode: boolean
  notificationEnabled: boolean
  autoShowOnStart: boolean
  /** 模型缓存 TTL（分钟），0 表示永不过期 */
  cacheTTLMinutes: number
  /** 是否接收测试版更新（beta 版本） */
  allowBetaUpdates: boolean
  /** AI 润色配置 */
  polish: PolishConfig
  /** 转录配置 */
  transcription: TranscriptionSettings
}

const DEFAULT_POLISH_CONFIG: PolishConfig = {
  provider: 'openai',
  apiKey: '',
  modelId: 'gpt-4o-mini',
  systemPrompt: '你是一个语音转文字的润色助手。用户输入的是语音识别后的原始文本，可能包含口语化表达、重复、填充词等。请将其润色为流畅、简洁的书面文本，保持原意不变。只输出润色后的文本，不要添加任何解释或额外内容。',
  timeoutMs: 30000,
}

const DEFAULT_ONLINE_TRANSCRIPTION_CONFIG: OnlineTranscriptionConfig = {
  provider: 'openai',
  apiKey: '',
  modelId: 'whisper-1',
  responseFormat: 'json',
  temperature: 0,
  timeoutMs: 120000,
}

const DEFAULT_TRANSCRIPTION_SETTINGS: TranscriptionSettings = {
  mode: 'offline',
  online: DEFAULT_ONLINE_TRANSCRIPTION_CONFIG,
}

export function loadAppSettings(): AppSettings {
  const defaults: AppSettings = {
    shortcut: DEFAULT_SHORTCUT,
    autoInsertText: true,
    clipboardMode: false,
    notificationEnabled: true,
    autoShowOnStart: false,
    cacheTTLMinutes: 30, // 默认 30 分钟
    allowBetaUpdates: false, // 默认不接收测试版
    polish: DEFAULT_POLISH_CONFIG,
    transcription: DEFAULT_TRANSCRIPTION_SETTINGS,
  }
  const raw = loadJsonFile<AppSettings>('settings.json', defaults)
  return {
    ...defaults,
    ...raw,
    polish: {
      ...DEFAULT_POLISH_CONFIG,
      ...raw.polish,
    },
    transcription: {
      ...DEFAULT_TRANSCRIPTION_SETTINGS,
      ...raw.transcription,
      online: {
        ...DEFAULT_ONLINE_TRANSCRIPTION_CONFIG,
        ...raw.transcription?.online,
      },
    },
  }
}

export function saveAppSettings(settings: Partial<AppSettings>): void {
  const current = loadAppSettings()
  const updated = { ...current, ...settings }

  // 确保用户配置目录存在
  if (!fs.existsSync(userConfigDir)) {
    fs.mkdirSync(userConfigDir, { recursive: true })
  }

  const filePath = path.join(userConfigDir, 'settings.json')
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
  console.log('[Config] 应用设置已保存:', updated)
}

// 导出路径工具函数供其他模块使用
export * from './paths'
