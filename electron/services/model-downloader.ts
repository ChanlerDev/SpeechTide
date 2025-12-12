/**
 * 模型下载服务
 * 
 * 负责下载和管理 SenseVoice 模型
 */

import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { getModelsDir, ensureDir } from '../config/paths'

/** 模型信息 */
export interface ModelInfo {
  id: string
  name: string
  description: string
  size: string  // 人类可读的大小
  sizeBytes: number
  files: ModelFile[]
}

/** 模型文件 */
export interface ModelFile {
  name: string
  url: string
  size: number
  sha256?: string
}

/** 下载进度 */
export interface DownloadProgress {
  file: string
  downloaded: number
  total: number
  percent: number
  speed: string  // 如 "1.2 MB/s"
}

/** 下载结果 */
export interface DownloadResult {
  success: boolean
  modelPath?: string
  error?: string
}

/** SenseVoice 模型配置 */
const SENSEVOICE_MODEL: ModelInfo = {
  id: 'sensevoice-small',
  name: 'SenseVoice Small',
  description: '阿里达摩院开源的语音识别模型，支持中英日韩粤语',
  size: '~230 MB',
  sizeBytes: 230 * 1024 * 1024,
  files: [
    {
      name: 'model.onnx',
      url: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.onnx?download=true',
      size: 228 * 1024 * 1024,
    },
    {
      name: 'tokens.txt',
      url: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt?download=true',
      size: 200 * 1024,
    },
  ],
}

/**
 * 模型下载器类
 */
export class ModelDownloader {
  private abortController: AbortController | null = null
  private onProgress: ((progress: DownloadProgress) => void) | null = null

  /**
   * 获取模型目录
   */
  getModelDir(modelId: string): string {
    return path.join(getModelsDir(), modelId)
  }

  /**
   * 检查模型是否已下载
   */
  isModelDownloaded(modelId: string = 'sensevoice-small'): boolean {
    const modelDir = this.getModelDir(modelId)
    const model = modelId === 'sensevoice-small' ? SENSEVOICE_MODEL : null
    
    if (!model) return false

    return model.files.every(file => {
      const filePath = path.join(modelDir, file.name)
      if (!fs.existsSync(filePath)) return false
      
      // 检查文件大小是否合理（至少有预期大小的 90%）
      const stats = fs.statSync(filePath)
      return stats.size >= file.size * 0.9
    })
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): ModelInfo[] {
    return [SENSEVOICE_MODEL]
  }

  /**
   * 下载单个文件
   */
  private async downloadFile(
    url: string,
    destPath: string,
    fileName: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath)
      let downloadedBytes = 0
      let totalBytes = 0
      let lastTime = Date.now()
      let lastBytes = 0

      const makeRequest = (requestUrl: string) => {
        const protocol = requestUrl.startsWith('https') ? https : http
        
        const request = protocol.get(requestUrl, (response) => {
          // 处理重定向
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location
            if (redirectUrl) {
              file.close()
              fs.unlinkSync(destPath)
              makeRequest(redirectUrl)
              return
            }
          }

          if (response.statusCode !== 200) {
            file.close()
            fs.unlinkSync(destPath)
            reject(new Error(`下载失败: HTTP ${response.statusCode}`))
            return
          }

          totalBytes = parseInt(response.headers['content-length'] || '0', 10)

          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            
            // 计算速度
            const now = Date.now()
            const timeDiff = (now - lastTime) / 1000
            if (timeDiff >= 0.5) {  // 每 0.5 秒更新一次
              const bytesDiff = downloadedBytes - lastBytes
              const speed = bytesDiff / timeDiff
              const speedStr = this.formatSpeed(speed)
              
              this.onProgress?.({
                file: fileName,
                downloaded: downloadedBytes,
                total: totalBytes,
                percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
                speed: speedStr,
              })
              
              lastTime = now
              lastBytes = downloadedBytes
            }
          })

          response.pipe(file)

          file.on('finish', () => {
            file.close()
            resolve()
          })
        })

        request.on('error', (err) => {
          file.close()
          fs.unlink(destPath, () => {})
          reject(err)
        })

        // 支持取消
        if (this.abortController) {
          this.abortController.signal.addEventListener('abort', () => {
            request.destroy()
            file.close()
            fs.unlink(destPath, () => {})
            reject(new Error('下载已取消'))
          })
        }
      }

      makeRequest(url)
    })
  }

  /**
   * 格式化下载速度
   */
  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    }
    if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    }
    return `${Math.round(bytesPerSecond)} B/s`
  }

  /**
   * 下载模型
   */
  async download(
    modelId: string = 'sensevoice-small',
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const model = modelId === 'sensevoice-small' ? SENSEVOICE_MODEL : null
    
    if (!model) {
      return { success: false, error: `未知模型: ${modelId}` }
    }

    // 检查是否已下载
    if (this.isModelDownloaded(modelId)) {
      return { success: true, modelPath: this.getModelDir(modelId) }
    }

    this.onProgress = onProgress || null
    this.abortController = new AbortController()

    const modelDir = this.getModelDir(modelId)
    ensureDir(modelDir)

    try {
      for (const file of model.files) {
        const filePath = path.join(modelDir, file.name)
        
        // 如果文件已存在且大小合适，跳过
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath)
          if (stats.size >= file.size * 0.9) {
            console.log(`[ModelDownloader] 跳过已存在的文件: ${file.name}`)
            continue
          }
        }

        console.log(`[ModelDownloader] 开始下载: ${file.name}`)
        await this.downloadFile(file.url, filePath, file.name)
        console.log(`[ModelDownloader] 下载完成: ${file.name}`)
      }

      return { success: true, modelPath: modelDir }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ModelDownloader] 下载失败:`, message)
      return { success: false, error: message }
    } finally {
      this.abortController = null
      this.onProgress = null
    }
  }

  /**
   * 取消下载
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      console.log('[ModelDownloader] 下载已取消')
    }
  }

  /**
   * 删除模型
   */
  deleteModel(modelId: string): boolean {
    const modelDir = this.getModelDir(modelId)
    
    if (!fs.existsSync(modelDir)) {
      return true
    }

    try {
      fs.rmSync(modelDir, { recursive: true, force: true })
      console.log(`[ModelDownloader] 模型已删除: ${modelId}`)
      return true
    } catch (error) {
      console.error(`[ModelDownloader] 删除模型失败:`, error)
      return false
    }
  }

  /**
   * 获取模型状态
   */
  getModelStatus(modelId: string = 'sensevoice-small'): {
    downloaded: boolean
    path?: string
    size?: number
  } {
    const downloaded = this.isModelDownloaded(modelId)
    const modelDir = this.getModelDir(modelId)

    if (!downloaded) {
      return { downloaded: false }
    }

    // 计算实际大小
    let totalSize = 0
    const model = modelId === 'sensevoice-small' ? SENSEVOICE_MODEL : null
    if (model) {
      for (const file of model.files) {
        const filePath = path.join(modelDir, file.name)
        if (fs.existsSync(filePath)) {
          totalSize += fs.statSync(filePath).size
        }
      }
    }

    return {
      downloaded: true,
      path: modelDir,
      size: totalSize,
    }
  }
}

// 导出单例
export const modelDownloader = new ModelDownloader()
