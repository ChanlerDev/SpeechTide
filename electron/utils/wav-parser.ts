/**
 * WAV File Parser Utility for SpeechTide
 * Parses WAV headers, extracts PCM data, and resamples audio for SenseVoice
 */

import * as fs from 'node:fs/promises'

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  dataLength: number
  duration: number // in seconds
}

/**
 * Parse WAV file header and return metadata
 */
export async function parseWavFile(filePath: string): Promise<WavInfo> {
  const buffer = await fs.readFile(filePath)
  return parseWavHeader(buffer)
}

/**
 * Extract audio as Float32Array (mono, normalized to [-1, 1])
 */
export async function extractPcmData(
  filePath: string
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buffer = await fs.readFile(filePath)
  const info = parseWavHeader(buffer)

  if (info.bitsPerSample !== 8 && info.bitsPerSample !== 16 && info.bitsPerSample !== 24 && info.bitsPerSample !== 32) {
    throw new Error(`Unsupported bits per sample: ${info.bitsPerSample}. Supported: 8, 16, 24, 32`)
  }

  const dataOffset = findDataChunkOffset(buffer)
  const rawPcm = buffer.subarray(dataOffset)
  const samples = pcmToFloat32(rawPcm, info.bitsPerSample, info.channels)

  return { samples, sampleRate: info.sampleRate }
}

/**
 * Extract and resample audio to target sample rate (default: 16000 Hz for SenseVoice)
 */
export async function extractAndResample(
  filePath: string,
  targetSampleRate: number = 16000
): Promise<Float32Array> {
  const { samples, sampleRate } = await extractPcmData(filePath)

  if (sampleRate === targetSampleRate) {
    return samples
  }

  return resampleLinear(samples, sampleRate, targetSampleRate)
}

// ============ Internal Functions ============

function parseWavHeader(buffer: Buffer): WavInfo {
  if (buffer.length < 44) {
    throw new Error('Invalid WAV file: file too small (< 44 bytes)')
  }

  // Check RIFF header
  const riffTag = buffer.toString('ascii', 0, 4)
  if (riffTag !== 'RIFF') {
    throw new Error(`Invalid WAV file: expected RIFF header, got "${riffTag}"`)
  }

  // Check WAVE format
  const waveTag = buffer.toString('ascii', 8, 12)
  if (waveTag !== 'WAVE') {
    throw new Error(`Invalid WAV file: expected WAVE format, got "${waveTag}"`)
  }

  // Find fmt chunk
  const fmtInfo = findFmtChunk(buffer)

  // Check audio format (must be PCM = 1)
  if (fmtInfo.audioFormat !== 1) {
    throw new Error(
      `Unsupported audio format: ${fmtInfo.audioFormat}. Only PCM (format=1) is supported`
    )
  }

  // Find data chunk to get data length
  const dataOffset = findDataChunkOffset(buffer)
  const dataLength = buffer.readUInt32LE(dataOffset - 4)

  const bytesPerSample = fmtInfo.bitsPerSample / 8
  const totalSamples = dataLength / bytesPerSample / fmtInfo.channels
  const duration = totalSamples / fmtInfo.sampleRate

  return {
    sampleRate: fmtInfo.sampleRate,
    channels: fmtInfo.channels,
    bitsPerSample: fmtInfo.bitsPerSample,
    dataLength,
    duration,
  }
}

interface FmtInfo {
  audioFormat: number
  channels: number
  sampleRate: number
  bitsPerSample: number
}

function findFmtChunk(buffer: Buffer): FmtInfo {
  let offset = 12 // Skip RIFF header

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)

    if (chunkId === 'fmt ') {
      if (offset + 8 + 16 > buffer.length) {
        throw new Error('Invalid WAV file: fmt chunk is truncated')
      }

      return {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        // byteRate at offset + 16 (4 bytes)
        // blockAlign at offset + 20 (2 bytes)
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      }
    }

    offset += 8 + chunkSize
    // Ensure 2-byte alignment
    if (chunkSize % 2 !== 0) {
      offset += 1
    }
  }

  throw new Error('Invalid WAV file: fmt chunk not found')
}

function findDataChunkOffset(buffer: Buffer): number {
  let offset = 12 // Skip RIFF header

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)

    if (chunkId === 'data') {
      return offset + 8 // Return offset to actual data
    }

    offset += 8 + chunkSize
    // Ensure 2-byte alignment
    if (chunkSize % 2 !== 0) {
      offset += 1
    }
  }

  throw new Error('Invalid WAV file: data chunk not found')
}

/**
 * Convert raw PCM bytes to Float32Array normalized to [-1, 1]
 * Automatically converts stereo to mono by averaging channels
 */
function pcmToFloat32(pcmData: Buffer, bitsPerSample: number, channels: number): Float32Array {
  const bytesPerSample = bitsPerSample / 8
  const totalSamples = Math.floor(pcmData.length / bytesPerSample / channels)
  const output = new Float32Array(totalSamples)

  for (let i = 0; i < totalSamples; i++) {
    let sum = 0

    for (let ch = 0; ch < channels; ch++) {
      const byteOffset = (i * channels + ch) * bytesPerSample
      sum += readSample(pcmData, byteOffset, bitsPerSample)
    }

    // Average channels for mono output
    output[i] = sum / channels
  }

  return output
}

/**
 * Read a single sample from PCM data and normalize to [-1, 1]
 */
function readSample(buffer: Buffer, offset: number, bitsPerSample: number): number {
  if (offset + bitsPerSample / 8 > buffer.length) {
    return 0 // Prevent reading past buffer end
  }

  switch (bitsPerSample) {
    case 8:
      // 8-bit PCM is unsigned (0-255), center is 128
      return (buffer.readUInt8(offset) - 128) / 128

    case 16:
      // 16-bit PCM is signed (-32768 to 32767)
      return buffer.readInt16LE(offset) / 32768

    case 24: {
      // 24-bit PCM is signed, need to manually read 3 bytes
      const b0 = buffer.readUInt8(offset)
      const b1 = buffer.readUInt8(offset + 1)
      const b2 = buffer.readInt8(offset + 2) // Signed for sign extension
      const value = b0 | (b1 << 8) | (b2 << 16)
      return value / 8388608 // 2^23
    }

    case 32:
      // 32-bit PCM is signed
      return buffer.readInt32LE(offset) / 2147483648 // 2^31

    default:
      throw new Error(`Unsupported bits per sample: ${bitsPerSample}`)
  }
}

/**
 * Simple linear interpolation resampling
 * For production use, consider using a proper resampling library like libsamplerate
 */
function resampleLinear(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): Float32Array {
  const ratio = sourceSampleRate / targetSampleRate
  const outputLength = Math.floor(samples.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio
    const srcIndexFloor = Math.floor(srcIndex)
    const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1)
    const fraction = srcIndex - srcIndexFloor

    // Linear interpolation between adjacent samples
    output[i] = samples[srcIndexFloor] * (1 - fraction) + samples[srcIndexCeil] * fraction
  }

  return output
}
