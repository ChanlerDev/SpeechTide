#include "ax-insert.h"
#include <napi.h>
#include <string>
#include <iostream>
#include <vector>
#include <chrono>
#include <thread>
#include <unistd.h>

// 包含 macOS 框架
#include <CoreGraphics/CoreGraphics.h>

// 前向声明
namespace AxInsertBinding {
}

// 键盘输入系统类
class KeyboardInputSystem {
private:
    CGEventSourceRef _source;
    bool _isInitialized;

public:
    KeyboardInputSystem() : _source(NULL), _isInitialized(false) {
        initialize();
    }

    ~KeyboardInputSystem() {
        if (_source) {
            CFRelease(_source);
        }
    }

    bool isInitialized() const {
        return _isInitialized;
    }

    bool initialize() {
        _source = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);
        _isInitialized = (_source != NULL);
        return _isInitialized;
    }

    // 输入大段文本（支持 Unicode）
    bool inputLargeText(const std::string& text, size_t chunkSize = 1000) {
        if (!_isInitialized) {
            std::cerr << "[Keyboard] 键盘输入系统未初始化" << std::endl;
            return false;
        }

        if (text.empty()) {
            return true;
        }

        // 对于大文本，分块处理以避免系统限制
        if (text.length() > chunkSize) {
            return inputLargeTextOptimized(text, chunkSize);
        }

        // 小文本直接输入
        return inputTextInternal(text);
    }

private:
    bool inputLargeTextOptimized(const std::string& text, size_t chunkSize) {
        size_t textLength = text.length();
        size_t position = 0;
        size_t chunkCount = 0;

        while (position < textLength) {
            size_t remaining = textLength - position;
            size_t currentChunkSize = std::min(chunkSize, remaining);

            // 确保不在 UTF-8 多字节字符中间分割
            size_t adjustedChunkSize = adjustChunkSize(text, position, currentChunkSize);
            std::string chunk = text.substr(position, adjustedChunkSize);

            std::cout << "[Keyboard] 输入文本块 " << (chunkCount + 1)
                     << "/" << ((textLength + chunkSize - 1) / chunkSize)
                     << " (位置: " << position << ", 大小: " << adjustedChunkSize << ")" << std::endl;

            if (!inputTextInternal(chunk)) {
                std::cerr << "[Keyboard] 文本块输入失败" << std::endl;
                return false;
            }

            position += adjustedChunkSize;
            chunkCount++;

            // 在块之间添加延迟
            if (position < textLength) {
                usleep(100000); // 100ms 延迟
            }
        }

        return true;
    }

    // 确保不在 UTF-8 多字节字符中间分割
    size_t adjustChunkSize(const std::string& text, size_t position, size_t chunkSize) {
        size_t endPosition = position + chunkSize;

        // 如果在文本末尾，直接返回
        if (endPosition >= text.length()) {
            return text.length() - position;
        }

        // 检查最后一个字节是否是 UTF-8 多字节字符的一部分
        unsigned char lastByte = static_cast<unsigned char>(text[endPosition - 1]);

        // 如果是多字节字符的开始，回溯到字符开始
        if ((lastByte & 0xE0) == 0xC0) {
            // 2字节字符 (110xxxxx)
            return chunkSize - 1;
        } else if ((lastByte & 0xF0) == 0xE0) {
            // 3字节字符 (1110xxxx)
            return chunkSize - 1;
        } else if ((lastByte & 0xF8) == 0xF0) {
            // 4字节字符 (11110xxx)
            return chunkSize - 1;
        }

        return chunkSize;
    }

    bool inputTextInternal(const std::string& text) {
        // 使用 Unicode 输入方式处理所有字符
        return inputUnicodeText(text);
    }

    bool inputUnicodeText(const std::string& text) {
        // 转换 UTF-8 字符串为 UTF-16
        std::vector<UniChar> unicodeChars;
        CFStringRef cfString = CFStringCreateWithCString(
            kCFAllocatorDefault,
            text.c_str(),
            kCFStringEncodingUTF8
        );

        if (!cfString) {
            std::cerr << "[Keyboard] 无法创建 CFString" << std::endl;
            return false;
        }

        // 获取 UTF-16 字符数组
        CFIndex length = CFStringGetLength(cfString);
        unicodeChars.resize(length);
        CFStringGetCharacters(cfString, CFRangeMake(0, length), unicodeChars.data());

        // 为每个 Unicode 字符创建事件
        for (size_t i = 0; i < unicodeChars.size(); i++) {
            CGEventRef unicodeEvent = CGEventCreateKeyboardEvent(_source, 0, true);

            if (unicodeEvent) {
                // 设置 Unicode 字符数据
                CGEventKeyboardSetUnicodeString(unicodeEvent, 1, &unicodeChars[i]);

                // 发送按下事件
                CGEventPost(kCGHIDEventTap, unicodeEvent);

                // 创建并发送释放事件
                CGEventRef unicodeEventUp = CGEventCreateKeyboardEvent(_source, 0, false);
                if (unicodeEventUp) {
                    CGEventKeyboardSetUnicodeString(unicodeEventUp, 1, &unicodeChars[i]);
                    CGEventPost(kCGHIDEventTap, unicodeEventUp);
                    CFRelease(unicodeEventUp);
                }

                CFRelease(unicodeEvent);

                // 在字符之间添加延迟
                usleep(5000); // 5ms
            }
        }

        CFRelease(cfString);
        return true;
    }
};

