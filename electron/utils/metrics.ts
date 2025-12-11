/**
 * SpeechTide 性能监控系统
 *
 * 收集和追踪应用性能指标，包括：
 * - 录音启动时间
 * - 转写耗时
 * - 内存使用
 * - 模型加载时间
 */

import { createModuleLogger } from './logger'

const logger = createModuleLogger('metrics')

/**
 * 单次操作的性能指标
 */
export interface PerformanceMetric {
  /** 操作类型 */
  operation: 'recording' | 'transcription' | 'model_load' | 'text_insert'
  /** 开始时间戳 */
  startTime: number
  /** 耗时（毫秒） */
  duration: number
  /** 内存使用（字节） */
  memoryUsage: number
  /** 附加数据 */
  metadata?: Record<string, unknown>
}

/**
 * 聚合统计数据
 */
export interface AggregatedStats {
  count: number
  totalDuration: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  lastUpdated: number
}

/**
 * 性能指标收集器
 *
 * 单例模式，全局共享实例
 */
export class MetricsCollector {
  private static instance: MetricsCollector
  private metrics: PerformanceMetric[] = []
  private readonly maxMetrics = 100
  private stats: Map<string, AggregatedStats> = new Map()
  private activeTimers: Map<string, number> = new Map()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector()
    }
    return MetricsCollector.instance
  }

  /**
   * 开始计时
   * @returns 计时器 ID
   */
  startTimer(operation: PerformanceMetric['operation'], timerId?: string): string {
    const id = timerId || `${operation}_${Date.now()}`
    this.activeTimers.set(id, Date.now())
    logger.debug(`开始计时: ${operation}`, { timerId: id })
    return id
  }

  /**
   * 结束计时并记录指标
   */
  endTimer(
    timerId: string,
    operation: PerformanceMetric['operation'],
    metadata?: Record<string, unknown>
  ): PerformanceMetric | null {
    const startTime = this.activeTimers.get(timerId)
    if (!startTime) {
      logger.warn(`计时器不存在: ${timerId}`)
      return null
    }

    this.activeTimers.delete(timerId)
    const duration = Date.now() - startTime
    const memoryUsage = process.memoryUsage().heapUsed

    const metric: PerformanceMetric = {
      operation,
      startTime,
      duration,
      memoryUsage,
      metadata,
    }

    this.recordMetric(metric)
    return metric
  }

  /**
   * 直接记录指标
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric)

    // 限制内存中的指标数量
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }

    // 更新聚合统计
    this.updateStats(metric)

    logger.debug(`记录指标: ${metric.operation}`, {
      duration: metric.duration,
      memoryUsage: Math.round(metric.memoryUsage / 1024 / 1024) + 'MB',
    })
  }

  /**
   * 更新聚合统计数据
   */
  private updateStats(metric: PerformanceMetric): void {
    const existing = this.stats.get(metric.operation)
    if (existing) {
      existing.count++
      existing.totalDuration += metric.duration
      existing.avgDuration = Math.round(existing.totalDuration / existing.count)
      existing.minDuration = Math.min(existing.minDuration, metric.duration)
      existing.maxDuration = Math.max(existing.maxDuration, metric.duration)
      existing.lastUpdated = Date.now()
    } else {
      this.stats.set(metric.operation, {
        count: 1,
        totalDuration: metric.duration,
        avgDuration: metric.duration,
        minDuration: metric.duration,
        maxDuration: metric.duration,
        lastUpdated: Date.now(),
      })
    }
  }

  /**
   * 获取指定操作的统计数据
   */
  getStats(operation: PerformanceMetric['operation']): AggregatedStats | null {
    return this.stats.get(operation) || null
  }

  /**
   * 获取所有统计数据
   */
  getAllStats(): Record<string, AggregatedStats> {
    const result: Record<string, AggregatedStats> = {}
    this.stats.forEach((value, key) => {
      result[key] = { ...value }
    })
    return result
  }

  /**
   * 获取最近的指标记录
   */
  getRecentMetrics(count = 10): PerformanceMetric[] {
    return this.metrics.slice(-count)
  }

  /**
   * 获取平均转写时间
   */
  getAverageTranscriptionTime(): number {
    const stats = this.stats.get('transcription')
    return stats?.avgDuration || 0
  }

  /**
   * 获取当前内存使用
   */
  getCurrentMemoryUsage(): { heapUsed: number; heapTotal: number; rss: number } {
    const usage = process.memoryUsage()
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
    }
  }

  /**
   * 清空所有指标
   */
  clear(): void {
    this.metrics = []
    this.stats.clear()
    this.activeTimers.clear()
    logger.info('性能指标已清空')
  }

  /**
   * 导出报告
   */
  exportReport(): {
    stats: Record<string, AggregatedStats>
    recentMetrics: PerformanceMetric[]
    memory: { heapUsed: number; heapTotal: number; rss: number }
  } {
    return {
      stats: this.getAllStats(),
      recentMetrics: this.getRecentMetrics(20),
      memory: this.getCurrentMemoryUsage(),
    }
  }
}

/**
 * 全局性能收集器实例
 */
export const metrics = MetricsCollector.getInstance()
