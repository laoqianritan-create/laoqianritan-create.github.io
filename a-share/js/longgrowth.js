/**
 * 长周期对数增长面板（七条线）
 * 数据：panel_longgrowth.json { generated, series: { code: {name, unit, dates[], values[]} } }
 * 展示：全部指标 2006-01 归一 = 1，纵轴对数，斜率即年化增速。
 */
(function () {
  'use strict';

  // Laoqian Chart 取色规范：按数据系列顺序取色（蓝/深灰/红/紫/深蓝灰/青绿/绿/青蓝）
  const COLORS = {
    M2: '#5AAEF3', 存款: '#333333', GDP: '#E65A56', 总市值: '#6D61E4',
    一线房价: '#5B6E96', 二线房价: '#62D9AD', 黄金: '#30CB13',
    中证全指全收益: '#23C2DB'
  };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1600 : 720;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 200 : 118;   // 右侧留出 CAGR 标签空间
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

    // 日期轴（取覆盖最全的序列作 master；每条线按日期二分对齐 x 位置）
    const master = series.reduce((a, b) => (b.dates.length > a.dates.length ? b : a), series[0]);
    const dates = master.dates;
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
    // 日期 → master 索引（二分最近）
    const idxOf = (d) => {
      if (d <= dates[0]) return 0;
      if (d >= dates[n - 1]) return n - 1;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (dates[m] <= d) lo = m; else hi = m;
      }
      return (d - dates[lo] <= dates[hi] - d) ? lo : hi;
    };
    // 每条线预计算 x 索引数组
    series.forEach((s) => {
      s.xidx = s.dates.map((d) => idxOf(d));
    });

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
      ctx.fillText('不同事物的增长情况', W / 2, 90);
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
      for (let i = 0; i < s.norm.length; i++) {
        const v = s.norm[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(s.xidx[i]), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // ── 末端 CAGR 标签（每个数字，防重叠：按末端 y 排序 + 左右交替 + 间距挤开）──
    const ends = [];
    series.forEach((s) => {
      let li = -1;
      for (let i = s.norm.length - 1; i >= 0; i--) {
        if (s.norm[i] !== null && s.norm[i] > 0) { li = i; break; }
      }
      if (li < 0) return;
      let fi = -1;
      for (let i = 0; i <= li; i++) {
        if (s.norm[i] !== null && s.norm[i] > 0) { fi = i; break; }
      }
      if (fi < 0) return;
      const v0 = s.norm[fi], v1 = s.norm[li];
      const y0 = Date.parse(s.dates[fi]), y1 = Date.parse(s.dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      ends.push({
        s, x: xs(s.xidx[li]), y: ys(v1), v1, cagr,
        color: COLORS[s.code] || '#888888'
      });
    });
    ends.sort((a, b) => b.y - a.y);   // 像素 y 从高到低
    const lh2 = exportMode ? 34 : 16; // 标签行高
    const used = [];                   // 已占用的标签 y 中心
    const dotColor = (c) => (c === '#E65A56' ? '#5AAEF3' : '#E65A56'); // 末端点与曲线反色
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    ends.forEach((e, i) => {
      const txt = `${(e.cagr * 100).toFixed(1)}%`;
      const tw = ctx.measureText(txt).width;
      const side = (i % 2 === 0) ? 1 : -1;                 // 0/2/4… 右侧，1/3/5… 左侧（交替分散）
      const bx = side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12) - tw;
      const ha = side === 1 ? 'left' : 'right';
      // 检查是否与已放标签重叠，重叠则上下挤开
      let dy = 0;
      for (let k = 0; k < 24; k++) {
        const cand = e.y + dy;
        const clash = used.some((u) => Math.abs(u - cand) < lh2 * 1.15);
        if (!clash) break;
        dy = (k % 2 === 0) ? dy - lh2 * 1.15 : dy + lh2 * 1.15;
        if (k > 10) dy += lh2 * 1.15;   // 持续不够就逐步下移
      }
      const labelY = e.y + dy;
      used.push(labelY);
      // 末端点（与曲线反色）
      ctx.fillStyle = dotColor(e.color);
      ctx.beginPath();
      ctx.arc(e.x, e.y, exportMode ? 9 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 连接线（标签与数据点）
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x + (side === 1 ? (exportMode ? 8 : 6) : -(exportMode ? 8 : 6)), e.y);
      ctx.lineTo(side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12), labelY);
      ctx.stroke();
      // 标签
      ctx.fillStyle = e.color;
      ctx.textAlign = ha;
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx, labelY);
    });

    // 图例（横向罗列，两行排不下自动换行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 245 : 20;
    const lh = exportMode ? 50 : 22;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let lx = lx0, ly = ly0;
    const lgap = exportMode ? 52 : 24;
    ctx.font = (exportMode ? 26 : 12.5) + 'px NotoSansSC, sans-serif';
    series.forEach((s) => {
      const color = COLORS[s.code] || '#888888';
      const last = s.norm[s.norm.length - 1];
      const mult = last !== null && last !== undefined ? last : null;
      const label = `${s.name}${mult ? `  ${mult.toFixed(1)}x` : ''}`;
      const tw = ctx.measureText(label).width + (exportMode ? 56 : 24);
      if (lx + tw > W - padR - 10) { lx = lx0; ly += lh; }
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(label, lx + (exportMode ? 56 : 24), ly);
      lx += tw + lgap;
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

    // ── 悬浮数值提示（屏幕版）：鼠标 x → 最近 master 交易日 → 每条线按自身日期就近取值 ──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__lgData = { series, dates };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__lgData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          const date = D.dates[i];
          let html = `<b>${date}</b><br>`;
          D.series.forEach((s) => {
            let v = null;
            if (s.norm.length) {
              const j = nearestIdx(s, date);
              v = (j >= 0) ? s.norm[j] : null;
            }
            if (v === null || v === undefined) return;
            html += `<span style="color:${COLORS[s.code] || '#888'}">●</span> ${s.name}：<b>${v.toFixed(1)}x</b><br>`;
          });
          window.AK.tooltip.show(ev, html.slice(0, -4));
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  // 该线自身 dates（升序）中距离目标日期最近的点索引
  function nearestIdx(s, t) {
    const d = s.dates;
    if (!d.length || t < d[0]) return 0;
    if (t > d[d.length - 1]) return d.length - 1;
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (d[m] <= t) lo = m; else hi = m;
    }
    return (t - d[lo] <= d[hi] - t) ? lo : hi;
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
