/**
 * 全市场成交金额 / 换手面板
 * 数据：market_turnover.json { generated, dates[], amount[]（亿元）, totalMv[]（亿元）, turnover[]（%） }
 * 展示：上 = 全市场成交金额（柱/面积）；下 = 换手率折线 + 窗口均值虚线 + 分位带
 * 周期：3 / 5 / 7 / 10 / 20 年（交易日近似）
 */
(function () {
  'use strict';

  const YEARS = [3, 5, 7, 10, 20];

  let state = { years: 10 };

  function draw(canvasEl, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1800 : 860;
    const padL = exportMode ? 170 : 80;
    const padR = exportMode ? 150 : 70;
    const padT = exportMode ? 70 : 48;
    const padB = exportMode ? 50 : 44;

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

    // 周期裁剪
    const nYears = state.years;
    const maxDays = data.dates.length;
    const want = Math.round(nYears * 245);
    const startIdx = Math.max(0, maxDays - want);
    const dates = data.dates.slice(startIdx);
    const amount = data.amount.slice(startIdx);
    const turnover = data.turnover.slice(startIdx);
    const n = dates.length;

    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // 标题

    // ── 上图：成交金额（柱） ──
    const h1 = (H - padT - padB) * 0.44;
    const top1 = padT;
    let aMax = 0;
    amount.forEach((v) => { if (v > aMax) aMax = v; });
    if (!aMax) aMax = 1;
    const y1 = (v) => top1 + h1 * (1 - v / aMax);

    // y 网格
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = (aMax / 4) * g;
      const y = y1(v);
      ctx.strokeStyle = '#EDEDED'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.fillText((v / 1e4).toFixed(v >= 1e4 ? 1 : 2) + '万亿', padL - 10, y);
    }
    // 柱（降采样：n>800 时画线）
    if (n > 800) {
      ctx.strokeStyle = '#E65A56'; ctx.lineWidth = exportMode ? 2 : 1;
      ctx.beginPath();
      amount.forEach((v, i) => {
        const x = xs(i), y = y1(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      const bw = Math.max(1, (W - padL - padR) / n * 0.7);
      ctx.fillStyle = '#E65A56';
      amount.forEach((v, i) => {
        const x = xs(i) - bw / 2;
        ctx.fillRect(x, y1(v), bw, top1 + h1 - y1(v));
      });
    }
    // 上图标题
    ctx.fillStyle = '#333333'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.fillText('全市场成交金额（两市合计）', padL, top1 - 8);

    // 上图：最新值水平虚线（红色）
    const lastAmt = amount[n - 1];
    if (lastAmt !== null && lastAmt !== undefined) {
      const ly = y1(lastAmt);
      ctx.strokeStyle = '#E65A56'; ctx.lineWidth = exportMode ? 3 : 1.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(W - padR, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#E65A56'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
      ctx.fillText(`最新 ${(lastAmt / 1e4).toFixed(2)} 万亿`, W - padR, ly - 8);
    }

    // ── 下图：换手率折线 + 均值 + 分位带 ──
    const h2 = (H - padT - padB) * 0.44;
    const top2 = top1 + h1 + (H - padT - padB) * 0.06;
    const vals = turnover.filter((v) => v !== null && v !== undefined);
    let tMin = Math.min(...vals), tMax = Math.max(...vals);
    if (!isFinite(tMin)) { tMin = 0; tMax = 1; }
    const tPad = (tMax - tMin) * 0.08 || 0.1;
    tMin -= tPad; tMax += tPad;
    const y2 = (v) => top2 + h2 * (1 - (v - tMin) / (tMax - tMin));

    for (let g = 0; g <= 4; g++) {
      const v = tMin + (tMax - tMin) * g / 4;
      const y = y2(v);
      ctx.strokeStyle = '#EDEDED'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.fillText(v.toFixed(1) + '%', padL - 10, y);
    }

    // 换手率折线（黑色）
    ctx.strokeStyle = '#333333'; ctx.lineWidth = exportMode ? 4 : 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    turnover.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      const x = xs(i), y = y2(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 下图：最新值水平虚线（黑色）
    let lastTr = null, lastTrIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (turnover[i] !== null && turnover[i] !== undefined) { lastTr = turnover[i]; lastTrIdx = i; break; }
    }
    if (lastTr !== null) {
      const ly = y2(lastTr);
      ctx.strokeStyle = '#333333'; ctx.lineWidth = exportMode ? 3 : 1.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(W - padR, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#333333'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
      ctx.fillText(`最新 ${lastTr.toFixed(2)}%`, W - padR, ly - 8);
    }

    // 下图标题
    ctx.fillStyle = '#333333'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.fillText('换手率（成交额 / 全市场总市值）', padL, top2 - 8);

    // x 轴年份
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const yearSet = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || d.slice(0, 4) !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearSet.add([y, i]);
    });
    yearSet.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 6));

    // 页脚
    if (exportMode) {
      ctx.fillStyle = '#888888'; ctx.font = '300 22px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const asOf = (data.generated || '').slice(0, 10);
      ctx.fillText(`数据截至 ${asOf} · 两市成交额（新浪）· 总市值（乐咕）· 自由流通市值无日度历史，采用总市值口径`, padL, H - 64);
      ctx.textAlign = 'right';
    }

    // ── hover 纵向跟随虚线（贯穿上下两图）──
    if (!exportMode && opts.hoverIdx !== undefined && opts.hoverIdx !== null) {
      const hx = xs(opts.hoverIdx);
      window.AK.drawHoverVLine(ctx, hx, top1, top2 + h2, scale);
    }

    // ── 悬浮数值提示（屏幕版）：最近交易日 → 成交额 / 换手 ──
    if (!exportMode && opts.bindHover !== false) {
      canvasEl.__mtData = { dates, amount, turnover, xs, data, state, drawFn: draw };
      if (!canvasEl.__hoverBound) {
        canvasEl.__hoverBound = true;
        canvasEl.addEventListener('mousemove', (ev) => {
          const D = canvasEl.__mtData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvasEl, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) {
            window.AK.tooltip.hide();
            D.drawFn(canvasEl, D.data, { exportMode: false, scale: window.devicePixelRatio || 1 });
            return;
          }
          const n = D.dates.length;
          const idx = Math.max(0, Math.min(n - 1, Math.round((sx - padL) / (W - padL - padR) * (n - 1))));
          const i = idx;

          // 重绘带竖线
          D.drawFn(canvasEl, D.data, { exportMode: false, scale: window.devicePixelRatio || 1, hoverIdx: i });

          const amt = D.amount[i];
          const tr = D.turnover[i];
          let html = `<b>${D.dates[i]}</b><br>成交金额：<b>${(amt / 1e4).toFixed(2)} 万亿</b>`;
          if (tr !== null && tr !== undefined) html += `<br>换手率：<b>${tr.toFixed(2)}%</b>`;
          window.AK.tooltip.show(ev, html);
        });
        canvasEl.addEventListener('mouseleave', () => {
          window.AK.tooltip.hide();
          const D = canvasEl.__mtData;
          if (D) D.drawFn(canvasEl, D.data, { exportMode: false, scale: window.devicePixelRatio || 1 });
        });
      }
    }
  }

  window.MT_render = function (data) {
    const wrap = document.getElementById('panelTurnoverBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    // 周期切换控制
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-controls';
    ctrl.innerHTML = `<div class="ctrl-group"><label>窗口</label><span class="seg" id="mt-years"></span></div>`;
    wrap.appendChild(ctrl);
    const seg = ctrl.querySelector('#mt-years');
    YEARS.forEach((y) => {
      const b = document.createElement('button');
      b.textContent = `${y} 年`;
      if (y === state.years) b.classList.add('active');
      b.addEventListener('click', () => {
        state.years = y;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });
      });
      seg.appendChild(b);
    });

    const canvas = document.createElement('canvas');
    canvas.id = 'turnover';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      turnover: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
