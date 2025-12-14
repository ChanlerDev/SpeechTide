/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { memo, useCallback, useState } from 'react'

interface AppleScriptPermission {
  available: boolean
  hasPermission: boolean
  message: string
  guide?: string
}

interface HistoryStats {
  count: number
  sizeBytes: number
}

/**
 * 模型缓存时间选项（分钟）
 * 0 表示永不卸载
 */
const CACHE_TTL_OPTIONS = [
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 0, label: '永不' },
] as const

/**
 * 清除历史时间范围选项（天）
 * 0 表示清除全部
 */
const CLEAR_AGE_OPTIONS = [
  { value: 1, label: '1 天前' },
  { value: 3, label: '3 天前' },
  { value: 7, label: '7 天前' },
  { value: 30, label: '30 天前' },
  { value: 0, label: '全部' },
] as const

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

interface AppSettingsProps {
  clipboardMode: boolean
  autoShowOnStart: boolean
  cacheTTLMinutes: number
  appleScriptPermission: AppleScriptPermission | null
  historyStats: HistoryStats | null
  isClearing: boolean
  onUpdateClipboardMode: (value: boolean) => Promise<void>
  onUpdateAutoShowOnStart: (value: boolean) => Promise<void>
  onUpdateCacheTTL: (value: number) => Promise<void>
  onRefreshAppleScriptPermission: () => Promise<void>
  onClearHistory: (maxAgeDays: number) => Promise<void>
  onRefreshHistoryStats: () => Promise<void>
}

/**
 * 应用设置组件
 */
export const AppSettings = memo<AppSettingsProps>(({
  clipboardMode,
  autoShowOnStart,
  cacheTTLMinutes,
  appleScriptPermission,
  historyStats,
  isClearing,
  onUpdateClipboardMode,
  onUpdateAutoShowOnStart,
  onUpdateCacheTTL,
  onRefreshAppleScriptPermission,
  onClearHistory,
  onRefreshHistoryStats,
}) => {
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedAge, setSelectedAge] = useState(7)

  const handleToggleClipboard = useCallback(() => {
    onUpdateClipboardMode(!clipboardMode)
  }, [clipboardMode, onUpdateClipboardMode])

  const handleToggleAutoShow = useCallback(() => {
    onUpdateAutoShowOnStart(!autoShowOnStart)
  }, [autoShowOnStart, onUpdateAutoShowOnStart])

  const handleCacheTTLChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateCacheTTL(Number(e.target.value))
  }, [onUpdateCacheTTL])

  const handleClearConfirm = useCallback(async () => {
    setShowConfirm(false)
    await onClearHistory(selectedAge)
    await onRefreshHistoryStats()
  }, [selectedAge, onClearHistory, onRefreshHistoryStats])

  const Toggle = ({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-600">{label}</span>
      <button
        onClick={onToggle}
        className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'left-4' : 'left-0.5'}`} />
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <span className="text-xs font-medium text-gray-600">设置</span>

      <div className="mt-2 divide-y divide-gray-50">
        <Toggle enabled={clipboardMode} onToggle={handleToggleClipboard} label="禁用自动插入" />
        <Toggle enabled={autoShowOnStart} onToggle={handleToggleAutoShow} label="启动时显示面板" />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-gray-600">模型缓存时间</span>
          <select
            value={cacheTTLMinutes}
            onChange={handleCacheTTLChange}
            className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {CACHE_TTL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {appleScriptPermission && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">辅助功能</span>
            <div className={`flex items-center gap-1 text-xs ${appleScriptPermission.hasPermission ? 'text-green-600' : 'text-amber-600'}`}>
              <span>{appleScriptPermission.hasPermission ? '✓' : '⚠'}</span>
              <button onClick={onRefreshAppleScriptPermission} className="hover:underline">
                {appleScriptPermission.hasPermission ? '正常' : '检查'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyStats && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs text-gray-500">历史记录</span>
              <p className="text-xs text-gray-400 mt-0.5">
                {historyStats.count} 条，共 {formatBytes(historyStats.sizeBytes)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedAge}
              onChange={(e) => setSelectedAge(Number(e.target.value))}
              disabled={isClearing || historyStats.count === 0}
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            >
              {CLEAR_AGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isClearing || historyStats.count === 0}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                isClearing || historyStats.count === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              {isClearing ? '清除中...' : '清除'}
            </button>
          </div>

          {showConfirm && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 mb-2">
                确定要删除{selectedAge === 0 ? '全部' : ` ${selectedAge} 天前的`}历史记录吗？此操作不可恢复。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleClearConfirm}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  确认删除
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

AppSettings.displayName = 'AppSettings'
