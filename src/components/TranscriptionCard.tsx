/**
 * Copyright (c) 2025 SpeechTide Contributors
 * MIT License
 */

import { memo } from 'react'

interface TranscriptionCardProps {
  transcript: string | null | undefined
  copySuccess: boolean
  onCopy: () => void
}

/**
 * 转录文本展示卡片
 */
export const TranscriptionCard = memo<TranscriptionCardProps>(({
  transcript,
  copySuccess,
  onCopy,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50">
        <span className="text-sm font-medium text-gray-700">转录结果</span>
        <button
          onClick={onCopy}
          disabled={!transcript}
          className={`text-sm px-2 py-1 rounded-md transition-colors ${
            copySuccess
              ? 'text-green-600 bg-green-50'
              : transcript
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          {copySuccess ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <div className="p-3 min-h-[60px] max-h-[100px] overflow-y-auto">
        {transcript ? (
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
            {transcript}
          </p>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">等待录音...</p>
        )}
      </div>
    </div>
  )
})

TranscriptionCard.displayName = 'TranscriptionCard'
