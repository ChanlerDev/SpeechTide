import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clipboard } from 'electron'

const execAsync = promisify(exec)

/**
 * AppleScript 文本注入器
 * 提供可靠的 macOS 文本插入功能，替代 robotjs
 */
export class AppleScriptTextInserter {
  private available: boolean

  constructor() {
    this.available = process.platform === 'darwin'
  }

  /**
   * 检查当前环境是否支持 AppleScript
   */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * 在当前活动应用中插入文本
   * @param text 要插入的文本
   * @param targetApp 目标应用名称（可选）
   * @returns Promise<{ success: boolean; error?: string }>
   */
  async insertText(text: string, targetApp?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.available) {
      return { success: false, error: 'AppleScript 仅在 macOS 上可用' }
    }

    // 保存原有剪贴板内容
    const originalClipboard = clipboard.readText()
    console.log('[AppleScript] 保存原有剪贴板内容:', originalClipboard.substring(0, 30) + (originalClipboard.length > 30 ? '...' : ''))

    try {
      // 优先使用剪贴板+粘贴方案（对中文支持更好）
      const escapedText = this.escapeText(text)
      console.log('[AppleScript] 原始文本:', text)
      console.log('[AppleScript] 转义后文本:', escapedText)

      // 使用剪贴板+Command+V的方式，而不是 keystroke
      let script: string
      if (targetApp) {
        script = `set the clipboard to "${escapedText}"`
        const script2 = `tell application "${targetApp}" to activate`
        const script3 = `tell application "System Events" to keystroke "v" using command down`

        console.log('[AppleScript] 完整脚本:')
        console.log('  1.', script)
        console.log('  2.', script2)
        console.log('  3.', script3)

        const result1 = await this.executeScript(script)
        console.log('[AppleScript] 执行结果 1:', result1)
        await new Promise(resolve => setTimeout(resolve, 100)) // 等待 100ms 确保剪贴板更新

        if (!result1.success && result1.error) {
          this.restoreClipboard(originalClipboard)
          return { success: false, error: result1.error }
        }

        const result2 = await this.executeScript(script2)
        console.log('[AppleScript] 执行结果 2:', result2)
        await new Promise(resolve => setTimeout(resolve, 100)) // 等待 100ms 确保激活完成

        if (!result2.success && result2.error) {
          this.restoreClipboard(originalClipboard)
          return { success: false, error: result2.error }
        }

        const result3 = await this.executeScript(script3)
        console.log('[AppleScript] 执行结果 3:', result3)
        await new Promise(resolve => setTimeout(resolve, 100)) // 等待 100ms 确保粘贴完成

        if (!result3.success && result3.error) {
          this.restoreClipboard(originalClipboard)
          return { success: false, error: result3.error }
        }

        // 粘贴成功后恢复原有剪贴板内容
        this.restoreClipboard(originalClipboard)
        return { success: true }
      } else {
        script = `set the clipboard to "${escapedText}"`
        const script2 = `tell application "System Events" to keystroke "v" using command down`

        console.log('[AppleScript] 完整脚本:')
        console.log('  1.', script)
        console.log('  2.', script2)

        const result1 = await this.executeScript(script)
        console.log('[AppleScript] 执行结果 1:', result1)
        await new Promise(resolve => setTimeout(resolve, 100)) // 等待 100ms 确保剪贴板更新

        if (!result1.success && result1.error) {
          this.restoreClipboard(originalClipboard)
          return { success: false, error: result1.error }
        }

        const result2 = await this.executeScript(script2)
        console.log('[AppleScript] 执行结果 2:', result2)
        await new Promise(resolve => setTimeout(resolve, 100)) // 等待 100ms 确保粘贴完成

        if (!result2.success && result2.error) {
          this.restoreClipboard(originalClipboard)
          return { success: false, error: result2.error }
        }

        // 粘贴成功后恢复原有剪贴板内容
        this.restoreClipboard(originalClipboard)
        return { success: true }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[AppleScript] 执行失败:', errorMessage)
      // 出错时也要恢复剪贴板
      this.restoreClipboard(originalClipboard)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 恢复剪贴板内容
   */
  private restoreClipboard(content: string) {
    clipboard.writeText(content)
    console.log('[AppleScript] 已恢复剪贴板内容')
  }

  /**
   * 执行复杂的 AppleScript 操作
   * @param script AppleScript 代码
   * @returns Promise<{ success: boolean; output?: string; error?: string }>
   */
  async executeScript(script: string): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!this.available) {
      return { success: false, error: 'AppleScript 仅在 macOS 上可用' }
    }

    try {
      // 使用临时文件方式执行 AppleScript，避免命令行注入问题
      const fsPromises = fs.promises

      // 创建临时文件（使用时间戳+随机数确保唯一性）
      const tempFile = path.join(os.tmpdir(), `ax-insert-${Date.now()}-${Math.random().toString(36).slice(2)}.applescript`)
      await fsPromises.writeFile(tempFile, script, { encoding: 'utf8', mode: 0o644 })

      console.log('[AppleScript] 临时文件:', tempFile)
      console.log('[AppleScript] 脚本内容:', script)

      try {
        // 使用 cat 方式执行，避免命令注入
        const command = `cat '${tempFile}' | osascript`
        const { stdout, stderr } = await execAsync(command, { timeout: 5000 })

        console.log('[AppleScript] stdout:', stdout)
        console.log('[AppleScript] stderr:', stderr)

        return {
          success: true,
          output: stdout.trim(),
          error: stderr.trim() || undefined
        }
      } finally {
        // 清理临时文件
        try {
          await fsPromises.unlink(tempFile)
          console.log('[AppleScript] 已清理临时文件')
        } catch (e) {
          console.warn('[AppleScript] 清理临时文件失败:', e instanceof Error ? e.message : String(e))
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[AppleScript] 执行脚本时出错:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 检查是否具有必要的权限
   * @returns Promise<{ hasAccessibility: boolean; details?: string }>
   */
  async checkPermissions(): Promise<{ hasAccessibility: boolean; details?: string }> {
    if (!this.available) {
      return { hasAccessibility: false, details: '非 macOS 系统' }
    }

    try {
      // 尝试执行一个简单的 AppleScript
      const result = await this.executeScript('tell application "System Events" to return "ok"')

      if (result.success) {
        return { hasAccessibility: true }
      } else {
        return {
          hasAccessibility: false,
          details: result.error || '未知权限问题'
        }
      }
    } catch (error) {
      return {
        hasAccessibility: false,
        details: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 获取权限请求指南
   */
  getPermissionGuide(): string {
    return `
权限设置指南：

1. 打开"系统偏好设置" > "安全性与隐私" > "隐私"

2. 在左侧列表中选择"辅助功能"，点击锁图标解锁（需要管理员权限）

3. 点击"+"按钮，添加以下应用之一：
   - 终端 (Terminal.app)
   - 您的应用 (SpeechTide)

4. 如果仍有问题，在"自动化"部分同样添加对应应用

5. 重启应用后重试
`
  }

  /**
   * 处理特殊字符转义
   * @private
   */
  private escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')  // 反斜杠
      .replace(/"/g, '\\"')    // 双引号
      .replace(/\n/g, '\\n')   // 换行 - 在 AppleScript 中需要转义
      .replace(/\r/g, '\\r')   // 回车 - 在 AppleScript 中需要转义
      .replace(/\t/g, '\\t')   // 制表符 - 在 AppleScript 中需要转义
      // 注意：不要在这里添加其他转义，保持文本原样
  }
}
