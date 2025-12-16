import fs from 'node:fs/promises'
import path from 'node:path'
import type { ConversationRecord } from '../../shared/conversation'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('conversation-store')

/** UUID 格式正则表达式 */
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/**
 * 判断是否为预期的文件读取错误（文件不存在或JSON解析失败）
 */
function isExpectedMetaError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
  return false
}

export interface ListOptions {
  limit?: number
  offset?: number
  excludeTest?: boolean
}

export class ConversationStore {
  constructor(private readonly baseDir: string) {}

  /**
   * 获取历史记录列表
   * @param options 分页和过滤选项
   * @returns 按时间倒序排列的会话记录列表
   */
  async list(options: ListOptions = {}): Promise<ConversationRecord[]> {
    const { limit = 50, offset = 0, excludeTest = true } = options
    const records: ConversationRecord[] = []

    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true })

      // 读取所有有效的会话记录
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (!UUID_PATTERN.test(entry.name)) continue

        try {
          const metaPath = path.join(this.baseDir, entry.name, 'meta.json')
          const metaContent = await fs.readFile(metaPath, 'utf-8')
          const meta = JSON.parse(metaContent) as ConversationRecord

          // 过滤测试记录
          if (excludeTest && meta.test) continue

          records.push(meta)
        } catch (error) {
          // 跳过无法读取的记录
          if (!isExpectedMetaError(error)) {
            logger.warn('读取会话元数据失败', {
              sessionId: entry.name,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }

      // 按 finishedAt 倒序排列（最新的在前）
      records.sort((a, b) => (b.finishedAt || b.startedAt) - (a.finishedAt || a.startedAt))

      // 应用分页
      return records.slice(offset, offset + limit)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * 根据 ID 获取单个会话记录
   * @param sessionId 会话 ID
   * @returns 会话记录，不存在则返回 null
   */
  async get(sessionId: string): Promise<ConversationRecord | null> {
    // 验证 ID 格式
    if (!UUID_PATTERN.test(sessionId)) {
      return null
    }

    try {
      const metaPath = path.join(this.baseDir, sessionId, 'meta.json')
      const metaContent = await fs.readFile(metaPath, 'utf-8')
      return JSON.parse(metaContent) as ConversationRecord
    } catch (error) {
      if (isExpectedMetaError(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * 删除单个会话记录
   * @param sessionId 会话 ID
   * @returns 是否删除成功
   */
  async delete(sessionId: string): Promise<boolean> {
    // 验证 ID 格式，防止路径遍历
    if (!UUID_PATTERN.test(sessionId)) {
      logger.warn('删除失败：无效的会话 ID 格式', { sessionId })
      return false
    }

    try {
      const sessionDir = path.join(this.baseDir, sessionId)
      await fs.rm(sessionDir, { recursive: true, force: true })
      logger.info('会话已删除', { sessionId })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        context: 'delete',
        sessionId,
      })
      throw error
    }
  }

  async save(record: ConversationRecord) {
    // 输入验证
    if (!record) {
      throw new Error('记录不能为空')
    }
    if (!record.id || typeof record.id !== 'string') {
      throw new Error('记录ID无效：必须是非空字符串')
    }

    // 验证会话ID格式，防止路径遍历攻击
    const sanitizedId = record.id.replace(/[^a-zA-Z0-9_-]/g, '')
    if (sanitizedId !== record.id) {
      throw new Error('会话ID包含非法字符：只能包含字母、数字、下划线和连字符')
    }

    const sessionDir = path.join(this.baseDir, sanitizedId)
    await fs.mkdir(sessionDir, { recursive: true })
    const metaPath = path.join(sessionDir, 'meta.json')
    await fs.writeFile(metaPath, JSON.stringify(record, null, 2), 'utf-8')
    return metaPath
  }

  /**
   * 获取历史记录统计信息
   * @param maxAgeDays 统计多少天前的记录，0 表示全部
   * @returns 会话数量和总存储大小（字节）
   */
  async getStats(maxAgeDays = 0): Promise<{ count: number; sizeBytes: number }> {
    let count = 0
    let sizeBytes = 0
    const now = Date.now()
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        // 验证目录名格式（UUID），防止误计其他文件
        if (!UUID_PATTERN.test(entry.name)) continue

        const sessionDir = path.join(this.baseDir, entry.name)

        // 如果指定了时间范围，检查是否符合条件
        if (maxAgeDays > 0) {
          try {
            const metaPath = path.join(sessionDir, 'meta.json')
            const metaContent = await fs.readFile(metaPath, 'utf-8')
            const meta = JSON.parse(metaContent) as ConversationRecord
            const finishedAt = meta.finishedAt || meta.startedAt || 0
            // 只统计超过指定天数的记录
            if (now - finishedAt <= maxAgeMs) continue
          } catch (error) {
            // 仅对预期错误（文件不存在或JSON损坏）静默处理，视为古老记录
            if (!isExpectedMetaError(error)) {
              logger.warn('读取会话元数据时发生意外错误', {
                sessionId: entry.name,
                error: error instanceof Error ? error.message : String(error),
                code: (error as NodeJS.ErrnoException).code,
              })
            }
          }
        }

        count++
        const files = await fs.readdir(sessionDir)

        for (const file of files) {
          const filePath = path.join(sessionDir, file)
          const stat = await fs.stat(filePath)
          sizeBytes += stat.size
        }
      }
    } catch (error) {
      // 目录不存在时返回空统计
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    return { count, sizeBytes }
  }

  /**
   * 按时间范围清除历史记录
   * @param maxAgeDays 清除多少天前的记录，0 表示清除全部
   * @param excludeSessionId 要排除的会话ID（避免删除正在进行的会话）
   * @returns 删除的会话数量
   */
  async clearByAge(maxAgeDays: number, excludeSessionId?: string): Promise<{ deletedCount: number }> {
    let deletedCount = 0
    const now = Date.now()
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        // 验证目录名格式（UUID），防止误删其他文件
        if (!UUID_PATTERN.test(entry.name)) continue

        // 跳过当前正在进行的会话
        if (excludeSessionId && entry.name === excludeSessionId) continue

        const sessionDir = path.join(this.baseDir, entry.name)
        let shouldDelete = false

        if (maxAgeDays === 0) {
          // 清除全部
          shouldDelete = true
        } else {
          // 读取 meta.json 获取时间戳
          try {
            const metaPath = path.join(sessionDir, 'meta.json')
            const metaContent = await fs.readFile(metaPath, 'utf-8')
            const meta = JSON.parse(metaContent) as ConversationRecord
            const finishedAt = meta.finishedAt || meta.startedAt || 0
            shouldDelete = now - finishedAt > maxAgeMs
          } catch (error) {
            // 仅对预期错误（文件不存在或JSON损坏）允许删除
            if (isExpectedMetaError(error)) {
              shouldDelete = true
            } else {
              // 非预期错误（权限、IO等）跳过该会话，避免误删
              logger.error(error instanceof Error ? error : new Error(String(error)), {
                context: 'clearByAge',
                sessionId: entry.name,
                code: (error as NodeJS.ErrnoException).code,
              })
              shouldDelete = false
            }
          }
        }

        if (shouldDelete) {
          await fs.rm(sessionDir, { recursive: true, force: true })
          deletedCount++
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    return { deletedCount }
  }
}
