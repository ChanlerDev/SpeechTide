#!/usr/bin/env node
// 构建脚本：将 electron/main.ts 和 electron/preload.ts 编译为 CommonJS 格式

const { build } = require('esbuild')
const path = require('path')
const fs = require('fs')

const outDir = path.resolve(__dirname, '../dist-electron')

const commonConfig = {
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  bundle: true,
  sourcemap: true,
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  logLevel: 'info',
}

async function buildElectron() {
  // 确保输出目录存在
  fs.mkdirSync(outDir, { recursive: true })

  console.log('构建 Electron...\n')

  try {
    // 构建 main
    console.log('→ 构建 main.ts')
    await build({
      ...commonConfig,
      entryPoints: [path.resolve(__dirname, '../electron/main.ts')],
      outfile: path.join(outDir, 'main.cjs'),
      external: [
        'electron',
        'sherpa-onnx-node',
        'onnxruntime-web',
        'onnxruntime-node',
        'onnxruntime-common',
        'pino',
        'pino-pretty',
        'uiohook-napi',
      ],
    })

    // 构建 preload
    console.log('→ 构建 preload.ts')
    await build({
      ...commonConfig,
      entryPoints: [path.resolve(__dirname, '../electron/preload.ts')],
      outfile: path.join(outDir, 'preload.cjs'),
      external: ['electron'],
    })

    console.log('\n✓ 构建完成')
  } catch (error) {
    console.error('✗ 构建失败:', error)
    process.exit(1)
  }
}

buildElectron()
