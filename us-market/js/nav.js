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

  // ── 滚动定位（2026-09-24 修：点导航跳不到目标面板）──
  // 病因：① 全站 scroll-padding-top 只有 16px，而顶部有 position: sticky 的分类栏
  //        挡住约 60px → 面板顶部被压在栏下面；
  //       ② 原生锚点跳转会「一次性」算出目标位置，而面板是懒加载的，滚动途中下面
  //        的面板陆续初始化把文档撑高，落点于是偏出去几千 px。
  // 对策：自己算偏移 + 立即定位 + 两次纠偏（图表初始化后文档高度还会变）。
  function topOffset() {
    let off = 12;
    const catBar = document.getElementById('categoryBar');
    if (catBar && getComputedStyle(catBar).position === 'sticky') off += catBar.offsetHeight;
    const header = document.getElementById('header');
    if (header && getComputedStyle(header).position === 'sticky') off += header.offsetHeight;
    return off;
  }

  function scrollToPanel(panel, behavior = 'auto') {
    if (!panel) return;
    const y = panel.getBoundingClientRect().top + window.scrollY - topOffset();
    window.scrollTo({ top: Math.max(0, y), behavior });
  }

  // 让原生锚点跳转（站内其它 #panel-xxx 链接）也用同一个偏移
  function syncScrollPadding() {
    document.documentElement.style.scrollPaddingTop = `${topOffset()}px`;
  }
  syncScrollPadding();
  window.addEventListener('resize', syncScrollPadding, { passive: true });

  function jumpToPanel(panel, withCorrections = true) {
    if (!panel) return;
    scrollToPanel(panel, 'auto');
    if (!withCorrections) return;
    // 懒加载/图表 resize 会改变文档高度 → 补两次纠偏，确保最终停在面板顶部
    [260, 700, 1400].forEach(delay => {
      setTimeout(() => {
        if (panel.hidden) return;
        const drift = panel.getBoundingClientRect().top - topOffset();
        if (Math.abs(drift) > 4) scrollToPanel(panel);
      }, delay);
    });
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', `#${panel.id}`);
    }
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
        jumpToPanel(firstVisible);
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
    item.addEventListener('click', ev => {
      // 接管原生锚点跳转（见上方 jumpToPanel 说明），保证落到面板顶部
      ev.preventDefault();
      const target = document.getElementById(item.dataset.panel);
      if (!target) return;
      if (target.dataset.category && target.dataset.category !== currentCategory) {
        setCategory(target.dataset.category, false);
      }
      setActivePanel(target.id);
      jumpToPanel(target);
    });
  });

  setCategory(currentCategory, false);

  // 深链接（带 #panel-xxx 直接进站）也要正确定位
  if (window.location.hash) {
    let hashPanel = null;
    try { hashPanel = document.querySelector(window.location.hash); } catch (_) { hashPanel = null; }
    if (hashPanel?.classList?.contains('panel')) {
      setTimeout(() => jumpToPanel(hashPanel, false), 350);
    }
  }
}

// 保留占位（历史上这里有 scroll-snap 逻辑，被禁用了但仍保留导出以防外部调用）
export function initPanelSnapScroll() {
  return;
}
