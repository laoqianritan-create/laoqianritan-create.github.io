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
    wideBase: 'data/wide_base.json'
  };

  // ── 面板注册表：进入视口 → 拉数据 → 渲染（timing 与 fund 共用 fund_index.json）──
  const PANELS = [
    { id: 'panel-long',      key: 'longgrowth',    render: (d) => window.LG_render(d) },
    { id: 'panel-industry',  key: 'industry',      render: (d) => window.IH_render(d) },
    { id: 'panel-turnover',  key: 'turnover',      render: (d) => window.MT_render(d) },
    { id: 'panel-return',    key: 'returnDecomp',  render: (d) => window.RD_render(d) },
    { id: 'panel-investor',  key: 'investor',      render: (d) => window.IS_render(d) },
    { id: 'panel-huazheng',  key: 'huazheng',      render: (d) => window.HZ_render(d) },
    { id: 'panel-fear',      key: 'fearGreed',     render: (d) => window.FG_render(d) },
    { id: 'panel-fund',      key: 'fundIndex',     render: (d) => window.FI_render(d) },
    { id: 'panel-coverage',  key: 'coverage',      render: (d) => window.CV_render(d) },
    { id: 'panel-timing',    key: 'fundIndex',     render: (d) => window.TM_render(d) },
    { id: 'panel-widebase',  key: 'wideBase',      render: (d) => window.WB_render(d) }
  ];

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
    } catch (e) {
      console.error('[' + panel.id + ']', e);
      showPanelError(panel.id, '数据渲染失败：' + e.message);
    }
  }

  function renderHeatmap(raw) {
    const canvas = document.getElementById('heatmap');
    if (!canvas) return;
    // 原始 JSON → heatmap.js 期望的 { years, rows, metricsMeta } 结构
    const payload = normalizeHeatmap(raw);
    const draw = (opts) => window.SW_drawHeatmap(canvas, payload, opts);
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });
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
    const draw = (opts) => window.SW_drawLossTable(canvas, opts);
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });
  }

  function showPanelError(panelId, msg) {
    const el = document.getElementById(panelId);
    if (!el) return;
    const body = el.querySelector('.panel-body');
    if (!body) return;
    body.innerHTML = '<div class="panel-error">⚠ ' + msg + '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
