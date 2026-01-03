/**
 * 依赖检测服务
 * 
 * 检测系统依赖是否已安装
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface DependencyStatus {
  name: string
  installed: boolean
  version?: string
  path?: string
}

/**
 * 检测 Homebrew 是否已安装（仅 macOS）
 */
export async function checkHomebrew(): Promise<{ installed: boolean; version?: string }> {
  if (process.platform !== 'darwin') {
    return { installed: false }
  }

  try {
    const { stdout } = await execAsync('brew --version', { timeout: 5000 })
    const versionMatch = stdout.match(/Homebrew (\d+\.\d+\.\d+)/)
    return {
      installed: true,
      version: versionMatch ? versionMatch[1] : 'unknown',
    }
  } catch {
    return { installed: false }
  }
}

/**
 * 检测所有依赖（当前无外部依赖）
 */
export async function checkAllDependencies(): Promise<{
  allInstalled: boolean
}> {
  return {
    allInstalled: true,
  }
}

/**
 * 检测 SoX 是否已安装（已弃用，始终返回已安装）
 * @deprecated 项目已不再依赖 SoX
 */
export async function checkSox(): Promise<{ installed: boolean; version?: string }> {
  // 项目已不再需要 SoX，始终返回已安装
  return { installed: true, version: 'not-required' }
}

/**
 * 使用 Homebrew 安装 SoX（已弃用，无操作）
 * @deprecated 项目已不再依赖 SoX
 */
export async function installSoxWithHomebrew(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onProgress?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  // 项目已不再需要 SoX
  return { success: true }
}

/**
 * 获取终端安装命令（已弃用）
 * @deprecated 项目已不再依赖 SoX
 */
export function getTerminalInstallCommand(): string {
  return '# No external dependencies required'
}
