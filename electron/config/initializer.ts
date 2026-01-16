/**
 * 配置初始化模块
 * 
 * 负责首次启动时创建用户配置目录和默认配置文件
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  getUserDataPath,
  getConfigDir,
  getModelsDir,
  getConversationsDir,
  getCacheDir,
  getLogsDir,
  ensureDir,
} from './paths'

/** 默认应用设置 */
const DEFAULT_SETTINGS = {
  shortcut: {
    accelerator: 'MetaRight',
    description: '切换录音流程',
    holdThresholdMs: 300,  // 长按判定阈值
  },
  autoInsertText: true,
  clipboardMode: false,
  notificationEnabled: true,
  autoShowOnStart: true,
  cacheTTLMinutes: 30,
  transcription: {
    mode: 'offline',
    online: {
      provider: 'openai',
      apiKey: '',
      modelId: 'whisper-1',
      responseFormat: 'json',
      temperature: 0,
      timeoutMs: 120000,
    },
  },
}

/** 默认音频配置 */
const DEFAULT_AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  threshold: 0,
  silence: '10.0',
  recorder: 'sox',
  maxDurationMs: 0,
}

/** 默认转写配置 */
const DEFAULT_TRANSCRIBER_CONFIG = {
  engine: 'sensevoice',
  language: 'auto',
  useInverseTextNormalization: true,
}

/**
 * 初始化用户数据目录结构
 */
export function initializeDirectories(): void {
  const dirs = [
    getUserDataPath(),
    getConfigDir(),
    getModelsDir(),
    getConversationsDir(),
    getCacheDir(),
    getLogsDir(),
  ]

  for (const dir of dirs) {
    ensureDir(dir)
  }

  console.log('[Initializer] 用户数据目录已初始化:', getUserDataPath())
}

/**
 * 写入默认配置文件（如果不存在）
 */
function writeDefaultConfig(filename: string, defaults: object): boolean {
  const configDir = getConfigDir()
  const filePath = path.join(configDir, filename)

  if (fs.existsSync(filePath)) {
    return false // 文件已存在，不覆盖
  }

  ensureDir(configDir)
  fs.writeFileSync(filePath, JSON.stringify(defaults, null, 2), 'utf-8')
  console.log(`[Initializer] 创建默认配置: ${filename}`)
  return true
}

/**
 * 初始化所有默认配置文件
 */
export function initializeDefaultConfigs(): void {
  writeDefaultConfig('settings.json', DEFAULT_SETTINGS)
  writeDefaultConfig('audio.json', DEFAULT_AUDIO_CONFIG)
  writeDefaultConfig('transcriber.json', DEFAULT_TRANSCRIBER_CONFIG)
}

/**
 * 检查是否为首次启动
 */
export function isFirstLaunch(): boolean {
  const markerFile = path.join(getUserDataPath(), '.initialized')
  return !fs.existsSync(markerFile)
}

/**
 * 标记初始化完成
 */
export function markInitialized(): void {
  const markerFile = path.join(getUserDataPath(), '.initialized')
  ensureDir(getUserDataPath())
  fs.writeFileSync(markerFile, new Date().toISOString(), 'utf-8')
  console.log('[Initializer] 初始化标记已创建')
}

/**
 * 完整的首次启动初始化
 */
export function performFirstLaunchSetup(): boolean {
  if (!isFirstLaunch()) {
    console.log('[Initializer] 非首次启动，跳过初始化')
    return false
  }

  console.log('[Initializer] 检测到首次启动，开始初始化...')
  initializeDirectories()
  initializeDefaultConfigs()
  // 注意：不在这里调用 markInitialized()，等 Onboarding 完成后再标记
  return true
}

/**
 * 获取初始化状态
 */
export function getInitializationStatus(): {
  isFirstLaunch: boolean
  userDataPath: string
  configDir: string
  modelsDir: string
} {
  return {
    isFirstLaunch: isFirstLaunch(),
    userDataPath: getUserDataPath(),
    configDir: getConfigDir(),
    modelsDir: getModelsDir(),
  }
}
