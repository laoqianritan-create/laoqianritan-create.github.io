/**
 * A股看板 · 主控（懒加载引擎）
 * 首屏只加载 Banner + 申万热力图（轻量），其余面板进入视口才拉取数据并渲染。
 * 参考美股复盘看板 panels.js 懒加载引擎：面板注册表 + IntersectionObserver + 数据缓存。
 */
(function () {
  'use strict';

  const AK = window.AK;

  // ── 数据映射（key → JSON URL）──
  const DATA = {
    banner: 'data/banner.json',
    heatmap: 'data/sw_returns.json',
    longgrowth: 'data/panel_longgrowth.json',
    industry: 'data/industry_heat.json',
    turnover: 'data/market_turnover.json',
    returnDecomp: 'data/return_decomp.json',
    investor: 'data/investor_structure.json',
    huazheng: 'data/panel_huazheng.json',
    fearGreed: 'data/fear_greed.json',
    fundIndex: 'data/fund_index.json',
    coverage: 'data/coverage.json',
    wideBase: 'data/wide_base.json',
    valuation: 'data/index_valuation.json',
    assetAlloc: 'data/asset_allocation.json',
    trendTemp: 'data/trend_temperature.json'
  };

  // ── 面板注册表：进入视口 → 拉数据 → 渲染（timing 与 fund 共用 fund_index.json）──
  const PANELS = [
    { id: 'panel-long',      key: 'longgrowth',    render: (d) => window.LG_render(d) },
    { id: 'panel-huazheng',  key: 'huazheng',      render: (d) => window.HZ_render(d) },
    { id: 'panel-coverage',  key: 'coverage',      render: (d) => window.CV_render(d) },
    { id: 'panel-widebase',  key: 'wideBase',      render: (d) => window.WB_render(d) },
    { id: 'panel-valuation', key: 'valuation',     render: (d) => window.IV_render(d) },
    { id: 'panel-return',    key: 'returnDecomp',  render: (d) => window.RD_render(d) },
    { id: 'panel-asset',     key: 'assetAlloc',    render: (d) => window.AA_render(d) },
    { id: 'panel-turnover',  key: 'turnover',      render: (d) => window.MT_render(d) },
    { id: 'panel-industry',  key: 'industry',      render: (d) => window.IH_render(d) },
    { id: 'panel-trend',     key: 'trendTemp',     render: (d) => window.TT_render(d) },
    { id: 'panel-fear',      key: 'fearGreed',     render: (d) => window.FG_render(d) },
    { id: 'panel-fund',      key: 'fundIndex',     render: (d) => window.FI_render(d) },
    { id: 'panel-timing',    key: 'fundIndex',     render: (d) => window.TM_render(d) },
    { id: 'panel-investor',  key: 'investor',      render: (d) => window.IS_render(d) }
  ];

  // ── 导航高亮：当前面板对应导航项加 active（红下划线）──
  const navLinks = Array.from(document.querySelectorAll('.site-nav a[href^="#panel-"]'));
  const navIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = '#' + e.target.id;
      navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === id));
      if (history.replaceState) history.replaceState(null, '', id);
    });
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  function bindNavHighlight() {
    PANELS.forEach((p) => {
      const el = document.getElementById(p.id);
      if (el) navIO.observe(el);
    });
  }

  // ── 数据缓存（同一 key 只 fetch 一次）──
  const cache = {};
  async function loadData(key) {
    if (cache[key]) return cache[key];
    const url = DATA[key];
    const p = AK.fetchJSON(url).then((d) => {
      cache[key] = d;
      return d;
    });
    cache[key] = p;
    return p;
  }

  /** 面板「数据截至」：从该面板 JSON 的 generated / asOf / updated 取，禁止硬编码 */
  function applyAsOf(panelId, d) {
    if (!d || typeof d !== 'object') return;
    const v = d.generated || d.asOf || d.updated;
    if (!v) return;
    const el = document.querySelector('#' + panelId + ' .panel-asof');
    if (el) el.textContent = '数据截至 ' + String(v).slice(0, 10);
  }

  async function init() {
    try {
      // ── 首屏立即加载：Banner + 申万热力图（轻量）──
      const [bannerRes, heatmapRes] = await Promise.allSettled([
        loadData('banner'),
        loadData('heatmap')
      ]);

      const asOfList = [];
      [bannerRes, heatmapRes].forEach((p) => {
        if (p.status === 'fulfilled') {
          const d = p.value;
          if (d && d.generated) asOfList.push(String(d.generated).slice(0, 10));
          if (d && d.asOf) asOfList.push(d.asOf);
        }
      });

      // 顶部动态 Banner
      try {
        if (bannerRes.status === 'fulfilled' && bannerRes.value && window.BN_render) {
          window.BN_render(bannerRes.value);
        }
      } catch (e) { console.error('[banner]', e); }

      // 顶部新鲜度
      AK.renderFreshness(asOfList);

      // 申万热力图（首屏）
      try {
        if (heatmapRes.status === 'fulfilled') renderHeatmap(heatmapRes.value);
        else showPanelError('panel-heatmap', '热力图数据加载失败');
      } catch (e) {
        console.error('[heatmap]', e);
        showPanelError('panel-heatmap', '热力图渲染失败：' + e.message);
      }

      // 损失表（同一份 sw_returns）
      if (window.SW_drawLossTable) {
        try { renderLossTable(); } catch (e) { console.error('[loss]', e); }
      }

      // ── 懒加载引擎：面板进入视口（提前 600px 预载）→ 拉数据 → 渲染 ──
      const loaded = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const panel = PANELS.find((p) => p.id === entry.target.id);
          if (!panel || loaded.has(panel.id)) return;
          loaded.add(panel.id);
          loadPanel(panel);
        });
      }, { rootMargin: '600px 0px' });

      PANELS.forEach((p) => {
        const el = document.getElementById(p.id);
        if (el) io.observe(el);
      });

      // 兜底：所有面板都已在视口内但 observer 未触发时，直接渲染剩余面板
      PANELS.forEach((p) => {
        if (!loaded.has(p.id)) {
          const el = document.getElementById(p.id);
          if (el && el.getBoundingClientRect().top < window.innerHeight + 600) {
            loaded.add(p.id);
            loadPanel(p);
          }
        }
      });
    } catch (err) {
      console.error('[A股看板] 初始化失败', err);
      showPanelError('panel-heatmap', '初始化失败：' + err.message);
    }
  }

  async function loadPanel(panel) {
    try {
      const d = await loadData(panel.key);
      if (!d) { showPanelError(panel.id, panel.key + ' 数据加载失败'); return; }
      panel.render(d);
      applyAsOf(panel.id, d);
    } catch (e) {
      console.error('[' + panel.id + ']', e);
      showPanelError(panel.id, '数据渲染失败：' + e.message);
    }
  }

  function renderHeatmap(raw) {
    const canvas = document.getElementById('heatmap');
    if (!canvas) return;
    applyAsOf('panel-heatmap', raw);
    // 原始 JSON → heatmap.js 期望的 { years, rows, metricsMeta } 结构
    const full = normalizeHeatmap(raw);
    let cur = full;
    const draw = (opts) => window.SW_drawHeatmap(canvas, cur, opts);

    // 手机端年份截断：默认近 5 年，可切「全部年份」（桌面自动隐藏）
    const segEl = document.createElement('div');
    segEl.className = 'hm-range-seg';
    segEl.innerHTML = '<button type="button" data-r="5">近5年</button><button type="button" data-r="all" class="on">全部年份</button>';
    const wrap = canvas.parentElement;
    if (wrap) wrap.insertBefore(segEl, canvas);
    segEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (b.dataset.r === '5') {
        const n = Math.min(5, full.years.length);
        cur = { ...full, years: full.years.slice(-n), rows: full.rows.map((r) => ({ ...r, rets: (r.rets || []).slice(-n) })) };
      } else {
        cur = full;
      }
      draw({ exportMode: false, scale: window.devicePixelRatio || 1 });
    });
    if (window.innerWidth <= 768) {
      segEl.style.display = 'inline-flex';
      segEl.querySelector('button[data-r="5"]').click();
    } else {
      segEl.style.display = 'none';
    }
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });

    // 导出按钮（热力图 exportMode 自带标题，只补来源）
    const be = document.getElementById('btnExportHeatmap');
    if (be && !be.__bound) {
      be.__bound = true;
      const orig = be.innerHTML;
      be.addEventListener('click', async () => {
        be.disabled = true; be.textContent = '…';
        try {
          await window.AK.exportPNG(canvas, 3000, '申万行业热力图.png',
            (off) => window.SW_drawHeatmap(off, payload, { exportMode: true, scale: 1 }),
            { noHeader: true, source: '数据来源：A股看板 · ashare.laoqianriritan.com' });
          be.textContent = '✓';
        } catch (e) { console.error(e); be.textContent = '!'; }
        setTimeout(() => { be.disabled = false; be.innerHTML = orig; }, 1200);
      });
    }
  }

  function normalizeHeatmap(raw) {
    const years = [...raw.years.map(String), '2026*'];
    const metricsMeta = raw.metrics_meta && raw.metrics_meta.columns
      ? raw.metrics_meta.columns
      : [];
    // sw_returns.json 的 data 为 { 行业名: {rets, ytd2026, metrics} }，转成数组并追加 2026 YTD + CAGR 列
    const order = window.SW_ROW_ORDER || Object.keys(raw.data || {});
    const rows = order.map((name) => {
      const item = (raw.data || {})[name];
      if (!item) return null;
      const rets = [...(item.rets || [])];
      rets.push(item.ytd2026 !== undefined && item.ytd2026 !== null ? item.ytd2026 : null);
      const metrics = metricsMeta.map((col) =>
        item.metrics && item.metrics[col.key] !== undefined ? item.metrics[col.key] : null
      );
      return { name, rets, metrics };
    }).filter(Boolean);
    return { years, rows, metricsMeta };
  }

  function renderLossTable() {
    const canvas = document.getElementById('lossTable');
    if (!canvas) return;
    // 数据截至：与热力图同源 sw_returns.json
    loadData('heatmap').then((d) => applyAsOf('panel-loss', d)).catch(() => {});
    const draw = (opts) => window.SW_drawLossTable(canvas, opts);
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });

    // 导出按钮（抄底数学题 exportMode 自带标题，只补来源）
    const be = document.getElementById('btnExportLossTable');
    if (be && !be.__bound) {
      be.__bound = true;
      const orig = be.innerHTML;
      be.addEventListener('click', async () => {
        be.disabled = true; be.textContent = '…';
        try {
          await window.AK.exportPNG(canvas, 3000, '抄底数学题.png',
            (off) => window.SW_drawLossTable(off, { exportMode: true, scale: 1 }),
            { noHeader: true, source: '数据来源：A股看板 · ashare.laoqianriritan.com' });
          be.textContent = '✓';
        } catch (e) { console.error(e); be.textContent = '!'; }
        setTimeout(() => { be.disabled = false; be.innerHTML = orig; }, 1200);
      });
    }
  }

  function showPanelError(panelId, msg) {
    const el = document.getElementById(panelId);
    if (!el) return;
    const body = el.querySelector('.panel-body');
    if (!body) return;
    body.innerHTML = '<div class="panel-error">⚠ ' + msg + '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindNavHighlight(); init(); });
  } else {
    bindNavHighlight();
    init();
  }
})();
