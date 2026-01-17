/**
 * 文件转录主组件
 * 支持拖放或选择音频文件进行转录
 */

import { useState, useCallback, useEffect } from 'react'
import { DropZone } from './DropZone'
import { TranscriptionProgress } from './TranscriptionProgress'
import { TranscriptionResult } from './TranscriptionResult'

type TranscriptionState = 'idle' | 'selected' | 'transcribing' | 'complete' | 'error'

interface SelectedFileInfo {
  name: string
  path: string
  size: number
}

interface FileTranscriptionState {
  status: TranscriptionState
  selectedFile: SelectedFileInfo | null
  transcriptionResult: string
  outputPath: string
  fileName: string
  progress: number
  error: string | null
}

const DEFAULT_OUTPUT_PATH = '~/Documents/SpeechTide/'

const getDefaultFileName = (originalName: string): string => {
  const baseName = originalName.replace(/\.[^/.]+$/, '')
  return `${baseName}_transcription`
}

export const FileTranscription = () => {
  const [state, setState] = useState<FileTranscriptionState>({
    status: 'idle',
    selectedFile: null,
    transcriptionResult: '',
    outputPath: DEFAULT_OUTPUT_PATH,
    fileName: '',
    progress: 0,
    error: null,
  })

  useEffect(() => {
    const dispose = window.speech.onTranscribeProgress((progress) => {
      setState(prev => ({ ...prev, progress }))
    })
    return dispose
  }, [])

  const handleFileSelect = useCallback((file: File) => {
    const fileWithPath = file as File & { path: string }
    setState(prev => ({
      ...prev,
      status: 'selected',
      selectedFile: {
        name: file.name,
        path: fileWithPath.path,
        size: file.size,
      },
      fileName: getDefaultFileName(file.name),
      error: null,
    }))
  }, [])

  const handleStartTranscription = useCallback(async () => {
    if (!state.selectedFile) return

    setState(prev => ({
      ...prev,
      status: 'transcribing',
      progress: 0,
      error: null,
    }))

    try {
      const result = await window.speech.transcribeFile(state.selectedFile.path)

      if (result.success && result.text) {
        setState(prev => ({
          ...prev,
          status: 'complete',
          transcriptionResult: result.text!,
          progress: 100,
        }))
      } else {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: result.error || '转录失败',
        }))
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : '转录过程中发生错误',
      }))
    }
  }, [state.selectedFile])

  const handleExport = useCallback(async () => {
    try {
      const result = await window.speech.exportTranscription({
        text: state.transcriptionResult,
        outputPath: state.outputPath,
        fileName: state.fileName,
      })
      
      if (result.success) {
        alert(`导出成功！\n文件路径: ${result.fullPath}`)
      } else {
        alert('导出失败: ' + (result.error || '未知错误'))
      }
    } catch (err) {
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'))
    }
  }, [state.outputPath, state.fileName, state.transcriptionResult])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(state.transcriptionResult)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [state.transcriptionResult])

  const handleReset = useCallback(() => {
    setState({
      status: 'idle',
      selectedFile: null,
      transcriptionResult: '',
      outputPath: DEFAULT_OUTPUT_PATH,
      fileName: '',
      progress: 0,
      error: null,
    })
  }, [])

  const handleSelectDirectory = useCallback(async () => {
    try {
      const result = await window.speech.selectDirectory()
      if (result.path && !result.canceled) {
        setState(prev => ({ ...prev, outputPath: result.path + '/' }))
      }
    } catch (err) {
      console.error('选择目录失败:', err)
    }
  }, [])

  const handleOutputPathChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, outputPath: e.target.value }))
  }, [])

  const handleFileNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, fileName: e.target.value }))
  }, [])

  return (
    <div className="space-y-4">
      {/* 状态：空闲 - 显示拖放区 */}
      {state.status === 'idle' && (
        <DropZone
          onFileSelect={handleFileSelect}
          disabled={false}
        />
      )}

      {/* 状态：已选择文件 - 显示文件信息和开始按钮 */}
      {state.status === 'selected' && state.selectedFile && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{state.selectedFile.name}</p>
                <p className="text-xs text-gray-400">
                  {(state.selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={handleReset}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                取消
              </button>
            </div>
          </div>

          {/* 输出配置 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <span className="text-xs font-medium text-gray-600">输出设置</span>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">输出目录</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={state.outputPath}
                    onChange={handleOutputPathChange}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                  />
                  <button
                    onClick={handleSelectDirectory}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors whitespace-nowrap"
                  >
                    选择
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">文件名</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={state.fileName}
                    onChange={handleFileNameChange}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                  />
                  <span className="text-xs text-gray-400">.txt</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleStartTranscription}
            className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
          >
            开始转录
          </button>
        </div>
      )}

      {/* 状态：转录中 - 显示进度 */}
      {state.status === 'transcribing' && state.selectedFile && (
        <TranscriptionProgress
          fileName={state.selectedFile.name}
          progress={state.progress}
        />
      )}

      {/* 状态：完成 - 显示结果 */}
      {state.status === 'complete' && (
        <div className="space-y-4">
          <TranscriptionResult
            text={state.transcriptionResult}
            onExport={handleExport}
            onCopy={handleCopy}
            onReset={handleReset}
          />

          {/* 导出配置 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <span className="text-xs font-medium text-gray-600">导出设置</span>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">输出目录</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={state.outputPath}
                    onChange={handleOutputPathChange}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                  />
                  <button
                    onClick={handleSelectDirectory}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors whitespace-nowrap"
                  >
                    选择
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">文件名</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={state.fileName}
                    onChange={handleFileNameChange}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                  />
                  <span className="text-xs text-gray-400">.txt</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 状态：错误 */}
      {state.status === 'error' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-700">转录失败</p>
                <p className="text-xs text-rose-600 mt-0.5">{state.error}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            重新选择文件
          </button>
        </div>
      )}
    </div>
  )
}
