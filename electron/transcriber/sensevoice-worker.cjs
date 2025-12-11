#!/usr/bin/env node
// 确保DYLD_LIBRARY_PATH设置正确
const path = require('path');
const fs = require('fs');
const expectedPath = path.join(__dirname, '../../..', 'node_modules/sherpa-onnx-darwin-arm64');
if (!process.env.DYLD_LIBRARY_PATH || !process.env.DYLD_LIBRARY_PATH.includes(expectedPath)) {
  process.env.DYLD_LIBRARY_PATH = expectedPath + ':' + (process.env.DYLD_LIBRARY_PATH || '');
}

const sherpa = require('sherpa-onnx-node')

// 全局错误处理器，防止 worker 意外退出
process.on('uncaughtException', (error) => {
  console.error('[Worker] 未捕获的异常:', error.message)
  process.send?.({
    type: 'transcribe-error',
    error: `未捕获异常: ${error.message}`,
  })
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] 未处理的 Promise 拒绝:', reason)
  process.send?.({
    type: 'transcribe-error',
    error: `未处理的Promise拒绝: ${reason}`,
  })
})

let recognizer = null
let language = ''
let activeStreams = new Set()

function handleInit(payload) {
  try {
    // 明确指定语言，避免 auto 检测错误
    // 支持的语言: zh(中文), en(英文), yue(粤语), ja(日语), ko(韩语)
    const lang = payload.language || 'zh'
    language = lang
    console.log('[Worker] 初始化识别器，语言设置为:', language)

    // 检查音频文件是否存在并验证模型
    if (!fs.existsSync(payload.modelPath)) {
      throw new Error(`模型文件不存在: ${payload.modelPath}`)
    }
    if (!fs.existsSync(payload.tokensPath)) {
      throw new Error(`tokens 文件不存在: ${payload.tokensPath}`)
    }

    // Sherpa-ONNX 配置
    // ⚠ 警告：SenseVoice-ONNX 可能将 language 参数视为自动检测输出而非输入
    const senseVoiceConfig = {
      model: payload.modelPath,
      useInverseTextNormalization: payload.useITN ? 1 : 0,
    }

    // 尝试添加 language 参数（可能无效）
    if (payload.language && payload.language !== 'auto') {
      senseVoiceConfig.language = payload.language
    }

    const config = {
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        senseVoice: senseVoiceConfig,
        tokens: payload.tokensPath,
        numThreads: 2,
        provider: 'cpu',
        debug: 1,
      },
    }

    console.log('[Worker] 创建识别器，配置:', JSON.stringify({
      language: senseVoiceConfig.language || 'auto',
      modelPath: path.basename(payload.modelPath),
      tokensPath: path.basename(payload.tokensPath),
      useITN: senseVoiceConfig.useInverseTextNormalization,
    }, null, 2))
    console.log('[Worker] ⚠ 注意：ONNX 版本可能忽略 language 参数，lang 是检测结果而非输入')

    recognizer = new sherpa.OfflineRecognizer(config)
    console.log('[Worker] 识别器初始化成功')
    process.send?.({ type: 'ready' })
  } catch (error) {
    console.error('[Worker] 识别器初始化失败:', error.message)
    process.send?.({
      type: 'init-error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function handleTranscribe(message) {
  if (!recognizer) {
    process.send?.({
      type: 'transcribe-error',
      id: message.id,
      error: '识别器尚未初始化',
    })
    return
  }

  let stream = null
  try {
    // 检查音频文件是否存在
    if (!fs.existsSync(message.audioPath)) {
      throw new Error(`音频文件不存在: ${message.audioPath}`)
    }

    stream = recognizer.createStream()
    activeStreams.add(stream)

    // 手动解析 WAV 文件
    let waveData
    try {
      const audioBuffer = fs.readFileSync(message.audioPath)

      // 解析 WAV 头部 (44 bytes)
      if (audioBuffer.length < 44) {
        throw new Error('WAV文件太小')
      }

      // 检查 RIFF 头
      const riff = audioBuffer.readUInt32LE(0)
      if (riff !== 0x46464952) {
        throw new Error('不是有效的 RIFF 文件')
      }

      // 检查 WAVE 标识
      const wave = audioBuffer.readUInt32LE(8)
      if (wave !== 0x45564157) {
        throw new Error('不是有效的 WAVE 文件')
      }

      // 查找 fmt chunk
      let offset = 12
      let sampleRate = 0
      let bitsPerSample = 0
      let numChannels = 0
      let dataOffset = 0
      let dataSize = 0

      while (offset < audioBuffer.length) {
        const chunkId = audioBuffer.readUInt32LE(offset)
        const chunkSize = audioBuffer.readUInt32LE(offset + 4)

        if (chunkId === 0x20746d66) { // 'fmt '
          numChannels = audioBuffer.readUInt16LE(offset + 10)  // 偏移量10-11: 通道数
          sampleRate = audioBuffer.readUInt32LE(offset + 12)  // 偏移量12-15: 采样率
          bitsPerSample = audioBuffer.readUInt16LE(offset + 22) // 偏移量22-23: 位深度
        } else if (chunkId === 0x61746164) { // 'data'
          dataOffset = offset + 8
          dataSize = chunkSize
          break
        }

        offset += 8 + chunkSize + (chunkSize % 2)
      }

      if (!sampleRate || !dataOffset) {
        throw new Error('WAV文件格式错误')
      }

      // 提取音频数据
      const totalSamples = dataSize / (bitsPerSample / 8)
      const samplesPerChannel = totalSamples / numChannels
      const samples = new Float32Array(samplesPerChannel)

      for (let i = 0; i < samplesPerChannel; i++) {
        let sample = 0
        // 混合多通道为单声道
        for (let ch = 0; ch < numChannels; ch++) {
          if (bitsPerSample === 16) {
            const int16 = audioBuffer.readInt16LE(dataOffset + (i * numChannels + ch) * 2)
            sample += int16 / 0x8000 // 转换为[-1, 1]范围
          } else if (bitsPerSample === 8) {
            const uint8 = audioBuffer.readUInt8(dataOffset + i * numChannels + ch)
            sample += (uint8 - 128) / 128 // 转换为[-1, 1]范围
          } else {
            throw new Error(`不支持的位深度: ${bitsPerSample}`)
          }
        }
        samples[i] = sample / numChannels // 平均值
      }

      waveData = { sampleRate, samples }
    } catch (readError) {
      throw new Error(`读取音频文件失败: ${readError instanceof Error ? readError.message : String(readError)}`)
    }

    // 检查wave数据有效性
    if (!waveData || !waveData.samples || waveData.samples.length === 0) {
      throw new Error('音频数据为空或无效')
    }

    // 音频质量检测：检查音量是否过小
    const samples = waveData.samples
    const sum = samples.reduce((acc, val) => acc + Math.abs(val), 0)
    const avgAmplitude = sum / samples.length
    console.log('[Worker] 音频平均振幅:', avgAmplitude.toFixed(6))

    if (avgAmplitude < 0.001) {
      console.warn('[Worker] 警告：音频音量过小，可能导致转录为空')
    }

    // 将波形数据传递给 stream
    console.log('[Worker] 输入音频信息:', {
      sampleRate: waveData.sampleRate,
      samplesCount: samples.length,
      durationSec: samples.length / waveData.sampleRate,
    })

    stream.acceptWaveform({ sampleRate: waveData.sampleRate, samples: waveData.samples })
    console.log('[Worker] 开始解码...')
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    console.log('[Worker] 获取结果对象:', result)

    // 检查原始文本结果
    if (result.text || result.tokens || result.timestamps) {
      console.log('[Worker] 原始转录结果:')
      if (result.text) console.log('  text:', result.text)
      if (result.tokens) console.log('  tokens:', result.tokens)
      if (result.timestamps) console.log('  timestamps:', result.timestamps)
    } else {
      console.warn('[Worker] 警告：没有任何转录结果（text/tokens/timestamps 都为空）')
      console.warn('[Worker] 可能原因:')
      console.warn('  1. 音频质量不佳（音量<0.001）')
      console.warn('  2. ONNX版本的语言检测错误（检测到<|en|>但说中文）')
      console.warn('  3. ONNX版本不支持强制指定语言')
      console.warn('  4. 模型导出时未正确包含语言识别功能')
    }
    const durationMs = Math.round((waveData.samples.length / waveData.sampleRate) * 1000)

    console.log('[Worker] 转录成功！结果:', {
      id: message.id,
      text: result.text ?? '',
      textLength: result.text ? result.text.length : 0,
      durationMs,
      language: result.language ?? language,
      timestamp: new Date().toLocaleString(),
    })
    // 也输出原始文本，方便调试
    if (result.text) {
      console.log('[Worker] 转录文本内容:', result.text)
    } else {
      console.log('[Worker] 警告：转录结果为空')
    }
    process.send?.({
      type: 'transcribe-success',
      id: message.id,
      text: result.text ?? '',
      durationMs,
      language: result.language ?? language,
    })
  } catch (error) {
    console.error('[Worker] 转录失败:', error)
    process.send?.({
      type: 'transcribe-error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    // 安全地释放 stream
    if (stream && activeStreams.has(stream)) {
      const streamRef = stream  // 保存引用，避免后续设为 null 导致删除失败
      activeStreams.delete(streamRef)
      try {
        console.log('[Worker] 开始释放 stream 对象')
        if (typeof streamRef === 'object' && streamRef !== null) {
          if (typeof streamRef.free === 'function') {
            console.log('[Worker] 调用 stream.free()')
            streamRef.free()
          } else if (typeof streamRef.release === 'function') {
            console.log('[Worker] 调用 stream.release()')
            streamRef.release()
          } else if (typeof streamRef.delete === 'function') {
            console.log('[Worker] 调用 stream.delete()')
            streamRef.delete()
          } else {
            console.log('[Worker] stream 对象无释放方法，依赖 GC 回收')
          }
        }
        console.log('[Worker] Stream 释放完成')
      } catch (releaseError) {
        console.error('[Worker] 释放 stream 时出错:', releaseError)
      }
    }
  }
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'init') {
    handleInit(message.payload)
    return
  }
  if (message.type === 'transcribe') {
    handleTranscribe(message)
  }
})

// 进程退出时清理所有资源
process.on('exit', (code) => {
  console.log(`[Worker] 进程即将退出，退出码: ${code}`)
  // 清理所有活动的 stream
  console.log(`[Worker] 清理 ${activeStreams.size} 个活动的 stream`)
  for (const stream of activeStreams) {
    try {
      if (typeof stream.release === 'function') {
        stream.release()
      } else if (typeof stream.destroy === 'function') {
        stream.destroy()
      } else if (typeof stream.delete === 'function') {
        stream.delete()
      }
    } catch (error) {
      console.error('[Worker] 释放 stream 时出错:', error)
    }
  }
  activeStreams.clear()
  console.log('[Worker] 资源清理完成')
})
