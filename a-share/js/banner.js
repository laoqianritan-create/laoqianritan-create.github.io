/**
 * 顶部 Banner：深酒红渐变 + 价格坐标双线（红利低波全收益 / 中证全指价格）+ 圆形 icon
 * 数据：banner.json { dates[], redLow[], csiAll[] }（2006-01 起）
 * 设计参考：《追寻价值之路》（燕翔）封面气质——暖色底、大字标题、克制装饰。
 */
(function () {
  'use strict';

  const C_BG_1 = '#990C2E';   // 深酒红
  const C_BG_2 = '#6E0620';
  const C_GOLD = '#ECD7A0';   // 金黄（红利低波）
  const C_WHITE = '#FFFFFF';  // 白（中证全指）

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 2400 : 1480;
    const H = exportMode ? 600 : 320;

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

    // 背景：深酒红渐变（右上微亮 → 左下深）
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, C_BG_1);
    bg.addColorStop(1, C_BG_2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 微弱径向高光（顶部）
    const gl = ctx.createRadialGradient(W * 0.55, -H * 0.3, 10, W * 0.55, -H * 0.3, W * 0.9);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    const dates = data.dates || [];
    const red = data.redLow || [];
    const csi = data.csiAll || [];
    const n = Math.min(dates.length, red.length, csi.length);
    if (n < 2) return;

    // ── 圆形 icon（左侧装饰：金圆「息」+ 白描边圆「A」）──
    const rBig = exportMode ? 88 : 54;
    const rSml = exportMode ? 58 : 35;
    const cx1 = exportMode ? 190 : 120;
    const cy1 = exportMode ? 300 : 160;
    // 大金圆
    ctx.beginPath();
    ctx.arc(cx1, cy1, rBig, 0, Math.PI * 2);
    ctx.fillStyle = C_GOLD;
    ctx.fill();
    ctx.fillStyle = '#7A0A24';
    ctx.font = (exportMode ? 96 : 58) + 'px AlibabaPuHuiTi, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('息', cx1, cy1 + 2);
    // 小白描边圆（右下错位）
    const cx2 = cx1 + rBig * 0.9, cy2 = cy1 + rBig * 0.9;
    ctx.beginPath();
    ctx.arc(cx2, cy2, rSml, 0, Math.PI * 2);
    ctx.strokeStyle = C_WHITE;
    ctx.lineWidth = exportMode ? 5 : 3;
    ctx.stroke();
    ctx.fillStyle = C_WHITE;
    ctx.font = (exportMode ? 64 : 38) + 'px AlibabaPuHuiTi, sans-serif';
    ctx.fillText('A', cx2, cy2 + 2);

    // ── 左侧大标题 ──
    const titleX = exportMode ? 330 : 205;
    const titleY = exportMode ? 300 : 158;
    ctx.fillStyle = C_WHITE;
    ctx.font = '900 ' + (exportMode ? 118 : 66) + 'px AlibabaPuHuiTi, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('A股看板', titleX, titleY - (exportMode ? 52 : 30));
    ctx.fillStyle = C_GOLD;
    ctx.font = '400 ' + (exportMode ? 40 : 23) + 'px NotoSansSC, sans-serif';
    ctx.fillText('市场温度 · 每交易日自动更新', titleX, titleY + (exportMode ? 58 : 33));

    // ── 右侧曲线区（价格坐标，线性）──
    const plotL = exportMode ? 900 : 540;
    const plotR = W - (exportMode ? 210 : 120);
    const plotT = exportMode ? 90 : 56;
    const plotB = H - (exportMode ? 90 : 52);
    const plotW = plotR - plotL;

    // y 范围：0 ~ 红利低波最大值（价格坐标，0 起）
    let maxV = 0;
    for (let i = 0; i < n; i++) { if (red[i] > maxV) maxV = red[i]; }
    maxV *= 1.05;
    const xs = (i) => plotL + (i / (n - 1)) * plotW;
    const ys = (v) => plotB - (v / maxV) * (plotB - plotT);

    // 浅色网格（价格刻度）
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.font = (exportMode ? 26 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    ticks.forEach((t) => {
      const y = plotB - t * (plotB - plotT);
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();
      const val = Math.round(maxV * t);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(val.toLocaleString(), plotL - 14, y);
    });

    // 年份刻度
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const years = [];
    for (let i = 0; i < n; i++) {
      const y = dates[i].slice(0, 4);
      if (i === 0 || y !== dates[i - 1].slice(0, 4)) {
        if (+y % 4 === 0 || +y === 2006 || +y === 2026) years.push([y, i]);
      }
    }
    years.forEach(([y, i]) => {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(y, xs(i), plotB + 10);
    });

    // 曲线：红利低波（金黄）— 线宽 2.5
    const drawLine = (vals, color, lw) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawLine(red, C_GOLD, exportMode ? 5 : 2.4);
    drawLine(csi, C_WHITE, exportMode ? 5 : 2.4);

    // 末端标签（右侧）
    const lastRed = red[n - 1], lastCsi = csi[n - 1];
    const lx = plotR + (exportMode ? 40 : 18);
    const lyr = ys(lastRed), lyc = ys(lastCsi);
    // 末端圆点
    [[plotR, lyr, C_GOLD], [plotR, lyc, C_WHITE]].forEach(([x, y, c]) => {
      ctx.beginPath();
      ctx.arc(x, y, exportMode ? 9 : 5, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = '#7A0A24';
      ctx.lineWidth = exportMode ? 3 : 2;
      ctx.stroke();
    });
    // 数值 + 名称（右对齐，错开防重叠）
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const items = [
      { y: lyr, c: C_GOLD, name: '红利低波', v: lastRed },
      { y: lyc, c: C_WHITE, name: '中证全指', v: lastCsi },
    ];
    const gapY = exportMode ? 46 : 24;
    if (Math.abs(lyr - lyc) < gapY * 1.4) {
      // 太近则上下分开
      items[0].y = Math.min(lyr, lyc) - gapY * 0.7;
      items[1].y = Math.max(lyr, lyc) + gapY * 0.7;
    }
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.font = (exportMode ? 46 : 26) + 'px AlibabaPuHuiTi, sans-serif';
      ctx.fillText(it.v.toLocaleString('zh-CN', { maximumFractionDigits: 0 }), lx, it.y);
      ctx.font = '400 ' + (exportMode ? 26 : 15) + 'px NotoSansSC, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(it.name, lx, it.y + (exportMode ? 34 : 19));
    });
  }

  window.BN_render = function (data) {
    const wrap = document.getElementById('heroBanner');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'heroBannerCanvas';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });
  };
})();
