/**
 * 热力图渲染器（canvas）
 * 蓝(#4A6FE2) → 浅蓝 → 白 → 浅红 → 红(#e65a56)，TwoSlopeNorm 以 0 为对称轴。
 * 年度涨跌幅区: VMIN=-50, VMAX=105 (大波动)
 * CAGR 区:     VMIN_M=-12, VMAX_M=18  (年化复合,数值小)
 * 单元格内数值 1 位小数；亮度 > 0.55 用深字，否则白字。
 *
 * 入口：SW_drawHeatmap(canvas, { years, rows, metricsMeta }, opts?)
 *   opts.scale       — 像素倍数（屏幕 dpr，导图 1）
 *   opts.exportMode  — true=导出版(顶部加标题+色条+底部页脚)；false=屏幕版
 */
(function () {
  'use strict';

  // 年度涨跌幅配色
  const VMIN = -50;
  const VMAX = 105;
  // CAGR 配色(更紧的范围，让数值差异看得见)
  const VMIN_M = -12;
  const VMAX_M = 18;

  const STOPS = [
    [0.00, [74, 111, 226]],
    [0.35, [192, 207, 250]],
    [0.50, [255, 255, 255]],
    [0.65, [245, 192, 190]],
    [1.00, [230, 90, 86]]
  ];

  function normVal(val, vmin, vmax) {
    if (val >= 0) return 0.5 + (val / vmax) * 0.5;
    return 0.5 + (val / Math.abs(vmin)) * 0.5;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function mapColor(val, vmin, vmax) {
    if (val === null || val === undefined || Number.isNaN(val)) {
      return { rgb: [240, 240, 240], lum: 0.94 };
    }
    const t = clamp(normVal(val, vmin, vmax), 0, 1);
    let i = 0;
    while (i < STOPS.length - 1 && STOPS[i + 1][0] < t) i++;
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[Math.min(i + 1, STOPS.length - 1)];
    const span = t1 - t0 || 1;
    const k = (t - t0) / span;
    const rgb = [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k));
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return { rgb, lum };
  }
  function rgbStr([r, g, b]) { return `rgb(${r},${g},${b})`; }

  /** 计算布局 */
  function layout(years, rows, metricsMeta, exportMode) {
    const n_year = years.length;            // 22
    const n_metric = metricsMeta.length;    // 4
    const n_rows = rows.length;             // 31

    if (exportMode) {
      const W = 3000;
      const padL = 320, padR = 80;
      // 年度列 + CAGR 列 + 分隔 gap
      const gapW = 30;                      // 年度区与 CAGR 区之间的视觉分隔
      const usable = W - padL - padR - gapW;
      // CAGR 单格稍宽,以便容纳两位小数 + %
      const yearCellW = usable / (n_year + n_metric * 1.45);
      const metricCellW = yearCellW * 1.45;
      const cellH = 60;
      const headerH = 240;
      const legendH = 90;
      const colHdrH = 78;                   // 两行标题(label + sublabel)
      const footerH = 100;
      const padBot = 50;
      const matrixTop = headerH + legendH + colHdrH;
      const matrixBot = matrixTop + cellH * n_rows;
      const H = matrixBot + footerH + padBot;
      const metricStartX = padL + n_year * yearCellW + gapW;
      return {
        W, H, padL, padR, gapW,
        yearCellW, metricCellW, cellH,
        headerH, legendH, colHdrH, footerH, padBot,
        matrixTop, matrixBot,
        metricStartX, exportMode: true
      };
    }

    // 屏幕模式：按视口宽度自适应
    const W = 1480;
    const padL = 140, padR = 20;
    const gapW = 16;
    const usable = W - padL - padR - gapW;
    const yearCellW = usable / (n_year + n_metric * 1.4);
    const metricCellW = yearCellW * 1.4;
    const cellH = 38;
    const colHdrH = 54;                     // 两行标题
    const matrixTop = colHdrH;
    const matrixBot = matrixTop + cellH * n_rows;
    const H = matrixBot + 16;
    const metricStartX = padL + n_year * yearCellW + gapW;
    return {
      W, H, padL, padR, gapW,
      yearCellW, metricCellW, cellH,
      headerH: 0, legendH: 0, colHdrH, footerH: 0, padBot: 0,
      matrixTop, matrixBot,
      metricStartX, exportMode: false
    };
  }

  function fmtVal(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return v.toFixed(1);
  }

  /** 主渲染 */
  window.SW_drawHeatmap = function (canvas, payload, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const scale = opts.scale || (window.devicePixelRatio || 1);

    const { years, rows, metricsMeta = [] } = payload;
    const L = layout(years, rows, metricsMeta, exportMode);

    canvas.width = L.W * scale;
    canvas.height = L.H * scale;
    if (!exportMode) {
      canvas.style.width = '100%';
      canvas.style.maxWidth = L.W + 'px';
      canvas.style.height = 'auto';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, L.W, L.H);

    // ── 导出版顶部标题区 ──
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 92px AlibabaPuHuiTi, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('申万一级行业年度涨跌幅 · 长期 CAGR', L.W / 2, 100);

      ctx.fillStyle = '#555555';
      ctx.font = '300 30px NotoSansSC, "Microsoft YaHei", sans-serif';
      ctx.fillText('2005 — 2026 · 31 个一级行业 · 蓝跌红涨 · 右侧 4 列为年化复合收益率', L.W / 2, 175);

      drawLegendBar(ctx, L);
    }

    // ── 列标题（年度） ──
    const colHdrSize = exportMode ? 24 : 14;
    const sublabelSize = exportMode ? 17 : 10;

    ctx.font = `400 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const colHdrBaseY = L.matrixTop - 6;
    years.forEach((y, j) => {
      const cx = L.padL + (j + 0.5) * L.yearCellW;
      const isYtd = y === '2026*';
      ctx.fillStyle = isYtd ? '#E65A56' : '#333333';
      ctx.fillText(y, cx, colHdrBaseY);
    });

    // ── 列标题（CAGR）——label + sublabel 双行 ──
    metricsMeta.forEach((col, j) => {
      const cx = L.metricStartX + (j + 0.5) * L.metricCellW;
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `400 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(col.label, cx, colHdrBaseY - sublabelSize - 2);

      ctx.fillStyle = '#999999';
      ctx.font = `300 ${sublabelSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.fillText(col.sublabel, cx, colHdrBaseY);
    });

    // ── 行渲染 ──
    const rowLblSize = exportMode ? 26 : 14;
    const cellTxtSize = exportMode ? 22 : 11;
    const metricTxtSize = exportMode ? 24 : 12;

    rows.forEach((row, i) => {
      const rowY = L.matrixTop + i * L.cellH;

      // 行标签
      ctx.fillStyle = '#333333';
      ctx.font = `400 ${rowLblSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.name, L.padL - 12, rowY + L.cellH / 2);

      // 年度色块 + 数值
      row.rets.forEach((val, j) => {
        const x = L.padL + j * L.yearCellW;
        const y = rowY;
        const { rgb, lum } = mapColor(val, VMIN, VMAX);
        ctx.fillStyle = rgbStr(rgb);
        ctx.fillRect(x, y, L.yearCellW, L.cellH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, L.yearCellW - 1, L.cellH - 1);
        ctx.fillStyle = lum > 0.55 ? '#222222' : '#FFFFFF';
        ctx.font = `400 ${cellTxtSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtVal(val), x + L.yearCellW / 2, y + L.cellH / 2);
      });

      // CAGR 色块 + 数值 + %
      (row.metrics || []).forEach((val, j) => {
        const x = L.metricStartX + j * L.metricCellW;
        const y = rowY;
        const { rgb, lum } = mapColor(val, VMIN_M, VMAX_M);
        ctx.fillStyle = rgbStr(rgb);
        ctx.fillRect(x, y, L.metricCellW, L.cellH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, L.metricCellW - 1, L.cellH - 1);
        ctx.fillStyle = lum > 0.55 ? '#222222' : '#FFFFFF';
        // 加粗一点点表明这是「指标」而非「年度」
        ctx.font = `500 ${metricTxtSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const txt = (val === null || val === undefined) ? '—' : `${val.toFixed(1)}%`;
        ctx.fillText(txt, x + L.metricCellW / 2, y + L.cellH / 2);
      });
    });

    // ── 顶/底边框线 ──
    const matrixRight = L.metricStartX + metricsMeta.length * L.metricCellW;
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(L.padL, L.matrixTop);
    ctx.lineTo(matrixRight, L.matrixTop);
    ctx.moveTo(L.padL, L.matrixBot);
    ctx.lineTo(matrixRight, L.matrixBot);
    ctx.stroke();

    // ── 年度区与 CAGR 区之间的竖向分隔线 ──
    const sepX = L.padL + years.length * L.yearCellW + L.gapW / 2;
    ctx.strokeStyle = '#BBBBBB';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sepX, L.matrixTop - L.colHdrH);
    ctx.lineTo(sepX, L.matrixBot);
    ctx.stroke();
    ctx.setLineDash([]);

    // 导出版页脚
    if (exportMode) {
      const footY = L.matrixBot + 60;
      ctx.fillStyle = '#555555';
      ctx.font = '300 24px NotoSansSC, "Microsoft YaHei", sans-serif';

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let leftLine = '数据来源：Wind 申万一级行业指数';
      if (opts.ytdAsOf) leftLine += `  ·  2026 年为年初至今涨跌幅（截至 ${opts.ytdAsOf}）`;
      else leftLine += '  ·  2026 年为年初至今涨跌幅';
      leftLine += '  ·  CAGR 基于完整年度数据';
      ctx.fillText(leftLine, L.padL, footY);

      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', L.W - L.padR, footY);
    }
  };

  function drawLegendBar(ctx, L) {
    const barW = Math.round(L.W * 0.32);
    const barH = 22;
    const barX = (L.W - barW) / 2;
    const barY = 220;

    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0.00, '#4A6FE2');
    grad.addColorStop(0.35, '#C0CFFA');
    grad.addColorStop(0.50, '#FFFFFF');
    grad.addColorStop(0.65, '#F5C0BE');
    grad.addColorStop(1.00, '#e65a56');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

    ctx.fillStyle = '#555555';
    ctx.font = '300 22px NotoSansSC, "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText('−50%', barX - 12, barY + barH / 2);
    ctx.textAlign = 'left';
    ctx.fillText('+100%', barX + barW + 12, barY + barH / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0', barX + barW * 0.5, barY + barH + 6);

    // CAGR 色阶说明小字
    ctx.fillStyle = '#888888';
    ctx.font = '300 17px NotoSansSC, "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('右侧 CAGR 区使用更紧的色阶（−12% ~ +18%）以拉开年化数值差异', L.W / 2, barY + barH + 36);
  }
})();
