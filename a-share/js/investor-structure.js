/**
 * 投资者结构面板
 * 数据：investor_structure.json {
 *   generated, cards: [{title, items: [{label, value, note}]}],
 *   newAccounts: { dates[], newWan[], index[], breakDate }
 * }
 * 展示：三张总览卡（谁在持有 / 谁在定价 / 谁在交易）+ 新增投资者 vs 中证全指双轴图
 */
(function () {
  'use strict';

  let payload = null;
  let canvas = null;

  function draw(canvasEl, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const na = data.newAccounts;
    if (!na || !na.dates || !na.dates.length) return;

    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 640;
    const padL = exportMode ? 180 : 80;
    const padR = exportMode ? 160 : 70;
    const padT = exportMode ? 220 : 52;
    const padB = exportMode ? 130 : 48;

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

    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 64px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('新增投资者 vs 中证全指', W / 2, 80);
      ctx.fillStyle = '#555555';
      ctx.font = '300 26px NotoSansSC, sans-serif';
      ctx.fillText('月度 · 左轴：新增开户（万户） · 右轴：中证全指（收盘）', W / 2, 145);
    }

    const n = na.dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // 左轴：新增开户（柱）
    const vals = na.newWan.filter((v) => v !== null && v !== undefined);
    let vMax = Math.max(...vals, 1);
    const yL = (v) => padT + (1 - v / vMax) * (H - padT - padB);

    // 右轴：中证全指
    const idxVals = na.index.filter((v) => v !== null && v !== undefined);
    let iMin = Math.min(...idxVals), iMax = Math.max(...idxVals);
    const iPad = (iMax - iMin) * 0.05 || 100;
    iMin -= iPad; iMax += iPad;
    const yR = (v) => padT + (1 - (v - iMin) / (iMax - iMin)) * (H - padT - padB);

    // 左轴网格
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = (vMax / 4) * g;
      const yy = yL(v);
      ctx.strokeStyle = '#EDEDED'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.fillText(v.toFixed(0), padL - 10, yy);
    }

    // 新增开户柱（红；降采样画线）
    if (n > 500) {
      ctx.strokeStyle = '#E65A56'; ctx.lineWidth = exportMode ? 3 : 1.4;
      ctx.beginPath();
      na.newWan.forEach((v, i) => {
        if (v === null || v === undefined) return;
        const x = xs(i), y = yL(v);
        if (i === 0 || na.newWan[i - 1] === null) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      const bw = Math.max(1, (W - padL - padR) / n * 0.55);
      ctx.fillStyle = '#E65A56';
      na.newWan.forEach((v, i) => {
        if (v === null || v === undefined) return;
        ctx.fillRect(xs(i) - bw / 2, yL(v), bw, padT + (H - padT - padB) - yL(v));
      });
    }

    // 中证全指折线（右轴）
    ctx.strokeStyle = '#5AAEF3'; ctx.lineWidth = exportMode ? 4 : 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    na.index.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      const x = xs(i), y = yR(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 口径切换分界线
    if (na.breakDate) {
      const bi = na.dates.findIndex((d) => d >= na.breakDate);
      if (bi > 0 && bi < n) {
        const x = xs(bi);
        ctx.strokeStyle = '#BBBBBB'; ctx.lineWidth = exportMode ? 2 : 1;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#777777';
        ctx.font = (exportMode ? 20 : 9.5) + 'px NotoSansSC, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('口径切换', x, padT + 6);
      }
    }

    // 右轴刻度（指数）
    ctx.fillStyle = '#5AAEF3';
    ctx.textAlign = 'left';
    for (let g = 0; g <= 3; g++) {
      const v = iMin + (iMax - iMin) * g / 3;
      ctx.fillText(Math.round(v), W - padR + 12, yR(v));
    }

    // 图例（横向罗列）
    ctx.font = (exportMode ? 26 : 13.5) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ly = exportMode ? 240 : 18;
    const lg0 = padL;
    const items = [
      { color: '#E65A56', label: '新增开户（万户）' },
      { color: '#5AAEF3', label: '中证全指（右轴）' }
    ];
    let lx = lg0;
    items.forEach((it) => {
      const tw = ctx.measureText(it.label).width + (exportMode ? 48 : 20);
      ctx.fillStyle = it.color;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 36 : 14, exportMode ? 7 : 3);
      ctx.fillStyle = '#444';
      ctx.fillText(it.label, lx + (exportMode ? 48 : 20), ly);
      lx += tw + (exportMode ? 60 : 30);
    });

    // x 轴年份
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const yearSet = new Set();
    na.dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || d.slice(0, 4) !== na.dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearSet.add([y, i]);
    });
    yearSet.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 页脚
    if (exportMode) {
      ctx.fillStyle = '#888888'; ctx.font = '300 22px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const asOf = (data.generated || '').slice(0, 10);
      ctx.fillText(`数据截至 ${asOf} · ${na.breakDate ? '口径分界：' + na.breakDate + '（前中证登全市场 / 后上交所沪市）' : ''}`, padL, H - 62);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 62);
    }

    // ── 悬浮数值提示（屏幕版）：最近月份 → 新增开户 / 中证全指 ──
    if (!exportMode) {
      canvasEl.__isData = { dates: na.dates, newWan: na.newWan, index: na.index };
      if (!canvasEl.__hoverBound) {
        canvasEl.__hoverBound = true;
        canvasEl.addEventListener('mousemove', (ev) => {
          const D = canvasEl.__isData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvasEl, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          const v = D.newWan[i];
          const iv = D.index[i];
          let html = `<b>${D.dates[i]}</b>`;
          if (v !== null && v !== undefined) html += `<br>新增开户：<b>${v.toFixed(0)} 万户</b>`;
          if (iv !== null && iv !== undefined) html += `<br>中证全指：<b>${Math.round(iv)}</b>`;
          window.AK.tooltip.show(ev, html);
        });
        canvasEl.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  function renderCards(wrap, data) {
    const cards = data.cards || [];
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:18px;';
    cards.forEach((c) => {
      const box = document.createElement('div');
      box.style.cssText = 'border:1px solid #E5E5E5;border-radius:8px;padding:14px 16px;background:#FAFAFA;';
      let html = `<div style="font-weight:700;font-size:14px;margin-bottom:10px;">${c.title}</div>`;
      (c.items || []).forEach((it) => {
        html += `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:3px 0;border-bottom:1px dashed #EEEEEE;">
          <span style="color:#555;">${it.label}</span><span style="font-weight:600;">${it.value}</span></div>`;
        if (it.note) html += `<div style="font-size:11px;color:#999;margin-top:1px;">${it.note}</div>`;
      });
      box.innerHTML = html;
      grid.appendChild(box);
    });
    wrap.appendChild(grid);
  }

  window.IS_render = function (data) {
    payload = data;
    const wrap = document.getElementById('panelInvestorBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    renderCards(wrap, data);

    canvas = document.createElement('canvas');
    canvas.id = 'investor';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      investor: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
