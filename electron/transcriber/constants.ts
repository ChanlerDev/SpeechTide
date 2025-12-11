/**
 * SenseVoice转录器相关常量
 * 基于官方 SenseVoice 音频预处理要求
 */

// 核心音频参数
export const AUDIO_SAMPLE_RATE = 16000  // 必须 16kHz
export const FEATURE_DIM = 80           // 80维 fbank 特征
export const LFR_WINDOW_SIZE = 7        // LFR 窗口大小
export const LFR_WINDOW_SHIFT = 6       // LFR 窗口位移

// 频谱范围
export const LOW_FREQ = 20              // 最低频率 (Hz)
export const HIGH_FREQ = -400           // 最高频率 (负值表示从Nyquist频率减去)

// 音频增强参数
export const DITHER = 1.0               // 添加微量噪声，提高数值稳定性 (从 0 改为 1.0)

// 归一化设置
export const NORMALIZE_SAMPLES = true   // 是否归一化样本
export const SNIP_EDGES = false         // 是否裁剪边缘
