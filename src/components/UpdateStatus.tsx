/**
 * 更新状态组件
 *
 * 精简的单行组件，显示版本信息和更新状态
 */

import { memo, useState, useEffect, useCallback } from 'react'

/** 更新状态类型（本地定义以避免全局类型问题） */
type UpdateStatusType = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error'

interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

interface UpdateStateLocal {
  status: UpdateStatusType
  currentVersion: string
  availableVersion?: string
  releaseNotes?: string
  progress?: UpdateProgress
  error?: string
}

export const UpdateStatus = memo(() => {
  const [state, setState] = useState<UpdateStateLocal | null>(null)

  // 初始化状态
  useEffect(() => {
    window.update.getState().then(setState)
    const dispose = window.update.onStateChange(setState)
    return dispose
  }, [])

  // 检查更新
  const handleCheck = useCallback(async () => {
    await window.update.check()
  }, [])

  // 下载更新
  const handleDownload = useCallback(async () => {
    await window.update.download()
  }, [])

  // 立即安装
  const handleInstall = useCallback(async () => {
    await window.update.install()
  }, [])

  // 打开 GitHub Releases
  const handleOpenReleasePage = useCallback(async () => {
    await window.update.openReleasePage()
  }, [])

  if (!state) return null

  const { status, currentVersion, availableVersion, progress } = state

  // 格式化下载速度
  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
    if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
    return `${bytesPerSecond} B/s`
  }

  // 检测是否为 beta 版本
  const isBetaVersion = (version?: string) => version?.includes('-beta') || false

  // Beta 标识组件
  const BetaBadge = () => (
    <span className="ml-1 px-1 py-0.5 text-[10px] bg-orange-500 text-white rounded font-medium">
      BETA
    </span>
  )

  return (
    <div className="flex items-center justify-between text-xs text-gray-400 px-1 py-2 border-t border-gray-100">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* 空闲 */}
        {status === 'idle' && (
          <>
            <span className="text-gray-500 flex items-center">
              v{currentVersion}
              {isBetaVersion(currentVersion) && <BetaBadge />}
            </span>
            <button
              onClick={handleCheck}
              className="text-blue-500 hover:text-blue-600"
            >
              检查更新
            </button>
          </>
        )}

        {/* 检查中 */}
        {status === 'checking' && (
          <>
            <span className="text-gray-500 flex items-center">
              v{currentVersion}
              {isBetaVersion(currentVersion) && <BetaBadge />}
            </span>
            <span className="flex items-center gap-1 text-blue-500">
              <span className="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full" />
              检查中...
            </span>
          </>
        )}

        {/* 已是最新 */}
        {status === 'not-available' && (
          <>
            <span className="text-gray-500 flex items-center">
              v{currentVersion}
              {isBetaVersion(currentVersion) && <BetaBadge />}
            </span>
            <span className="text-green-500">✓ 已是最新</span>
            <button
              onClick={handleCheck}
              className="text-gray-400 hover:text-blue-500 text-[10px]"
            >
              再次检查
            </button>
          </>
        )}

        {/* 有可用更新 */}
        {status === 'available' && (
          <>
            <span className="text-gray-500 flex items-center">
              v{currentVersion}
              {isBetaVersion(currentVersion) && <BetaBadge />}
            </span>
            <span className="text-gray-400">→</span>
            <span className="text-green-600 font-medium flex items-center">
              v{availableVersion}
              {isBetaVersion(availableVersion) && <BetaBadge />}
            </span>
            <button
              onClick={handleDownload}
              className="px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              更新
            </button>
          </>
        )}

        {/* 下载中 */}
        {status === 'downloading' && progress && (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-blue-500">下载中 {progress.percent.toFixed(0)}%</span>
            <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden max-w-[80px]">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="text-gray-400">{formatSpeed(progress.bytesPerSecond)}</span>
          </div>
        )}

        {/* 下载完成 */}
        {status === 'downloaded' && (
          <>
            <span className="text-green-600 flex items-center">
              v{availableVersion} 已就绪
              {isBetaVersion(availableVersion) && <BetaBadge />}
            </span>
            <button
              onClick={handleInstall}
              className="px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              重启安装
            </button>
          </>
        )}

        {/* 安装中 */}
        {status === 'installing' && (
          <span className="flex items-center gap-1 text-blue-500">
            <span className="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full" />
            正在安装...
          </span>
        )}

        {/* 错误 */}
        {status === 'error' && (
          <>
            <span className="text-gray-500 flex items-center">
              v{currentVersion}
              {isBetaVersion(currentVersion) && <BetaBadge />}
            </span>
            <span className="text-red-500 truncate max-w-[120px]" title={state.error}>
              更新失败
            </span>
            <button
              onClick={handleCheck}
              className="text-blue-500 hover:text-blue-600"
            >
              重试
            </button>
          </>
        )}
      </div>

      {/* 去官网下载链接 */}
      <button
        onClick={handleOpenReleasePage}
        className="text-gray-400 hover:text-blue-500 ml-2 shrink-0"
      >
        去官网下载
      </button>
    </div>
  )
})

UpdateStatus.displayName = 'UpdateStatus'
