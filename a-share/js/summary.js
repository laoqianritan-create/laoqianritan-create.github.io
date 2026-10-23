/**
 * A股看板 · 汇总页（summary.html）
 * 改版（2026-10-24）：模仿美债看板 /us-debt/summary/ 的汇总页形态——
 *   卡片 = 标题 + 固定 160px 高迷你图（summary-mini.js 专门重绘），
 *   不再离屏渲染完整面板截图；单卡失败不拖垮整页。
 */
(function () {
  'use strict';

  const AK = window.AK;
  const SM = window.SM;

  const DATA = {
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

  // 卡片定义：标题 + 主页面锚点 + 迷你渲染函数名（顺序与 index.html 一致）
  const CARDS = [
    { title: '申万一级行业年度涨跌幅 · 长期 CAGR', anchor: 'panel-heatmap', dataKey: 'heatmap', render: 'renderHeatmap' },
    { title: '不同事物的增长情况', anchor: 'panel-long', dataKey: 'longgrowth', render: 'renderLonggrowth' },
    { title: '华证六因子', anchor: 'panel-huazheng', dataKey: 'huazheng', render: 'renderHuazheng' },
    { title: '宽基指数覆盖范围', anchor: 'panel-coverage', dataKey: 'coverage', render: 'renderCoverage' },
    { title: '宽基指数全收益净值', anchor: 'panel-widebase', dataKey: 'wideBase', render: 'renderWideBase' },
    { title: '主要宽基指数估值分位', anchor: 'panel-valuation', dataKey: 'valuation', render: 'renderValuation' },
    { title: '指数收益来源拆解', anchor: 'panel-return', dataKey: 'returnDecomp', render: 'renderReturnDecomp' },
    { title: '股债性价比 · 股权风险溢价', anchor: 'panel-asset', dataKey: 'assetAlloc', render: 'renderAssetAlloc' },
    { title: '关于抄底的一道基础数学题', anchor: 'panel-loss', dataKey: null, render: 'renderLossTable' },
    { title: '全市场成交金额 / 换手', anchor: 'panel-turnover', dataKey: 'turnover', render: 'renderTurnover' },
    { title: '行业交易热度', anchor: 'panel-industry', dataKey: 'industry', render: 'renderIndustry' },
    { title: '市场趋势温度', anchor: 'panel-trend', dataKey: 'trendTemp', render: 'renderTrend' },
    { title: 'A股恐贪指数', anchor: 'panel-fear', dataKey: 'fearGreed', render: 'renderFearGreed' },
    { title: '神奇择时指标', anchor: 'panel-fund', dataKey: 'fundIndex', render: 'renderFundIndex' },
    { title: '偏股混合基金滚动年化', anchor: 'panel-timing', dataKey: 'fundIndex', render: 'renderTiming' },
    { title: '投资者结构', anchor: 'panel-investor', dataKey: 'investor', render: 'renderInvestor' },
    { title: '个股走势图', anchor: 'panel-chart', dataKey: null, render: 'chartSvg' }
  ];

  const ARROW_SVG = '<svg class="sm-arrow" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 8h11M9 3.5L13.5 8 9 12.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** 个股走势：交互面板，无静态数据 → 内联 SVG 示意图（仿美债无图面板的占位思路） */
  function chartSvg(host) {
    host.innerHTML =
      '<svg viewBox="0 0 560 280" style="width:100%;height:100%;display:block">' +
      '<rect width="560" height="280" fill="#fff"/>' +
      '<rect x="150" y="96" width="260" height="26" rx="6" fill="#f4f5f7" stroke="#e0e4ea"/>' +
      '<text x="166" y="114" font-size="12" fill="#9aa0a6">输入公司名 / 6 位代码</text>' +
      '<rect x="322" y="96" width="72" height="26" rx="6" fill="#E65A56"/>' +
      '<text x="358" y="114" font-size="12" fill="#fff" text-anchor="middle">查询</text>' +
      '<polyline points="90,210 150,196 205,204 260,182 320,190 375,168 430,176 470,158" fill="none" stroke="#5AAEF3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="470" cy="158" r="4" fill="#E65A56"/>' +
      '<line x1="80" y1="228" x2="480" y2="228" stroke="#e8e8e8"/>' +
      '<text x="80" y="248" font-size="10" fill="#b0b4bc">2005</text>' +
      '<text x="275" y="248" font-size="10" fill="#b0b4bc" text-anchor="middle">任意个股 / ETF</text>' +
      '<text x="480" y="248" font-size="10" fill="#b0b4bc" text-anchor="end">今</text>' +
      '</svg>';
  }

  function buildGrid() {
    const grid = document.getElementById('smGrid');
    if (!grid) return;
    const loadEl = document.getElementById('smLoading');
    if (loadEl) loadEl.remove();

    CARDS.forEach((c) => {
      const a = document.createElement('a');
      a.className = 'sm-card';
      a.href = 'index.html#' + c.anchor;
      a.title = c.title;

      const head = document.createElement('div');
      head.className = 'sm-card-head';
      const h3 = document.createElement('h3');
      h3.textContent = c.title;
      head.appendChild(h3);
      head.insertAdjacentHTML('beforeend', ARROW_SVG);

      const body = document.createElement('div');
      body.className = 'sm-card-body';

      a.appendChild(head);
      a.appendChild(body);
      grid.appendChild(a);
    });
  }

  // fetch 带超时兜底（个别请求挂起时不让整页卡死）
  function fetchJSON(url, ms = 8000) {
    return Promise.race([
      AK.fetchJSON(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + url)), ms))
    ]);
  }

  async function init() {
    try {
      const payloads = await Promise.allSettled(
        Object.entries(DATA).map(([k, url]) => fetchJSON(url).then((d) => [k, d]))
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

      const dateEl = document.getElementById('smDate');
      if (dateEl) dateEl.textContent = asOf ? '数据截至 ' + asOf : '';

      // 逐卡渲染迷你图：单卡失败仅该卡显示提示，不拖垮整页
      const grid = document.getElementById('smGrid');
      const cards = grid.querySelectorAll('.sm-card');
      cards.forEach((card, i) => {
        const c = CARDS[i];
        if (!c) return;
        const body = card.querySelector('.sm-card-body');
        try {
          if (c.render === 'chartSvg') {
            chartSvg(body);
            return;
          }
          const fn = SM && SM[c.render];
          if (!fn) { body.innerHTML = '<div class="sm-fail">渲染器缺失</div>'; return; }
          const d = c.dataKey ? data[c.dataKey] : null;
          if (!d && c.dataKey) { body.innerHTML = '<div class="sm-fail">数据加载失败</div>'; return; }
          // 迷你渲染函数接收 (canvas, data)：统一创建 560×280 画布并挂载
          const dpr = window.devicePixelRatio || 1;
          const canvas = document.createElement('canvas');
          canvas.width = SM.W * dpr;
          canvas.height = SM.H * dpr;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.style.display = 'block';
          body.appendChild(canvas);
          fn(canvas, d);
        } catch (e) {
          console.error('[summary] 缩略图渲染失败', c.anchor, e);
          body.innerHTML = '<div class="sm-fail">缩略图渲染失败</div>';
        }
      });

      grid.setAttribute('aria-busy', 'false');
    } catch (err) {
      console.error('[summary] 初始化失败', err);
      const grid = document.getElementById('smGrid');
      if (grid) {
        grid.innerHTML = '<div style="text-align:center;color:#999;padding:60px 0;font-size:14px;grid-column:1/-1;">汇总生成失败：' + err.message + '</div>';
      }
    }
  }

  buildGrid();
  // 双保险：无论 DOMContentLoaded 是否触发，init 都会执行（防重入）
  let started = false;
  function safeInit() {
    if (started) return;
    started = true;
    init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  }
  safeInit();
})();
