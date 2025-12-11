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
}
