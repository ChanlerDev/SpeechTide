#!/usr/bin/env node
/**
 * SpeechTide Postinstall Script
 * 自动检查并下载 SenseVoice 模型（如果需要）
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')

// 配置
const MODEL_VERSION = '1.0.0'
const SENSEVOICE_VERSION = 'small'
const MODEL_BASE_URL = 'https://huggingface.co/litagin/SenseVoiceSmall_zh/resolve/main/sensevoice-small'

// 模型文件列表
const MODEL_FILES = [
  {
    name: 'model.onnx',
    url: `${MODEL_BASE_URL}/model.onnx`,
    size: '~75MB'
  },
  {
    name: 'tokens.json',
    url: `${MODEL_BASE_URL}/tokens.json`,
    size: '~15KB'
  }
]

function getSupportDir() {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'SpeechTide')
  }
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', 'SpeechTide')
  }
  return path.join(home, '.local', 'share', 'SpeechTide')
}

function getModelDir() {
  return path.join(getSupportDir(), 'models', `sensevoice-${SENSEVOICE_VERSION}`)
}

function checkModelExists() {
  const modelDir = getModelDir()
  return fs.existsSync(path.join(modelDir, 'model.onnx')) &&
         fs.existsSync(path.join(modelDir, 'tokens.json'))
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${response.statusCode}`))
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      fs.unlink(destPath, () => {})
      reject(err)
    })
  })
}

async function downloadModels() {
  const modelDir = getModelDir()
  console.log(`\n🚀 SpeechTide ${MODEL_VERSION} - 模型初始化`)
  console.log(`📁 模型目录: ${modelDir}\n`)

  // 创建目录
  fs.mkdirSync(modelDir, { recursive: true })

  // 下载模型文件
  for (const file of MODEL_FILES) {
    const destPath = path.join(modelDir, file.name)
    console.log(`⬇️  下载 ${file.name} (${file.size})...`)

    try {
      await downloadFile(file.url, destPath)
      console.log(`✅ ${file.name} 下载完成`)
    } catch (error) {
      console.error(`❌ ${file.name} 下载失败:`, error.message)
      console.log(`   请手动下载: ${file.url}`)
    }
  }

  // 检查结果
  if (checkModelExists()) {
    console.log('\n✅ 模型文件检查通过！')
    console.log('   SpeechTide 已准备就绪\n')
  } else {
    console.log('\n⚠️  部分模型文件下载失败')
    console.log('   您可以：')
    console.log('   1. 稍后重新运行 npm install')
    console.log('   2. 手动下载模型文件到上述目录')
  }
}

async function main() {
  try {
    if (process.env.SPEECHTIDE_SKIP_MODEL_DOWNLOAD === '1' || process.env.CI === 'true') {
      console.log('✅ SpeechTide CI 环境：跳过模型下载')
      return
    }

    if (checkModelExists()) {
      console.log('✅ SpeechTide 模型已存在，跳过下载')
      return
    }

    console.log('🔍 检查到模型文件不存在，开始下载...')
    await downloadModels()
  } catch (error) {
    console.error('\n❌ 初始化过程中发生错误:', error.message)
    process.exit(1)
  }
}

main()
