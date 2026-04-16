// ══════════════════════════════════════════════════════
// nav.js · 顶部导航 + 分类切换 + 滚动 snap（当前 no-op）
// 切换分类后会触发所有 chart 强制重绘（首次进入视口时容器为 0x0 的问题）
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

    // 切换分类后强制全量重绘：resize + 重新 setOption
    // 背景：ECharts 在 hidden(display:none) 的容器上初始化时画布为 0×0，
    // 仅 resize() 不够，需要再调 _refreshTheme 触发完整 setOption。
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

  // 记录哪些面板已触发过 resize（避免重复执行）
  const resizedPanels = new Set();

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.target.hidden || entry.target.dataset.category !== currentCategory) {
        return;
      }
      setActivePanel(entry.target.id);
      // 面板首次进入视口时补一次强制重绘
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

// 保留占位（历史上这里有 scroll-snap 逻辑，被禁用了但仍保留导出以防外部调用）
export function initPanelSnapScroll() {
  return;
}
