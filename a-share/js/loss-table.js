/**
 * 抄底数学题 · 亏损对照表 canvas 渲染器
 * 与热力图共用架构:屏幕版 dpr scale, 导出版 3000px scale=1
 * A 股配色:亏损用绿色(越亏越深),0% 淡背景
 *
 * 入口: SW_drawLossTable(canvas, opts)
 *   opts.exportMode  — true=3000px 导出版(带标题+页脚)
 *   opts.scale       — 像素倍数
 */
(function () {
  'use strict';

  const ROW_LBLS = [
    '80 元（高位跌 20）', '70 元（高位跌 30）', '60 元（高位跌 40）',
    '50 元（高位跌 50）', '40 元（高位跌 60）', '30 元（高位跌 70）',
    '20 元（高位跌 80）', '10 元（高位跌 90）'
  ];
  const COL_LBLS = ['100 元买入', '80 元买入', '70 元买入', '60 元买入', '50 元买入', '40 元买入'];
  const CURRENT_PRICES = [80, 70, 60, 50, 40, 30, 20, 10];
  const BUY_PRICES     = [100, 80, 70, 60, 50, 40];

  // 生成数据矩阵: (现价 - 买入价) / 买入价 * 100; 现价 > 买入价则 null (未触及)
  // 现价 == 买入价 时是 0.00% (刚好回本, 对角线)
  const DATA = CURRENT_PRICES.map((cur) =>
    BUY_PRICES.map((buy) => (cur > buy ? null : ((cur - buy) / buy) * 100))
  );

  // A 股配色:绿=跌,越亏越深绿; 0% 临界=极淡红
  const COLORS = {
    blank: { bg: '#f8f9fb', fg: '#b8bec7' },  // /
    zero:  { bg: '#fbe9ea', fg: '#c1443c' },  // 刚好回本
    lv1:   { bg: '#dfefdc', fg: '#1e6d3b' },  // -1% ~ -20%
    lv2:   { bg: '#9dd0a2', fg: '#0f4a1f' },  // -20% ~ -40%
    lv3:   { bg: '#4fac54', fg: '#ffffff' },  // -40% ~ -60%
    lv4:   { bg: '#2c8730', fg: '#ffffff' },  // -60% ~ -75%
    lv5:   { bg: '#155a1a', fg: '#ffffff' }   // <= -75%
  };

  function classify(val) {
    if (val === null || val === undefined) return 'blank';
    if (val === 0) return 'zero';
    const abs = Math.abs(val);
    if (abs < 20) return 'lv1';
    if (abs < 40) return 'lv2';
    if (abs < 60) return 'lv3';
    if (abs < 75) return 'lv4';
    return 'lv5';
  }

  function fmtVal(v) {
    if (v === null || v === undefined) return '/';
    if (v === 0) return '0.00%';
    return v.toFixed(2) + '%';
  }

  function layout(exportMode) {
    const nRows = ROW_LBLS.length;   // 8
    const nCols = COL_LBLS.length;   // 6

    if (exportMode) {
      const W = 3000;
      const padL = 460, padR = 60;
      const cellW = (W - padL - padR) / nCols;
      const cellH = 140;
      const headerH = 260;
      const colHdrH = 96;
      const footerH = 100;
      const padBot = 50;
      const matrixTop = headerH + colHdrH;
      const matrixBot = matrixTop + cellH * nRows;
      return {
        W, H: matrixBot + footerH + padBot,
        padL, padR, cellW, cellH, headerH, colHdrH, footerH, padBot,
        matrixTop, matrixBot, exportMode: true
      };
    }
    // 屏幕版
    const W = 1180;
    const padL = 200, padR = 20;
    const cellW = (W - padL - padR) / nCols;
    const cellH = 48;
    const colHdrH = 48;
    const matrixTop = colHdrH;
    const matrixBot = matrixTop + cellH * nRows;
    return {
      W, H: matrixBot + 8,
      padL, padR, cellW, cellH, headerH: 0, colHdrH, footerH: 0, padBot: 0,
      matrixTop, matrixBot, exportMode: false
    };
  }

  window.SW_drawLossTable = function (canvas, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const scale = opts.scale || (window.devicePixelRatio || 1);
    const L = layout(exportMode);

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

    // 导出版:顶部大标题
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 88px AlibabaPuHuiTi, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('关于抄底的一道基础数学题', L.W / 2, 105);

      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, "Microsoft YaHei", sans-serif';
      ctx.fillText('不同买入价与现价的亏损对照表 · 跌得越多,反弹回本越难', L.W / 2, 180);

      // 图例(顶部右侧)
      drawLegend(ctx, L.W - 640, 220, exportMode);
    }

    // 表头(带 padL 的行标签列 + 6 个列标题)
    const colHdrSize = exportMode ? 26 : 13;
    const hdrY = L.matrixTop - L.colHdrH;
    ctx.font = `500 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle';

    // 行标签表头(深色底 白字)
    ctx.fillStyle = '#4a5060';
    ctx.fillRect(0, hdrY, L.padL, L.colHdrH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('现价（高位回撤）', L.padL / 2, hdrY + L.colHdrH / 2);

    COL_LBLS.forEach((lbl, j) => {
      const x = L.padL + j * L.cellW;
      ctx.fillStyle = '#4a5060';
      ctx.fillRect(x, hdrY, L.cellW, L.colHdrH);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(lbl, x + L.cellW / 2, hdrY + L.colHdrH / 2);
    });

    // 数据行
    const rowLblSize = exportMode ? 22 : 12;
    const cellValSize = exportMode ? 26 : 14;

    ROW_LBLS.forEach((rowLbl, i) => {
      const y = L.matrixTop + i * L.cellH;

      // 行标签(浅灰底 深字)
      ctx.fillStyle = '#f4f5f7';
      ctx.fillRect(0, y, L.padL, L.cellH);
      ctx.fillStyle = '#333333';
      ctx.font = `500 ${rowLblSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rowLbl, L.padL / 2, y + L.cellH / 2);

      // 数据格
      DATA[i].forEach((val, j) => {
        const x = L.padL + j * L.cellW;
        const c = COLORS[classify(val)];
        ctx.fillStyle = c.bg;
        ctx.fillRect(x, y, L.cellW, L.cellH);
        // 白色分隔
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = exportMode ? 3 : 1.5;
        ctx.strokeRect(x, y, L.cellW, L.cellH);

        ctx.fillStyle = c.fg;
        ctx.font = `700 ${cellValSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtVal(val), x + L.cellW / 2, y + L.cellH / 2);
      });
    });

    // 表头下白色分隔线(整行)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = exportMode ? 3 : 1.5;
    ctx.strokeRect(0, hdrY, L.padL + COL_LBLS.length * L.cellW, L.colHdrH);
    COL_LBLS.forEach((_, j) => {
      const x = L.padL + j * L.cellW;
      ctx.strokeRect(x, hdrY, L.cellW, L.colHdrH);
    });

    // 导出版页脚
    if (exportMode) {
      const footY = L.matrixBot + 55;
      ctx.fillStyle = '#555555';
      ctx.font = '300 22px NotoSansSC, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('注: / 表示该买入价尚未被触及；表内数值 = (现价 − 买入价) / 买入价', L.padL, footY);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', L.W - L.padR, footY);
    }
  };

  function drawLegend(ctx, startX, y, exportMode) {
    const size = exportMode ? 22 : 12;
    const boxW = exportMode ? 66 : 40;
    const boxH = exportMode ? 30 : 20;
    const gap = exportMode ? 8 : 4;

    ctx.font = `400 ${size}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('亏损色阶', startX - 20, y + boxH / 2);

    const items = [
      { lbl: '-20%', c: COLORS.lv1 },
      { lbl: '-40%', c: COLORS.lv3 },
      { lbl: '-60%', c: COLORS.lv4 },
      { lbl: '-90%', c: COLORS.lv5 }
    ];
    items.forEach((item, i) => {
      const x = startX + i * (boxW + gap);
      ctx.fillStyle = item.c.bg;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = item.c.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${size - 4}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.fillText(item.lbl, x + boxW / 2, y + boxH / 2);
    });
  }
})();
