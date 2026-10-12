/**
 * 收益来源拆解面板（表格版）
 * 数据：return_decomp.json { generated, indexes: [ {code, name, start, end, totalReturnPct, dividendPct, earningsPct, valuationPct} ] }
 */
(function () {
  'use strict';

  let payload = null;
  let canvasMain = null;

  const COLS = [
    { key: 'name', label: '指数', align: 'left', w: 0.16 },
    { key: 'range', label: '区间', align: 'left', w: 0.16 },
    { key: 'totalReturnPct', label: '全收益', align: 'right', w: 0.14 },
    { key: 'dividendPct', label: '股息', align: 'right', w: 0.12 },
    { key: 'earningsPct', label: '盈利', align: 'right', w: 0.12 },
    { key: 'valuationPct', label: '估值', align: 'right', w: 0.12 },
    { key: 'peRange', label: 'PE 起止', align: 'right', w: 0.18 },
  ];

  const COLOR_POS = '#C0392B';   // 正收益 红
  const COLOR_NEG = '#1E8449';   // 负收益 绿
  const COLOR_ZERO = '#888';

  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    const sign = v > 0 ? '+' : '';
    return sign + v.toFixed(1) + '%';
  }

  function pctColor(v) {
    if (v === null || v === undefined) return '#aaa';
    if (v > 0.05) return COLOR_POS;
    if (v < -0.05) return COLOR_NEG;
    return COLOR_ZERO;
  }

  function drawMain(canvasEl, exportMode, scale) {
    const W = exportMode ? 3000 : 1480;
    const padL = exportMode ? 60 : 30;
    const padR = exportMode ? 60 : 30;
    const headH = exportMode ? 90 : 44;
    const rowH = exportMode ? 96 : 48;
    const colGap = 0;
    const idx = payload.indexes || [];
    const nRows = idx.length;
    const H = headH + rowH * nRows + (exportMode ? 40 : 20);

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

    const tableW = W - padL - padR;
    // 列 x 坐标
    let cx = padL;
    const colXs = [];
    COLS.forEach((c) => {
      colXs.push(cx);
      cx += tableW * c.w;
    });

    // 表头
    ctx.fillStyle = '#F7F8FA';
    ctx.fillRect(padL, 0, tableW, headH);
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, headH);
    ctx.lineTo(W - padR, headH);
    ctx.stroke();

    const headFont = (exportMode ? 26 : 13) + 'px NotoSansSC, sans-serif';
    ctx.font = headFont;
    ctx.fillStyle = '#666';
    COLS.forEach((c, i) => {
      const tx = c.align === 'right' ? colXs[i] + tableW * c.w - 16 : colXs[i] + 16;
      ctx.textAlign = c.align === 'right' ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, tx, headH / 2);
    });

    // 行
    idx.forEach((r, ri) => {
      const ry = headH + ri * rowH;
      // 斑马纹
      if (ri % 2 === 1) {
        ctx.fillStyle = '#FAFBFC';
        ctx.fillRect(padL, ry, tableW, rowH);
      }
      // 行底线
      ctx.strokeStyle = '#EEEEEE';
      ctx.beginPath();
      ctx.moveTo(padL, ry + rowH);
      ctx.lineTo(W - padR, ry + rowH);
      ctx.stroke();

      const cy = ry + rowH / 2;
      const bodyFont = (exportMode ? 30 : 14.5) + 'px NotoSansSC, sans-serif';
      ctx.font = bodyFont;
      ctx.textBaseline = 'middle';

      // 指数名（粗体）
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'left';
      ctx.font = (exportMode ? '700 ' : '600 ') + (exportMode ? 30 : 14.5) + 'px NotoSansSC, sans-serif';
      ctx.fillText(r.name, colXs[0] + 16, cy);
      ctx.font = bodyFont;

      // 区间
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.fillText((r.start || '').slice(0, 7) + ' 起', colXs[1] + 16, cy);

      // 全收益 / 股息 / 盈利 / 估值（右对齐，按正负着色）
      const pctCols = ['totalReturnPct', 'dividendPct', 'earningsPct', 'valuationPct'];
      pctCols.forEach((key, ci) => {
        const colIdx = 2 + ci;
        const v = r[key];
        ctx.fillStyle = pctColor(v);
        ctx.textAlign = 'right';
        ctx.font = (exportMode ? '700 ' : '600 ') + (exportMode ? 30 : 14.5) + 'px NotoSansSC, sans-serif';
        ctx.fillText(fmtPct(v), colXs[colIdx] + tableW * COLS[colIdx].w - 16, cy);
        ctx.font = bodyFont;
      });

      // PE 起止
      ctx.fillStyle = '#666';
      ctx.textAlign = 'right';
      if (r.peStart && r.peEnd) {
        ctx.fillText(r.peStart.toFixed(1) + ' → ' + r.peEnd.toFixed(1), colXs[6] + tableW * COLS[6].w - 16, cy);
      } else {
        ctx.fillText('—', colXs[6] + tableW * COLS[6].w - 16, cy);
      }
    });
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
