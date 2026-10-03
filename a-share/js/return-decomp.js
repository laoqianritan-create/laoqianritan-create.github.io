/**
 * 收益来源拆解面板
 * 数据：return_decomp.json { generated, indexes: [ {code, name, totalReturnPct, dividendPct, earningsPct, valuationPct} ] }
 *
 * 展示：
 *  · 主图：多宽基横向对比（分组柱：全收益 / 股息 / 盈利 / 估值）
 *  · 副卡：单指数瀑布（点击/选择切换），从 0 累加 股息+盈利+估值 → 全收益
 */
(function () {
  'use strict';

  let payload = null;
  let canvasMain = null;
  let canvasWaterfall = null;
  let selectedCode = null;

  const SERIES = [
    { key: 'totalReturnPct', label: '全收益', color: '#1A1A1A' },
    { key: 'dividendPct', label: '股息', color: '#5AAEF3' },
    { key: 'earningsPct', label: '盈利', color: '#6D61E4' },
    { key: 'valuationPct', label: '估值', color: '#E65A56' }
  ];

  function drawMain(canvasEl, exportMode, scale) {
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1300 : 620;
    const padL = exportMode ? 220 : 110;
    const padR = exportMode ? 120 : 60;
    const padT = exportMode ? 210 : 50;
    const padB = exportMode ? 160 : 60;

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
        ctx.fillRect(bx, Math.min(by, y0), barW, Math.max(bh, 1));
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
      // 点击选中标记
      if (r.code === selectedCode) {
        ctx.strokeStyle = '#E65A56'; ctx.lineWidth = 2;
        ctx.strokeRect(gx - groupW / 2 + 4, padT, groupW - 8, H - padT - padB);
      }
    });

    // 图例
    const lx = exportMode ? padL + 20 : padL + 10;
    const ly = exportMode ? 230 : 16;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    SERIES.forEach((s, i) => {
      const yy = ly + i * (exportMode ? 44 : 18);
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, yy - (exportMode ? 8 : 4), exportMode ? 36 : 14, exportMode ? 7 : 3);
      ctx.fillStyle = '#444';
      ctx.font = (exportMode ? 24 : 11.5) + 'px NotoSansSC, sans-serif';
      ctx.fillText(s.label, lx + (exportMode ? 48 : 20), yy);
    });

    // 点击切换瀑布
    if (!exportMode) {
      canvasEl.onclick = (e) => {
        const rect = canvasEl.getBoundingClientRect();
        const sx = canvasEl.width / rect.width;
        const mx = (e.clientX - rect.left) * sx;
        const idx2 = Math.floor((mx - padL) / groupW);
        if (idx2 >= 0 && idx2 < n) {
          selectedCode = payload.indexes[idx2].code;
          drawMain(canvasEl, false, window.devicePixelRatio || 1);
          drawWaterfall(canvasWaterfall, false, window.devicePixelRatio || 1);
        }
      };
    }
  }

  function drawWaterfall(canvasEl, exportMode, scale) {
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1400 : 640;
    const padL = exportMode ? 250 : 130;
    const padR = exportMode ? 140 : 70;
    const padT = exportMode ? 240 : 56;
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

    const idx = (payload.indexes || []).find((r) => r.code === selectedCode) || (payload.indexes || [])[0];
    if (!idx) { return; }

    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 60px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${idx.name} · 收益来源瀑布`, W / 2, 80);
      ctx.fillStyle = '#555555';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.fillText('点击主图指数可切换 · 估值贡献为 PE 变化残差', W / 2, 145);
    }

    // 瀑布段：股息 → 盈利 → 估值 → 合计
    const segs = [
      { label: '股息贡献', v: idx.dividendPct || 0, color: '#5AAEF3' },
      { label: '盈利贡献', v: idx.earningsPct || 0, color: '#6D61E4' },
      { label: '估值贡献', v: idx.valuationPct || 0, color: '#E65A56' }
    ];
    const total = idx.totalReturnPct || 0;

    let vMin = Math.min(0, ...segs.map((s) => s.v));
    let vMax = Math.max(total, ...segs.map((s) => s.v));
    const pad = (vMax - vMin) * 0.1 || 5;
    vMax += pad; vMin -= pad;
    const y = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * (H - padT - padB);
    const y0 = y(0);

    // 网格 + 0线
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
    ctx.strokeStyle = '#999999'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(W - padR, y0); ctx.stroke();

    // 浮柱（从 0 起）
    const barW = Math.min((W - padL - padR) / 6, exportMode ? 320 : 150);
    const nSegs = segs.length + 1;
    const step = (W - padL - padR) / (nSegs + 1);

    // 先画合计柱（黑色，半透明叠底）
    let curX = padL + step * 0.8;
    ctx.fillStyle = 'rgba(26,26,26,0.08)';
    ctx.fillRect(curX - barW / 2, Math.min(y(total), y0), barW, Math.abs(y(total) - y0));
    ctx.fillStyle = '#1a1a1a';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = total >= 0 ? 'bottom' : 'top';
    ctx.fillText(`${total.toFixed(0)}%`, curX, total >= 0 ? y(total) - 6 : y(total) + 16);
    ctx.fillStyle = '#333';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('全收益', curX, H - padB + 8);

    // 三段浮柱
    segs.forEach((s, i) => {
      const x = padL + step * (i + 1.8);
      const by = Math.min(y(s.v), y0);
      const bh = Math.abs(y(s.v) - y0);
      ctx.fillStyle = s.color;
      ctx.fillRect(x - barW / 2, by, barW, Math.max(bh, 1));
      ctx.fillStyle = '#333';
      ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = s.v >= 0 ? 'bottom' : 'top';
      ctx.fillText(`${s.v.toFixed(0)}%`, x, s.v >= 0 ? y(s.v) - 6 : y(s.v) + 16);
      ctx.textBaseline = 'top';
      ctx.fillText(s.label, x, H - padB + 8);
    });

    // 说明
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('股息+盈利+估值 ≈ 全收益（估值贡献为残差，含复利与口径误差）', padL, H - padB + 36);
  }

  window.RD_render = function (data) {
    payload = data;
    const wrap = document.getElementById('panelReturnBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    selectedCode = (data.indexes && data.indexes[0] && data.indexes[0].code) || null;

    const capMain = document.createElement('div');
    capMain.innerHTML = '<div style="font-size:13px;color:#777;margin-bottom:6px;">主图 · 多宽基长期收益拆解（点击某根柱的指数名切换下方瀑布）</div>';
    wrap.appendChild(capMain);
    canvasMain = document.createElement('canvas');
    canvasMain.id = 'returnDecomp';
    wrap.appendChild(canvasMain);

    const capWf = document.createElement('div');
    capWf.innerHTML = '<div style="font-size:13px;color:#777;margin:16px 0 6px;">副卡 · 单指数收益来源瀑布</div>';
    wrap.appendChild(capWf);
    canvasWaterfall = document.createElement('canvas');
    canvasWaterfall.id = 'returnWaterfall';
    wrap.appendChild(canvasWaterfall);

    drawMain(canvasMain, false, window.devicePixelRatio || 1);
    drawWaterfall(canvasWaterfall, false, window.devicePixelRatio || 1);

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        drawMain(canvasMain, false, window.devicePixelRatio || 1);
        drawWaterfall(canvasWaterfall, false, window.devicePixelRatio || 1);
      });
    });

    window.AK.bindExportButtons({
      returnDecomp: (off) => drawMain(off, true, 1)
    });
  };
})();
