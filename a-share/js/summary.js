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
    { title: '普通人投资的三种「合适」', anchor: 'panel-three-clocks', dataKey: null, render: 'threeClocksSvg' },
    { title: '指标地图', anchor: 'panel-superhorizon', dataKey: null, render: 'superhorizonSvg' },
    { title: '申万一级行业年度涨跌幅 · 长期 CAGR', anchor: 'panel-heatmap', dataKey: 'heatmap', render: 'renderHeatmap' },
    { title: '行业买入体验模拟器', anchor: 'panel-buy-sim', dataKey: 'heatmap', render: 'renderBuySim' },
    { title: '长期持有某个行业，体验就会变好吗？', anchor: 'panel-hold-win', dataKey: 'heatmap', render: 'renderHoldWin' },
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

  /** 指标散点图：静态示意图（横轴相关性 / 纵轴时滞） */
  function superhorizonSvg(host) {
    const dots = [[150,70,'#5AAEF3'],[210,92,'#5AAEF3'],[300,78,'#5AAEF3'],[380,110,'#5AAEF3'],
                  [170,150,'#E65A56'],[240,166,'#E65A56'],[330,148,'#E65A56'],[410,162,'#E65A56'],
                  [220,210,'#888888'],[300,224,'#888888'],[390,205,'#888888']];
    let svg = '<svg viewBox="0 0 560 280" style="width:100%;height:100%;display:block">' +
      '<rect width="560" height="280" fill="#fff"/>' +
      '<rect x="120" y="40" width="400" height="80" fill="rgba(90,174,243,.10)"/>' +
      '<rect x="120" y="120" width="400" height="70" fill="rgba(230,90,86,.07)"/>' +
      '<rect x="120" y="190" width="400" height="50" fill="rgba(136,136,136,.05)"/>' +
      '<line x1="120" y1="185" x2="520" y2="185" stroke="#BBBBBB" stroke-dasharray="6 4" stroke-width="1"/>';
    dots.forEach(([x,y,c]) => { svg += '<circle cx="'+x+'" cy="'+y+'" r="4.5" fill="'+c+'"/>'; });
    svg += '<text x="120" y="262" font-size="10" fill="#B0B4BC">相关性 →</text>' +
      '<text x="520" y="262" font-size="10" fill="#B0B4BC" text-anchor="end">29 个指标</text>' +
      '</svg>';
    host.innerHTML = svg;
  }

  /** 三种「合适」：静态示意图，无数据 → 内联 SVG 线稿缩略（储蓄阶梯 / 牛熊波浪 / 恐贪表盘） */
  function threeClocksSvg(host) {
    let stairs = 'M30 230', x = 30, y = 230;
    for (let i = 0; i < 12; i++) { y -= 10; stairs += ` L${x} ${y}`; x += 11; stairs += ` L${x} ${y}`; }
    let wave = '';
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, v = Math.sin(2 * Math.PI * (t * 2.2 + 0.08));
      const yy = 150 - (v > 0 ? v * v * 70 : -Math.pow(-v, 0.6) * 38);
      wave += (i ? ' L' : 'M') + (200 + t * 160).toFixed(1) + ' ' + yy.toFixed(1);
    }
    let ticks = '';
    for (let k = 0; k < 24; k++) {
      const a = Math.PI + (k + 0.5) / 24 * Math.PI, c = Math.cos(a), s = Math.sin(a);
      ticks += `<line x1="${(465 + 52 * c).toFixed(1)}" y1="${(200 + 52 * s).toFixed(1)}" x2="${(465 + 64 * c).toFixed(1)}" y2="${(200 + 64 * s).toFixed(1)}" stroke="${k < 12 ? '#8F8E86' : '#22211F'}" stroke-width="2" stroke-linecap="round"/>`;
    }
    host.innerHTML =
      '<svg viewBox="0 0 560 280" style="width:100%;height:100%;display:block">' +
      '<rect width="560" height="280" fill="#fff"/>' +
      '<line x1="186" y1="50" x2="186" y2="250" stroke="#e5e5e5" stroke-dasharray="5 5"/>' +
      '<line x1="380" y1="50" x2="380" y2="250" stroke="#e5e5e5" stroke-dasharray="5 5"/>' +
      `<path d="${stairs}" fill="none" stroke="#22211F" stroke-width="2.5" stroke-linejoin="round"/>` +
      '<line x1="162" y1="240" x2="162" y2="80" stroke="#F5572F" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M162 80 L186 88 L162 96 Z" fill="#F5572F"/>' +
      '<line x1="196" y1="150" x2="366" y2="150" stroke="#C0BFB7" stroke-dasharray="5 5"/>' +
      `<path d="${wave}" fill="none" stroke="#22211F" stroke-width="2.5" stroke-linejoin="round"/>` +
      ticks +
      '<line x1="465" y1="200" x2="498" y2="166" stroke="#F5572F" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="465" cy="200" r="6" fill="#fff" stroke="#22211F" stroke-width="2"/>' +
      '<text x="280" y="40" font-size="13" fill="#9a9a9a" text-anchor="middle">储蓄 · 周期 · 心理承受力</text>' +
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
      a.href = c.href || ('index.html#' + c.anchor);
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
          if (c.render === 'superhorizonSvg') {
            superhorizonSvg(body);
            return;
          }
          if (c.render === 'threeClocksSvg') {
            threeClocksSvg(body);
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
        grid.innerHTML = '<div style="text-align:center;color:#767676;padding:60px 0;font-size:14px;grid-column:1/-1;">汇总生成失败：' + err.message + '</div>';
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
