declare module 'sherpa-onnx-node' {
  /** 音频波形数据 */
  interface SherpaWave {
    sampleRate: number
    samples: Float32Array
  }

  /** 转录结果 */
  interface SherpaResult {
    text: string
    language?: string
    tokens?: string[]
    timestamps?: number[]
  }

  /** 音频流对象 */
  interface SherpaStream {
    acceptWaveform(wave: SherpaWave): void
    free(): void
    release?(): void
    delete?(): void
  }

  /** SenseVoice 模型配置 */
  interface SenseVoiceConfig {
    model: string
    language?: string
    useInverseTextNormalization?: 0 | 1
  }

  /** 特征配置 */
  interface FeatConfig {
    sampleRate: number
    featureDim: number
  }

  /** 模型配置 */
  interface ModelConfig {
    senseVoice: SenseVoiceConfig
    tokens: string
    numThreads?: number
    provider?: 'cpu' | 'cuda' | 'coreml'
    debug?: 0 | 1
  }

  /** 离线识别器配置 */
  interface OfflineRecognizerConfig {
    featConfig: FeatConfig
    modelConfig: ModelConfig
  }

  /** 离线识别器类 */
  class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig)
    createStream(): SherpaStream
    decode(stream: SherpaStream): void
    getResult(stream: SherpaStream): SherpaResult
    free(): void
  }

  export { OfflineRecognizer, SherpaWave, SherpaResult, SherpaStream, OfflineRecognizerConfig }
  export function readWave(path: string): SherpaWave
}
