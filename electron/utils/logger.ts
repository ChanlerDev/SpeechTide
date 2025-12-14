/**
 * SpeechTide 结构化日志系统
 *
 * 基于 pino 实现的日志系统，支持：
 * - 结构化日志输出
 * - 上下文传递
 * - 性能追踪
 * - 文件输出（可选）
 */

import pino from 'pino'
import path from 'node:path'
import fs from 'node:fs'
import { getDefaultSupportDirectory } from '../config'

export interface LogContext {
  sessionId?: string
  operation?: string
  duration?: number
  [key: string]: unknown
}

/**
 * 日志配置
 */
interface LoggerConfig {
  level: pino.Level
  enableFile: boolean
  enableConsole: boolean
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: (process.env.LOG_LEVEL as pino.Level) || 'info',
  enableFile: process.env.NODE_ENV === 'production',
  enableConsole: true,
}

/**
 * 创建 pino 日志实例
 */
function createPinoLogger(config: LoggerConfig): pino.Logger {
  const targets: pino.TransportTargetOptions[] = []

  if (config.enableConsole) {
    targets.push({
      target: 'pino-pretty',
      level: config.level,
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    })
  }

  if (config.enableFile) {
    const logDir = path.join(getDefaultSupportDirectory(), 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`)
    targets.push({
      target: 'pino/file',
      level: config.level,
      options: { destination: logFile },
    })
  }

  if (targets.length === 0) {
    return pino({ level: 'silent' })
  }

  return pino({
    level: config.level,
    base: { app: 'SpeechTide' },  // 版本号从 app.getVersion() 在各模块动态获取
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: { targets },
  })
}

/**
 * Logger 类
 *
 * 提供统一的日志接口，支持上下文传递和子日志器创建
 */
export class Logger {
  private logger: pino.Logger
  private context: LogContext

  constructor(context: LogContext = {}, config: LoggerConfig = DEFAULT_CONFIG) {
    this.logger = createPinoLogger(config)
    this.context = context
  }

  /**
   * 信息级别日志
   */
  info(message: string, context?: LogContext): void {
    this.logger.info({ ...this.context, ...context }, message)
  }

  /**
   * 警告级别日志
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn({ ...this.context, ...context }, message)
  }

  /**
   * 错误级别日志
   */
  error(error: Error | string, context?: LogContext): void {
    if (error instanceof Error) {
      this.logger.error({ err: error, ...this.context, ...context }, error.message)
    } else {
      this.logger.error({ ...this.context, ...context }, error)
    }
  }

  /**
   * 调试级别日志
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug({ ...this.context, ...context }, message)
  }

  /**
   * 追踪级别日志（最详细）
   */
  trace(message: string, context?: LogContext): void {
    this.logger.trace({ ...this.context, ...context }, message)
  }

  /**
   * 创建子日志器，继承当前上下文
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger({ ...this.context, ...context })
    childLogger.logger = this.logger.child(context)
    return childLogger
  }

  /**
   * 计时器：开始计时
   */
  startTimer(operation: string): () => void {
    const start = Date.now()
    return () => {
      const duration = Date.now() - start
      this.info(`${operation} 完成`, { operation, duration })
    }
  }
}

/**
 * 全局日志实例
 */
export const logger = new Logger({ module: 'main' })

/**
 * 创建模块专用日志器
 */
export function createModuleLogger(moduleName: string): Logger {
  return logger.child({ module: moduleName })
}
