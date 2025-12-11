import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './global.d.ts'

console.log('[Main] React 应用启动')
console.log('[Main] window.speech API 检查:', typeof window.speech)
console.log('[Main] window.onboarding API 检查:', typeof window.onboarding)

// 检查 API 是否可用
const apiMissing = typeof window.speech === 'undefined' || typeof window.onboarding === 'undefined'
if (apiMissing) {
  console.error('[Main] ERROR: API 未找到！', {
    speech: typeof window.speech,
    onboarding: typeof window.onboarding
  })
  const errorDiv = document.createElement('div')
  errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #1a1a2e; color: white; padding: 40px; font-family: system-ui; z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center;'
  errorDiv.innerHTML = `
    <h2 style="color: #ff6b6b; margin-bottom: 16px;">Preload 脚本加载失败</h2>
    <p style="color: #a0a0a0;">window.speech: ${typeof window.speech}</p>
    <p style="color: #a0a0a0;">window.onboarding: ${typeof window.onboarding}</p>
    <p style="margin-top: 20px; color: #666;">请检查开发者工具控制台</p>
  `
  document.body.appendChild(errorDiv)
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('未找到根元素，请确保 HTML 中包含 id="root" 的元素')
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
