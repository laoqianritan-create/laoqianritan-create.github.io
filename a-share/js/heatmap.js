/**
 * 热力图渲染器（canvas）
 * 渲染规格与 PNG 完全一致：
 *   蓝(#4A6FE2) → 浅蓝(#C0CFFA) → 白 → 浅红(#F5C0BE) → 红(#e65a56)
 *   TwoSlopeNorm: 以 0 为对称轴, vmin=-50, vmax=105
 *   单元格内数值 1 位小数；亮度 > 0.55 用深字，否则白字
 *
 * 入口：SW_drawHeatmap(canvas, { years, rows }, opts?)
 *   opts.scale       — 像素倍数（屏幕用 dpr，导图用 3）
 *   opts.exportMode  — true=用于导出（顶部加大标题+色条+底部页脚）；false=纯图主体
 *   opts.maxWidthCss — 屏幕模式下的 CSS 宽度
 */
(function () {
  'use strict';

  const VMIN = -50;
  const VMAX = 105;
  // 颜色停靠点(归一化到 0..1 的位置, hex)
  const STOPS = [
    [0.00, [74, 111, 226]],   // #4A6FE2
    [0.35, [192, 207, 250]],  // #C0CFFA
    [0.50, [255, 255, 255]],  // #FFFFFF
    [0.65, [245, 192, 190]],  // #F5C0BE
    [1.00, [230, 90, 86]]     // #e65a56
  ];

  function norm(val) {
    // TwoSlopeNorm: 0 永远落在 0.5
    if (val >= 0) {
      return 0.5 + (val / VMAX) * 0.5;
    } else {
      return 0.5 + (val / Math.abs(VMIN)) * 0.5; // val 负, 结果 <0.5
    }
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function mapColor(val) {
    if (val === null || val === undefined || Number.isNaN(val)) {
      return { rgb: [240, 240, 240], lum: 0.94 };
    }
    const t = clamp(norm(val), 0, 1);
    // 线性插值找两个相邻 STOP
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

  /**
   * 计算布局（数据像素 = 与缩放无关的"逻辑像素"）
   */
  function layout(years, rows, exportMode) {
    const n_cols = years.length;
    const n_rows = rows.length;

    if (exportMode) {
      // 导出模式：3000px 宽固定布局
      const W = 3000;
      const padL = 320, padR = 80;          // 左留行标签
      const cellW = (W - padL - padR) / n_cols;
      const cellH = 60;
      const headerH = 240;                  // 标题区
      const legendH = 90;                   // 色条
      const colHdrH = 50;                   // 年份行
      const footerH = 100;                  // 页脚
      const padBot = 50;
      const matrixTop = headerH + legendH + colHdrH;
      const matrixBot = matrixTop + cellH * n_rows;
      const H = matrixBot + footerH + padBot;
      return {
        W, H, padL, padR, cellW, cellH,
        headerH, legendH, colHdrH, footerH, padBot,
        matrixTop, matrixBot
      };
    }

    // 屏幕模式：按视口宽度自适应
    const W = 1340;                          // 逻辑宽度，CSS 缩放
    const padL = 150, padR = 30;
    const cellW = (W - padL - padR) / n_cols;
    const cellH = 38;
    const colHdrH = 36;
    const matrixTop = colHdrH;
    const matrixBot = matrixTop + cellH * n_rows;
    const H = matrixBot + 16;
    return {
      W, H, padL, padR, cellW, cellH,
      headerH: 0, legendH: 0, colHdrH, footerH: 0, padBot: 0,
      matrixTop, matrixBot
    };
  }

  function fmtVal(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return v.toFixed(1);
  }

  /**
   * 主渲染
   */
  window.SW_drawHeatmap = function (canvas, payload, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const scale = opts.scale || (window.devicePixelRatio || 1);

    const { years, rows } = payload;
    const L = layout(years, rows, exportMode);

    // 设置 canvas 实际像素 + CSS 尺寸
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

    // 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, L.W, L.H);

    // ── 导出模式：顶部标题区 ──
    if (exportMode) {
      // 大标题
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 92px AlibabaPuHuiTi, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('申万一级行业年度涨跌幅', L.W / 2, 100);

      // 副标题
      ctx.fillStyle = '#555555';
      ctx.font = '300 30px NotoSansSC, "Microsoft YaHei", sans-serif';
      ctx.fillText('2005 — 2026 · 31 个一级行业 · 蓝跌红涨', L.W / 2, 175);

      // 色条
      drawLegendBar(ctx, L);
    }

    // ── 列标题（年份）──
    ctx.fillStyle = '#333333';
    const colHdrSize = exportMode ? 24 : 14;
    ctx.font = `400 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const colHdrBaseY = L.matrixTop - 6;
    years.forEach((y, j) => {
      const cx = L.padL + (j + 0.5) * L.cellW;
      const isYtd = y === '2026*';
      ctx.fillStyle = isYtd ? '#E65A56' : '#333333';
      ctx.fillText(y, cx, colHdrBaseY);
    });

    // ── 行标签 + 色块 + 数值 ──
    const rowLblSize = exportMode ? 26 : 14;
    const cellTxtSize = exportMode ? 22 : 11;

    rows.forEach((row, i) => {
      const rowY = L.matrixTop + i * L.cellH;

      // 行标签（右对齐贴近左边格子）
      ctx.fillStyle = '#333333';
      ctx.font = `400 ${rowLblSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.name, L.padL - 12, rowY + L.cellH / 2);

      // 色块 + 数值
      row.rets.forEach((val, j) => {
        const x = L.padL + j * L.cellW;
        const y = rowY;
        const { rgb, lum } = mapColor(val);
        ctx.fillStyle = rgbStr(rgb);
        ctx.fillRect(x, y, L.cellW, L.cellH);

        // 白色细网格
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, L.cellW - 1, L.cellH - 1);

        // 数值
        const txtColor = lum > 0.55 ? '#222222' : '#FFFFFF';
        ctx.fillStyle = txtColor;
        ctx.font = `400 ${cellTxtSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtVal(val), x + L.cellW / 2, y + L.cellH / 2);
      });
    });

    // ── 顶/底边框线 ──
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(L.padL, L.matrixTop);
    ctx.lineTo(L.padL + years.length * L.cellW, L.matrixTop);
    ctx.moveTo(L.padL, L.matrixBot);
    ctx.lineTo(L.padL + years.length * L.cellW, L.matrixBot);
    ctx.stroke();

    // ── 导出模式：页脚 ──
    if (exportMode) {
      const footY = L.matrixBot + 60;
      ctx.fillStyle = '#555555';
      ctx.font = '300 24px NotoSansSC, "Microsoft YaHei", sans-serif';

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let leftLine = '数据来源：Wind 申万一级行业指数';
      if (opts.ytdAsOf) leftLine += `  ·  2026 年为年初至今涨跌幅（截至 ${opts.ytdAsOf}）`;
      else leftLine += '  ·  2026 年为年初至今涨跌幅';
      ctx.fillText(leftLine, L.padL, footY);

      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', L.W - L.padR, footY);
    }
  };

  function drawLegendBar(ctx, L) {
    // 居中色条，跨越中间 30% 宽度
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

    // 标签 -50% / 0 / +100%
    ctx.fillStyle = '#555555';
    ctx.font = '300 22px NotoSansSC, "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'right';
    ctx.fillText('−50%', barX - 12, barY + barH / 2);

    ctx.textAlign = 'left';
    ctx.fillText('+100%', barX + barW + 12, barY + barH / 2);

    // 0 标签（位于 50/(50+100)=33.3% 处即 vmin=-50/vmax=100 的零点）
    // 我们的归一化是 0.5(零点固定在中间)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0', barX + barW * 0.5, barY + barH + 6);
  }
})();
