/**
 * 文件转写服务
 *
 * 提供 WAV 文件转写和导出功能
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createTranscriber, type Transcriber, type TranscriberConfig } from '../transcriber'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('file-transcription-service')

export interface FileTranscriptionResult {
  success: boolean
  text?: string
  durationMs?: number
  error?: string
}

export interface ExportOptions {
  text: string
  outputPath: string
  fileName: string
}

export interface ExportResult {
  success: boolean
  fullPath?: string
  error?: string
}

export interface FileTranscriptionServiceOptions {
  supportDir: string
  transcriberConfig: () => TranscriberConfig
}

export class FileTranscriptionService {
  private readonly supportDir: string
  private readonly getTranscriberConfig: () => TranscriberConfig
  private transcriber: Transcriber | null = null

  constructor(options: FileTranscriptionServiceOptions) {
    this.supportDir = options.supportDir
    this.getTranscriberConfig = options.transcriberConfig
  }

  /**
   * 转写 WAV 文件
   */
  async transcribeFile(
    filePath: string,
    onProgress?: (progress: number) => void
  ): Promise<FileTranscriptionResult> {
    logger.info('开始转写文件', { filePath })

    // 验证文件存在
    if (!fs.existsSync(filePath)) {
      logger.warn('文件不存在', { filePath })
      return { success: false, error: '文件不存在' }
    }

    // 验证文件格式
    const ext = path.extname(filePath).toLowerCase()
    if (ext !== '.wav') {
      logger.warn('不支持的文件格式', { filePath, ext })
      return { success: false, error: `不支持的文件格式: ${ext}，仅支持 .wav 文件` }
    }

    // 报告开始进度
    onProgress?.(0)

    try {
      // 确保转写器可用
      const transcriber = this.ensureTranscriber()

      // 报告转写中进度
      onProgress?.(50)

      // 执行转写
      const startTime = Date.now()
      const result = await transcriber.transcribe(filePath)
      const durationMs = Date.now() - startTime

      // 报告完成进度
      onProgress?.(100)

      logger.info('转写完成', {
        filePath,
        textLength: result.text.length,
        durationMs,
        modelId: result.modelId,
      })

      return {
        success: true,
        text: result.text,
        durationMs,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(error instanceof Error ? error : new Error(errorMessage), {
        context: 'transcribeFile',
        filePath,
      })
      return { success: false, error: `转写失败: ${errorMessage}` }
    }
  }

  /**
   * 导出转写结果到文件
   */
  async exportTranscription(options: ExportOptions): Promise<ExportResult> {
    const { text, outputPath, fileName } = options

    logger.info('开始导出转写结果', { outputPath, fileName })

    try {
      // 展开 ~ 到实际 home 目录
      const expandedPath = outputPath.startsWith('~')
        ? path.join(os.homedir(), outputPath.slice(1))
        : outputPath

      // 创建输出目录（如果不存在）
      if (!fs.existsSync(expandedPath)) {
        fs.mkdirSync(expandedPath, { recursive: true })
        logger.debug('创建输出目录', { expandedPath })
      }

      // 确保文件名以 .txt 结尾
      const finalFileName = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`
      const fullPath = path.join(expandedPath, finalFileName)

      // 写入文件
      fs.writeFileSync(fullPath, text, 'utf-8')

      logger.info('导出完成', { fullPath })

      return { success: true, fullPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 检查是否为权限错误
      if (error instanceof Error && 'code' in error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EACCES' || code === 'EPERM') {
          logger.warn('写入权限不足', { outputPath })
          return { success: false, error: '写入权限不足，请选择其他目录' }
        }
      }

      logger.error(error instanceof Error ? error : new Error(errorMessage), {
        context: 'exportTranscription',
        outputPath,
        fileName,
      })
      return { success: false, error: `导出失败: ${errorMessage}` }
    }
  }

  /**
   * 销毁服务，释放资源
   */
  destroy(): void {
    if (this.transcriber) {
      logger.info('销毁转写器')
      this.transcriber.destroy?.()
      this.transcriber = null
    }
  }

  /**
   * 确保转写器可用（懒加载）
   */
  private ensureTranscriber(): Transcriber {
    if (!this.transcriber) {
      logger.info('创建转写器实例')
      const config = this.getTranscriberConfig()
      this.transcriber = createTranscriber(config, { supportDir: this.supportDir })
    }
    return this.transcriber
  }
}
