// ══════════════════════════════════════════════════════
// lang-switch.js · Seamless EN/CN language switching
// Design: preserve hash (same panel) + sessionStorage for scroll + fade before switch
// ══════════════════════════════════════════════════════

const SCROLL_KEY = 'langSwitchScroll';
const PANEL_KEY = 'langSwitchActivePanel';

function captureState() {
  // Current panel: prefer hash, otherwise read from visible .panel:not([hidden])
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

  // If a panel is stored and there's no current hash, set it to trigger the existing router
  if (savedPanel && !window.location.hash) {
    history.replaceState(null, '', '#' + savedPanel);
  }

  // Wait for render to complete before restoring scroll
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
      // Before switching: save state, visually fade out (to avoid the white-flash feel)
      captureState();
      const href = el.getAttribute('href') || '';
      const currentHash = window.location.hash || '';
      e.preventDefault();
      document.body.style.transition = 'opacity 0.12s';
      document.body.style.opacity = '0.4';
      // Carry the current hash over
      window.location.href = href + currentHash;
    });
  });
}

export function initLangSwitch() {
  // Restore state after routing
  restoreState();
  bindToggle();
}
