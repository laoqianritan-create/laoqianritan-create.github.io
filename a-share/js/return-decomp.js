/**
 * 收益来源拆解面板
 * 数据：return_decomp.json { generated, indexes: [ {code, name, totalReturnPct, dividendPct, earningsPct, valuationPct} ] }
 * 展示：多宽基横向对比（分组柱：全收益 / 股息 / 盈利 / 估值），鼠标悬停查看数值
 */
(function () {
  'use strict';

  let payload = null;
  let canvasMain = null;

  const SERIES = [
    { key: 'totalReturnPct', label: '全收益', color: '#1A1A1A' },
    { key: 'dividendPct', label: '股息', color: '#5AAEF3' },
    { key: 'earningsPct', label: '盈利', color: '#6D61E4' },
    { key: 'valuationPct', label: '估值', color: '#E65A56' }
  ];

  function drawMain(canvasEl, exportMode, scale) {
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1250 : 600;
    const padL = exportMode ? 220 : 110;
    const padR = exportMode ? 120 : 60;
    const padT = exportMode ? 200 : 48;
    const padB = exportMode ? 150 : 56;

    canvasEl.width = W * scale;
    canvasEl.height = H * scale;
    if (!exportMode) {
      canvasEl.style.width = '100%';
      canvasEl.style.maxWidth = W + 'px';
      canvasEl.style.height = 'auto';
    }
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 64px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('指数长期收益来源拆解', W / 2, 78);
      ctx.fillStyle = '#555555';
      ctx.font = '300 26px NotoSansSC, sans-serif';
      ctx.fillText('2004-12-31 起 · 全收益 = 股息 + 盈利增长 + 估值变化（PE 为残差）', W / 2, 142);
    }

    const idx = payload.indexes || [];
    const n = idx.length;
    const groupW = (W - padL - padR) / n;
    const barW = groupW * 0.16;
    const gap = groupW * 0.05;

    // y 范围：min(全收益, 0) ~ max
    let vMax = 0, vMin = 0;
    idx.forEach((r) => {
      SERIES.forEach((s) => {
        const v = r[s.key];
        if (v === null || v === undefined) return;
        if (v > vMax) vMax = v;
        if (v < vMin) vMin = v;
      });
    });
    if (vMax <= vMin) { vMax = 1; vMin = 0; }
    const pad = (vMax - vMin) * 0.1 || 10;
    vMax += pad; vMin -= pad;
    const y = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * (H - padT - padB);
    const y0 = y(0);

    // 网格
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = vMin + (vMax - vMin) * g / 4;
      const yy = y(v);
      ctx.strokeStyle = '#EDEDED'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.fillText(v.toFixed(0) + '%', padL - 10, yy);
    }
    // 0 线
    ctx.strokeStyle = '#999999'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(W - padR, y0); ctx.stroke();

    // 纵向虚线分组（每 2 个指数一组：沪深300+中证500 / 中证1000+中证2000 / 中证全指+中证A500）
    ctx.strokeStyle = '#CCCCCC'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    for (let i = 1; i < n; i += 2) {
      const gx = padL + i * groupW;
      ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, H - padB); ctx.stroke();
    }
    ctx.setLineDash([]);

    // 分组柱
    idx.forEach((r, i) => {
      const gx = padL + i * groupW + groupW / 2;
      SERIES.forEach((s, si) => {
        const v = r[s.key];
        if (v === null || v === undefined) return;
        const bx = gx - barW * SERIES.length / 2 + si * (barW + gap);
        const by = y(Math.max(0, v));
        const bh = Math.abs(y(v) - y0);
        ctx.fillStyle = s.color;
        // 圆角柱（左上/右上圆角，半径随柱宽，保持克制）
        const rr = Math.max(2, Math.min(barW * 0.18, 6));
        ctx.beginPath();
        ctx.moveTo(bx, Math.min(by, y0) + Math.max(bh, 1));
        ctx.lineTo(bx, Math.min(by, y0) + rr);
        ctx.arcTo(bx, Math.min(by, y0), bx + rr, Math.min(by, y0), rr);
        ctx.lineTo(bx + barW - rr, Math.min(by, y0));
        ctx.arcTo(bx + barW, Math.min(by, y0), bx + barW, Math.min(by, y0) + rr, rr);
        ctx.lineTo(bx + barW, Math.min(by, y0) + Math.max(bh, 1));
        ctx.closePath();
        ctx.fill();
        // 数值
        ctx.fillStyle = '#333333';
        ctx.font = (exportMode ? 20 : 9.5) + 'px NotoSansSC, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = v >= 0 ? 'bottom' : 'top';
        ctx.fillText(v.toFixed(0) + '%', bx + barW / 2, v >= 0 ? by - 4 : by + 12);
      });
      // 指数名
      ctx.fillStyle = '#1a1a1a';
      ctx.font = (exportMode ? 26 : 12.5) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(r.name, gx, H - padB + 8);
    });

    // 图例（横向罗列）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly = exportMode ? 230 : 16;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 26 : 13.5) + 'px NotoSansSC, sans-serif';
    let lx = lx0;
    const lgap = exportMode ? 56 : 26;
    SERIES.forEach((s) => {
      const tw = ctx.measureText(s.label).width + (exportMode ? 48 : 20);
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 36 : 14, exportMode ? 7 : 3);
      ctx.fillStyle = '#444';
      ctx.fillText(s.label, lx + (exportMode ? 48 : 20), ly);
      lx += tw + lgap;
    });

    // ── 悬浮数值提示（屏幕版） ──
    if (!exportMode) {
      canvasEl.__rdGeom = { padL, groupW, n, idx };
      if (!canvasEl.__hoverBound) {
        canvasEl.__hoverBound = true;
        canvasEl.addEventListener('mousemove', (ev) => {
          const G = canvasEl.__rdGeom;
          if (!G) return;
          const { x } = window.AK.canvasXY(canvasEl, ev);
          const sx = x / (window.devicePixelRatio || 1);
          const gi = Math.floor((sx - G.padL) / G.groupW);
          if (gi < 0 || gi >= G.n) { window.AK.tooltip.hide(); return; }
          const r = G.idx[gi];
          let html = `<b>${r.name}</b> · 长期累计<br>`;
          SERIES.forEach((s) => {
            const v = r[s.key];
            html += `<span style="color:${s.color}">●</span> ${s.label}：<b>${v === null || v === undefined ? '—' : v.toFixed(1) + '%'}</b><br>`;
          });
          window.AK.tooltip.show(ev, html.slice(0, -4));
        });
        canvasEl.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.RD_render = function (data) {
    payload = data;
    const wrap = document.getElementById('panelReturnBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    canvasMain = document.createElement('canvas');
    canvasMain.id = 'returnDecomp';
    wrap.appendChild(canvasMain);

    drawMain(canvasMain, false, window.devicePixelRatio || 1);

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => drawMain(canvasMain, false, window.devicePixelRatio || 1));
    });

    window.AK.bindExportButtons({
      returnDecomp: (off) => drawMain(off, true, 1)
    });
  };
})();
