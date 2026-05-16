// ══════════════════════════════════════════════════════
// nav.js · Top nav + category switching + scroll snap (currently a no-op)
// Switching category triggers a forced redraw of every chart (works around the
// first-time-in-viewport 0x0 container issue)
// ══════════════════════════════════════════════════════

import { chartInstances } from './chart-helpers.js';

export function initNav() {
  const navGroups = Array.from(document.querySelectorAll('.nav-group'));
  const categoryTabs = Array.from(document.querySelectorAll('.category-tab'));
  const panels = document.querySelectorAll('.panel');
  let currentCategory = 'sp500';

  const hashTarget = window.location.hash ? document.querySelector(window.location.hash) : null;
  if (hashTarget?.dataset.category) {
    currentCategory = hashTarget.dataset.category;
  }

  function setActivePanel(panelId) {
    const visibleGroup = document.querySelector(`.nav-group[data-category="${currentCategory}"]`);
    if (!visibleGroup) {
      return;
    }
    visibleGroup.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.panel === panelId);
    });
  }

  function setCategory(category, shouldScroll = true) {
    currentCategory = category;
    navGroups.forEach(group => {
      group.classList.toggle('active', group.dataset.category === category);
    });
    categoryTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.category === category);
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.category !== category;
    });

    const firstVisible = document.querySelector(`.panel[data-category="${category}"]`);
    if (firstVisible) {
      setActivePanel(firstVisible.id);
      if (shouldScroll) {
        firstVisible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Force a full redraw after switching category: resize + re-setOption.
    // Background: when ECharts initializes inside a hidden (display:none) container, the canvas
    // is 0×0; resize() alone isn't enough, so we also call _refreshTheme to trigger a full setOption.
    function forceRedrawAll() {
      chartInstances.forEach(chart => {
        try {
          chart.resize();
          if (typeof chart._refreshTheme === 'function') {
            chart._refreshTheme();
          }
        } catch (_) {}
      });
    }
    requestAnimationFrame(() => requestAnimationFrame(forceRedrawAll));
    setTimeout(forceRedrawAll, 300);
  }

  // Track which panels have already been resized (to avoid duplicate runs)
  const resizedPanels = new Set();

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.target.hidden || entry.target.dataset.category !== currentCategory) {
        return;
      }
      setActivePanel(entry.target.id);
      // Trigger a one-shot forced redraw the first time a panel enters the viewport
      if (!resizedPanels.has(entry.target.id)) {
        resizedPanels.add(entry.target.id);
        requestAnimationFrame(() => {
          chartInstances.forEach(chart => {
            try {
              chart.resize();
              if (typeof chart._refreshTheme === 'function') chart._refreshTheme();
            } catch (_) {}
          });
        });
      }
    });
  }, { rootMargin: '-104px 0px -60% 0px', threshold: 0 });

  panels.forEach(panel => observer.observe(panel));

  categoryTabs.forEach(tab => {
    tab.addEventListener('click', () => setCategory(tab.dataset.category));
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = document.getElementById(item.dataset.panel);
      if (target?.dataset.category && target.dataset.category !== currentCategory) {
        setCategory(target.dataset.category, false);
      }
    });
  });

  setCategory(currentCategory, false);
}

// Placeholder (legacy scroll-snap logic was disabled; export retained for external callers)
export function initPanelSnapScroll() {
  return;
}
