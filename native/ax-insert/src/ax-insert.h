#ifndef AX_INSERT_H
#define AX_INSERT_H

#include <napi.h>
#include <CoreFoundation/CoreFoundation.h>
#include <ApplicationServices/ApplicationServices.h>

namespace AxInsertBinding {

// 前向声明
bool simulateKeyboardInput(const std::string& text);

/**
 * 在当前焦点元素中插入文本
 * 参数: { text: string, targetApp?: string }
 * 返回: { success: boolean, method?: string, error?: string }
 */
Napi::Value InsertText(const Napi::CallbackInfo& info);

/**
 * 检查辅助功能权限
 * 返回: { hasAccessibility: boolean, error?: string }
 */
Napi::Value CheckPermissions(const Napi::CallbackInfo& info);

/**
 * 初始化模块
 */
Napi::Object Init(Napi::Env env, Napi::Object exports);

} // namespace AxInsertBinding

#endif // AX_INSERT_H