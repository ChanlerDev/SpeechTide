/**
 * 转录结果显示组件
 * 支持预览、导出和复制
 */

import { useState, useCallback } from 'react'

interface TranscriptionResultProps {
  text: string
  onExport: () => void
  onCopy: () => void
  onReset: () => void
}

export const TranscriptionResult = ({ text, onExport, onCopy, onReset }: TranscriptionResultProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [onCopy])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs font-medium text-gray-600">转录完成</span>
        </div>
        <span className="text-xs text-gray-400">{text.length} 字符</span>
      </div>

      <div className="p-4">
        <div className="max-h-48 overflow-y-auto rounded-lg bg-gray-50 border border-gray-100 p-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
            {text || '（无转录内容）'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <button
          onClick={onExport}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          导出文件
        </button>

        <button
          onClick={handleCopy}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
            copied
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              已复制
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              复制
            </>
          )}
        </button>

        <button
          onClick={onReset}
          className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
        >
          重新选择
        </button>
      </div>
    </div>
  )
}
