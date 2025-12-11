/**
 * 模型下载步骤
 */

import { useState, useEffect, useCallback } from 'react'

interface ModelStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

interface DownloadProgress {
  file: string
  downloaded: number
  total: number
  percent: number
  speed: string
}

export function ModelStep({ onNext, onBack, onSkip }: ModelStepProps) {
  const [checking, setChecking] = useState(true)
  const [downloaded, setDownloaded] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkModel = useCallback(async () => {
    setChecking(true)
    try {
      const result = await window.onboarding.checkModel()
      setDownloaded(result.downloaded)
    } catch (err) {
      console.error('检查模型状态失败:', err)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkModel()
    const unsubscribe = window.onboarding.onDownloadProgress((prog) => {
      setProgress(prog)
    })
    return () => unsubscribe()
  }, [checkModel])

  const startDownload = async () => {
    setDownloading(true)
    setError(null)
    setProgress(null)
    try {
      const result = await window.onboarding.downloadModel()
      if (result.success) {
        setDownloaded(true)
      } else {
        setError(result.error || '下载失败')
      }
    } catch (err) {
      setError('下载过程出错')
    } finally {
      setDownloading(false)
    }
  }

  const cancelDownload = async () => {
    await window.onboarding.cancelDownload()
    setDownloading(false)
    setProgress(null)
  }

  const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${bytes} B`
  }

  if (checking) {
    return (
      <div className="p-6 flex flex-col h-full items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-500 text-sm">正在检查模型...</p>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col h-full bg-gradient-to-b from-blue-50 to-white">
      <div className="flex-1">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🤖</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">语音识别模型</h2>
          <p className="text-gray-500 text-sm">下载后可完全离线使用</p>
        </div>

        {/* 模型卡片 */}
        <div className={`rounded-xl p-4 border mb-4 transition-all ${
          downloaded 
            ? 'bg-green-50 border-green-200' 
            : 'bg-white border-gray-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              downloaded ? 'bg-green-100' : 'bg-purple-100'
            }`}>
              {downloaded ? (
                <span className="text-green-600 text-xl">✓</span>
              ) : (
                <span className="text-2xl">🧠</span>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-800">SenseVoice Small</p>
              <p className="text-xs text-gray-500">
                {downloaded ? '已就绪' : '约 230 MB · 支持中英日韩粤'}
              </p>
            </div>
          </div>

          {/* 下载进度 */}
          {downloading && progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{formatSize(progress.downloaded)} / {formatSize(progress.total)}</span>
                <span>{progress.speed}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">{progress.percent}%</p>
            </div>
          )}

          {/* 下载/取消按钮 */}
          {!downloaded && (
            <button
              onClick={downloading ? cancelDownload : startDownload}
              className={`w-full mt-3 py-2.5 rounded-lg font-medium transition-colors ${
                downloading
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90'
              }`}
            >
              {downloading ? '取消下载' : '开始下载'}
            </button>
          )}
        </div>

        {/* 错误信息 */}
        {error && (
          <div className="p-3 bg-red-50 rounded-xl border border-red-100 mb-4">
            <p className="text-sm text-red-600 mb-1">下载失败：{error}</p>
            <button onClick={startDownload} className="text-xs text-red-500 hover:underline">
              点击重试
            </button>
          </div>
        )}

        {/* 说明 */}
        <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
          <p className="text-xs text-purple-700">
            💡 模型由阿里达摩院开源，所有数据均在本地处理
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onBack}
          disabled={downloading}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors disabled:opacity-50"
        >
          ← 返回
        </button>
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            disabled={downloading}
            className="px-4 py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors disabled:opacity-50"
          >
            跳过
          </button>
          <button
            onClick={onNext}
            disabled={!downloaded || downloading}
            className={`px-6 py-2 rounded-xl font-medium transition-colors ${
              downloaded && !downloading
                ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            继续
          </button>
        </div>
      </div>
    </div>
  )
}
