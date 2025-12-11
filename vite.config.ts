import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { execSync } from 'child_process'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          // 使用独立脚本构建 CommonJS 格式的主进程和 preload
          execSync('node scripts/build-main.cjs', { stdio: 'inherit' })
          options.startup()
        },
        vite: {
          build: {
            // 禁用 vite-plugin-electron 的构建，使用我们自己的脚本
            watch: null,
          },
        },
      },
    ]),
    renderer(),
  ],
  optimizeDeps: {
    exclude: [],
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
})

