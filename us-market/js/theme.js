// ══════════════════════════════════════════════════════
// theme.js · 深浅主题切换
// 切换后会触发所有注册 chart 的 _refreshTheme() 让图表重绘
// ══════════════════════════════════════════════════════

import { chartInstances } from './chart-helpers.js';

export function initTheme() {
  const saved = localStorage.getItem('sp500-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  document.getElementById('themeToggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('sp500-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('sp500-theme', 'dark');
    }

    setTimeout(() => {
      chartInstances.forEach(chart => {
        if (chart._refreshTheme) {
          chart._refreshTheme();
        }
        chart.resize();
      });
    }, 50);
  });
}
