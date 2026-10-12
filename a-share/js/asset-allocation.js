/**
 * 面板：股债性价比 · ERP（德邦《A股动静框架之静态指标》· 资产联动）
 * 数据：asset_allocation.json
 *   [{ date:'2007-01', pe_ttm, earning_yield, yield, erp, rel_ratio, erp_pct }]
 *   中证800 PE-TTM 倒数（盈利收益率）− 中债10Y国债收益率 = ERP
 * 展示：上子图 ERP（%）+ 当前分位；下子图 股债相对收益率（盈利收益率 / 10Y 国债，相除）
 */
(function () {
  'use strict';

  const COL = { erp: '#E65A56', rel: '#5AAEF3', zero: '#CCCCCC', pctBand: '#F5C0BE' };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 220 : 140;
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 40;

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

    const rows = data || [];
    const dates = rows.map((r) => r.date);
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // 两个子图的绘图区
    const gap = exportMode ? 50 : 40;
    const plotTop = padT, plotBottom = H - padB;
    const half = (plotBottom - plotTop - gap) / 2;
    const box1 = { top: plotTop, h: half };           // ERP
    const box2 = { top: plotTop + half + gap, h: half }; // 股债相对收益率

    function yMap(v, ymin, ymax, box) {
      return box.top + (1 - (v - ymin) / (ymax - ymin)) * box.h;
    }

    // 子图 1：ERP
    const erp = rows.map((r) => r.erp);
    let eMin = Math.min(...erp), eMax = Math.max(...erp);
    const ePad = (eMax - eMin) * 0.08 || 0.3;
    eMin -= ePad; eMax += ePad;

    // 网格
    ctx.lineWidth = 1;
    [0].forEach((lv) => {
      if (lv < eMin || lv > eMax) return;
      const y = yMap(lv, eMin, eMax, box1);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    });
    const yticks1 = 5;
    for (let k = 0; k <= yticks1; k++) {
      const v = eMin + (eMax - eMin) * k / yticks1;
      const y = yMap(v, eMin, eMax, box1);
      ctx.strokeStyle = (k === yticks1) ? 'transparent' : '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(1) + '%', padL - 12, y);
    }

    // 每月纵向参考线（先画，曲线在上层）
    const monthTicks = new Set();
    dates.forEach((d, i) => {
      const ym = d.slice(0, 7);
      if (i === 0 || ym !== dates[i - 1].slice(0, 7)) monthTicks.add(i);
    });
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 1;
    monthTicks.forEach((i) => {
      const x = xs(i);
      ctx.beginPath(); ctx.moveTo(x, box1.top); ctx.lineTo(x, box1.top + box1.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, box2.top); ctx.lineTo(x, box2.top + box2.h); ctx.stroke();
    });

    // 分位着色带：ERP 当前分位 → 底部注释
    const lastErp = erp[n - 1];
    const lastPct = rows[n - 1].erp_pct !== undefined ? rows[n - 1].erp_pct : null;

    // ERP 曲线 + 末端
    ctx.strokeStyle = COL.erp;
    ctx.lineWidth = exportMode ? 6 : 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xs(i), y = yMap(erp[i], eMin, eMax, box1);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 末端点 + 标签
    const ey = yMap(lastErp, eMin, eMax, box1);
    ctx.fillStyle = '#5AAEF3';
    ctx.beginPath(); ctx.arc(xs(n - 1), ey, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.erp;
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${lastErp.toFixed(2)}%`, xs(n - 1) + (exportMode ? 20 : 12), ey);

    // 子图 1 标题
    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('股权风险溢价 ERP（中证800 盈利收益率 − 中债10Y国债）', padL, box1.top - (exportMode ? 34 : 18));
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    if (lastPct !== null) {
      ctx.fillText(`当前 ${lastErp.toFixed(2)}% · 历史分位 ${(lastPct * 100).toFixed(0)}% · ${dates[0]} — ${dates[n - 1]}`, padL, box1.top - (exportMode ? 8 : 4));
    }

    // ── 子图 2：股债相对收益率（相除）──
    const rel = rows.map((r) => r.rel_ratio);
    let rMin = Math.min(...rel), rMax = Math.max(...rel);
    const rPad = (rMax - rMin) * 0.08 || 0.1;
    rMin -= rPad; rMax += rPad;

    for (let k = 0; k <= yticks1; k++) {
      const v = rMin + (rMax - rMin) * k / yticks1;
      const y = yMap(v, rMin, rMax, box2);
      ctx.strokeStyle = (k === yticks1) ? 'transparent' : '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(1) + 'x', padL - 12, y);
    }
    ctx.strokeStyle = COL.rel;
    ctx.lineWidth = exportMode ? 6 : 2.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xs(i), y = yMap(rel[i], rMin, rMax, box2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const ry = yMap(rel[n - 1], rMin, rMax, box2);
    ctx.fillStyle = '#E65A56';
    ctx.beginPath(); ctx.arc(xs(n - 1), ry, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.rel;
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${rel[n - 1].toFixed(2)}x`, xs(n - 1) + (exportMode ? 20 : 12), ry);

    // ── 阶段性高点标记 ──
    function findPeaks(arr, window) {
      const peaks = [];
      // 中段：前后都有足够窗口
      for (let i = window; i < arr.length - window; i++) {
        let isPeak = true;
        for (let j = i - window; j <= i + window; j++) {
          if (j !== i && arr[j] > arr[i]) { isPeak = false; break; }
        }
        if (isPeak) peaks.push(i);
      }
      // 末尾：从 (arr.length - window) 到最后，找区间最高点
      const tailStart = arr.length - window;
      if (tailStart > 0) {
        let tailMax = -Infinity, tailIdx = -1;
        for (let i = tailStart; i < arr.length; i++) {
          if (arr[i] > tailMax) { tailMax = arr[i]; tailIdx = i; }
        }
        if (tailIdx > 0 && tailMax > arr[tailStart - 1] && !peaks.includes(tailIdx)) {
          peaks.push(tailIdx);
        }
      }
      return peaks.sort((a, b) => a - b);
    }
    function drawPeakLabels(peaks, arr, yMin, yMax, box, color) {
      ctx.fillStyle = color;
      ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      peaks.forEach((i) => {
        const x = xs(i), y = yMap(arr[i], yMin, yMax, box);
        // 小点
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, exportMode ? 5 : 2.5, 0, Math.PI * 2); ctx.fill();
        // 日期标签 yyyy.mm
        const d = dates[i];
        const label = d.slice(0, 4) + '.' + d.slice(5, 7);
        ctx.fillText(label, x, y - (exportMode ? 12 : 6));
      });
    }
    const w = 24; // 约2年窗口
    drawPeakLabels(findPeaks(erp, w), erp, eMin, eMax, box1, COL.erp);
    drawPeakLabels(findPeaks(rel, w), rel, rMin, rMax, box2, COL.rel);

    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('股债相对收益率（中证800盈利收益率 ÷ 中债10Y国债，相除）', padL, box2.top - (exportMode ? 34 : 18));

    // ── 共享 X 轴：年份标签 ──
    const yearTicks = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % 3 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), plotBottom + (exportMode ? 16 : 8)));

    // 标题（导出版）

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${dates[n - 1]} · 乐咕乐股 PE-TTM + akshare 中美国债收益率`, padL, H - 40);
      ctx.textAlign = 'right';
    }

    // ── 悬浮提示 ──
    if (!exportMode) {
      canvas.__aaData = { rows, dates, xs, box1, box2, yMap1: (v) => yMap(v, eMin, eMax, box1), yMap2: (v) => yMap(v, rMin, rMax, box2) };
      if (!canvas.__aaBound) {
        canvas.__aaBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__aaData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          const r = D.rows[i];
          window.AK.tooltip.show(ev,
            `<b>${r.date}</b><br>` +
            `<span style="color:#E65A56">●</span> ERP：<b>${r.erp.toFixed(2)}%</b><br>` +
            `<span style="color:#888">●</span> 中证800 PE-TTM：<b>${r.pe_ttm.toFixed(1)}x</b><br>` +
            `<span style="color:#888">●</span> 盈利收益率：<b>${r.earning_yield.toFixed(2)}%</b><br>` +
            `<span style="color:#888">●</span> 中债10Y：<b>${r.yield.toFixed(2)}%</b><br>` +
            `<span style="color:#5AAEF3">●</span> 股债相对：<b>${r.rel_ratio.toFixed(2)}x</b>`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.AA_render = function (data) {
    data = (data && data.items) || data;  // JSON 为 { generated, items } 包装时解包
    const wrap = document.getElementById('panelAssetBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'assetAllocation';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      assetAllocation: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
