import fsPromises from 'node:fs/promises'
import path from 'node:path'

/**
 * 修复 WAV 文件头（解决 node-record-lpcm16 的已知问题）
 * @param filePath WAV文件路径
 * @returns 如果修复了文件头则返回 true，否则返回 false
 */
export async function fixWavHeaderIfNeeded(filePath: string): Promise<boolean> {
  try {
    const buffer = await fsPromises.readFile(filePath)

    // 检查 RIFF 头
    if (buffer.readUInt32LE(0) !== 0x46464952) {
      return false
    }

    // 检查 WAVE 标识
    if (buffer.readUInt32LE(8) !== 0x45564157) {
      return false
    }

    // 查找 'data' 块
    let offset = 12
    let dataSize = -1

    while (offset < buffer.length - 8) {
      const chunkId = buffer.readUInt32LE(offset)
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 0x61746164) { // 'data'
        dataSize = chunkSize
        break
      }

      offset += 8 + chunkSize + (chunkSize % 2)
    }

    if (dataSize === -1) {
      return false
    }

    const actualDataSize = buffer.length - (offset + 8)

    // 如果数据大小不匹配，修复 WAV 头
    if (dataSize !== actualDataSize) {
      console.log(`[speech] 修复 WAV 文件头: ${path.basename(filePath)} (声明: ${dataSize}, 实际: ${actualDataSize})`)
      const fixedBuffer = Buffer.from(buffer)
      fixedBuffer.writeUInt32LE(actualDataSize, offset + 4 - 4) // 修复 data chunk size
      fixedBuffer.writeUInt32LE(buffer.length - 8, 4) // 修复 RIFF size
      await fsPromises.writeFile(filePath, fixedBuffer)
      return true
    }

    return false
  } catch (error) {
    console.warn('[speech] WAV 头修复失败:', error)
    return false
  }
}
