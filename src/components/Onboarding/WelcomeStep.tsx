/**
 * 欢迎步骤
 */

interface WelcomeStepProps {
  onNext: () => void
  onSkip: () => void
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="p-6 flex flex-col h-full bg-gradient-to-b from-blue-50 to-white">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <span className="text-4xl">🎙️</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">欢迎使用 SpeechTide</h1>
        <p className="text-gray-500 mb-8 max-w-xs">
          本地语音转文字，快速、私密、无需联网
        </p>
        
        <div className="w-full max-w-xs space-y-3 mb-8">
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg">🎤</div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-700">授权麦克风</p>
              <p className="text-xs text-gray-400">录制您的语音</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-lg">🤖</div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-700">下载识别模型</p>
              <p className="text-xs text-gray-400">约 230 MB，仅需一次</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-lg">🔒</div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-700">完全本地处理</p>
              <p className="text-xs text-gray-400">数据不会上传云端</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onNext}
          className="w-full py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium shadow-sm"
        >
          开始设置
        </button>
        <button
          onClick={onSkip}
          className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          跳过，稍后设置
        </button>
      </div>
    </div>
  )
}
