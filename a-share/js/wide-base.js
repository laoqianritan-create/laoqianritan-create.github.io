/**
 * 面板 8：宽基指数全收益净值（对数）
 * 数据：wide_base.json { generated, baseDate, series: { code: {name, note, dates[], values[]} } }
 * 展示：沪深300/中证500/中证1000/中证2000/中证全指/中证A500/红利低波 全收益净值（2005=100），对数坐标
 * 交互：鼠标悬停查看数值；末端 CAGR 数字防重叠；图例横向单行
 */
(function () {
  'use strict';

  // Laoqian Chart 取色规范 12 色板按序
  const ORDER = ['H00300', 'H00905', 'H00852', '399606', '000688', '932000', 'H00985', 'A500TR.CSI', 'H30269.CSI'];
  const COLORS = {
    H00300: '#5AAEF3',    // 蓝 沪深300全收益
    H00905: '#333333',    // 深灰 中证500全收益
    H00852: '#E65A56',    // 红 中证1000全收益
    '399606': '#6D61E4',  // 紫 创业板指全收益
    '000688': '#5B6E96',  // 深蓝灰 科创50
    '932000': '#62D9AD',  // 青绿 中证2000
    H00985: '#30CB13',    // 绿 中证全指全收益
    'A500TR.CSI': '#23C2DB', // 青蓝 中证A500全收益
    H30269: '#FFDC4C',    // 金黄 红利低波全收益
  };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 240 : 150;
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

    const raw = data.series || {};
    const codes = ORDER.filter((c) => raw[c] && (raw[c].values || []).length > 0);

    // ── 统一日期轴：取最长线的 dates 作 master，其余线按日期对齐（缺失 = null）──
    let masterDates = [];
    codes.forEach((c) => {
      if ((raw[c].dates || []).length > masterDates.length) masterDates = raw[c].dates;
    });
    const series = codes.map((c) => {
      const dts = raw[c].dates, vals = raw[c].values;
      const map = new Map();
      for (let i = 0; i < dts.length; i++) map.set(dts[i], vals[i]);
      const nav = masterDates.map((d) => (map.has(d) ? map.get(d) : null));
      return { code: c, name: raw[c].name, nav };
    });

    const dates = masterDates;
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // y 范围（对数）
    let yMin = Infinity, yMax = -Infinity;
    series.forEach((s) => s.nav.forEach((v) => {
      if (v === null || v <= 0) return;
      const lv = Math.log(v);
      if (lv < yMin) yMin = lv;
      if (lv > yMax) yMax = lv;
    }));
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    const yPad = (yMax - yMin) * 0.05 || 0.1;
    yMin -= yPad; yMax += yPad;
    const ys = (v) => padT + (1 - (Math.log(v) - yMin) / (yMax - yMin)) * (H - padT - padB);

    // 网格（对数刻度）
    const gridLevels = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
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
      ctx.fillText('宽基指数全收益净值', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText(`${data.baseDate || '2005-01-04'} = 100 · 纵轴对数 · 含股息再投资`, W / 2, 160);
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
        const v = s.nav[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // ── 末端 CAGR 标签（一个数字，统一放最右侧空白区，防重叠、不遮曲线）──
    const ends = [];
    series.forEach((s) => {
      let li = -1;
      for (let i = s.nav.length - 1; i >= 0; i--) {
        if (s.nav[i] !== null && s.nav[i] > 0) { li = i; break; }
      }
      if (li < 0) return;
      let fi = -1;
      for (let i = 0; i <= li; i++) {
        if (s.nav[i] !== null && s.nav[i] > 0) { fi = i; break; }
      }
      if (fi < 0) return;
      const v0 = s.nav[fi], v1 = s.nav[li];
      const y0 = Date.parse(dates[fi]), y1 = Date.parse(dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      ends.push({ s, x: xs(li), y: ys(v1), cagr, color: COLORS[s.code] || '#888888' });
    });
    ends.sort((a, b) => b.y - a.y);
    const lh2 = exportMode ? 34 : 16;
    const used = [];
    const dotColor = (c) => (c === '#E65A56' ? '#5AAEF3' : '#E65A56');
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    const tagX = W - padR + (exportMode ? 28 : 16);   // 标签统一在最右侧
    ends.forEach((e, i) => {
      const txt = `${(e.cagr * 100).toFixed(1)}%`;
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
      ctx.moveTo(e.x + (exportMode ? 8 : 6), e.y);
      ctx.lineTo(tagX - (exportMode ? 6 : 4), labelY);
      ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, tagX, labelY);
    });

    // ── 图例（横向单行，自适缩短）──
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 245 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const lgap = exportMode ? 52 : 24;
    // 图例不显示涨幅数字（用户要求）
    let legendNames = series.map((s) => s.name);
    const legendW = (ns) => ns.reduce((w, nm, i) => {
      return w + ctx.measureText(nm).width + (exportMode ? 56 : 24) + lgap;
    }, 0);
    let minLen = 12;
    while (legendW(legendNames) > W - padR - lx0 - 16 && minLen > 2) {
      minLen--;
      legendNames = legendNames.map((nm) => (nm.length > minLen ? nm.slice(0, minLen) : nm));
    }
    let lx = lx0, ly = ly0;
    series.forEach((s, i) => {
      const color = COLORS[s.code] || '#888888';
      const label = legendNames[i];
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
      ctx.fillText(`数据截至 ${asOf} · 中证2000 为价格指数（全收益未发布）· 中证官网 + Wind AIFin`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // ── 悬浮数值提示（屏幕版）──
    if (!exportMode) {
      canvas.__wbData = { series, dates, xs };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__wbData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          let html = `<b>${D.dates[i]}</b><br>`;
          D.series.forEach((s) => {
            const v = s.nav[i];
            if (v === null || v === undefined) return;
            html += `<span style="color:${COLORS[s.code] || '#888'}">●</span> ${s.name}：<b>${v.toFixed(0)}</b><br>`;
          });
          window.AK.tooltip.show(ev, html.slice(0, -4));
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.WB_render = function (data) {
    const wrap = document.getElementById('panelWideBaseBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'wideBase';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      wideBase: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
