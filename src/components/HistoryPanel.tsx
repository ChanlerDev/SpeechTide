/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react'
import type { ConversationRecord } from '../../shared/conversation'

interface HistoryPanelProps {
  onBack: () => void
}

/** 时间范围过滤类型 */
type TimeRangeFilter = 'all' | 'today' | 'this-week' | 'this-month' | 'older'

const TIME_RANGE_OPTIONS: { value: TimeRangeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'this-week', label: '本周' },
  { value: 'this-month', label: '本月' },
  { value: 'older', label: '更早' },
]

/**
 * 格式化字节数为可读字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * 根据时间范围过滤记录
 */
function filterByTimeRange(records: ConversationRecord[], filter: TimeRangeFilter): ConversationRecord[] {
  if (filter === 'all') return records

  const now = new Date()
  let cutoffTime: number

  switch (filter) {
    case 'today': {
      // 今天：今天00:00:00至今
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      cutoffTime = todayStart.getTime()
      return records.filter(record => record.finishedAt >= cutoffTime)
    }
    case 'this-week': {
      // 本周：本周一00:00:00至今
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1 // 周一为起始
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
      cutoffTime = weekStart.getTime()
      return records.filter(record => record.finishedAt >= cutoffTime)
    }
    case 'this-month': {
      // 本月：本月1号00:00:00至今
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      cutoffTime = monthStart.getTime()
      return records.filter(record => record.finishedAt >= cutoffTime)
    }
    case 'older': {
      // 更早：本月1号之前
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      cutoffTime = monthStart.getTime()
      return records.filter(record => record.finishedAt < cutoffTime)
    }
    default:
      return records
  }
}

/**
 * 计算记录集合的总大小（估算）
 */
function calculateTotalSize(records: ConversationRecord[]): number {
  return records.reduce((sum, record) => {
    const textSize = (record.transcript?.length || 0) * 2
    const audioSize = 3000 // 估算音频文件约 3KB
    return sum + textSize + audioSize
  }, 0)
}

