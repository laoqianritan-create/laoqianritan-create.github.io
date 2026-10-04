/**
 * 面板 11：偏股混合基金 3 年滚动年化
 * 数据：fund_index.json { series: { '885001.WI': {dates, values, rolling3} } }
 * 展示：885001 每日 3 年滚动年化收益（%）；>0 红 / <0 绿；0 虚线
 */
(function () {
  'use strict';

  const C_PG = '#E65A56';   // 红（正）
  const C_NEG = '#30CB13';  // 绿（负）

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

    const pg = data.series && data.series['885001.WI'];
    if (!pg) return;
    const dates = pg.dates || [];
    const rollRaw = pg.rolling3 || [];
    // rolling3 可能为 {dates, values} 对象或数组
    const roll = Array.isArray(rollRaw) ? rollRaw : (rollRaw.values || []);
    const n = Math.min(dates.length, roll.length);

    // 有效数据范围（去掉开头 null）
    let first = -1, last = -1;
    for (let i = 0; i < n; i++) {
      const v = roll[i];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (last < 0) return;

    const xs = (i) => padL + (first === last ? 0.5 : (i - first) / (last - first)) * (W - padL - padR);
    let pMin = Infinity, pMax = -Infinity;
    for (let i = first; i <= last; i++) {
      const v = roll[i];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      if (v < pMin) pMin = v;
      if (v > pMax) pMax = v;
    }
    const pad = Math.max((pMax - pMin) * 0.08, 3);
    pMin = Math.min(pMin - pad, -1); pMax = Math.max(pMax + pad, 1);
    const yP = (v) => padT + (1 - (v - pMin) / (pMax - pMin)) * (H - padT - padB);

    // 网格 + 零线
    ctx.lineWidth = 1;
    const step = Math.ceil((pMax - pMin) / 8 / 5) * 5 || 5;
    for (let g = Math.ceil(pMin / step) * step; g <= pMax; g += step) {
      const y = yP(g);
      ctx.strokeStyle = (Math.abs(g) < 1e-9) ? '#BBBBBB' : '#EDEDED';
      ctx.lineWidth = (Math.abs(g) < 1e-9) ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${g}%`, padL - 12, y);
    }
    // 0 线标注
    const y0 = yP(0);
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('0', padL + 6, y0);

    // x 轴年份
    const yearTicks = new Set();
    for (let i = first; i <= last; i++) {
      const y = dates[i].slice(0, 4);
      if ((i === first || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    }
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('偏股混合基金 3 年滚动年化', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('885001 偏股混合基金指数 · 每日近 756 个交易日（≈3 年）年化复合', W / 2, 160);
    }

    // 曲线（红正绿负）
    ctx.lineJoin = 'round';
    for (let i = first; i <= last; i++) {
      const v = roll[i];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      const x = xs(i), y = yP(v);
      ctx.strokeStyle = (v >= 0) ? C_PG : C_NEG;
      ctx.lineWidth = exportMode ? 5 : 2.2;
      ctx.beginPath();
      ctx.moveTo(x - (exportMode ? 3 : 1.5), y);
      ctx.lineTo(x + (exportMode ? 3 : 1.5), y);
      ctx.stroke();
    }

    // 末端标签
    const xl = xs(last), yl = yP(roll[last]);
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.arc(xl, yl, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = (roll[last] >= 0) ? C_PG : C_NEG;
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${roll[last].toFixed(1)}%`, xl + (exportMode ? 16 : 10), yl);

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 245 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const items = [
      { c: C_PG, label: '3年滚动年化 > 0' },
      { c: C_NEG, label: '3年滚动年化 < 0' },
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
      ctx.fillText(`数据截至 ${(data.generated || '').slice(0, 10)} · 885001 偏股混合基金指数（Wind AIFin）· 756 交易日窗口年化复合`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // hover（屏幕版）
    if (!exportMode) {
      canvas.__tmData = { dates, roll, first, last, xs, yP };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__tmData;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const idx = Math.round((sx - padL) / (W - padL - padR) * (D.last - D.first)) + D.first;
          const i = Math.max(D.first, Math.min(D.last, idx));
          const v = D.roll[i];
          if (v === null || v === undefined || Number.isNaN(v)) { window.AK.tooltip.hide(); return; }
          const color = (v >= 0) ? C_PG : C_NEG;
          window.AK.tooltip.show(ev, `<b>${D.dates[i]}</b><br><span style="color:${color}">●</span> 3年滚动年化：<b>${v.toFixed(2)}%</b>`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.TM_render = function (data) {
    const wrap = document.getElementById('panelTimingBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'timing';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      timing: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
