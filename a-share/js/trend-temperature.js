/**
 * 面板：市场趋势温度（德邦《A股动静框架之静态指标》· 市场交易/情绪）
 * 数据：trend_temperature.json
 *   { stock_ma250: [{date,total,above_ma250,pct_above}], industry_macd: [{date,positive_count,total,pct_positive}], updated }
 * 展示：上子图 50 周均线上方个股占比（日度）；下子图 申万一级行业 MACD>0 占比（月度）
 */
(function () {
  'use strict';

  const COL = { stock: '#E65A56', macd: '#5AAEF3', ref: '#CCCCCC' };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 220 : 140;
    const padT = exportMode ? 200 : 52;
    const padB = exportMode ? 90 : 40;

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

    const stocks = data.stock_ma250 || [];
    const macds = data.industry_macd || [];
    const gap = exportMode ? 90 : 40;
    const plotTop = padT, plotBottom = H - padB;
    const half = (plotBottom - plotTop - gap) / 2;
    const box1 = { top: plotTop, h: half };
    const box2 = { top: plotTop + half + gap, h: half };

    function yMap(v, ymin, ymax, box) {
      return box.top + (1 - (v - ymin) / (ymax - ymin)) * box.h;
    }

    // 共享日期刻度函数
    function drawXAxis(dates, ticksEvery, yBase) {
      const yearTicks = new Set();
      dates.forEach((d, i) => {
        const y = d.slice(0, 4);
        if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % ticksEvery === 0) yearTicks.add([y, i]);
      });
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      yearTicks.forEach(([y, i]) => {
        const x = xs(i);
        ctx.fillText(y, x, yBase + (exportMode ? 14 : 6));
      });
    }

    // ── 子图 1：50 周线上方个股占比 ──
    const d1 = stocks.map((r) => r.date);
    const v1 = stocks.map((r) => r.pct_above);
    const n1 = d1.length;
    const xs = (i, nn = n1, left = padL, right = W - padR) =>
      left + (nn === 1 ? 0.5 : i / (nn - 1)) * (right - left);

    let sMin = Math.min(0, ...v1), sMax = Math.max(100, ...v1);
    const sPad = (sMax - sMin) * 0.06 || 5;
    sMin -= sPad; sMax += sPad;

    for (let k = 0; k <= 5; k++) {
      const v = sMin + (sMax - sMin) * k / 5;
      const y = yMap(v, sMin, sMax, box1);
      ctx.strokeStyle = '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(v) + '%', padL - 12, y);
    }
    // 50% 参考虚线
    const y50 = yMap(50, sMin, sMax, box1);
    ctx.strokeStyle = COL.ref;
    ctx.setLineDash([exportMode ? 8 : 4, exportMode ? 6 : 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y50); ctx.lineTo(W - padR, y50); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COL.stock;
    ctx.lineWidth = exportMode ? 5 : 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n1; i++) {
      const x = xs(i), y = yMap(v1[i], sMin, sMax, box1);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 末端
    const last1 = v1[n1 - 1];
    const e1y = yMap(last1, sMin, sMax, box1);
    ctx.fillStyle = '#5AAEF3';
    ctx.beginPath(); ctx.arc(xs(n1 - 1), e1y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.stock;
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(last1.toFixed(1) + '%', xs(n1 - 1) + (exportMode ? 20 : 12), e1y);

    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('处于 50 周均线上方的个股占比（全 A 后复权日线）', padL, box1.top - (exportMode ? 34 : 18));
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    ctx.fillText(`${d1[0]} — ${d1[n1 - 1]} · 5562 只全 A 股`, padL, box1.top - (exportMode ? 8 : 4));

    // ── 子图 2：申万一级行业 MACD>0 占比 ──
    const d2 = macds.map((r) => r.date);
    const v2 = macds.map((r) => r.pct_positive);
    const n2 = d2.length;

    let mMin = Math.min(0, ...v2), mMax = Math.max(100, ...v2);
    const mPad = (mMax - mMin) * 0.06 || 5;
    mMin -= mPad; mMax += mPad;

    for (let k = 0; k <= 5; k++) {
      const v = mMin + (mMax - mMin) * k / 5;
      const y = yMap(v, mMin, mMax, box2);
      ctx.strokeStyle = '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(v) + '%', padL - 12, y);
    }
    const y50b = yMap(50, mMin, mMax, box2);
    ctx.strokeStyle = COL.ref;
    ctx.setLineDash([exportMode ? 8 : 4, exportMode ? 6 : 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y50b); ctx.lineTo(W - padR, y50b); ctx.stroke();
    ctx.setLineDash([]);

    // 柱状（月度，窄柱）+ 折线
    const barW = (W - padL - padR) / n2 * 0.6;
    ctx.fillStyle = '#5AAEF3';
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < n2; i++) {
      const x = xs(i, n2);
      const y0 = yMap(0, mMin, mMax, box2);
      const y1 = yMap(v2[i], mMin, mMax, box2);
      const h = Math.abs(y1 - y0);
      ctx.fillRect(x - barW / 2, Math.min(y0, y1), barW, Math.max(h, 1));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = exportMode ? 3 : 1.4;
    ctx.beginPath();
    for (let i = 0; i < n2; i++) {
      const x = xs(i, n2), y = yMap(v2[i], mMin, mMax, box2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 末端
    const last2 = v2[n2 - 1];
    const e2y = yMap(last2, mMin, mMax, box2);
    ctx.fillStyle = '#E65A56';
    ctx.beginPath(); ctx.arc(xs(n2 - 1, n2), e2y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#333333';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(last2.toFixed(0) + '%', xs(n2 - 1, n2) + (exportMode ? 20 : 12), e2y);

    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('申万一级行业 MACD > 0 的行业占比（月度末）', padL, box2.top - (exportMode ? 34 : 18));
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    ctx.fillText(`${d2[0]} — ${d2[n2 - 1]} · 31 个一级行业`, padL, box2.top - (exportMode ? 8 : 4));

    // 共享 X 轴
    drawXAxis(d1, 4, plotBottom);

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('市场趋势温度', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('个股 50 周线上方占比 · 行业 MACD 扩散', W / 2, 160);
    }

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${d1[n1 - 1]} · hithink 全市场后复权日线 + 申万一级行业日线`, padL, H - 40);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 40);
    }

    // ── 悬浮提示 ──
    if (!exportMode) {
      canvas.__ttData = { stocks, macds, xs1: (i) => xs(i), xs2: (i) => xs(i, n2), box1, box2, y1: (v) => yMap(v, sMin, sMax, box1), y2: (v) => yMap(v, mMin, mMax, box2) };
      if (!canvas.__ttBound) {
        canvas.__ttBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__ttData;
          if (!D) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          // 判断在哪个子图
          const { y } = window.AK.canvasXY(canvas, ev);
          const sy = y / (window.devicePixelRatio || 1);
          if (sy >= D.box1.top && sy <= D.box1.top + D.box1.h) {
            const i = Math.max(0, Math.min(D.stocks.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.stocks.length - 1))));
            const r = D.stocks[i];
            window.AK.tooltip.show(ev,
              `<b>${r.date}</b><br>` +
              `<span style="color:#E65A56">●</span> 50周线上方：<b>${r.pct_above.toFixed(1)}%</b><br>` +
              `（${r.above_ma250} / ${r.total} 只）`);
          } else if (sy >= D.box2.top && sy <= D.box2.top + D.box2.h) {
            const i = Math.max(0, Math.min(D.macds.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.macds.length - 1))));
            const r = D.macds[i];
            window.AK.tooltip.show(ev,
              `<b>${r.date}</b><br>` +
              `<span style="color:#5AAEF3">●</span> 行业MACD>0：<b>${r.pct_positive.toFixed(0)}%</b><br>` +
              `（${r.positive_count} / ${r.total} 个行业）`);
          } else { window.AK.tooltip.hide(); }
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.TT_render = function (data) {
    data = (data && data.items) || data;  // JSON 为 { generated, items } 包装时解包
    const wrap = document.getElementById('panelTrendBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'trendTemperature';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      trendTemperature: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
