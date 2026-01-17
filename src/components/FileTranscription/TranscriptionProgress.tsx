/**
 * 转录进度显示组件
 */

interface TranscriptionProgressProps {
  fileName: string
  progress: number
}

export const TranscriptionProgress = ({ fileName, progress }: TranscriptionProgressProps) => {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-orange-500 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">{fileName}</p>
          <p className="text-xs text-orange-600">正在转录...</p>
        </div>
        <span className="text-sm font-medium text-orange-600">{Math.round(progress)}%</span>
      </div>

      <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-300/50 to-transparent rounded-full animate-pulse"
          style={{ width: `${Math.min(progress + 10, 100)}%` }}
        />
      </div>
    </div>
  )
}
