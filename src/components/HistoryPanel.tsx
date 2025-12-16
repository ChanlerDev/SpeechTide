/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react'

interface HistoryRecord {
  id: string
  startedAt: number
  finishedAt: number
  durationMs: number
  audioPath: string
  transcript?: string
  modelId?: string
  language?: string
  error?: string
}

interface HistoryPanelProps {
  onBack: () => void
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
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  // 复制文本
  const handleCopy = async (record: HistoryRecord) => {
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
  const handlePlay = async (record: HistoryRecord) => {
    if (playingId === record.id) return
    setPlayingId(record.id)
    try {
      await window.speech.playHistoryAudio(record.id)
    } catch (err) {
      console.error('播放失败:', err)
    } finally {
      // 延迟重置播放状态，给音频一些播放时间
      setTimeout(() => setPlayingId(null), 1000)
    }
  }

  // 删除记录
  const handleDelete = async (record: HistoryRecord) => {
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

  return (
    <div className="h-full bg-gradient-to-b from-slate-50 to-white flex flex-col overflow-hidden">
      {/* 固定头部区域 */}
      <div className="flex-shrink-0 sticky top-0 z-10">
        {/* macOS 交通灯安全区域 */}
        <div className="h-7 bg-white/80" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* 头部 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs">返回</span>
          </button>
          <div className="flex items-center gap-2 flex-1">
            <h2 className="text-sm font-semibold text-gray-800">历史记录</h2>
            {copiedId && (
              <span className="text-xs text-green-600 font-medium">
                已复制到剪贴板
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{records.length} 条</span>
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
        ) : records.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-400 text-sm">暂无历史记录</p>
            <p className="text-gray-300 text-xs mt-1">开始录音后会自动保存</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {records.map((record) => (
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

                {/* 复制提示 */}
                {copiedId === record.id && (
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    已复制
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

HistoryPanel.displayName = 'HistoryPanel'
