/**
 * 权限请求步骤
 */

import { useState, useEffect, useCallback } from 'react'

interface PermissionsStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function PermissionsStep({ onNext, onBack, onSkip }: PermissionsStepProps) {
  const [checking, setChecking] = useState(true)
  const [microphone, setMicrophone] = useState<string>('unknown')
  const [accessibility, setAccessibility] = useState<boolean>(false)
  const [requesting, setRequesting] = useState<string | null>(null)

  const checkPermissions = useCallback(async () => {
    setChecking(true)
    try {
      const result = await window.onboarding.checkPermissions()
      setMicrophone(result.microphone)
      setAccessibility(result.accessibility)
    } catch (error) {
      console.error('检查权限失败:', error)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkPermissions()
    const interval = setInterval(checkPermissions, 2000)
    return () => clearInterval(interval)
  }, [checkPermissions])

  const requestMicrophone = async () => {
    setRequesting('microphone')
    try {
      const result = await window.onboarding.requestMicrophonePermission()
      setMicrophone(result.status)
    } catch (error) {
      console.error('请求麦克风权限失败:', error)
    } finally {
      setRequesting(null)
    }
  }

  const requestAccessibility = async () => {
    setRequesting('accessibility')
    try {
      await window.onboarding.requestAccessibilityPermission()
    } catch (error) {
      console.error('请求辅助功能权限失败:', error)
    } finally {
      setRequesting(null)
    }
  }

  const isMicrophoneGranted = microphone === 'granted'
  const canProceed = isMicrophoneGranted

  if (checking) {
    return (
      <div className="p-6 flex flex-col h-full items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-500 text-sm">正在检查权限...</p>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col h-full bg-gradient-to-b from-blue-50 to-white">
      <div className="flex-1">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🔐</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">系统权限</h2>
          <p className="text-gray-500 text-sm">授权后才能正常使用语音功能</p>
        </div>

        <div className="space-y-3">
          {/* 麦克风权限 */}
          <div className={`rounded-xl p-4 border transition-all ${
            isMicrophoneGranted 
              ? 'bg-green-50 border-green-200' 
              : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isMicrophoneGranted ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {isMicrophoneGranted ? (
                    <span className="text-green-600 text-lg">✓</span>
                  ) : (
                    <span className="text-lg">🎤</span>
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-800">麦克风</p>
                  <p className="text-xs text-gray-500">
                    {isMicrophoneGranted ? '已授权' : '必需 · 用于录制语音'}
                  </p>
                </div>
              </div>
              {!isMicrophoneGranted && (
                <button
                  onClick={microphone === 'denied' ? () => window.onboarding.openMicrophoneSettings() : requestMicrophone}
                  disabled={requesting === 'microphone'}
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {requesting === 'microphone' ? '...' : microphone === 'denied' ? '设置' : '授权'}
                </button>
              )}
            </div>
          </div>

          {/* 辅助功能权限 */}
          <div className={`rounded-xl p-4 border transition-all ${
            accessibility 
              ? 'bg-green-50 border-green-200' 
              : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  accessibility ? 'bg-green-100' : 'bg-amber-100'
                }`}>
                  {accessibility ? (
                    <span className="text-green-600 text-lg">✓</span>
                  ) : (
                    <span className="text-lg">⌨️</span>
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-800">辅助功能</p>
                  <p className="text-xs text-gray-500">
                    {accessibility ? '已授权' : '可选 · 自动插入文字'}
                  </p>
                </div>
              </div>
              {!accessibility && (
                <button
                  onClick={requestAccessibility}
                  disabled={requesting === 'accessibility'}
                  className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {requesting === 'accessibility' ? '...' : '授权'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 提示信息 */}
        {!accessibility && (
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs text-amber-700">
              💡 不授权辅助功能也可使用，但转写文本需手动粘贴
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
        >
          ← 返回
        </button>
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors"
          >
            跳过
          </button>
          <button
            onClick={onNext}
            disabled={!canProceed}
            className={`px-6 py-2 rounded-xl font-medium transition-colors ${
              canProceed 
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
