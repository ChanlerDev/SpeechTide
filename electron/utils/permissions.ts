/**
 * 权限检查模块
 * 
 * 检查和请求 macOS 系统权限（麦克风、辅助功能）
 */

import { systemPreferences, shell } from 'electron'

export type MicrophonePermission = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/**
 * 检查麦克风权限
 */
export function checkMicrophonePermission(): MicrophonePermission {
  if (process.platform !== 'darwin') {
    // 非 macOS 平台默认授权
    return 'granted'
  }

  const status = systemPreferences.getMediaAccessStatus('microphone')
  
  switch (status) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    case 'not-determined':
      return 'not-determined'
    case 'restricted':
      return 'restricted'
    default:
      return 'unknown'
  }
}

/**
 * 请求麦克风权限
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true
  }

  try {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    console.log('[Permissions] 麦克风权限请求结果:', granted)
    return granted
  } catch (error) {
    console.error('[Permissions] 请求麦克风权限失败:', error)
    return false
  }
}

/**
 * 检查辅助功能权限
 */
export function checkAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') {
    return true
  }

  // 使用 false 表示不弹出系统提示
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/**
 * 请求辅助功能权限（打开系统设置）
 */
export function requestAccessibilityPermission(): void {
  if (process.platform !== 'darwin') {
    return
  }

  // 使用 true 会弹出系统提示引导用户授权
  const trusted = systemPreferences.isTrustedAccessibilityClient(true)
  
  if (!trusted) {
    // 打开系统偏好设置的辅助功能面板
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
}

/**
 * 打开系统偏好设置的麦克风权限面板
 */
export function openMicrophoneSettings(): void {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
  }
}

/**
 * 打开系统偏好设置的辅助功能权限面板
 */
export function openAccessibilitySettings(): void {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
}
