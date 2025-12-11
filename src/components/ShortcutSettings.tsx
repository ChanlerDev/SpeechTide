/**
 * Copyright (c) 2025 SpeechTide Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useCallback, useRef, type KeyboardEvent } from 'react'
import type { ShortcutConfig } from '../../shared/app-state'

interface ShortcutSettingsProps {
  shortcut: ShortcutConfig | null
  isRecordingShortcut: boolean
  onShortcutChange: (shortcut: ShortcutConfig) => Promise<{ success: boolean; error?: string }>
  onRecordingChange: (recording: boolean) => void
}

/**
 * 快捷键设置组件
 */
export const ShortcutSettings = ({
  shortcut,
  isRecordingShortcut,
  onShortcutChange,
  onRecordingChange,
}: ShortcutSettingsProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isRecordingShortcut) return

      e.preventDefault()
      e.stopPropagation()

      const modifiers: string[] = []
      if (e.metaKey) modifiers.push('Command')
      if (e.ctrlKey) modifiers.push('Control')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')

      const key = e.key
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return

      const normalizedKey = key.length === 1 ? key.toUpperCase() : key
      const accelerator = [...modifiers, normalizedKey].join('+')

      if (modifiers.length > 0 && shortcut) {
        const newShortcut = { ...shortcut, accelerator }
        onShortcutChange(newShortcut).then((result) => {
          if (!result.success) {
            alert('快捷键设置失败: ' + result.error)
          }
        })
      }
      onRecordingChange(false)
    },
    [isRecordingShortcut, shortcut, onShortcutChange, onRecordingChange]
  )

  const handleInputFocus = () => {
    onRecordingChange(true)
  }

  const handleInputBlur = () => {
    onRecordingChange(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <span className="text-xs font-medium text-gray-600">快捷键</span>
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={isRecordingShortcut ? '按下新快捷键...' : (shortcut?.accelerator || '')}
        onKeyDown={handleKeyDown}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        className={`w-full mt-2 px-3 py-2 text-sm text-center font-mono border rounded-lg bg-gray-50 cursor-pointer focus:outline-none transition-all ${
          isRecordingShortcut 
            ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50' 
            : 'border-gray-200 hover:border-gray-300'
        }`}
        placeholder="点击设置"
      />
      <p className="text-xs text-gray-400 mt-2 text-center">
        按一次开始录音，再按一次停止
      </p>
    </div>
  )
}
