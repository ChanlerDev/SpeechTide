#ifndef AX_INSERT_OBJC_H
#define AX_INSERT_OBJC_H

#include <napi.h>

// 定义常量
#define K_AX_TEXT_FIELD_ATTRIBUTE CFSTR("AXTextField")
#define K_AX_TEXT_AREA_ATTRIBUTE CFSTR("AXTextArea")
#define K_AX_COMBO_BOX_ATTRIBUTE CFSTR("AXComboBox")
#define K_AX_SEARCH_FIELD_ATTRIBUTE CFSTR("AXSearchField")
#define K_AX_PLAIN_TEXT_ATTRIBUTE CFSTR("AXPlainText")
#define K_AX_EDITABLE_ATTRIBUTE CFSTR("AXEditable")

namespace AxInsertBinding {

/**
 * 在当前焦点元素中插入文本
 */
Napi::Value InsertText(const Napi::CallbackInfo& info);

/**
 * 检查辅助功能权限
 */
Napi::Value CheckPermissions(const Napi::CallbackInfo& info);

/**
 * 初始化模块
 */
Napi::Object Init(Napi::Env env, Napi::Object exports);

} // namespace AxInsertBinding

#endif // AX_INSERT_OBJC_H