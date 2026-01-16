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

interface AppSettingsProps {
  clipboardMode: boolean
  autoShowOnStart: boolean
  cacheTTLMinutes: number
  allowBetaUpdates: boolean
  appleScriptPermission: AppleScriptPermission | null
  onUpdateClipboardMode: (value: boolean) => Promise<void>
  onUpdateAutoShowOnStart: (value: boolean) => Promise<void>
  onUpdateCacheTTL: (value: number) => Promise<void>
  onUpdateAllowBetaUpdates: (value: boolean) => Promise<void>
  onRefreshAppleScriptPermission: () => Promise<void>
}

/**
 * 应用设置组件
 */
export const AppSettings = memo<AppSettingsProps>(({
  clipboardMode,
  autoShowOnStart,
  cacheTTLMinutes,
  allowBetaUpdates,
  appleScriptPermission,
  onUpdateClipboardMode,
  onUpdateAutoShowOnStart,
  onUpdateCacheTTL,
  onUpdateAllowBetaUpdates,
  onRefreshAppleScriptPermission,
}) => {
  const [showBetaWarning, setShowBetaWarning] = useState(false)

  const handleToggleClipboard = useCallback(() => {
    onUpdateClipboardMode(!clipboardMode)
  }, [clipboardMode, onUpdateClipboardMode])

  const handleToggleAutoShow = useCallback(() => {
    onUpdateAutoShowOnStart(!autoShowOnStart)
  }, [autoShowOnStart, onUpdateAutoShowOnStart])

  const handleToggleBeta = useCallback(() => {
    if (!allowBetaUpdates) {
      // 启用 beta 时显示警告
      setShowBetaWarning(true)
    } else {
      // 禁用 beta 直接执行
      onUpdateAllowBetaUpdates(false)
    }
  }, [allowBetaUpdates, onUpdateAllowBetaUpdates])

  const handleConfirmEnableBeta = useCallback(async () => {
    setShowBetaWarning(false)
    await onUpdateAllowBetaUpdates(true)
  }, [onUpdateAllowBetaUpdates])

  const Toggle = ({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-600">{label}</span>
      <button
        onClick={onToggle}
        className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-[hsl(var(--primary))]' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'left-4' : 'left-0.5'}`} />
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <span className="text-sm font-medium text-gray-700">设置</span>

      <div className="mt-2 space-y-2">
        <div className="divide-y divide-gray-50">
          <Toggle enabled={clipboardMode} onToggle={handleToggleClipboard} label="禁用自动插入" />
          <Toggle enabled={autoShowOnStart} onToggle={handleToggleAutoShow} label="启动时显示面板" />
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-600">接收测试版更新</span>
              <span className="relative group">
                <span className="text-xs text-gray-400 cursor-help">ⓘ</span>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                  测试版可能包含未完善的功能，仅推荐开发者使用
                </span>
              </span>
            </div>
            <button
              onClick={handleToggleBeta}
              className={`relative w-9 h-5 rounded-full transition-colors ${allowBetaUpdates ? 'bg-[hsl(var(--primary))]' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${allowBetaUpdates ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Beta 更新警告对话框 - 紧跟在开关下方 */}
        {showBetaWarning && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-medium text-amber-800 mb-1">⚠️ 测试版更新说明</p>
            <p className="text-xs text-gray-400 mb-2">
              测试版可能包含未完善的功能和已知问题，可能影响使用稳定性。建议仅在需要体验最新特性时启用。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBetaWarning(false)}
                className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmEnableBeta}
                className="px-2 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                我知道了，启用
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-50">
          <div className="py-1.5">
            <span className="text-xs text-gray-600">模型缓存时间</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {CACHE_TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onUpdateCacheTTL(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                    cacheTTLMinutes === opt.value
                      ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {appleScriptPermission && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">辅助功能</span>
            <div className={`flex items-center gap-1 text-xs ${appleScriptPermission.hasPermission ? 'text-green-600' : 'text-amber-600'}`}>
              <span>{appleScriptPermission.hasPermission ? '✓' : '⚠'}</span>
              <button onClick={onRefreshAppleScriptPermission} className="hover:underline">
                {appleScriptPermission.hasPermission ? '正常' : '检查'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

AppSettings.displayName = 'AppSettings'
