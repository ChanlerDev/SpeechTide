/**
 * 完成步骤
 */

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

interface CompleteStepProps {
  onFinish: () => void
}

export function CompleteStep({ onFinish }: CompleteStepProps) {
  const shortcutKey = isMac ? '⌘⇧Space' : 'Ctrl+Shift+Space'
  
  return (
    <div className="p-6 flex flex-col h-full bg-gradient-to-b from-green-50 to-white">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <span className="text-4xl">✓</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">准备就绪！</h1>
        <p className="text-gray-500 mb-8 max-w-xs">
          开始体验本地语音转文字
        </p>
        
        <div className="w-full max-w-xs space-y-3 mb-6">
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-orange-600 font-bold text-sm">1</span>
            </div>
            <div className="text-left flex-1">
              <p className="text-sm text-gray-700">
                按下 <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-600">{shortcutKey}</kbd>
              </p>
              <p className="text-xs text-gray-400">开始录音</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 font-bold text-sm">2</span>
            </div>
            <div className="text-left flex-1">
              <p className="text-sm text-gray-700">说完再按一次</p>
              <p className="text-xs text-gray-400">停止并转写</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 font-bold text-sm">3</span>
            </div>
            <div className="text-left flex-1">
              <p className="text-sm text-gray-700">文字自动插入</p>
              <p className="text-xs text-gray-400">到当前光标位置</p>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-gray-400 max-w-xs">
          点击菜单栏图标可打开设置面板
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onFinish}
          className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:opacity-90 transition-opacity font-medium shadow-sm"
        >
          开始使用
        </button>
      </div>
    </div>
  )
}
