/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react'
import type { ConversationRecord } from '../../shared/conversation'

interface HistoryPanelProps {
  onBack: () => void
}

type TimeRangeFilter = 'today' | 'week' | 'month' | 'all'

const TIME_FILTERS: { value: TimeRangeFilter; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'all', label: '全部' },
]

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function filterByTimeRange(records: ConversationRecord[], filter: TimeRangeFilter): ConversationRecord[] {
  if (filter === 'all') return records
  const now = new Date()
  let cutoff: number

  switch (filter) {
    case 'today':
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      break
    case 'week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).getTime()
      break
    }
    case 'month':
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      break
    default:
      return records
  }
  return records.filter(r => r.finishedAt >= cutoff)
}

function getRecordsToDelete(records: ConversationRecord[], filter: TimeRangeFilter): ConversationRecord[] {
  if (filter === 'all') return records
  const now = new Date()
  let cutoff: number

  switch (filter) {
    case 'today':
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      break
    case 'week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).getTime()
      break
    }
    case 'month':
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      break
    default:
      return []
  }
  return records.filter(r => r.finishedAt < cutoff)
}

function calculateSize(records: ConversationRecord[]): number {
  return records.reduce((sum, r) => sum + (r.transcript?.length || 0) * 2 + 3000, 0)
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  if (isToday) return time
  if (isYesterday) return `昨天 ${time}`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + time
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`
}

export const HistoryPanel = memo<HistoryPanelProps>(({ onBack }) => {
  const [records, setRecords] = useState<ConversationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<TimeRangeFilter>('today')
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const copyTimeout = useRef<NodeJS.Timeout | null>(null)
  const playTimeout = useRef<NodeJS.Timeout | null>(null)

  const filtered = filterByTimeRange(records, filter)
  const toDelete = getRecordsToDelete(records, filter)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.speech.getHistoryList({ limit: 1000 })
      if (result.error) setError(result.error)
      else setRecords(result.records || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
      if (playTimeout.current) clearTimeout(playTimeout.current)
    }
  }, [])

  const handleCopy = async (record: ConversationRecord) => {
    if (!record.transcript) return
    try {
      await navigator.clipboard.writeText(record.transcript)
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
      setCopiedId(record.id)
      copyTimeout.current = setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }

  const handlePlay = async (record: ConversationRecord) => {
    if (playingId === record.id) return
    if (playTimeout.current) clearTimeout(playTimeout.current)
    setPlayingId(record.id)
    try {
      await window.speech.playHistoryAudio(record.id)
    } catch {
      // ignore
    } finally {
      playTimeout.current = setTimeout(() => setPlayingId(null), Math.max(1000, record.durationMs))
    }
  }

  const handleDelete = async (record: ConversationRecord) => {
    if (deletingId === record.id) return
    setDeletingId(record.id)
    try {
      const result = await window.speech.deleteHistoryItem(record.id)
      if (result.success) setRecords(prev => prev.filter(r => r.id !== record.id))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkClear = async () => {
    setShowConfirm(false)
    setIsClearing(true)
    const targets = [...toDelete]
    for (const record of targets) {
      try {
        const result = await window.speech.deleteHistoryItem(record.id)
        if (result.success) setRecords(prev => prev.filter(r => r.id !== record.id))
      } catch {
        // ignore
      }
    }
    setIsClearing(false)
  }

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="flex-shrink-0">
        <div className="h-7" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">返回</span>
            </button>
            <span className="text-lg font-semibold text-[hsl(var(--text-primary))]">历史记录</span>
            <div className="w-12" />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-3">
            {TIME_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`chip flex-1 text-center ${filter === f.value ? 'active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Stats & clear */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[hsl(var(--text-tertiary))]">
              {filtered.length} 条 · {formatBytes(calculateSize(filtered))}
            </span>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isClearing || toDelete.length === 0}
              className="text-xs px-2.5 py-1 rounded-md text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isClearing ? '清除中...' : '清除旧记录'}
            </button>
          </div>

          {/* Confirm dialog */}
          {showConfirm && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-[hsl(var(--text-primary))] mb-2">
                确定清除 {toDelete.length} 条记录？此操作不可恢复。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))]"
                >
                  取消
                </button>
                <button
                  onClick={handleBulkClear}
                  className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600"
                >
                  确认清除
                </button>
              </div>
            </div>
          )}

          {/* Copy toast */}
          {copiedId && (
            <div className="mt-2 text-center">
              <span className="text-xs text-emerald-600 font-medium">已复制到剪贴板</span>
            </div>
          )}
        </div>
        <div className="divider" />
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-rose-500 mb-2">{error}</p>
            <button onClick={loadHistory} className="text-sm text-[hsl(var(--primary))] hover:underline">
              重试
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-sm text-[hsl(var(--text-tertiary))]">
              {filter === 'all' ? '暂无历史记录' : '该时间段无记录'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(record => (
              <div
                key={record.id}
                onClick={() => handleCopy(record)}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  copiedId === record.id
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'bg-white border border-transparent hover:border-[hsl(var(--border))]'
                } ${record.error ? 'opacity-60' : ''}`}
                style={{
                  boxShadow: copiedId === record.id ? 'none' : '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                {/* Meta row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs text-[hsl(var(--text-tertiary))]">
                    <span>{formatTime(record.finishedAt)}</span>
                    <span>·</span>
                    <span>{formatDuration(record.durationMs)}</span>
                    {record.language && (
                      <>
                        <span>·</span>
                        <span>{record.language}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handlePlay(record)}
                      disabled={playingId === record.id}
                      className={`p-1.5 rounded-lg transition-colors ${
                        playingId === record.id
                          ? 'bg-[hsl(var(--primary))] text-white'
                          : 'text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--muted))]'
                      }`}
                    >
                      {playingId === record.id ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(record)}
                      disabled={deletingId === record.id}
                      className="p-1.5 rounded-lg text-[hsl(var(--text-tertiary))] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      {deletingId === record.id ? (
                        <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="min-h-[32px]">
                  {record.error ? (
                    <p className="text-sm text-rose-400">转写失败: {record.error}</p>
                  ) : record.transcript ? (
                    <p className="text-sm text-[hsl(var(--text-primary))] leading-relaxed line-clamp-2">
                      {record.transcript}
                    </p>
                  ) : (
                    <p className="text-sm text-[hsl(var(--text-tertiary))]">无内容</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
})

HistoryPanel.displayName = 'HistoryPanel'