/**
 * 格式化时间戳为可读字符串
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  if (isToday) {
    return `今天 ${timeStr}`
  } else if (isYesterday) {
    return `昨天 ${timeStr}`
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + timeStr
  }
}

/**
 * 格式化时长
 */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m${remainingSeconds}s`
}

/**
 * 历史记录面板
 */
export const HistoryPanel = memo<HistoryPanelProps>(({ onBack }) => {
  const [records, setRecords] = useState<ConversationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 新增状态：时间过滤和批量清除
  const [timeFilter, setTimeFilter] = useState<TimeRangeFilter>('all')
  const [isClearing, setIsClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // 前端过滤逻辑
  const filteredRecords = filterByTimeRange(records, timeFilter)
  const filteredStats = {
    count: filteredRecords.length,
    sizeBytes: calculateTotalSize(filteredRecords),
  }

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.speech.getHistoryList({ limit: 100 })
      if (result.error) {
        setError(result.error)
      } else {
        setRecords(result.records || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // 清理 timeout，防止内存泄漏
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  // 复制文本
  const handleCopy = async (record: ConversationRecord) => {
    if (!record.transcript) return
    try {
      await navigator.clipboard.writeText(record.transcript)
      // 清除之前的 timeout，防止提前消失
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      setCopiedId(record.id)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 3000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  // 播放音频
  const handlePlay = async (record: ConversationRecord) => {
    if (playingId === record.id) return
    setPlayingId(record.id)
    try {
      await window.speech.playHistoryAudio(record.id)
    } catch (err) {
      console.error('播放失败:', err)
    } finally {
      // 根据音频实际时长设置状态重置时间
      const resetDelay = Math.max(1000, record.durationMs)
      setTimeout(() => setPlayingId(null), resetDelay)
    }
  }

  // 删除记录
  const handleDelete = async (record: ConversationRecord) => {
    if (deletingId === record.id) return
    setDeletingId(record.id)
    try {
      const result = await window.speech.deleteHistoryItem(record.id)
      if (result.success) {
        setRecords(prev => prev.filter(r => r.id !== record.id))
      } else {
        console.error('删除失败:', result.error)
      }
    } catch (err) {
      console.error('删除失败:', err)
    } finally {
      setDeletingId(null)
    }
  }

  // 批量清除历史记录（逐个删除当前显示的记录）
  const handleBulkClear = async () => {
    setShowClearConfirm(false)
    setIsClearing(true)

    let deletedCount = 0
    const recordsToDelete = [...filteredRecords] // 复制一份，避免状态变化影响迭代

    try {
      // 逐个删除当前筛选的记录
      for (const record of recordsToDelete) {
        try {
          const result = await window.speech.deleteHistoryItem(record.id)
          if (result.success) {
            deletedCount++
            // 实时更新UI
            setRecords(prev => prev.filter(r => r.id !== record.id))
          }
        } catch (err) {
          console.error(`删除记录 ${record.id} 失败:`, err)
        }
      }

      console.log(`已删除 ${deletedCount} 条历史记录`)
      if (deletedCount < recordsToDelete.length) {
        alert(`部分记录删除失败，成功删除 ${deletedCount}/${recordsToDelete.length} 条`)
      }
    } catch (err) {
      alert('清除失败: ' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* 固定头部区域 */}
      <div className="flex-shrink-0">
        {/* macOS 交通灯安全区域 */}
        <div className="h-7 bg-white/80" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* 头部 */}
        <div className="px-3 py-2 border-b border-gray-100 bg-white/95">
          {/* 第一行：返回按钮和标题 */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-xs">返回</span>
            </button>
            <h2 className="text-sm font-semibold text-gray-800">历史记录</h2>
            <div className="w-16" /> {/* 占位保持居中 */}
          </div>

          {/* 第二行：时间过滤器 */}
          <div className="flex items-center gap-1.5 mb-2">
            {TIME_RANGE_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => setTimeFilter(option.value)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  timeFilter === option.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* 第三行：统计信息和批量清除 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {filteredStats.count} 条 · {formatBytes(filteredStats.sizeBytes)}
            </span>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing || filteredStats.count === 0}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                isClearing || filteredStats.count === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              {isClearing ? '清除中...' : '批量清除'}
            </button>
          </div>

          {/* 复制提示（全局） */}
          {copiedId && (
            <div className="mt-2 text-xs text-green-600 font-medium text-center">
              已复制到剪贴板
            </div>
          )}

          {/* 清除确认对话框 */}
          {showClearConfirm && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 mb-2">
                确定要删除{TIME_RANGE_OPTIONS.find(o => o.value === timeFilter)?.label}历史记录吗？
                共 {filteredStats.count} 条，此操作不可恢复。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleBulkClear}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  确认删除
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={loadHistory}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              重试
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-400 text-sm">
              {timeFilter === 'all' ? '暂无历史记录' : `${TIME_RANGE_OPTIONS.find(o => o.value === timeFilter)?.label}暂无记录`}
            </p>
            <p className="text-gray-300 text-xs mt-1">
              {timeFilter === 'all' ? '开始录音后会自动保存' : '可尝试切换其他时间范围'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {filteredRecords.map((record) => (
              <div
                key={record.id}
                onClick={() => handleCopy(record)}
                className={`bg-white rounded-lg border shadow-sm p-3 cursor-pointer transition-all
                  ${copiedId === record.id
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-100 hover:border-gray-200 hover:shadow'
                  }
                  ${record.error ? 'opacity-60' : ''}
                `}
              >
                {/* 顶部：时间和操作按钮 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{formatTime(record.finishedAt)}</span>
                    <span className="text-xs text-gray-300">|</span>
                    <span className="text-xs text-gray-400">{formatDuration(record.durationMs)}</span>
                    {record.language && (
                      <>
                        <span className="text-xs text-gray-300">|</span>
                        <span className="text-xs text-gray-400">{record.language}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {/* 播放按钮 */}
                    <button
                      onClick={() => handlePlay(record)}
                      disabled={playingId === record.id}
                      className={`p-1.5 rounded-md transition-colors ${
                        playingId === record.id
                          ? 'bg-blue-100 text-blue-600'
                          : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                      }`}
                      title="播放录音"
                    >
                      {playingId === record.id ? (
                        <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleDelete(record)}
                      disabled={deletingId === record.id}
                      className={`p-1.5 rounded-md transition-colors ${
                        deletingId === record.id
                          ? 'bg-red-100 text-red-600'
                          : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                      }`}
                      title="删除记录"
                    >
                      {deletingId === record.id ? (
                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* 转录文本 */}
                <div className="min-h-[36px]">
                  {record.error ? (
                    <p className="text-red-400 text-sm">转写失败: {record.error}</p>
                  ) : record.transcript ? (
                    <p className="text-gray-700 text-sm leading-relaxed line-clamp-3">
                      {record.transcript}
                    </p>
                  ) : (
                    <p className="text-gray-300 text-sm">无转录内容</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

HistoryPanel.displayName = 'HistoryPanel'
