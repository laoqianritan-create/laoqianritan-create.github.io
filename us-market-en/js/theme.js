// ══════════════════════════════════════════════════════
// theme.js · Theme (dark mode removed; interface kept for compatibility)
// ══════════════════════════════════════════════════════

export function initTheme() {
  // dark mode removed (ch.59); clean up any residual user dark setting
  document.documentElement.removeAttribute('data-theme');
  localStorage.removeItem('sp500-theme');
}
