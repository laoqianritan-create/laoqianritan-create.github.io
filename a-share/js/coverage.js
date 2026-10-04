/**
 * 宽基指数覆盖范围面板（面板 11）
 * 数据：coverage.json { indexes: [{code,name,count}], overlap: [[%]] }
 * overlap[i][j] = 行指数 i 的成分中同时属于列指数 j 的比例（%）
 * 展示：6×6 交叠矩阵（蓝梯度）+ 成分数量行，hover 看解释
 */
(function () {
  'use strict';

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1700 : 760;
    const padL = exportMode ? 330 : 150;    // 行标签区
    const padT = exportMode ? 300 : 100;    // 列标签区
    const padR = exportMode ? 60 : 24;
    const padB = exportMode ? 80 : 30;

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

    const idxs = data.indexes || [];
    const n = idxs.length;
    const ov = data.overlap || [];
    if (!n) return;
    const gw = (W - padL - padR) / n;
    const gh = (H - padT - padB) / n;

    // ── 蓝梯度（0% 白 → 100% 深蓝）──
    function cellColor(v) {
      const t = Math.max(0, Math.min(1, v / 100));
      const r = Math.round(238 - 194 * t), g = Math.round(246 - 207 * t), b = 255;
      return `rgb(${r},${g},${b})`;
    }

    // ── 列标题（顶部，斜 45° 或横向缩写）──
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    idxs.forEach((ix, j) => {
      const cx = padL + gw * (j + 0.5);
      ctx.save();
      ctx.translate(cx, padT - (exportMode ? 42 : 20));
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 30 : 13) + 'px NotoSansSC, sans-serif';
      ctx.fillText(ix.name, 0, 0);
      ctx.restore();
    });

    // ── 行标签 + 数量 + 格子 ──
    idxs.forEach((ix, i) => {
      const ry = padT + gh * (i + 0.5);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 34 : 15) + 'px NotoSansSC, sans-serif';
      ctx.fillText(ix.name, padL - (exportMode ? 30 : 14), ry);
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 26 : 11) + 'px NotoSansSC, sans-serif';
      ctx.fillText(`${ix.count} 只`, padL - (exportMode ? 30 : 14), ry + (exportMode ? 34 : 16));

      for (let j = 0; j < n; j++) {
        const x = padL + gw * j, y = padT + gh * i;
        const v = ov[i] ? ov[i][j] : 0;
        // 对角线用深色边框区分
        ctx.fillStyle = cellColor(v);
        ctx.fillRect(x + 1, y + 1, gw - 2, gh - 2);
        if (i === j) {
          ctx.strokeStyle = '#5AAEF3';
          ctx.lineWidth = exportMode ? 4 : 2;
          ctx.strokeRect(x + 1, y + 1, gw - 2, gh - 2);
        } else {
          ctx.strokeStyle = '#EDEDED';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, gw - 2, gh - 2);
        }
        // 格内数值
        const tv = (v === 100) ? '100%' : (v > 0 ? v.toFixed(1) + '%' : '—');
        ctx.fillStyle = (v > 55) ? '#FFFFFF' : '#444444';
        ctx.font = (exportMode ? 32 : 14) + 'px NotoSansSC, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tv, x + gw / 2, y + gh / 2);
      }
    });

    // 顶部说明条（屏幕版：小字提示）
    if (!exportMode) {
      ctx.fillStyle = '#999999';
      ctx.font = '12px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('行指数成分中同时属于列指数的比例 · 对角线为本指数自身', padL, padT - (exportMode ? 0 : 64));
    }

    // ── 主标题（导出版）──
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('宽基指数覆盖范围', W / 2, 84);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText('行指数成分中同时属于列指数的比例（%）· 成分截至 ' + (data.asOf || ''),
        W / 2, 154);
    }

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`成分快照 ${data.asOf || ''} · 数据来源：中证指数官网（akshare）`, padL, H - 50);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 50);
    }

    // ── hover（屏幕版）──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__cvData = { idxs, ov, gw, gh, padL, padT };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__cvData;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1), sy = y / (window.devicePixelRatio || 1);
          if (sx < D.padL || sy < D.padT) { window.AK.tooltip.hide(); return; }
          const j = Math.floor((sx - D.padL) / D.gw), i = Math.floor((sy - D.padT) / D.gh);
          if (i < 0 || i >= D.idxs.length || j < 0 || j >= D.idxs.length) { window.AK.tooltip.hide(); return; }
          const v = D.ov[i] ? D.ov[i][j] : 0;
          const txt = i === j
            ? `${D.idxs[i].name}：${D.idxs[i].count} 只成分`
            : `${D.idxs[i].name} 的 ${v.toFixed(1)}% 成分同时属于 ${D.idxs[j].name}`;
          window.AK.tooltip.show(ev, `<b>${txt}</b>`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.CV_render = function (data) {
    const wrap = document.getElementById('panelCoverageBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'coverage';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      coverage: (off, scale) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
