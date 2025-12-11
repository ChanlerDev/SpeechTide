export interface ConversationRecord {
  id: string
  startedAt: number
  finishedAt: number
  durationMs: number
  audioPath: string
  transcript?: string
  modelId?: string
  language?: string
  error?: string
  test?: boolean
}

export interface ConversationStoreOptions {
  baseDir: string
}
