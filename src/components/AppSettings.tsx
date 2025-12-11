/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { memo, useCallback } from 'react'

interface AppleScriptPermission {
  available: boolean
  hasPermission: boolean
  message: string
  guide?: string
}

interface AppSettingsProps {
  clipboardMode: boolean
  autoShowOnStart: boolean
  appleScriptPermission: AppleScriptPermission | null
  onUpdateClipboardMode: (value: boolean) => Promise<void>
  onUpdateAutoShowOnStart: (value: boolean) => Promise<void>
  onRefreshAppleScriptPermission: () => Promise<void>
}

/**
 * 应用设置组件
 */
export const AppSettings = memo<AppSettingsProps>(({
  clipboardMode,
  autoShowOnStart,
  appleScriptPermission,
  onUpdateClipboardMode,
  onUpdateAutoShowOnStart,
  onRefreshAppleScriptPermission,
}) => {
  const handleToggleClipboard = useCallback(() => {
    onUpdateClipboardMode(!clipboardMode)
  }, [clipboardMode, onUpdateClipboardMode])

  const handleToggleAutoShow = useCallback(() => {
    onUpdateAutoShowOnStart(!autoShowOnStart)
  }, [autoShowOnStart, onUpdateAutoShowOnStart])

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
    </div>
  )
})

AppSettings.displayName = 'AppSettings'
