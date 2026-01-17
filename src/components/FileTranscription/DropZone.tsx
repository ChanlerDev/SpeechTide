/**
 * 文件拖放区域组件
 * 支持拖放和点击选择 .wav 文件
 */

import { useState, useCallback, useRef } from 'react'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  disabled: boolean
}

export const DropZone = ({ onFileSelect, disabled }: DropZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): boolean => {
    if (!file.name.toLowerCase().endsWith('.wav')) {
      setError('仅支持 .wav 格式文件')
      return false
    }
    setError(null)
    return true
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (validateFile(file)) {
        onFileSelect(file)
      }
    }
  }, [disabled, onFileSelect, validateFile])

  const handleClick = useCallback(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.click()
    }
  }, [disabled])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      if (validateFile(file)) {
        onFileSelect(file)
      }
    }
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [onFileSelect, validateFile])

  return (
    <div className="space-y-2">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          w-full h-40 rounded-xl border-2 border-dashed
          transition-all cursor-pointer
          ${disabled
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-50'
            : isDragOver
              ? 'bg-orange-50 border-orange-400 scale-[1.02]'
              : 'bg-gray-50 border-gray-300 hover:border-orange-300 hover:bg-orange-50/50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-3 text-center px-4">
          <div className={`
            w-12 h-12 rounded-full flex items-center justify-center
            ${isDragOver ? 'bg-orange-100' : 'bg-gray-100'}
          `}>
            <svg
              className={`w-6 h-6 ${isDragOver ? 'text-orange-500' : 'text-gray-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>

          <div>
            <p className={`text-sm font-medium ${isDragOver ? 'text-orange-700' : 'text-gray-600'}`}>
              {isDragOver ? '松开以选择文件' : '拖放音频文件到这里'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              或点击选择文件 · 仅支持 .wav 格式
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg">
          <span className="text-rose-500 text-xs">⚠️</span>
          <span className="text-xs text-rose-700">{error}</span>
        </div>
      )}
    </div>
  )
}
