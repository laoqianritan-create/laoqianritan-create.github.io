/**
 * A股恐贪指数面板（面板 9）
 * 数据：fear_greed.json { series: { fear_greed: {dates, values}, csi_all: {dates, values} } }
 * 展示：恐贪指数 0-100（左轴，含分档色带）+ 中证全指（右轴，红涨绿跌），hover 数值
 */
(function () {
  'use strict';

  const FG_COLOR = '#333333';      // 恐贪线（深灰）
  const CSI_COLOR = '#E65A56';     // 中证全指（红，红涨）

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1400 : 640;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 200 : 108;
    const padT = exportMode ? 200 : 52;
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

    const fg = data.series.fear_greed;
    const csi = data.series.csi_all;
    const dates = fg.dates;
    const n = dates.length;
    if (!n) return;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // 恐贪 y（0-100 固定）
    const yFg = (v) => padT + (1 - v / 100) * (H - padT - padB);
    // 中证全指 y（数据范围）
    const csiVals = csi.values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    let cMin = Math.min(...csiVals), cMax = Math.max(...csiVals);
    const cPad = (cMax - cMin) * 0.05 || 1;
    cMin -= cPad; cMax += cPad;
    const yCsi = (v) => padT + (1 - (v - cMin) / (cMax - cMin)) * (H - padT - padB);

    // ── 分档色带（恐贪：低=恐慌 红系，高=贪婪 绿系）──
    const bands = [
      { lo: 0, hi: 25, c: '#E65A56', a: exportMode ? 0.14 : 0.10, label: '极度恐慌' },
      { lo: 25, hi: 45, c: '#E65A56', a: exportMode ? 0.09 : 0.06, label: '恐慌' },
      { lo: 45, hi: 55, c: '#999999', a: exportMode ? 0.08 : 0.06, label: '中性' },
      { lo: 55, hi: 75, c: '#30CB13', a: exportMode ? 0.09 : 0.06, label: '贪婪' },
      { lo: 75, hi: 100, c: '#30CB13', a: exportMode ? 0.14 : 0.10, label: '极度贪婪' },
    ];
    bands.forEach((b) => {
      ctx.fillStyle = b.c;
      ctx.globalAlpha = b.a;
      ctx.fillRect(padL, yFg(b.hi), W - padL - padR, yFg(b.lo) - yFg(b.hi));
      ctx.globalAlpha = 1;
    });

    // ── 网格 + 恐贪刻度 ──
    ctx.lineWidth = 1;
    for (let g = 0; g <= 100; g += 25) {
      const y = yFg(g);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(g), padL - 12, y);
    }
    // 右轴（中证全指刻度，红）
    ctx.fillStyle = CSI_COLOR;
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach((f) => {
      const v = cMin + (cMax - cMin) * f;
      const y = padT + (1 - f) * (H - padT - padB);
      ctx.fillText(v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toFixed(0), W - padR + 12, y);
    });

    // x 轴年份
    const yearTicks = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
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
      ctx.fillText('A股恐贪指数', W / 2, 88);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('0 恐慌 — 100 贪婪 · 叠加中证全指', W / 2, 158);
    }

    // ── 曲线 ──
    function poly(values, xf, yf, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined || Number.isNaN(v)) { started = false; continue; }
        const x = xf(i), y = yf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    poly(fg.values, xs, yFg, FG_COLOR, exportMode ? 5 : 2);
    poly(csi.values, xs, yCsi, CSI_COLOR, exportMode ? 4 : 1.6);

    // 末端点 + 最新值标签
    const fgLast = fg.values[n - 1], csiLast = csi.values[n - 1];
    if (fgLast !== null) {
      const x = xs(n - 1), y = yFg(fgLast);
      ctx.fillStyle = '#5AAEF3';
      ctx.beginPath(); ctx.arc(x, y, exportMode ? 10 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = FG_COLOR;
      ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${fgLast.toFixed(1)}`, x + (exportMode ? 18 : 12), y);
    }
    if (csiLast !== null) {
      const x = xs(n - 1), y = yCsi(csiLast);
      ctx.fillStyle = '#30CB13';
      ctx.beginPath(); ctx.arc(x, y, exportMode ? 8 : 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = CSI_COLOR;
      ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(csiLast >= 10000 ? (csiLast / 10000).toFixed(2) + '万' : csiLast.toFixed(0), x - (exportMode ? 18 : 12), y);
    }

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 225 : 18;
    const lh = exportMode ? 46 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const items = [
      { c: FG_COLOR, label: `A股恐贪指数  ${fgLast !== null ? fgLast.toFixed(1) : '—'}` },
      { c: CSI_COLOR, label: `中证全指  ${csiLast !== null ? (csiLast >= 10000 ? (csiLast / 10000).toFixed(2) + '万' : csiLast.toFixed(0)) : '—'}` },
    ];
    let lx = lx0, ly = ly0;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.label, lx + (exportMode ? 56 : 24), ly);
      lx += ctx.measureText(it.label).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${(data.generated || '').slice(0, 10)} · A股恐贪指数：百分位网 6 子指标加权（日更）· 中证全指 000985`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // ── hover 悬浮（屏幕版）──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__fgData = { fg, csi, dates, yFg, yCsi, xs };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__fgData;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const idx = Math.max(0, Math.min(D.dates.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.dates.length - 1))));
          const fv = D.fg.values[idx], cv = D.csi.values[idx];
          let html = `<b>${D.dates[idx]}</b><br>`;
          if (fv !== null && fv !== undefined) html += `<span style="color:#333">●</span> 恐贪指数：<b>${fv.toFixed(1)}</b><br>`;
          if (cv !== null && cv !== undefined) html += `<span style="color:#E65A56">●</span> 中证全指：<b>${cv.toFixed(0)}</b>`;
          window.AK.tooltip.show(ev, html.replace(/<br>$/, ''));
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.FG_render = function (data) {
    const wrap = document.getElementById('panelFearBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'fearGreed';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      fearGreed: (off, scale) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
