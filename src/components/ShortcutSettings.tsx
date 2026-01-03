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
 * 统一 hybrid 模式：短按 = AI 润色输出，长按 = 快速输出
 */
export const ShortcutSettings = ({
  shortcut,
  isRecordingShortcut,
  onShortcutChange,
  onRecordingChange,
}: ShortcutSettingsProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const pressedKeysRef = useRef<Set<string>>(new Set())

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isRecordingShortcut) return

      e.preventDefault()
      e.stopPropagation()

      // 收集按下的键
      pressedKeysRef.current.add(e.code)
    },
    [isRecordingShortcut]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isRecordingShortcut) return

      e.preventDefault()
      e.stopPropagation()

      // 获取所有按下的键
      const pressedKeys = Array.from(pressedKeysRef.current)
      pressedKeysRef.current.clear()

      if (pressedKeys.length === 0) return

      // 按固定顺序排列：修饰键在前，主键在后
      const modifierOrder = ['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight']
      const modifiers = pressedKeys.filter(k => modifierOrder.includes(k)).sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b))
      const otherKeys = pressedKeys.filter(k => !modifierOrder.includes(k))

      const accelerator = [...modifiers, ...otherKeys].join('+')

      if (shortcut && accelerator) {
        const newShortcut = { ...shortcut, accelerator }
        onShortcutChange(newShortcut).then((result) => {
          if (!result.success) {
            alert('快捷键设置失败: ' + result.error)
          }
        })
      }
      onRecordingChange(false)
      inputRef.current?.blur()
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
      {/* 快捷键输入 */}
      <div>
        <span className="text-sm font-medium text-gray-700">快捷键</span>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={isRecordingShortcut ? '按下新快捷键...' : (shortcut?.accelerator || '')}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className={`w-full mt-2 px-3 py-2 text-xs text-center font-mono border rounded-lg bg-gray-50 cursor-pointer focus:outline-none transition-all ${
            isRecordingShortcut
              ? 'border-orange-400 ring-2 ring-orange-100 bg-orange-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
          placeholder="点击设置"
        />
      </div>

      {/* 行为说明 */}
      <p className="text-xs text-gray-400 text-center">
        短按 = AI 润色输出 · 长按 = 快速输出
      </p>
    </div>
  )
}
