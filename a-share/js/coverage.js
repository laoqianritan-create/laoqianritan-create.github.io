/**
 * 面板 13：宽基指数覆盖范围（格子网）
 * 数据：coverage.json { indexes: [{code, name, count}], overlap }
 * 展示：1 格 = 50 只成分股，每指数一行密集格子，格子数 = ceil(count/50)，直观对比覆盖规模
 */
(function () {
  'use strict';

  const PALETTE = ['#5AAEF3', '#333333', '#E65A56', '#6D61E4', '#5B6E96', '#62D9AD'];
  const PER = 50;           // 1 格 = 50 只

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const rowH = exportMode ? 120 : 58;
    const padL = exportMode ? 360 : 190;
    const padR = exportMode ? 220 : 120;
    const padT = exportMode ? 220 : 52;
    const padB = exportMode ? 130 : 50;
    const colW = exportMode ? 22 : 10;
    const gap = exportMode ? 4 : 2;
    const idx = data.indexes || [];
    const nRows = idx.length;
    const H = padT + padB + nRows * rowH;

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

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 76px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('宽基指数覆盖范围', W / 2, 90);
      ctx.fillStyle = '#555555';
      ctx.font = '300 28px NotoSansSC, sans-serif';
      ctx.fillText(`1 格 = 50 只成分股 · 截至 ${(data.asOf || '').slice(0, 10)}`, W / 2, 160);
    }

    // 行 + 格子
    const maxCells = Math.max(...idx.map((x) => Math.ceil(x.count / PER)));
    const totalW = maxCells * colW + (maxCells - 1) * gap;
    const x0 = (W - padL - padR - totalW) / 2 + padL;   // 格子居中

    idx.forEach((it, i) => {
      const y = padT + i * rowH;
      const cells = Math.ceil(it.count / PER);
      const color = PALETTE[i % PALETTE.length];

      // 行标签
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 34 : 15) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(it.name, padL - (exportMode ? 24 : 14), y + rowH / 2);

      // 格子（左对齐排，最后一格可不满）
      for (let c = 0; c < cells; c++) {
        const gx = x0 + c * (colW + gap);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(gx, y + (rowH - colW) / 2, colW, colW);
        ctx.globalAlpha = 1;
        if (exportMode) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.strokeRect(gx + 0.5, y + (rowH - colW) / 2 + 0.5, colW - 1, colW - 1);
        }
      }

      // 行末数量
      ctx.fillStyle = '#555555';
      ctx.font = (exportMode ? 30 : 13) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${it.count.toLocaleString()} 只`, x0 + cells * colW + (cells - 1) * gap + (exportMode ? 24 : 12), y + rowH / 2);
    });

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 245 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    let lx = lx0;
    idx.forEach((it, i) => {
      const color = PALETTE[i % PALETTE.length];
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly0 - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.name, lx + (exportMode ? 56 : 24), ly0);
      lx += ctx.measureText(it.name).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`1 格 = 50 只成分股 · 中证指数官网成分股快照（akshare）`, padL, H - 60);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, H - 60);
    }

    // hover（屏幕版）：显示 该指数覆盖 X 只 ≈ Y 格
    if (!exportMode) {
      canvas.__cvData = { idx, padL, x0, colW, gap, rowH, padT };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__cvData;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          const sy = y / (window.devicePixelRatio || 1);
          const i = Math.floor((sy - D.padT) / D.rowH);
          if (i < 0 || i >= D.idx.length) { window.AK.tooltip.hide(); return; }
          const it = D.idx[i];
          const cells = Math.ceil(it.count / PER);
          window.AK.tooltip.show(ev,
            `<b>${it.name}</b><br>成分股：<b>${it.count.toLocaleString()} 只</b><br>≈ ${cells} 格（1 格 = 50 只）`);
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
      coverage: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
