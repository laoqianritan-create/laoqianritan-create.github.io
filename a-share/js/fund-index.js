/**
 * 面板 12：神奇择时指标（中证A500全收益 vs 偏债混合基金指数）
 * 数据：fund_index.json { series: { 'A500TR.CSI': {dates, values}, '885003.WI': {dates, values} } }
 * 展示：两类资产净值（2005 起点 = 100），对数坐标，末端 CAGR
 * 思路：A股宽基全收益 vs 偏债混合的相对强弱 = 股债配置的择时温度计
 */
(function () {
  'use strict';

  const C_A500 = '#5AAEF3';   // 蓝
  const C_DEBT = '#333333';   // 深灰

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 640;
    const padL = exportMode ? 190 : 96;
    const padR = exportMode ? 200 : 118;
    const padT = exportMode ? 220 : 60;
    const padB = exportMode ? 110 : 46;

    canvas.width = W * scale;
    canvas.height = H * scale;
    if (!exportMode) {
      canvas.style.width = '100%';
      canvas.style.maxWidth = W + 'px';
      canvas.style.height = 'auto';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const a = data.series && data.series['A500TR.CSI'];
    const d = data.series && data.series['885003.WI'];
    if (!a || !d) return;

    // 统一日期轴（公共起点 2005-01-04 起）
    const t0 = '2005-01-04';
    const aIdx0 = a.dates.findIndex((x) => x >= t0);
    const dIdx0 = d.dates.findIndex((x) => x >= t0);
    if (aIdx0 < 0 || dIdx0 < 0) return;
    const aD = a.dates.slice(aIdx0);
    const dD = d.dates.slice(dIdx0);
    const master = [];
    for (const x of aD) master.push(x);
    for (const x of dD) if (!master.includes(x)) master.push(x);
    master.sort();
    const n = master.length;

    const aMap = new Map(); for (let i = aIdx0; i < a.dates.length; i++) aMap.set(a.dates[i], a.values[i]);
    const dMap = new Map(); for (let i = dIdx0; i < d.dates.length; i++) dMap.set(d.dates[i], d.values[i]);
    const aBase = a.values[aIdx0] || 1, dBase = d.values[dIdx0] || 1;
    const aNorm = master.map((dt) => (aMap.has(dt) ? aMap.get(dt) / aBase * 100 : null));
    const dNorm = master.map((dt) => (dMap.has(dt) ? dMap.get(dt) / dBase * 100 : null));

    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
    let yMin = Infinity, yMax = -Infinity;
    aNorm.concat(dNorm).forEach((v) => { if (v !== null && v > 0) { const lv = Math.log(v); if (lv < yMin) yMin = lv; if (lv > yMax) yMax = lv; } });
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    const yPad = (yMax - yMin) * 0.05 || 0.1; yMin -= yPad; yMax += yPad;
    const ys = (v) => padT + (1 - (Math.log(v) - yMin) / (yMax - yMin)) * (H - padT - padB);

    // 网格（对数）
    const gridLevels = [100, 200, 400, 800, 1600, 3200];
    ctx.lineWidth = 1;
    gridLevels.forEach((lv) => {
      if (lv < Math.exp(yMin) || lv > Math.exp(yMax)) return;
      const y = ys(lv);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${lv}`, padL - 12, y);
    });

    // x 轴年份
    const yearTicks = new Set();
    master.forEach((dt, i) => {
      const y = dt.slice(0, 4);
      if ((i === 0 || y !== master[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('神奇择时指标', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('中证A500全收益 vs 偏债混合基金指数 · 2005 起点 = 100 · 纵轴对数', W / 2, 160);
    }

    // 曲线（偏债先画、A500 后画）
    function poly(norm, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      for (let i = 0; i < n; i++) {
        const v = norm[i];
        if (v === null || v === undefined || Number.isNaN(v) || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    poly(dNorm, C_DEBT, exportMode ? 4 : 1.8);
    poly(aNorm, C_A500, exportMode ? 5 : 2.2);

    // 末端 CAGR 标签（防重叠）
    const cagr = (norm) => {
      let li = -1;
      for (let i = n - 1; i >= 0; i--) { if (norm[i] !== null && norm[i] > 0) { li = i; break; } }
      if (li < 0) return null;
      let fi = -1;
      for (let i = 0; i <= li; i++) { if (norm[i] !== null && norm[i] > 0) { fi = i; break; } }
      if (fi < 0) return null;
      const v0 = norm[fi], v1 = norm[li];
      const y0 = Date.parse(master[fi]), y1 = Date.parse(master[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      return { x: xs(li), y: ys(v1), cagr: (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0, v1 };
    };
    const eA = cagr(aNorm), eD = cagr(dNorm);
    const ends = [];
    if (eA) ends.push({ ...eA, color: C_A500 });
    if (eD) ends.push({ ...eD, color: C_DEBT });
    ends.sort((p, q) => q.y - p.y);
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    const used = [];
    ends.forEach((e, i) => {
      const txt = `${(e.cagr * 100).toFixed(1)}%`;
      const tw = ctx.measureText(txt).width;
      const side = (i === 0) ? 1 : -1;
      const bx = side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12) - tw;
      const ha = side === 1 ? 'left' : 'right';
      let dy = 0;
      for (let k = 0; k < 20; k++) {
        const cand = e.y + dy;
        if (!used.some((u) => Math.abs(u - cand) < (exportMode ? 34 : 16) * 1.2)) break;
        dy = (k % 2 === 0) ? dy - (exportMode ? 34 : 16) : dy + (exportMode ? 34 : 16);
      }
      const labelY = e.y + dy;
      used.push(labelY);
      const dotColor = (e.color === '#E65A56') ? '#5AAEF3' : '#E65A56';
      ctx.fillStyle = dotColor;
      ctx.beginPath(); ctx.arc(e.x, e.y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x + (side === 1 ? (exportMode ? 8 : 6) : -(exportMode ? 8 : 6)), e.y);
      ctx.lineTo(side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12), labelY);
      ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.textAlign = ha; ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx, labelY);
    });

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 245 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const aLast = aNorm[n - 1], dLast = dNorm[n - 1];
    const items = [
      { c: C_A500, label: `中证A500全收益  ${aLast !== null ? aLast.toFixed(0) : '—'}` },
      { c: C_DEBT, label: `偏债混合基金  ${dLast !== null ? dLast.toFixed(0) : '—'}` },
    ];
    let lx = lx0;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly0 - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.label, lx + (exportMode ? 56 : 24), ly0);
      lx += ctx.measureText(it.label).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${(data.generated || '').slice(0, 10)} · A500 全收益（Wind）· 885003 偏债混合基金指数（Wind）`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // hover（屏幕版）
    if (!exportMode && opts.bindHover !== false) {
      canvas.__fdData = { master, aNorm, dNorm, xs };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__fdData;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const idx = Math.max(0, Math.min(D.master.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.master.length - 1))));
          let html = `<b>${D.master[idx]}</b><br>`;
          if (D.aNorm[idx] !== null) html += `<span style="color:${C_A500}">●</span> A500全收益：<b>${D.aNorm[idx].toFixed(1)}</b><br>`;
          if (D.dNorm[idx] !== null) html += `<span style="color:${C_DEBT}">●</span> 偏债混合：<b>${D.dNorm[idx].toFixed(1)}</b>`;
          window.AK.tooltip.show(ev, html.replace(/<br>$/, ''));
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.FI_render = function (data) {
    const wrap = document.getElementById('panelFundBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'fundIndex';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      fundIndex: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
