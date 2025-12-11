/**
 * 原生录音 Hook
 * 
 * 使用 Web Audio API 在渲染进程录音，通过 IPC 传输到主进程
 */

import { useEffect, useRef } from 'react'

export function useNativeRecorder() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    // 监听开始录音信号
    const unsubStart = window.nativeRecorder.onStart(async (config) => {
      console.log('[NativeRecorder] 开始录音', config)
      
      try {
        // 获取麦克风权限
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: config.sampleRate,
            channelCount: config.channels,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        
        streamRef.current = stream

        // 创建 AudioContext
        const audioContext = new AudioContext({ sampleRate: config.sampleRate })
        audioContextRef.current = audioContext

        // 创建音频源
        const source = audioContext.createMediaStreamSource(stream)

        // 使用 ScriptProcessorNode 获取原始 PCM 数据
        // 注意：ScriptProcessorNode 已弃用，但 AudioWorklet 需要额外的文件
        const processor = audioContext.createScriptProcessor(4096, config.channels, config.channels)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0)
          
          // 将 Float32 转换为 Int16
          const int16Data = float32ToInt16(inputData)
          
          // 发送到主进程（实时发送，不再本地保存）
          const buffer = int16Data.buffer as ArrayBuffer
          window.nativeRecorder.sendChunk(buffer)
        }

        // 连接节点
        source.connect(processor)
        processor.connect(audioContext.destination)

        console.log('[NativeRecorder] 录音已开始')
      } catch (error) {
        console.error('[NativeRecorder] 开始录音失败:', error)
      }
    })

    // 监听停止录音信号
    const unsubStop = window.nativeRecorder.onStop(() => {
      console.log('[NativeRecorder] 停止录音')
      
      // 停止处理器
      if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
      }

      // 关闭 AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }

      // 停止媒体流
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      // 发送完成信号（不传数据，因为数据已经实时发送了）
      window.nativeRecorder.sendComplete()

      console.log('[NativeRecorder] 录音已停止')
    })

    return () => {
      unsubStart()
      unsubStop()
      
      // 清理
      if (processorRef.current) {
        processorRef.current.disconnect()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])
}

/**
 * 将 Float32Array 转换为 Int16Array
 */
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16Array
}