// 全局键盘输入系统实例
static KeyboardInputSystem* gKeyboardSystem = nullptr;

/**
 * 获取键盘输入系统单例
 */
KeyboardInputSystem* getKeyboardSystem() {
    if (!gKeyboardSystem) {
        gKeyboardSystem = new KeyboardInputSystem();
        std::cout << "[AXInsert] ✓ 键盘输入系统已初始化" << std::endl;
    }
    return gKeyboardSystem;
}

/**
 * 释放键盘输入系统
 */
void cleanupKeyboardSystem() {
    if (gKeyboardSystem) {
        delete gKeyboardSystem;
        gKeyboardSystem = nullptr;
    }
}

namespace AxInsertBinding {

    /**
     * 在当前焦点元素中插入文本 - 使用键盘模拟方案
     */
    Napi::Value InsertText(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            Napi::TypeError::New(env, "参数必须是对象 { text: string, targetApp?: string }")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        Napi::Object args = info[0].As<Napi::Object>();
        std::string text = args.Get("text").As<Napi::String>().Utf8Value();
        std::string targetApp = args.Get("targetApp").IsUndefined() ? "" : args.Get("targetApp").As<Napi::String>().Utf8Value();

        std::cout << "[AXInsert] 开始插入文本，长度: " << text.length() << std::endl;

        // 使用键盘模拟方案
        bool success = simulateKeyboardInput(text);

        std::string method = success ? "keyboard" : "";

        Napi::Object result = Napi::Object::New(env);
        result.Set("success", Napi::Boolean::New(env, success));
        result.Set("method", Napi::String::New(env, method));
        result.Set("error", success ? env.Null() : Napi::String::New(env, "键盘模拟输入失败"));

        return result;
    }


    /**
     * 键盘模拟输入 - 使用 CGEvent 实现
     */
    bool simulateKeyboardInput(const std::string& text) {
        std::cout << "[AXInsert] 开始键盘模拟输入，文本长度: " << text.length() << std::endl;

        // 获取键盘输入系统
        KeyboardInputSystem* keyboard = getKeyboardSystem();

        if (!keyboard || !keyboard->isInitialized()) {
            std::cerr << "[AXInsert] ✗ 键盘输入系统初始化失败" << std::endl;
            return false;
        }

        // 输入文本
        bool success = keyboard->inputLargeText(text);

        if (success) {
            std::cout << "[AXInsert] ✓ 键盘模拟输入成功" << std::endl;
        } else {
            std::cerr << "[AXInsert] ✗ 键盘模拟输入失败" << std::endl;
        }

        return success;
    }

    /**
     * 检查辅助功能权限
     */
    Napi::Value CheckPermissions(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Object result = Napi::Object::New(env);

        #ifdef __APPLE__
            // 测试键盘事件源是否可以创建
            CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);

            if (source) {
                result.Set("hasAccessibility", Napi::Boolean::New(env, true));
                result.Set("error", env.Null());
                std::cout << "[AXInsert] ✓ 辅助功能权限检查通过" << std::endl;
                CFRelease(source);
            } else {
                result.Set("hasAccessibility", Napi::Boolean::New(env, false));
                result.Set("error", Napi::String::New(env, "需要辅助功能权限"));
                std::cout << "[AXInsert] ✗ 辅助功能权限不足" << std::endl;
            }
        #else
            result.Set("hasAccessibility", Napi::Boolean::New(env, false));
            result.Set("error", Napi::String::New(env, "仅支持 macOS"));
        #endif

        return result;
    }

    /**
     * 初始化模块
     */
    Napi::Object Init(Napi::Env env, Napi::Object exports) {
        exports.Set("insertText", Napi::Function::New(env, InsertText));
        exports.Set("checkPermissions", Napi::Function::New(env, CheckPermissions));
        return exports;
    }

} // namespace AxInsertBinding

// 模块初始化函数（放在命名空间外）
Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    return AxInsertBinding::Init(env, exports);
}

// Node.js 模块初始化
NODE_API_MODULE(ax_insert, InitModule)