/**
 * AXInsert Node.js 模块
 * 提供基于键盘模拟的文本插入功能
 */

'use strict';

let nativeModule = null;
try {
  nativeModule = require('./build/Release/ax_insert.node');
} catch (error) {
  console.error('[AXInsert] 无法加载原生模块:', error.message);
  console.error('[AXInsert] 请运行: npm install 或 npm run rebuild');
}

/**
 * 在当前焦点元素中插入文本
 * @param {string} text - 要插入的文本
 * @param {string} [targetApp] - 目标应用名称（可选）
 * @returns {Promise<{success: boolean, method?: string, error?: string}>}
 */
async function insertText(text, targetApp) {
  if (!nativeModule) {
    return {
      success: false,
      error: '原生模块未加载，请确保模块已正确编译'
    };
  }

  try {
    return nativeModule.insertText({ text, targetApp });
  } catch (error) {
    console.error('[AXInsert] 插入文本时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 检查辅助功能权限
 * @returns {Promise<{hasAccessibility: boolean, error?: string}>}
 */
async function checkPermissions() {
  if (!nativeModule) {
    return {
      hasAccessibility: false,
      error: '原生模块未加载'
    };
  }

  try {
    return nativeModule.checkPermissions();
  } catch (error) {
    console.error('[AXInsert] 检查权限时出错:', error);
    return {
      hasAccessibility: false,
      error: error.message
    };
  }
}

module.exports = {
  insertText,
  checkPermissions
};