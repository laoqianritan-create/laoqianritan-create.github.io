/**
 * 长周期对数增长面板（七条线）
 * 数据：panel_longgrowth.json { generated, series: { code: {name, unit, dates[], values[]} } }
 * 展示：全部指标 2006-01 归一 = 1，纵轴对数，斜率即年化增速。
 */
(function () {
  'use strict';

  const COLORS = {
    M2: '#E65A56', 存款: '#D96A29', GDP: '#5AAEF3', 总市值: '#6D61E4',
    一线房价: '#2FBF71', 二线房价: '#5CBF6E', 黄金: '#E8B93A'
  };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1600 : 720;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 160 : 80;
    const padT = exportMode ? 220 : 60;
    const padB = exportMode ? 110 : 46;

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

    // 收集全部序列，取共同起点（2006-01 或最早）
    const codes = Object.keys(data.series || {});
    let startIdx = 0;
    const baseDate = data.baseDate || '2006-01';
    // 每条序列独立归一（以自身首个有效点 = 1）
    const series = codes.map((code) => {
      const s = data.series[code];
      const vals = s.values;
      let first = -1;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] !== null && vals[i] !== undefined && !Number.isNaN(vals[i])) { first = i; break; }
      }
      const base = first >= 0 ? vals[first] : 1;
      const norm = vals.map((v) => (v === null || v === undefined || Number.isNaN(v)) ? null : v / base);
      return { code, name: s.name, unit: s.unit, dates: s.dates, norm };
    });

    // 日期轴（取覆盖最全的序列）
    const master = series.reduce((a, b) => (b.dates.length > a.dates.length ? b : a), series[0]);
    const dates = master.dates;
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // y 范围：对数（以 2 为底？不，直接自然对数求范围）
    let yMin = Infinity, yMax = -Infinity;
    series.forEach((s) => {
      s.norm.forEach((v) => {
        if (v === null || v <= 0) return;
        const lv = Math.log(v);
        if (lv < yMin) yMin = lv;
        if (lv > yMax) yMax = lv;
      });
    });
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    const yPad = (yMax - yMin) * 0.05 || 0.1;
    yMin -= yPad; yMax += yPad;
    const ys = (v) => padT + (1 - (Math.log(v) - yMin) / (yMax - yMin)) * (H - padT - padB);

    // 网格线（对数刻度：0.5x/1x/2x/4x/8x/16x/32x）
    const gridLevels = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
    ctx.lineWidth = 1;
    gridLevels.forEach((lv) => {
      if (lv < Math.exp(yMin) || lv > Math.exp(yMax)) return;
      const y = ys(lv);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${lv}x`, padL - 10, y);
    });

    // x 轴年份刻度
    const yearTicks = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => {
      ctx.fillText(y, xs(i), H - padB + 8);
    });

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('长周期对数增长 · 七条线', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('2006-01 = 1 · 纵轴对数 · 斜率即年化增速', W / 2, 160);
    }

    // 画线
    series.forEach((s) => {
      const color = COLORS[s.code] || '#888888';
      ctx.strokeStyle = color;
      ctx.lineWidth = exportMode ? 6 : 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = s.norm[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // 图例
    const lx = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 240 : 20;
    const lh = exportMode ? 52 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    series.forEach((s, i) => {
      const y = ly0 + i * lh;
      const color = COLORS[s.code] || '#888888';
      ctx.fillStyle = color;
      ctx.fillRect(lx, y - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 26 : 12.5) + 'px NotoSansSC, sans-serif';
      const last = s.norm[s.norm.length - 1];
      const mult = last !== null && last !== undefined ? last : null;
      ctx.fillText(`${s.name}${mult ? `  ${mult.toFixed(1)}x` : ''}`, lx + (exportMode ? 56 : 24), y);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      const asOf = (data.generated || '').slice(0, 10);
      ctx.fillText(`数据截至 ${asOf} · M2/存款/GDP/总市值 月度 · 房价 月度（统计局，滞后约1–2个月）· 黄金 人民币口径`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }
  }

  window.LG_render = function (data) {
    const wrap = document.getElementById('panelLongBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'longGrowth';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      longGrowth: (off, scale) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
