# Apple Dictation Helper

macOS 原生听写组件，使用 `SFSpeechRecognizer` 实现实时流式语音识别。

## 架构

- **src/main.swift** - Swift 源码，通过 stdin/stdout JSON 协议与 Electron 通信
- **bin/apple-dictation-helper** - 预编译的 arm64 二进制，直接提交到 Git

## 更新流程

修改 `src/main.swift` 后，**必须重新编译并提交二进制**：

```bash
bash native/apple-dictation/build.sh
git add native/apple-dictation/bin/apple-dictation-helper
git commit -m "chore: rebuild apple-dictation-helper"
```

## 平台支持

仅支持 macOS arm64。Windows 不使用此模块。
