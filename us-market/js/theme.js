// ══════════════════════════════════════════════════════
// theme.js · 主题（dark 模式已移除，保留接口兼容）
// ══════════════════════════════════════════════════════

export function initTheme() {
  // dark 模式已移除（ch.59），清理用户残留的 dark 设置
  document.documentElement.removeAttribute('data-theme');
  localStorage.removeItem('sp500-theme');
}
