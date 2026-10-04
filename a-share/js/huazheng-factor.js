/**
 * 华证六因子面板
 * 数据：panel_huazheng.json { generated, baseDate, factors: { 成长: {name, dates[], nav[]} }, note }
 * 展示：成长/价值/低波/动量/质量/红利 6 因子净值（大中小微 4 档等权合成），对数坐标，2005-01-04=1
 * 交互：鼠标悬停查看最近交易日各因子净值；图例横向罗列
 */
(function () {
  'use strict';

  // Laoqian Chart 取色规范：按数据系列顺序取色（蓝/深灰/红/紫/深蓝灰/青绿）
  const COLORS = {
    成长: '#5AAEF3', 价值: '#333333', 低波: '#E65A56',
    动量: '#6D61E4', 质量: '#5B6E96', 红利: '#62D9AD'
  };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
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

    const factors = Object.keys(data.factors || {});
    const dates = factors.length ? data.factors[factors[0]].dates : [];
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // y 范围（对数）
    let yMin = Infinity, yMax = -Infinity;
    factors.forEach((f) => {
      (data.factors[f].nav || []).forEach((v) => {
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

    // 网格（对数刻度）
    const gridLevels = [1, 2, 4, 8, 16, 32, 64];
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

    // x 轴年份刻度（隔年显示防重叠）
    const yearTicks = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('华证 A股六因子', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText(`${data.baseDate || '2005-01-04'} = 1 · 大中小微4档等权合成 · 纵轴对数 · 华证价格指数`, W / 2, 160);
    }

    // 画线
    factors.forEach((f) => {
      const color = COLORS[f] || '#888888';
      const nav = data.factors[f].nav || [];
      ctx.strokeStyle = color;
      ctx.lineWidth = exportMode ? 6 : 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = nav[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // ── 末端 CAGR 标签（一个数字，防重叠：按末端 y 排序 + 左右交替 + 间距挤开）──
    const ends = [];
    factors.forEach((f) => {
      const nav = data.factors[f].nav || [];
      let li = -1;
      for (let i = nav.length - 1; i >= 0; i--) {
        if (nav[i] !== null && nav[i] > 0) { li = i; break; }
      }
      if (li < 0) return;
      let fi = -1;
      for (let i = 0; i <= li; i++) {
        if (nav[i] !== null && nav[i] > 0) { fi = i; break; }
      }
      if (fi < 0) return;
      const v0 = nav[fi], v1 = nav[li];
      const y0 = Date.parse(dates[fi]), y1 = Date.parse(dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      ends.push({ f, x: xs(li), y: ys(v1), v1, cagr, color: COLORS[f] || '#888888' });
    });
    ends.sort((a, b) => b.y - a.y);
    const lh2 = exportMode ? 34 : 16;
    const used = [];
    const dotColor = (c) => (c === '#E65A56' ? '#5AAEF3' : '#E65A56');
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    ends.forEach((e, i) => {
      const txt = `${(e.cagr * 100).toFixed(1)}%`;
      const tw = ctx.measureText(txt).width;
      const side = (i % 2 === 0) ? 1 : -1;
      const bx = side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12) - tw;
      const ha = side === 1 ? 'left' : 'right';
      let dy = 0;
      for (let k = 0; k < 24; k++) {
        const cand = e.y + dy;
        const clash = used.some((u) => Math.abs(u - cand) < lh2 * 1.15);
        if (!clash) break;
        dy = (k % 2 === 0) ? dy - lh2 * 1.15 : dy + lh2 * 1.15;
        if (k > 10) dy += lh2 * 1.15;
      }
      const labelY = e.y + dy;
      used.push(labelY);
      ctx.fillStyle = dotColor(e.color);
      ctx.beginPath();
      ctx.arc(e.x, e.y, exportMode ? 9 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x + (side === 1 ? (exportMode ? 8 : 6) : -(exportMode ? 8 : 6)), e.y);
      ctx.lineTo(side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12), labelY);
      ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.textAlign = ha;
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx, labelY);
    });
    // 图例（横向单行罗列：预计算总宽，超宽逐级缩短，不折行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 245 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const lgap = exportMode ? 52 : 24;
    const lastVals = factors.map((f) => {
      const nav = data.factors[f].nav || [];
      const last = nav[nav.length - 1];
      return (last !== null && last !== undefined) ? last : null;
    });
    let legendNames = factors.slice();
    const legendW = (ns) => ns.reduce((w, nm, i) => {
      const label = `${nm}${lastVals[i] !== null ? `  ${lastVals[i].toFixed(1)}x` : ''}`;
      return w + ctx.measureText(label).width + (exportMode ? 56 : 24) + lgap;
    }, 0);
    let minLen = 6;
    while (legendW(legendNames) > W - padR - lx0 - 16 && minLen > 2) {
      minLen--;
      legendNames = legendNames.map((nm) => (nm.length > minLen ? nm.slice(0, minLen) : nm));
    }
    let lx = lx0, ly = ly0;
    factors.forEach((f, i) => {
      const color = COLORS[f] || '#888888';
      const label = `${legendNames[i]}${lastVals[i] !== null ? `  ${lastVals[i].toFixed(1)}x` : ''}`;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(label, lx + (exportMode ? 56 : 24), ly);
      lx += ctx.measureText(label).width + (exportMode ? 56 : 24) + lgap;
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      const asOf = (data.generated || '').slice(0, 10);
      ctx.fillText(`数据截至 ${asOf} · 微盘红利 2014 前为 3 档等权 · 华证指数 IDMT 公开接口`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // ── 悬浮数值提示（屏幕版） ──
    if (!exportMode) {
      canvas.__hzData = { factors, dates, xs, nav: data.factors };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__hzData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          let html = `<b>${D.dates[i]}</b><br>`;
          D.factors.forEach((f) => {
            const v = (D.nav[f].nav || [])[i];
            if (v === null || v === undefined) return;
            html += `<span style="color:${COLORS[f] || '#888'}">●</span> ${f}：<b>${v.toFixed(1)}x</b><br>`;
          });
          window.AK.tooltip.show(ev, html.slice(0, -4));
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.HZ_render = function (data) {
    const wrap = document.getElementById('panelHuazhengBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'huazhengFactor';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      huazhengFactor: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
