/**
 * A股看板 · 汇总页（summary.html）
 * 离屏渲染全部 13 个看板 → 截取缩略图 → 卡片网格。
 * 参考美债看板 /us-debt/summary/ 的汇总页形态。
 */
(function () {
  'use strict';

  const AK = window.AK;

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

  // 卡片定义：渲染后从 canvas 截缩略图；点击跳主页面锚点
  const CARDS = [
    { title: '申万一级行业年度涨跌幅 · 长期 CAGR', anchor: 'panel-heatmap' },
    { title: '关于抄底的一道基础数学题', anchor: 'panel-loss' },
    { title: '不同事物的增长情况', anchor: 'panel-long' },
    { title: '华证六因子', anchor: 'panel-huazheng' },
    { title: '行业交易热度', anchor: 'panel-industry' },
    { title: '全市场成交金额 / 换手', anchor: 'panel-turnover' },
    { title: '宽基指数覆盖范围', anchor: 'panel-coverage' },
    { title: '指数收益来源拆解', anchor: 'panel-return' },
    { title: '宽基净值走势', anchor: 'panel-widebase' },
    { title: '投资者结构', anchor: 'panel-investor' },
    { title: 'A股恐贪指数', anchor: 'panel-fear' },
    { title: '偏股混合基金滚动年化', anchor: 'panel-timing' },
    { title: '神奇择时指标', anchor: 'panel-fund' }
  ];

  function buildGrid() {
    const grid = document.getElementById('smGrid');
    CARDS.forEach((c) => {
      const a = document.createElement('a');
      a.className = 'sm-card';
      a.href = 'index.html#' + c.anchor;
      a.title = c.title;
      const img = document.createElement('img');
      img.className = 'sm-thumb';
      img.alt = c.title;
      img.loading = 'eager'; // 缩略图直接加载（避免 lazy 在部分环境不触发导致空白）
      const h3 = document.createElement('div');
      h3.className = 'sm-title';
      h3.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3L13 8L8 13M3 8H13" stroke-linecap="round" stroke-linejoin="round"/></svg>' + c.title;
      a.appendChild(img);
      a.appendChild(h3);
      grid.appendChild(a);
    });
  }

  // 缩略图：把大 canvas 缩到 640px 宽再导出（控制体积）
  function snapshot(canvas) {
    try {
      if (!canvas || !canvas.toDataURL) return null;
      const w = canvas.width, h = canvas.height;
      if (!w || !h) return null;
      const TW = 640;
      const TH = Math.max(1, Math.round((h / w) * TW));
      const c2 = document.createElement('canvas');
      c2.width = TW; c2.height = TH;
      const ctx2 = c2.getContext('2d');
      ctx2.fillStyle = '#fff';
      ctx2.fillRect(0, 0, TW, TH);
      ctx2.drawImage(canvas, 0, 0, w, h, 0, 0, TW, TH);
      return c2.toDataURL('image/png');
    } catch (e) {
      console.error('[summary] snapshot 失败', e);
      return null;
    }
  }

  // sw_returns.json data 为 {行业名: {rets,ytd2026,metrics}} 字典 → 数组
  function normalizeHeatmap(raw) {
    const years = [...raw.years.map(String), '2026*'];
    const metricsMeta = raw.metrics_meta && raw.metrics_meta.columns ? raw.metrics_meta.columns : [];
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

  async function init() {
    try {
      const payloads = await Promise.allSettled(
        Object.entries(DATA).map(([k, url]) => AK.fetchJSON(url).then((d) => [k, d]))
      );
      const data = {};
      let asOf = null;
      payloads.forEach((p) => {
        if (p.status === 'fulfilled') {
          const [k, d] = p.value;
          data[k] = d;
          if (!asOf && d && d.generated) asOf = String(d.generated).slice(0, 10);
        }
      });

      // 数据日期
      const dateEl = document.getElementById('smDate');
      if (dateEl) dateEl.textContent = asOf ? '数据截至 ' + asOf : '';

      // ── 依次离屏渲染 13 个看板 ──
      // 1. 热力图
      if (data.heatmap && window.SW_drawHeatmap) {
        window.SW_drawHeatmap(document.getElementById('heatmap'), normalizeHeatmap(data.heatmap), { exportMode: false, scale: 1 });
      }
      // 2. 抄底数学题（静态表，无数据依赖）
      if (window.SW_drawLossTable) {
        window.SW_drawLossTable(document.getElementById('lossTable'), { exportMode: false, scale: 1 });
      }
      // 3-13. 面板渲染（各自在对应 body 容器里创建 canvas）
      const renders = [
        ['longgrowth', window.LG_render], ['huazheng', window.HZ_render],
        ['industry', window.IH_render], ['turnover', window.MT_render],
        ['coverage', window.CV_render], ['returnDecomp', window.RD_render],
        ['wideBase', window.WB_render], ['investor', window.IS_render],
        ['fearGreed', window.FG_render], ['fundIndex', window.FI_render],
        ['fundIndex', window.TM_render]
      ];
      renders.forEach(([key, fn]) => {
        if (data[key] && fn) { try { fn(data[key]); } catch (e) { console.error('[summary]', key, e); } }
      });

      // ── 收集画布 → 填卡片 ──
      const canvasRefs = [
        '#heatmap',
        '#lossTable',
        '#panelLongBody canvas', '#panelHuazhengBody canvas',
        '#panelIndustryBody canvas', '#panelTurnoverBody canvas',
        '#panelCoverageBody canvas', '#panelReturnBody canvas',
        '#panelWideBaseBody canvas', '#panelInvestorBody canvas',
        '#panelFearBody canvas', '#panelTimingBody canvas',
        '#panelFundBody canvas'
      ];
      const grid = document.getElementById('smGrid');
      const cards = grid.querySelectorAll('.sm-card');
      canvasRefs.forEach((sel, i) => {
        const el = document.querySelector(sel);
        const img = cards[i] && cards[i].querySelector('img');
        if (el && img) {
          const url = snapshot(el);
          if (url) img.src = url;
        }
      });

      document.getElementById('smLoading').hidden = true;
      grid.hidden = false;
    } catch (err) {
      console.error('[summary] 初始化失败', err);
      const l = document.getElementById('smLoading');
      if (l) l.textContent = '汇总生成失败：' + err.message;
    }
  }

  buildGrid();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
