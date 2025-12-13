# SpeechTide

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)]()

中文 | [English](README_EN.md)

SpeechTide 是一个语音输入助手，通过本地模型 SenseVoice Small 实现离线转录功能。为本人 Vibe Coding 出的个人工具，迭代不稳定。

## ✨ 功能特性

- 🎙️ **语音录制**：使用 Electron 原生 API 进行高质量音频采集
- 🤖 **本地转写**：SenseVoice ONNX 模型，离线语音识别
- ⌨️ **文本注入**：通过 AX API 直接插入文本到任意应用
- 🎯 **全局快捷键**：可自定义热键（默认：⌘ Right 键）
- 💬 **多语言支持**：中文、英语、日语、韩语、粤语

## 🚀 快速开始

### 安装应用

从 [Releases](https://github.com/ChanlerDev/speechtide/releases) 下载最新版本，拖入 Applications 文件夹后，在终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/SpeechTide.app"
```

> 由于没有 Apple 开发者签名，需要移除隔离属性才能正常打开。

### 从源码构建

**环境要求**：macOS、Node.js 22.x、npm 或 yarn

#### 安装

```bash
# 安装依赖（自动下载模型）
npm install

# 开发模式启动
npm run dev
```

#### 构建

```bash
# 构建生产版本
npm run build

# 构建产物位于 `release/` 目录
```

## 📁 项目结构

```
├── electron/          # 主进程与预加载脚本
│   ├── main.ts        # 应用入口
│   ├── preload.cjs    # 预加载脚本（IPC 桥接）
│   ├── audio/         # 录音模块
│   ├── transcriber/   # 转写引擎
│   └── services/      # 核心服务
├── src/               # React 渲染层
│   ├── components/    # UI 组件
│   ├── hooks/         # 自定义 React Hooks
│   └── lib/           # 工具库
├── shared/            # 共享类型定义
├── native/            # 原生扩展（AX API）
└── scripts/           # 构建脚本
```

## 🔧 配置

### 默认路径

- **应用数据**：`~/Library/Application Support/SpeechTide/`
- **模型文件**：`~/Library/Application Support/SpeechTide/models/sensevoice-small/`
- **会话记录**：`~/Library/Application Support/SpeechTide/conversations/`
- **日志文件**：`~/Library/Application Support/SpeechTide/logs/`

### 运行时配置

配置文件在首次运行时自动生成，位于：
`~/Library/Application Support/SpeechTide/config/`

- `audio.json` - 音频录制设置（采样率、最大时长）
- `transcriber.json` - 转写引擎设置

## 🤖 AI 模型

### SenseVoice

- **来源**：[FunAudioLLM/SenseVoice](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17)
- **许可证**：Apache 2.0
- **特点**：本地运行、离线可用、多语言支持（中/英/日/韩/粤）

## 🔐 权限要求

SpeechTide 需要以下 macOS 权限：

- **麦克风权限**：用于录音
- **辅助功能权限**：用于文本注入

权限可通过首次启动引导流程或系统偏好设置授予。

## 📄 许可证

本项目采用 Apache License 2.0 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [FunAudioLLM/SenseVoice](https://github.com/FunAudioLLM/SenseVoice) - 多语言语音识别模型
- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) - 实时语音识别工具包
- [Electron](https://electronjs.org/) - 跨平台桌面应用框架
- [React](https://reactjs.org/) - 用户界面库

## 📧 联系方式

- **邮箱**：speechtide@chanler.dev
- **仓库**：https://github.com/ChanlerDev/speechtide

