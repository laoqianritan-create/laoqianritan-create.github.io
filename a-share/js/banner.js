/**
 * 顶部 Banner（第六轮重构）：深酒红渐变 + 价格坐标双线灌满画布
 * 数据：banner.json { dates[], redLow[], csiAll[] }（2006-01 起）
 * 文案：「追寻适应与夏普之路」（Xiaomaoxihuanfeng-Light-2.ttf，左上）
 * 设计参考：《追寻价值之路》（燕翔）封面——暖色底、大字标题、克制装饰。
 * 已删：圆 icon / 「A股看板」标题 / 副题 / 右侧竖排刻度 / ticker 条。
 */
(function () {
  'use strict';

  const C_BG_1 = '#990C2E';   // 深酒红
  const C_BG_2 = '#6E0620';
  const C_GOLD = '#ECD7A0';   // 金黄（红利低波 + 标题）
  const C_WHITE = '#FFFFFF';  // 白（中证全指）
  const FONT_TITLE = 'Xiaomaoxihuanfeng, "Noto Sans SC", sans-serif';
  const FONT_BODY = 'NotoSansSC, "Microsoft YaHei", sans-serif';

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 2400 : 1480;
    const H = exportMode ? 600 : 470;   // 屏幕版加高：容纳左侧标题 + 下方三导航按钮

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
    const gl = ctx.createRadialGradient(W * 0.5, -H * 0.35, 10, W * 0.5, -H * 0.35, W * 0.95);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    const dates = data.dates || [];
    const red = data.redLow || [];
    const csi = data.csiAll || [];
    const n = Math.min(dates.length, red.length, csi.length);
    if (n < 2) return;

    // ── 图表纵向灌满画布：左侧留按钮区 + y 轴刻度，文案叠在图表内部左上 ──
    const padL = exportMode ? 700 : 440;   // 左：按钮区 + 刻度区（按钮不叠图）
    const padR = exportMode ? 320 : 190;   // 右：末端标签区
    const padT = exportMode ? 235 : 110;   // 顶部：纵向灌满（图表上边界抬高）
    const padB = exportMode ? 60 : 30;
    const plotL = padL, plotR = W - padR;
    const plotT = padT, plotB = H - padB;
    const plotW = plotR - plotL;

    // y 范围：0 ~ 红利低波最大值（价格坐标，0 起，线性）
    let maxV = 0;
    for (let i = 0; i < n; i++) { if (red[i] > maxV) maxV = red[i]; }
    maxV *= 1.06;
    const xs = (i) => plotL + (i / (n - 1)) * plotW;
    const ys = (v) => plotB - (v / maxV) * (plotB - plotT);

    // ── 文案：追寻适应与夏普之路（叠在图表内部左上角，与曲线重叠）──
    const tx = exportMode ? 708 : plotL + 10;  // 图表内部（> plotL）
    const ty = exportMode ? 88 : plotT + 8;    // 绘图区内顶部，叠在曲线上
    ctx.fillStyle = C_GOLD;
    ctx.font = (exportMode ? 56 : 34) + 'px ' + FONT_TITLE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('追寻适应与夏普之路', tx, ty);

    // 英文小字点缀（克制）
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = (exportMode ? 26 : 15) + 'px ' + FONT_BODY;
    ctx.fillText('ADAPTIVE ALLOCATION & SHARPE · 2006—2026', tx, ty + (exportMode ? 108 : 60));

    // 浅色水平网格 + 左侧价格刻度标签（y 轴）
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.font = (exportMode ? 22 : 11.5) + 'px ' + FONT_BODY;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let g = 0; g <= 4; g++) {
      const y = plotB - (g / 4) * (plotB - plotT);
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();
      const val = (maxV * g) / 4;
      const label = val >= 1000 ? (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k' : String(Math.round(val));
      ctx.fillText(label, plotL - 12, y);
    }

    // 年份刻度（稀疏打点）
    ctx.font = (exportMode ? 24 : 13) + 'px ' + FONT_BODY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const years = [];
    for (let i = 0; i < n; i++) {
      const y = dates[i].slice(0, 4);
      if (i === 0 || y !== dates[i - 1].slice(0, 4)) {
        if (+y % 4 === 0 || +y === 2006 || +y === 2026) years.push([y, i]);
      }
    }
    years.forEach(([y, i]) => ctx.fillText(y, xs(i), plotB + 8));

    // 曲线（价格坐标，线性）
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

    // 曲线下轻微面积填充（增加质感）
    const fillArea = (vals, color) => {
      const g2 = ctx.createLinearGradient(0, plotT, 0, plotB);
      g2.addColorStop(0, color.replace(')', ',0.16)').replace('rgb', 'rgba'));
      g2.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(plotL, plotB);
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.lineTo(plotR, plotB);
      ctx.closePath();
      ctx.fill();
    };
    fillArea(csi, 'rgb(255,255,255)');
    fillArea(red, 'rgb(236,215,160)');

    // 末端标签（数值 + 名称，右对齐，错开防重叠）
    const lastRed = red[n - 1], lastCsi = csi[n - 1];
    const lx = plotR + (exportMode ? 36 : 18);
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
    const gapY = exportMode ? 46 : 24;
    const items = [
      { y: lyr, c: C_GOLD, name: '红利低波', v: lastRed },
      { y: lyc, c: C_WHITE, name: '中证全指', v: lastCsi },
    ];
    if (Math.abs(lyr - lyc) < gapY * 1.4) {
      items[0].y = Math.min(lyr, lyc) - gapY * 0.7;
      items[1].y = Math.max(lyr, lyc) + gapY * 0.7;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.font = (exportMode ? 46 : 26) + 'px ' + FONT_BODY;
      ctx.fillText(it.v.toLocaleString('zh-CN', { maximumFractionDigits: 0 }), lx, it.y);
      ctx.font = (exportMode ? 24 : 14) + 'px ' + FONT_BODY;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(it.name, lx, it.y + (exportMode ? 34 : 19));
    });
  }

  // 字体注册（Xiaomaoxihuanfeng）后渲染：等 fonts.ready + 显式 load，避免竞态回退到 Noto
  const ready = new Promise((resolve) => {
    try {
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.ready,
          document.fonts.load('44px Xiaomaoxihuanfeng'),
          document.fonts.load('15px Xiaomaoxihuanfeng')
        ]).then(() => resolve(true)).catch(() => resolve(true));
      } else resolve(true);
    } catch (e) { resolve(true); }
  });

  window.BN_render = function (data) {
    const wrap = document.getElementById('heroBanner');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'heroBannerCanvas';
    wrap.appendChild(canvas);
    const doDraw = () => {
      draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });
    };
    // 立即绘制：不等字体（fallback 字体先出图，避免移动端/慢网字体加载挂起导致空白）
    try { doDraw(); } catch (e) { console.error('[banner] 首绘失败', e); }
    // 字体就绪后重绘一次（确保使用 Xiaomaoxihuanfeng）
    ready.then(doDraw).catch(() => {});
    // 兜底：若字体仍未就绪，稍后重绘一次确保使用 Xiaomaoxihuanfeng
    try {
      if (document.fonts && document.fonts.check && !document.fonts.check('44px Xiaomaoxihuanfeng')) {
        setTimeout(() => {
          try {
            if (document.fonts.check('44px Xiaomaoxihuanfeng')) {
              draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });
            }
          } catch (e) { /* 忽略 */ }
        }, 800);
      }
    } catch (e) { /* 忽略 */ }

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(doDraw);
    });
  };
})();
