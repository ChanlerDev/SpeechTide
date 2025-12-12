/**
 * SpeechTide 路径配置模块
 *
 * 提供动态路径检测，支持开发模式和生产模式
 * 不再需要手动设置 APP_ROOT 和 DYLD_LIBRARY_PATH
 */

import { app } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

let cachedAppRoot: string | null = null
let cachedUserDataPath: string | null = null

/**
 * 获取应用根目录
 * - 开发模式：使用 process.cwd() 或 VITE_DEV_SERVER_URL 推断
 * - 生产模式：使用 app.getAppPath()
 */
export function getAppRoot(): string {
  if (cachedAppRoot) return cachedAppRoot

  // 优先使用环境变量（兼容旧配置）
  if (process.env.APP_ROOT) {
    cachedAppRoot = process.env.APP_ROOT
    return cachedAppRoot
  }

  // 开发模式检测
  const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development'

  if (isDev) {
    // 开发模式：使用当前工作目录
    cachedAppRoot = process.cwd()
  } else if (app.isPackaged) {
    // 生产模式（打包后）：使用 app.getAppPath()
    cachedAppRoot = app.getAppPath()
  } else {
    // 未打包的生产构建：从 __dirname 推断
    // __dirname 通常是 dist-electron/，向上一级就是项目根目录
    cachedAppRoot = path.resolve(__dirname, '..')
  }

  return cachedAppRoot
}

/**
 * 获取用户数据目录
 * - macOS: ~/Library/Application Support/SpeechTide/
 * - Windows: %APPDATA%/SpeechTide/
 * - Linux: ~/.config/SpeechTide/
 */
export function getUserDataPath(): string {
  if (cachedUserDataPath) return cachedUserDataPath

  if (process.platform === 'darwin') {
    cachedUserDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'SpeechTide')
  } else if (process.platform === 'win32') {
    cachedUserDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'SpeechTide')
  } else {
    cachedUserDataPath = path.join(os.homedir(), '.config', 'SpeechTide')
  }

  return cachedUserDataPath
}

/**
 * 获取原生库路径（sherpa-onnx）
 * - 开发模式：从 node_modules 加载
 * - 生产模式：从 resources/native 加载
 */
export function getNativeLibPath(): string {
  const appRoot = getAppRoot()
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win' : 'linux'
  const libName = `sherpa-onnx-${platform}-${arch}`

  if (app.isPackaged) {
    // 打包后：从 resources 目录加载
    return path.join(process.resourcesPath, 'native', libName)
  }

  // 开发模式：从 node_modules 加载
  return path.join(appRoot, 'node_modules', libName)
}

/**
 * 获取 preload 脚本路径
 */
export function getPreloadPath(): string {
  const appRoot = getAppRoot()
  const isDev = !!process.env.VITE_DEV_SERVER_URL

  if (isDev) {
    return path.join(appRoot, 'electron', 'preload.cjs')
  }

  return path.join(appRoot, 'dist-electron', 'preload.js')
}

/**
 * 获取渲染进程资源目录
 */
export function getRendererDistPath(): string {
  const appRoot = getAppRoot()
  return path.join(appRoot, 'dist')
}

/**
 * 获取公共资源目录
 */
export function getPublicPath(): string {
  const appRoot = getAppRoot()
  const isDev = !!process.env.VITE_DEV_SERVER_URL

  if (isDev) {
    return path.join(appRoot, 'public')
  }

  return getRendererDistPath()
}

/**
 * 获取配置目录（用户配置）
 */
export function getConfigDir(): string {
  return path.join(getUserDataPath(), 'config')
}

/**
 * 获取项目内置配置目录（默认配置模板）
 */
export function getBundledConfigDir(): string {
  const appRoot = getAppRoot()
  return path.join(appRoot, 'config')
}

/**
 * 获取日志目录
 */
export function getLogsDir(): string {
  return path.join(getUserDataPath(), 'logs')
}

/**
 * 获取模型目录
 */
export function getModelsDir(): string {
  return path.join(getUserDataPath(), 'models')
}

/**
 * 获取会话目录
 */
export function getConversationsDir(): string {
  return path.join(getUserDataPath(), 'conversations')
}

/**
 * 获取缓存目录
 */
export function getCacheDir(): string {
  return path.join(getUserDataPath(), 'cache')
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 初始化所有必要的目录
 */
export function initializeDirectories(): void {
  const dirs = [
    getUserDataPath(),
    getConfigDir(),
    getLogsDir(),
    getModelsDir(),
    getConversationsDir(),
    getCacheDir(),
  ]

  for (const dir of dirs) {
    ensureDir(dir)
  }
}

/**
 * 检测是否为开发模式
 */
export function isDevelopment(): boolean {
  return !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development'
}

/**
 * 获取 sherpa-onnx 原生库的 DYLD_LIBRARY_PATH（仅 macOS）
 * 用于在启动子进程时设置环境变量
 */
export function getSherpaOnnxLibraryPath(): string | undefined {
  if (process.platform !== 'darwin') return undefined
  return getNativeLibPath()
}

/**
 * 构建子进程环境变量
 * 自动添加必要的路径配置
 */
export function buildWorkerEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }

  // 设置 APP_ROOT（向后兼容）
  env.APP_ROOT = getAppRoot()

  // macOS: 设置 DYLD_LIBRARY_PATH
  if (process.platform === 'darwin') {
    const sherpaPath = getSherpaOnnxLibraryPath()
    if (sherpaPath) {
      env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
        ? `${sherpaPath}:${env.DYLD_LIBRARY_PATH}`
        : sherpaPath
    }
  }

  return env
}
