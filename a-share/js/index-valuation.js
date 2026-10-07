/**
 * 面板：主要宽基指数估值分位（德邦《A股动静框架之静态指标》· 市场配置）
 * 数据：index_valuation.json
 *   [{ code, name, pe_ttm, pct, n_hist, hist: [[ym, pe], ...] }]
 * 展示：横向条形——当前 PE-TTM + 历史分位（0=深绿 低估 … 100=深红 高估，无白色过渡）
 */
(function () {
  'use strict';

  // 0=深绿 → 50=中性 → 100=深红（无白色过渡，同看板「申万行业年度涨跌幅」规范）
  function pctColor(p) {
    const x = Math.max(0, Math.min(100, p));
    if (x <= 50) {
      const k = x / 50; // 0..1 深绿→中灰绿
      const c = [47 + (170 - 47) * k, 191 + (190 - 191) * k, 113 + (120 - 113) * k];
      return `rgb(${c.map((v) => Math.round(v)).join(',')})`;
    }
    const k = (x - 50) / 50; // 0..1 中灰红→深红
    const c = [170 + (230 - 170) * k, 190 - (190 - 90) * k, 120 - (120 - 86) * k];
    return `rgb(${c.map((v) => Math.round(v)).join(',')})`;
  }

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
    const padL = exportMode ? 420 : 190;
    const padR = exportMode ? 380 : 200;
    const padT = exportMode ? 200 : 52;
    const padB = exportMode ? 100 : 44;

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

    const items = data || [];
    const n = items.length;

    // 条形区（PE 线性刻度）
    const plotLeft = padL, plotRight = W - padR;
    const plotTop = padT, plotBottom = H - padB;
    const rowH = (plotBottom - plotTop) / n;
    const barH = Math.min(rowH * 0.52, exportMode ? 44 : 20);

    // PE 范围
    let maxPe = Math.max(...items.map((it) => it.pe_ttm), 30);
    maxPe = Math.ceil(maxPe / 10) * 10;
    const px = (v) => plotLeft + (v / maxPe) * (plotRight - plotLeft);

    // 网格
    ctx.lineWidth = 1;
    [0, 10, 20, 30, 40, 50, 60].forEach((lv) => {
      if (lv > maxPe) return;
      const x = px(lv);
      ctx.strokeStyle = '#F0F0F0';
      ctx.beginPath(); ctx.moveTo(x, plotTop); ctx.lineTo(x, plotBottom); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(lv), x, plotBottom + (exportMode ? 16 : 8));
    });

    // 行
    items.forEach((it, i) => {
      const cy = plotTop + rowH * i + rowH / 2;
      // 行标签
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(it.name, plotLeft - (exportMode ? 24 : 14), cy);

      // 背景轨（历史范围）
      ctx.fillStyle = '#F4F4F4';
      ctx.fillRect(plotLeft, cy - barH / 2, plotRight - plotLeft, barH);

      // 分位轨道：绿（低估）→ 红（高估）渐变
      const grad = ctx.createLinearGradient(plotLeft, 0, plotRight, 0);
      grad.addColorStop(0, pctColor(0));
      grad.addColorStop(0.5, pctColor(50));
      grad.addColorStop(1, pctColor(100));
      ctx.save();
      ctx.beginPath();
      ctx.rect(plotLeft, cy - barH / 2, plotRight - plotLeft, barH);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(plotLeft, cy - barH / 2, plotRight - plotLeft, barH);
      ctx.restore();

      // 当前 PE 位置刻度线
      const xv = px(it.pe_ttm);
      ctx.strokeStyle = '#1A1A1A';
      ctx.lineWidth = exportMode ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(xv, cy - barH / 2 - (exportMode ? 6 : 3));
      ctx.lineTo(xv, cy + barH / 2 + (exportMode ? 6 : 3));
      ctx.stroke();

      // 数值标签：PE + 分位
      ctx.fillStyle = '#1A1A1A';
      ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const label = `${it.pe_ttm.toFixed(1)}x · ${it.pct.toFixed(0)}%`;
      ctx.fillText(label, xv + (exportMode ? 18 : 10), cy);

      // 历史最小/最大参考线（可选：分位锚点）
      if (it.n_hist > 0) {
        const minPe = Math.min(...it.hist.map((h) => h[1]));
        const maxPeH = Math.max(...it.hist.map((h) => h[1]));
        ctx.fillStyle = '#AAAAAA';
        ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${minPe.toFixed(0)}x`, plotLeft + 4, cy + barH / 2 + (exportMode ? 18 : 10));
        ctx.textAlign = 'right';
        ctx.fillText(`${maxPeH.toFixed(0)}x`, plotRight - 4, cy + barH / 2 + (exportMode ? 18 : 10));
      }
    });

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('主要宽基指数估值分位', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('PE-TTM 当前值 · 历史分位（绿=低估 红=高估）· 月度', W / 2, 160);
    }

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      const latest = items[0] ? items[0].hist[items[0].hist.length - 1][0] : '';
      ctx.fillText(`数据截至 ${latest} · 乐咕乐股 legulegu PE-TTM 月度`, padL, H - 40);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 40);
    }

    // ── 悬浮提示 ──
    if (!exportMode) {
      canvas.__ivData = { items, plotLeft, plotRight, plotTop, plotBottom, rowH, maxPe, px };
      if (!canvas.__ivBound) {
        canvas.__ivBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__ivData;
          if (!D || !D.items.length) return;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1), sy = y / (window.devicePixelRatio || 1);
          if (sx < D.plotLeft || sx > D.plotRight || sy < D.plotTop || sy > D.plotBottom) { window.AK.tooltip.hide(); return; }
          const i = Math.max(0, Math.min(D.items.length - 1, Math.floor((sy - D.plotTop) / D.rowH)));
          const it = D.items[i];
          window.AK.tooltip.show(ev,
            `<b>${it.name}</b><br>` +
            `PE-TTM：<b>${it.pe_ttm.toFixed(2)}x</b><br>` +
            `历史分位：<b>${it.pct.toFixed(1)}%</b><br>` +
            `样本：${it.n_hist} 期（${it.hist[0][0]} — ${it.hist[it.hist.length - 1][0]}）`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.IV_render = function (data) {
    data = (data && data.items) || data;  // JSON 为 { generated, items } 包装时解包
    const wrap = document.getElementById('panelValuationBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'indexValuation';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      indexValuation: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
