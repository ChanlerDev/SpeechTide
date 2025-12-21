/**
 * Copyright (c) 2025 SpeechTide Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

interface TestResult {
  text: string
  duration: number
  processingTime: number
  modelId: string
  language?: string
}

interface TestTranscriptionProps {
  testRunning: boolean
  testResult: TestResult | null
  isPlaying: boolean
  testCopySuccess: boolean
  stateStatus: string
  onPlayTestAudio: () => Promise<void>
  onRunTest: () => Promise<void>
  onCopyTestResult: () => void
}

/**
 * 测试转录功能组件
 */
export const TestTranscription = ({
  testRunning,
  testResult,
  isPlaying,
  testCopySuccess,
  stateStatus,
  onPlayTestAudio,
  onRunTest,
  onCopyTestResult,
}: TestTranscriptionProps) => {
  const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`
  const isDisabled = testRunning || stateStatus === 'recording' || stateStatus === 'transcribing'

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">测试转录</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPlayTestAudio}
            disabled={isPlaying}
            className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {isPlaying ? '播放中...' : '▶ 试听'}
          </button>
          <button
            onClick={onRunTest}
            disabled={isDisabled}
            className="text-xs px-2 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {testRunning ? '转录中...' : '开始测试'}
          </button>
        </div>
      </div>

      {testResult ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                {formatDuration(testResult.processingTime)}
              </span>
              <span className="text-xs text-gray-400">{testResult.modelId}</span>
            </div>
            <button
              onClick={onCopyTestResult}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                testCopySuccess ? 'text-green-600' : 'text-blue-600 hover:bg-blue-50'
              }`}
            >
              {testCopySuccess ? '✓' : '复制'}
            </button>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 max-h-[80px] overflow-y-auto">
            <p className="text-xs text-gray-600 leading-relaxed">
              {testResult.text || '无结果'}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-400">点击测试验证模型</p>
        </div>
      )}
    </div>
  )
}
