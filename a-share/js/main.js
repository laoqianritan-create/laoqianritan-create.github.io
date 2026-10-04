/**
 * A股看板 · 主控
 * 加载全部面板数据 → 渲染新鲜度 → 逐面板渲染 → 绑定导出
 */
(function () {
  'use strict';

  const AK = window.AK;

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
    coverage: 'data/coverage.json'
  };

  async function init() {
    try {
      // 并行加载核心数据（热力图失败不阻塞其他面板）
      const payloads = await Promise.allSettled(
        Object.entries(DATA).map(([k, url]) => AK.fetchJSON(url).then((d) => [k, d]))
      );
      const data = {};
      const asOfList = [];
      payloads.forEach((p) => {
        if (p.status === 'fulfilled') {
          const [k, d] = p.value;
          data[k] = d;
          if (d && d.generated) asOfList.push(String(d.generated).slice(0, 10));
          if (d && d.asOf) asOfList.push(d.asOf);
        } else {
          console.warn('[A股看板] 数据加载失败:', p.reason && p.reason.message);
        }
      });

      // 顶部新鲜度
      AK.renderFreshness(asOfList);

      // 各面板渲染（缺失数据的面板显示占位；单个面板报错不阻断其余）
      try { if (data.heatmap) renderHeatmap(data.heatmap); else showPanelError('panel-heatmap', '热力图数据加载失败'); }
      catch (e) { console.error('[heatmap]', e); showPanelError('panel-heatmap', '热力图渲染失败：' + e.message); }

      if (window.SW_drawLossTable) {
        try { renderLossTable(); } catch (e) { console.error('[loss]', e); }
      }

      try {
        if (data.longgrowth && window.LG_render) window.LG_render(data.longgrowth);
        else if (!data.longgrowth) showPanelError('panel-long', '长周期数据加载失败');
      } catch (e) { console.error('[longgrowth]', e); showPanelError('panel-long', '长周期渲染失败：' + e.message); }

      try {
        if (data.industry && window.IH_render) window.IH_render(data.industry);
        else if (!data.industry) showPanelError('panel-industry', '行业热度数据加载失败');
      } catch (e) { console.error('[industry]', e); showPanelError('panel-industry', '行业热度渲染失败：' + e.message); }

      try {
        if (data.turnover && window.MT_render) window.MT_render(data.turnover);
        else if (!data.turnover) showPanelError('panel-turnover', '成交换手数据加载失败');
      } catch (e) { console.error('[turnover]', e); showPanelError('panel-turnover', '成交换手渲染失败：' + e.message); }

      try {
        if (data.returnDecomp && window.RD_render) window.RD_render(data.returnDecomp);
        else if (!data.returnDecomp) showPanelError('panel-return', '收益拆解数据加载失败');
      } catch (e) { console.error('[return]', e); showPanelError('panel-return', '收益拆解渲染失败：' + e.message); }

      try {
        if (data.investor && window.IS_render) window.IS_render(data.investor);
        else if (!data.investor) showPanelError('panel-investor', '投资者结构数据加载失败');
      } catch (e) { console.error('[investor]', e); showPanelError('panel-investor', '投资者结构渲染失败：' + e.message); }

      try {
        if (data.huazheng && window.HZ_render) window.HZ_render(data.huazheng);
        else if (!data.huazheng) showPanelError('panel-huazheng', '华证六因子数据加载失败');
      } catch (e) { console.error('[huazheng]', e); showPanelError('panel-huazheng', '华证六因子渲染失败：' + e.message); }

      try {
        if (data.fearGreed && window.FG_render) window.FG_render(data.fearGreed);
        else if (!data.fearGreed) showPanelError('panel-fear', '恐贪指数数据加载失败');
      } catch (e) { console.error('[feargreed]', e); showPanelError('panel-fear', '恐贪指数渲染失败：' + e.message); }

      try {
        if (data.fundIndex && window.FI_render) window.FI_render(data.fundIndex);
        else if (!data.fundIndex) showPanelError('panel-fund', '基金指数数据加载失败');
      } catch (e) { console.error('[fundindex]', e); showPanelError('panel-fund', '基金指数渲染失败：' + e.message); }

      try {
        if (data.coverage && window.CV_render) window.CV_render(data.coverage);
        else if (!data.coverage) showPanelError('panel-coverage', '宽基覆盖数据加载失败');
      } catch (e) { console.error('[coverage]', e); showPanelError('panel-coverage', '宽基覆盖渲染失败：' + e.message); }

    } catch (err) {
      console.error('[A股看板] 初始化失败', err);
      showPanelError('panel-heatmap', '初始化失败：' + err.message);
    }
  }

  function renderHeatmap(raw) {
    const canvas = document.getElementById('heatmap');
    if (!canvas) return;
    // 原始 JSON → heatmap.js 期望的 { years, rows, metricsMeta } 结构
    const payload = normalizeHeatmap(raw);
    const draw = (opts) => window.SW_drawHeatmap(canvas, payload, opts);
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw({ exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    const btn = document.getElementById('btnExportHeatmap');
    if (btn) {
      btn.addEventListener('click', async () => {
        const orig = btn.innerHTML;
        btn.disabled = true; btn.textContent = '…';
        try {
          await AK.exportPNG(canvas, 3000, '申万一级行业年度涨跌幅_2005-2026.png', (off, scale) => {
            window.SW_drawHeatmap(off, payload, { exportMode: true, scale: 1, ytdAsOf: payload.ytdAsOf });
          });
          btn.textContent = '✓';
        } catch (e) {
          console.error(e); btn.textContent = '!';
        }
        setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 1200);
      });
    }
  }

  // 原始 sw_returns.json → heatmap.js 结构（与 data.js SW_loadData 同逻辑）
  function normalizeHeatmap(raw) {
    const yearsBase = (raw.years || []).map(String);
    const years = [...yearsBase, '2026*'];
    const metricsMeta = raw.metrics_meta && raw.metrics_meta.columns ? raw.metrics_meta.columns : [];
    const names = window.SW_ROW_ORDER && window.SW_ROW_ORDER.length
      ? window.SW_ROW_ORDER : Object.keys(raw.data || {});
    const rows = names.map((name) => {
      const item = raw.data[name];
      if (!item) throw new Error('数据缺少行业: ' + name);
      const rets = [...(item.rets || [])];
      rets.push(item.ytd2026 !== undefined && item.ytd2026 !== null ? item.ytd2026 : null);
      const metrics = metricsMeta.map((col) =>
        item.metrics && item.metrics[col.key] !== undefined ? item.metrics[col.key] : null);
      return { name, rets, metrics };
    });
    return { years, rows, metricsMeta, updated: raw.updated || null, ytdAsOf: raw.ytd_as_of || null };
  }

  function renderLossTable() {
    const canvas = document.getElementById('lossTable');
    if (!canvas) return;
    const draw = (opts) => window.SW_drawLossTable(canvas, opts);
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw({ exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    const btn = document.getElementById('btnExportLossTable');
    if (btn) {
      btn.addEventListener('click', async () => {
        const orig = btn.innerHTML;
        btn.disabled = true; btn.textContent = '…';
        try {
          await AK.exportPNG(canvas, 3000, '关于抄底的一道基础数学题.png', (off) => {
            window.SW_drawLossTable(off, { exportMode: true, scale: 1 });
          });
          btn.textContent = '✓';
        } catch (e) {
          console.error(e); btn.textContent = '!';
        }
        setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 1200);
      });
    }
  }

  function showPanelError(panelId, msg) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const body = panel.querySelector('.panel-body');
    if (body) {
      body.innerHTML = `<div style="padding:30px;text-align:center;color:#E65A56;font-size:13px;">${msg}<br>
        <small style="color:#999;">请刷新重试，或联系老钱</small></div>`;
    }
  }

  AK.fontsReady().then(init);
})();
