/**
 * 基金指数面板（面板 10）
 * 数据：fund_index.json { series: { '885001.WI': {dates, values, rolling3}, '885003.WI': ..., 'A500TR.CSI': ... } }
 * 展示：上：中证A500全收益 vs 偏债混合基金指数（2024-01 归一 = 100）
 *       下：偏股混合基金指数 3 年滚动年化（%）
 */
(function () {
  'use strict';

  const C_A500 = '#5AAEF3';   // 蓝
  const C_DEBT = '#333333';   // 深灰
  const C_PG = '#E65A56';     // 红（偏股混合滚动年化）

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1700 : 760;
    const padL = exportMode ? 190 : 96;
    const padR = exportMode ? 170 : 96;
    const padT = exportMode ? 210 : 54;
    const padB = exportMode ? 120 : 50;
    const GAP = exportMode ? 130 : 52;   // 上下子图间距

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

    const S = data.series || {};
    const a500 = S['A500TR.CSI'], debt = S['885003.WI'], pg = S['885001.WI'];
    if (!a500 || !debt) return;

    // ── 子图 A：A500 全收益 vs 偏债（共同日期段，归一 100）──
    const t0 = a500.dates[0];                    // 2024-01-02
    const dDates = debt.dates.map((d, i) => ({ d, i })).filter((o) => o.d >= t0);
    const aIdx0 = 0;
    const aDates = a500.dates;
    const dDatesArr = dDates.map((o) => o.d);
    const nA = aDates.length;
    // 归一
    const aBase = a500.values[0] || 1;
    const aNorm = a500.values.map((v) => (v === null || v === undefined || Number.isNaN(v)) ? null : v / aBase * 100);
    const dBegIdx = dDates[0] ? dDates[0].i : 0;
    const dBeg = debt.values[dBegIdx] || 1;
    const dNormRaw = debt.values.map((v) => (v === null || v === undefined || Number.isNaN(v)) ? null : v / dBeg * 100);
    const dNorm = dNormRaw.slice(dBegIdx);

    // 子图 A 区域
    const A_top = padT, A_bot = padT + (H - padT - padB - GAP) * 0.52;
    const xA = (i) => padL + (nA === 1 ? 0.5 : i / (nA - 1)) * (W - padL - padR);
    let aMin = Infinity, aMax = -Infinity;
    aNorm.concat(dNorm).forEach((v) => { if (v !== null) { if (v < aMin) aMin = v; if (v > aMax) aMax = v; } });
    const aPad = (aMax - aMin) * 0.08 || 1; aMin -= aPad; aMax += aPad;
    const yA = (v) => A_bot - (v - aMin) / (aMax - aMin) * (A_bot - A_top);

    // A 区网格 + 刻度
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = aMin + (aMax - aMin) * k / 4;
      const y = yA(v);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(0), padL - 12, y);
    }
    // A 区 x 刻度（年份）
    const yearTicksA = new Set();
    aDates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== aDates[i - 1].slice(0, 4)) && +y % 1 === 0) yearTicksA.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicksA.forEach(([y, i]) => ctx.fillText(y, xA(i), A_bot + 8));

    function poly(values, xf, yf, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined || Number.isNaN(v)) { started = false; continue; }
        const x = xf(i), y = yf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 偏债（深灰）先画、A500（蓝）后画，数据点按各自日期对齐 x（用 A 的 x 轴）
    const dDatesIdx = dDates.map((o) => o.i);
    poly(dNorm, (i) => xA(Math.round(i / Math.max(1, dDatesIdx.length - 1) * (nA - 1))), yA, C_DEBT, exportMode ? 4 : 1.8);
    poly(aNorm, xA, yA, C_A500, exportMode ? 5 : 2.2);

    // A 区末端标签
    const aEnd = aNorm[nA - 1], dEnd = dNorm[dNorm.length - 1];
    if (aEnd !== null) {
      const x = xA(nA - 1), y = yA(aEnd);
      ctx.fillStyle = C_A500;
      ctx.beginPath(); ctx.arc(x, y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C_A500;
      ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${aEnd.toFixed(1)}`, x + (exportMode ? 16 : 10), y - (exportMode ? 14 : 8));
    }
    if (dEnd !== null) {
      const x = xA(nA - 1), y = yA(dEnd);
      ctx.fillStyle = C_DEBT;
      ctx.beginPath(); ctx.arc(x, y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C_DEBT;
      ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${dEnd.toFixed(1)}`, x + (exportMode ? 16 : 10), y + (exportMode ? 14 : 8));
    }
    // A 区子标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '700 40px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('中证A500全收益 vs 偏债混合基金指数（2024-01 = 100）', padL, padT - 40);
    }

    // ── 子图 B：偏股混合 3 年滚动年化 ──
    const B_top = A_bot + GAP, B_bot = H - padB;
    const pDates = pg.dates, pRoll = pg.rolling3 ? pg.rolling3.values : null;
    const nP = pDates.length;
    const xP = (i) => padL + (nP === 1 ? 0.5 : i / (nP - 1)) * (W - padL - padR);
    let pMin = -20, pMax = 60;   // 滚动年化可视范围（默认；超出再扩展）
    if (pRoll) {
      const valid = pRoll.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
      if (valid.length) {
        const lo = Math.min(...valid), hi = Math.max(...valid);
        pMin = Math.floor(Math.min(lo - 5, -5) / 5) * 5;
        pMax = Math.ceil(Math.max(hi + 5, 25) / 5) * 5;
      }
    }
    const yP = (v) => B_bot - (v - pMin) / (pMax - pMin) * (B_bot - B_top);

    // B 区网格 + 零线
    ctx.lineWidth = 1;
    for (let g = pMin; g <= pMax; g += 10) {
      const y = yP(g);
      ctx.strokeStyle = (g === 0) ? '#BBBBBB' : '#EDEDED';
      ctx.lineWidth = (g === 0) ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${g}%`, padL - 12, y);
    }
    // B 区 x 年份
    const yearTicksB = new Set();
    pDates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== pDates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicksB.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicksB.forEach(([y, i]) => ctx.fillText(y, xP(i), B_bot + 8));

    // B 区曲线
    if (pRoll) {
      ctx.strokeStyle = C_PG; ctx.lineWidth = exportMode ? 5 : 2.2; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      for (let i = 0; i < pRoll.length; i++) {
        const v = pRoll[i];
        if (v === null || v === undefined || Number.isNaN(v)) { started = false; continue; }
        const x = xP(i), y = yP(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // 末端标签
      let li = -1;
      for (let i = pRoll.length - 1; i >= 0; i--) { if (pRoll[i] !== null && pRoll[i] !== undefined && !Number.isNaN(pRoll[i])) { li = i; break; } }
      if (li >= 0) {
        const x = xP(li), y = yP(pRoll[li]);
        ctx.fillStyle = '#30CB13';
        ctx.beginPath(); ctx.arc(x, y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = C_PG;
        ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${pRoll[li].toFixed(1)}%`, x + (exportMode ? 16 : 10), y);
      }
    }
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '700 40px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('偏股混合基金指数 · 3 年滚动年化收益', padL, B_top - 40);
    }

    // ── 主标题（导出版）──
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('基金指数', W / 2, 84);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('A500 全收益 vs 偏债 · 偏股混合 3 年滚动年化', W / 2, 154);
    }

    // ── 图例（横向单行，两个子图合并）──
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 200 : 16;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const items = [
      { c: C_A500, label: `中证A500全收益  ${aEnd !== null ? aEnd.toFixed(1) : '—'}` },
      { c: C_DEBT, label: `偏债混合  ${dEnd !== null ? dEnd.toFixed(1) : '—'}` },
      { c: C_PG, label: '偏股混合 3年滚动年化' },
    ];
    let lx = lx0;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly0 - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.label, lx + (exportMode ? 56 : 24), ly0);
      lx += ctx.measureText(it.label).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${(data.generated || '').slice(0, 10)} · 885001 偏股混合 / 885003 偏债混合（Wind）· A500 全收益（Wind）· 3年滚动年化 = 756 交易日窗口年化复合`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // ── hover（屏幕版）──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__fdData = { a500, debt, pg, aNorm, dNorm, pRoll, nA, nP, xA, yA, xP, yP, aDates, dDatesArr, pDates };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__fdData;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1), sy = y / (window.devicePixelRatio || 1);
          let html = null;
          if (sy >= A_top && sy <= A_bot) {
            const idx = Math.max(0, Math.min(D.nA - 1, Math.round((sx - padL) / (W - padL - padR) * (D.nA - 1))));
            const av = D.aNorm[idx];
            const dj = nearest(dDatesArr, D.aDates[idx]);
            const dv = (dj >= 0) ? D.dNorm[dj] : null;
            html = `<b>${D.aDates[idx]}</b><br>`;
            if (av !== null) html += `<span style="color:${C_A500}">●</span> A500全收益：<b>${av.toFixed(1)}</b><br>`;
            if (dv !== null) html += `<span style="color:${C_DEBT}">●</span> 偏债混合：<b>${dv.toFixed(1)}</b>`;
          } else if (sy >= B_top && sy <= B_bot && D.pRoll) {
            const idx = Math.max(0, Math.min(D.nP - 1, Math.round((sx - padL) / (W - padL - padR) * (D.nP - 1))));
            const pv = D.pRoll[idx];
            if (pv !== null && pv !== undefined) {
              html = `<b>${D.pDates[idx]}</b><br><span style="color:${C_PG}">●</span> 3年滚动年化：<b>${pv.toFixed(2)}%</b>`;
            }
          }
          if (html) window.AK.tooltip.show(ev, html.replace(/<br>$/, ''));
          else window.AK.tooltip.hide();
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  function nearest(arr, t) {
    if (!arr.length || t <= arr[0]) return 0;
    if (t >= arr[arr.length - 1]) return arr.length - 1;
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m; else hi = m; }
    return (t - arr[lo] <= arr[hi] - t) ? lo : hi;
  }

  window.FI_render = function (data) {
    const wrap = document.getElementById('panelFundBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'fundIndex';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      fundIndex: (off, scale) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
