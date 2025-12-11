/**
 * SpeechTide 主入口
 *
 * @description 应用启动入口，负责初始化 AppController 和处理应用生命周期事件
 * @author SpeechTide Team
 * @version 2.0.0
 */

import { app, globalShortcut } from 'electron'
import { AppController } from './core/app-controller'

export const isMac = process.platform === 'darwin'

// 创建控制器实例
const controller = new AppController()

// 应用生命周期事件
app.on('window-all-closed', () => {
  if (!isMac) {
    controller.destroy()
    app.quit()
  }
})

app.on('activate', () => {
  console.log('[SpeechTide] 检测到 activate 事件')
  controller.focusWindow(true)
})

app.on('before-quit', () => {
  console.log('[SpeechTide] 应用准备退出...')
  controller.prepareQuit()
})

app.on('will-quit', () => {
  console.log('[SpeechTide] 应用即将退出，清理资源...')
  if (app.isReady()) {
    globalShortcut.unregisterAll()
  }
  controller.destroy()
  console.log('[SpeechTide] ✓ 资源清理完成')
})

// 启动应用
controller.init()
