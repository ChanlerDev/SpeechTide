# SpeechTide

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)]()

[中文](README.md) | English

SpeechTide is a voice input assistant that enables offline transcription through the local SenseVoice Small model. This is a personal tool created through Vibe Coding, with unstable iterations.

## ✨ Features

- 🎙️ **Voice Recording**: High-quality audio capture using Electron native API
- 🤖 **Local Transcription**: SenseVoice ONNX model for offline speech recognition
- ⌨️ **Text Injection**: Direct text insertion using AX API
- 🎯 **Global Shortcut**: Customizable hotkeys (default: ⌘ Right key)
- 💬 **Multi-language**: Supports Chinese, English, Japanese, Korean, and Cantonese

## 🚀 Quick Start

### Install the App

Download the latest version from [Releases](https://github.com/ChanlerDev/speechtide/releases), drag it to the Applications folder, then run in Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/SpeechTide.app"
```

> The app is not signed with an Apple Developer certificate, so you need to remove the quarantine attribute to open it.

### Build from Source

**Prerequisites**: macOS, Node.js 22.x, npm or yarn

#### Installation

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev
```

#### Building

```bash
# Build for production
npm run build

# The build artifacts will be stored in the `release/` directory
```

## 📁 Project Structure

```
├── electron/          # Main process & preload scripts
│   ├── main.ts        # Application entry point
│   ├── preload.cjs    # Preload script (IPC bridge)
│   ├── audio/         # Audio recording module
│   ├── transcriber/   # Transcription engines
│   └── services/      # Core services
├── src/               # React renderer layer
│   ├── components/    # UI components
│   ├── hooks/         # Custom React hooks
│   └── lib/           # Utilities
├── shared/            # Shared type definitions
├── native/            # Native extensions (AX API)
└── scripts/           # Build & utility scripts
```

## 🔧 Configuration

### Default Paths

- **Application Data**: `~/Library/Application Support/SpeechTide/`
- **Models**: `~/Library/Application Support/SpeechTide/models/sensevoice-small/`
- **Conversations**: `~/Library/Application Support/SpeechTide/conversations/`
- **Logs**: `~/Library/Application Support/SpeechTide/logs/`

### Runtime Configuration

Configuration files are automatically generated on first run at:
`~/Library/Application Support/SpeechTide/config/`

- `audio.json` - Audio recording settings (sample rate, max duration)
- `transcriber.json` - Transcription engine settings

## 🤖 AI Models

### SenseVoice

- **Source**: [FunAudioLLM/SenseVoice](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17)
- **License**: Apache 2.0
- **Features**: Local, offline, multi-language support (Chinese, English, Japanese, Korean, Cantonese)

## 🔐 Permissions

SpeechTide requires the following macOS permissions:

- **Microphone Access**: For audio recording
- **Accessibility Access**: For text injection

Permissions can be granted through the onboarding flow or System Preferences.

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FunAudioLLM/SenseVoice](https://github.com/FunAudioLLM/SenseVoice) - Multi-language speech recognition model
- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) - Real-time speech recognition toolkit
- [Electron](https://electronjs.org/) - Cross-platform desktop application framework
- [React](https://reactjs.org/) - User interface library

## 📧 Contact

- **Email**: speechtide@chanler.dev
- **Repository**: https://github.com/ChanlerDev/speechtide

---

**SpeechTide Contributors** - Making voice input more efficient! 🎤
