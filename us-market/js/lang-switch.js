// ══════════════════════════════════════════════════════
// lang-switch.js · 中英文无感切换
// 设计原则：保留 hash（同 panel）+ sessionStorage 保存 scroll + 切前淡出
// ══════════════════════════════════════════════════════

const SCROLL_KEY = 'langSwitchScroll';
const PANEL_KEY = 'langSwitchActivePanel';

function captureState() {
  // 当前 panel：优先 hash，否则从可见的 .panel:not([hidden]) 取
  let panelId = (window.location.hash || '').replace('#', '');
  if (!panelId) {
    const visible = document.querySelector('.panel:not([hidden])');
    if (visible) panelId = visible.id;
  }
  sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  if (panelId) sessionStorage.setItem(PANEL_KEY, panelId);
}

function restoreState() {
  const savedPanel = sessionStorage.getItem(PANEL_KEY);
  const savedScroll = sessionStorage.getItem(SCROLL_KEY);
  if (!savedPanel && !savedScroll) return;

  // 如果存了 panel 且当前没 hash，主动设 hash 触发原有路由
  if (savedPanel && !window.location.hash) {
    history.replaceState(null, '', '#' + savedPanel);
  }

  // 等渲染完成再恢复 scroll
  if (savedScroll !== null) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
      }, 80);
    });
  }

  sessionStorage.removeItem(SCROLL_KEY);
  sessionStorage.removeItem(PANEL_KEY);
}

function bindToggle() {
  const toggle = document.getElementById('langToggle');
  if (!toggle) return;
  toggle.querySelectorAll('.lang-opt').forEach(el => {
    el.addEventListener('click', e => {
      if (el.classList.contains('active')) {
        e.preventDefault();
        return;
      }
      // 切换前：保存状态、视觉淡出（避免白屏闪烁感）
      captureState();
      const href = el.getAttribute('href') || '';
      const currentHash = window.location.hash || '';
      e.preventDefault();
      document.body.style.transition = 'opacity 0.12s';
      document.body.style.opacity = '0.4';
      // 把当前 hash 带过去
      window.location.href = href + currentHash;
    });
  });
}

export function initLangSwitch() {
  // 路由后恢复状态
  restoreState();
  bindToggle();
}
