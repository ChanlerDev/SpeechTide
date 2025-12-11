/**
 * Onboarding 状态管理
 * 
 * 管理首次启动引导流程的状态
 */

import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath, ensureDir } from '../config/paths'

/** Onboarding 步骤 */
export type OnboardingStep = 
  | 'welcome'
  | 'permissions'
  | 'model'
  | 'shortcut'
  | 'complete'

/** Onboarding 状态 */
export interface OnboardingState {
  currentStep: OnboardingStep
  completed: boolean
  steps: {
    welcome: boolean
    permissions: boolean
    model: boolean
    shortcut: boolean
  }
  /** 权限状态 */
  permissions: {
    microphone: 'unknown' | 'granted' | 'denied' | 'not-determined'
    accessibility: boolean
  }
  /** 模型状态 */
  model: {
    downloaded: boolean
    downloading: boolean
    progress: number
    error?: string
  }
}

const ONBOARDING_FILE = '.onboarding.json'

/** 默认 Onboarding 状态 */
function getDefaultState(): OnboardingState {
  return {
    currentStep: 'welcome',
    completed: false,
    steps: {
      welcome: false,
      permissions: false,
      model: false,
      shortcut: false,
    },
    permissions: {
      microphone: 'unknown',
      accessibility: false,
    },
    model: {
      downloaded: false,
      downloading: false,
      progress: 0,
    },
  }
}

/**
 * 获取 Onboarding 状态文件路径
 */
function getOnboardingFilePath(): string {
  return path.join(getUserDataPath(), ONBOARDING_FILE)
}

/**
 * 加载 Onboarding 状态
 */
export function loadOnboardingState(): OnboardingState {
  const filePath = getOnboardingFilePath()
  
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const saved = JSON.parse(raw)
      return { ...getDefaultState(), ...saved }
    }
  } catch (error) {
    console.warn('[Onboarding] 加载状态失败，使用默认值:', error)
  }
  
  return getDefaultState()
}

/**
 * 保存 Onboarding 状态
 */
export function saveOnboardingState(state: Partial<OnboardingState>): OnboardingState {
  const current = loadOnboardingState()
  const updated = { ...current, ...state }
  
  try {
    ensureDir(getUserDataPath())
    const filePath = getOnboardingFilePath()
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
  } catch (error) {
    console.error('[Onboarding] 保存状态失败:', error)
  }
  
  return updated
}

/**
 * 更新步骤完成状态
 */
export function completeStep(step: keyof OnboardingState['steps']): OnboardingState {
  const state = loadOnboardingState()
  state.steps[step] = true
  
  // 确定下一步
  const stepOrder: OnboardingStep[] = ['welcome', 'permissions', 'model', 'shortcut', 'complete']
  const currentIndex = stepOrder.indexOf(step)
  if (currentIndex < stepOrder.length - 1) {
    state.currentStep = stepOrder[currentIndex + 1]
  }
  
  // 检查是否全部完成
  const allCompleted = Object.values(state.steps).every(v => v)
  if (allCompleted) {
    state.completed = true
    state.currentStep = 'complete'
  }
  
  return saveOnboardingState(state)
}

/**
 * 跳过 Onboarding（用于开发或用户选择跳过）
 */
export function skipOnboarding(): OnboardingState {
  return saveOnboardingState({
    completed: true,
    currentStep: 'complete',
    steps: {
      welcome: true,
      permissions: true,
      model: true,
      shortcut: true,
    },
  })
}

/**
 * 重置 Onboarding 状态（用于调试）
 */
export function resetOnboarding(): OnboardingState {
  const filePath = getOnboardingFilePath()
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return getDefaultState()
}

/**
 * 检查是否需要显示 Onboarding
 */
export function shouldShowOnboarding(): boolean {
  const state = loadOnboardingState()
  return !state.completed
}

/**
 * 更新麦克风权限状态
 */
export function updateMicrophoneStatus(
  status: OnboardingState['permissions']['microphone']
): OnboardingState {
  const state = loadOnboardingState()
  state.permissions.microphone = status
  return saveOnboardingState(state)
}

/**
 * 更新辅助功能权限状态
 */
export function updateAccessibilityStatus(status: boolean): OnboardingState {
  const state = loadOnboardingState()
  state.permissions.accessibility = status
  return saveOnboardingState(state)
}

/**
 * 更新模型下载状态
 */
export function updateModelStatus(status: Partial<OnboardingState['model']>): OnboardingState {
  const state = loadOnboardingState()
  state.model = { ...state.model, ...status }
  return saveOnboardingState(state)
}
