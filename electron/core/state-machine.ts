/**
 * SpeechTide 状态机
 *
 * 管理应用的语音流程状态转换
 */

import type { SpeechFlowStatus, SpeechTideState, TranscriptionMeta } from '../../shared/app-state'
import { STATUS_HINT } from '../config/constants'

export type StateChangeListener = (state: SpeechTideState) => void

/**
 * 状态机类
 * 负责管理应用状态的转换和广播
 */
export class StateMachine {
  private state: SpeechTideState = {
    status: 'idle',
    message: STATUS_HINT.idle,
    updatedAt: Date.now(),
  }

  private listeners: StateChangeListener[] = []

  /**
   * 获取当前状态
   */
  getState(): SpeechTideState {
    return { ...this.state }
  }

  /**
   * 获取当前状态名称
   */
  getStatus(): SpeechFlowStatus {
    return this.state.status
  }

  /**
   * 设置状态
   */
  setState(
    status: SpeechFlowStatus,
    message: string,
    patch?: Partial<SpeechTideState>
  ): void {
    this.state = {
      ...this.state,
      status,
      message,
      updatedAt: Date.now(),
      ...patch,
    }

    // 清除非错误状态下的 error 字段
    if (status !== 'error' && !patch?.error) {
      this.state.error = undefined
    }

    this.notifyListeners()
  }

  /**
   * 快捷设置：进入空闲状态
   */
  setIdle(): void {
    this.setState('idle', STATUS_HINT.idle)
  }

  /**
   * 快捷设置：进入录音状态
   */
  setRecording(meta: TranscriptionMeta): void {
    this.setState('recording', STATUS_HINT.recording, {
      meta,
      transcript: undefined,
    })
  }

  /**
   * 快捷设置：进入转写状态
   */
  setTranscribing(message?: string, meta?: TranscriptionMeta): void {
    this.setState('transcribing', message ?? STATUS_HINT.transcribing, { meta })
  }

  /**
   * 快捷设置：转写完成
   */
  setReady(transcript: string, meta: TranscriptionMeta): void {
    this.setState('ready', STATUS_HINT.ready, { transcript, meta })
  }

  /**
   * 快捷设置：进入错误状态
   */
  setError(message: string, error?: string, meta?: TranscriptionMeta): void {
    this.setState('error', message, { error, meta })
  }

  /**
   * 添加状态变化监听器
   */
  addListener(listener: StateChangeListener): void {
    this.listeners.push(listener)
  }

  /**
   * 移除状态变化监听器
   */
  removeListener(listener: StateChangeListener): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const stateCopy = this.getState()
    this.listeners.forEach(listener => {
      try {
        listener(stateCopy)
      } catch (err) {
        console.error('[StateMachine] 监听器执行出错:', err)
      }
    })
  }
}
