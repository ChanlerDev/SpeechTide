import fs from 'node:fs/promises'
import path from 'node:path'
import type { ConversationRecord } from '../../shared/conversation'

export class ConversationStore {
  constructor(private readonly baseDir: string) {}

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
        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
        if (!uuidPattern.test(entry.name)) continue

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
          } catch {
            // meta.json 不存在或损坏，视为古老记录
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
   * @returns 删除的会话数量
   */
  async clearByAge(maxAgeDays: number): Promise<{ deletedCount: number }> {
    let deletedCount = 0
    const now = Date.now()
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        // 验证目录名格式（UUID），防止误删其他文件
        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
        if (!uuidPattern.test(entry.name)) continue

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
          } catch {
            // meta.json 不存在或损坏，视为古老记录可删除
            shouldDelete = true
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
