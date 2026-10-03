/**
 * 行业交易热度面板
 * 数据：industry_heat.json { generated, metrics: { code: {name, dates[], turnover_pctile[], amount_share_pctile[], rps[], ma20_above[]} } }
 *
 * 交互：
 *  · 指标切换：7日换手率分位 / 成交金额占比分位 / RPS / MA20站上率
 *  · 周期切换：3 / 5 / 10 / 20 / 60 / 120 / 250 个交易日
 *  · 显示/隐藏数字
 *  · 一级矩阵点击行业行 → 二级矩阵；二级返回一级
 *
 * 配色：热度分位 0-100 → 绿(冷) → 白(50) → 红(热)，与全站红涨绿跌一致。
 */
(function () {
  'use strict';

  const METRICS = [
    { key: 'turnover_pctile', label: '7日换手率分位', sub: '自由流通换手率7日均值 · expanding 分位' },
    { key: 'amount_share_pctile', label: '成交金额占比分位', sub: '行业成交额/全市场 · expanding 分位' },
    { key: 'rps', label: 'RPS', sub: '250日涨幅行业排名百分位' }
  ];
  const PERIODS = [3, 5, 10, 20, 60, 120, 250];

  let state = {
    metric: 'turnover_pctile',
    days: 63,           // 默认近 3 个月 ≈ 63 交易日
    showNumbers: true,
    level: 1,
    parent: null        // 一级代码（二级时）
  };

  let payload = null;
  let canvas = null;
  let sortedL1 = [];   // 一级行业排序后的代码
  let l2ByParent = {}; // parentCode -> [codes]

  // ── 颜色：分位 0-100 → 绿→白→红 ──
  function heatColor(pct) {
    if (pct === null || pct === undefined || Number.isNaN(pct)) return 'rgb(245,245,245)';
    const x = Math.max(0, Math.min(100, pct)) / 100; // 0..1
    if (x < 0.5) {
      const k = x / 0.5; // 0..1 绿→白
      return `rgb(${Math.round(47 + (255 - 47) * k)},${Math.round(191 + (255 - 191) * k)},${Math.round(113 + (255 - 113) * k)})`;
    }
    const k = (x - 0.5) / 0.5; // 0..1 白→红
    return `rgb(${Math.round(255 - (255 - 230) * (1 - k))},${Math.round(255 - (255 - 90) * (1 - k))},${Math.round(255 - (255 - 86) * (1 - k))})`;
  }

  function draw(canvasEl, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const isL2 = state.level === 2;
    const codes = isL2 ? (l2ByParent[state.parent] || []) : sortedL1;
    const metricKey = state.metric;

    // 取日期轴（用第一个有数据的行业）
    const firstCode = codes[0];
    let allDates = [];
    if (firstCode && payload.metrics[firstCode]) allDates = payload.metrics[firstCode].dates;

    // 周期裁剪：取最近 N 个交易日
    const nDays = Math.min(state.days, allDates.length);
    const startIdx = allDates.length - nDays;
    const dates = allDates.slice(startIdx);

    // 行数 / 列数
    const nRows = codes.length;
    const nCols = dates.length;

    const W = exportMode ? 3000 : 1480;
    const rowH = exportMode ? 64 : 34;
    const colW = exportMode ? (W - 420) / Math.max(nCols, 1) : Math.max(9, (W - 240) / Math.max(nCols, 1));
    const padL = exportMode ? 300 : 170;
    const padR = exportMode ? 60 : 30;
    const colHdrH = exportMode ? 90 : 46;
    const legendH = exportMode ? 90 : 0;
    const footerH = exportMode ? 90 : 0;
    const titleH = exportMode ? 190 : 0;
    const H = titleH + legendH + colHdrH + nRows * rowH + footerH + 40;

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

    // 标题（导出版）
    if (exportMode) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '900 68px AlibabaPuHuiTi, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const title = isL2 ? `行业交易热度 · ${payload.metrics[state.parent].name}（二级）` : '行业交易热度 · 申万一级';
      ctx.fillText(title, W / 2, 78);
      ctx.fillStyle = '#555555';
      ctx.font = '300 26px NotoSansSC, sans-serif';
      const m = METRICS.find((x) => x.key === metricKey);
      ctx.fillText(`${m.label} · ${m.sub} · 近 ${state.days} 个交易日`, W / 2, 140);
      // 色条
      const barW = 420, barH = 16;
      const bx = (W - barW) / 2, by = 175;
      const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
      grad.addColorStop(0, '#2FBF71'); grad.addColorStop(0.5, '#FFFFFF'); grad.addColorStop(1, '#E65A56');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, barW, barH);
      ctx.strokeStyle = '#E5E5E5'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
      ctx.fillStyle = '#555555'; ctx.font = '300 20px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('0（冷）', bx - 10, by + barH / 2);
      ctx.textAlign = 'left';
      ctx.fillText('100（热）', bx + barW + 10, by + barH / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('50（中性）', bx + barW / 2, by + barH + 6);
    }

    const matrixTop = titleH + legendH + colHdrH;

    // 列标题（日期）
    ctx.fillStyle = '#555555';
    ctx.font = (exportMode ? 20 : 10.5) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    dates.forEach((d, j) => {
      const x = padL + (j + 0.5) * colW;
      const label = exportMode ? d : d.slice(5);
      ctx.fillText(label, x, matrixTop - 6);
    });

    // 行 + 单元格
    codes.forEach((code, i) => {
      const row = payload.metrics[code];
      if (!row) return;
      const y = matrixTop + i * rowH;

      // 行标签
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 26 : 12.5) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(row.name, padL - 14, y + rowH / 2);

      const vals = row[metricKey] || [];
      for (let j = 0; j < nCols; j++) {
        const v = vals[startIdx + j];
        const x = padL + j * colW;
        ctx.fillStyle = heatColor(v);
        ctx.fillRect(x, y, colW, rowH);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);
        if (state.showNumbers && v !== null && v !== undefined) {
          ctx.fillStyle = v > 80 || v < 20 ? '#FFFFFF' : '#222222';
          ctx.font = (exportMode ? 18 : 8.5) + 'px NotoSansSC, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(Math.round(v), x + colW / 2, y + rowH / 2);
        }
      }
    });

    // 边框
    ctx.strokeStyle = '#999999'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, matrixTop); ctx.lineTo(padL + nCols * colW, matrixTop);
    ctx.moveTo(padL, matrixTop + nRows * rowH); ctx.lineTo(padL + nCols * colW, matrixTop + nRows * rowH);
    ctx.stroke();

    // 页脚（导出版）
    if (exportMode) {
      const fy = H - 60;
      ctx.fillStyle = '#888888'; ctx.font = '300 22px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const asOf = (payload.generated || '').slice(0, 10);
      ctx.fillText(`数据截至 ${asOf} · 一级行业 1999 起 / 二级 2024 起 · 样本<120 日置空`, padL, fy);
      ctx.textAlign = 'right';
      ctx.fillText('公众号「老钱日日谈」播客「面基」', W - padR, fy);
    }
  }

  // ── 控制条构建 ──
  function buildControls(wrap) {
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-controls';
    ctrl.innerHTML = `
      <div class="ctrl-group"><label>指标</label><span class="seg" id="ih-metric"></span></div>
      <div class="ctrl-group"><label>周期</label><span class="seg" id="ih-period"></span></div>
      <div class="ctrl-group">
        <label><input type="checkbox" id="ih-num" checked> 显示数字</label>
      </div>
      <div class="ctrl-group"><label>层级</label><span id="ih-level" style="font-size:12px;color:#555;"></span></div>`;
    wrap.appendChild(ctrl);

    const metricSeg = ctrl.querySelector('#ih-metric');
    METRICS.forEach((m, i) => {
      const b = document.createElement('button');
      b.textContent = m.label;
      if (i === 0) b.classList.add('active');
      b.addEventListener('click', () => {
        state.metric = m.key;
        metricSeg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 });
      });
      metricSeg.appendChild(b);
    });

    const periodSeg = ctrl.querySelector('#ih-period');
    PERIODS.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p;
      if (p === 63) b.classList.add('active');
      b.addEventListener('click', () => {
        state.days = p;
        periodSeg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 });
      });
      periodSeg.appendChild(b);
    });

    const numChk = ctrl.querySelector('#ih-num');
    numChk.addEventListener('change', () => {
      state.showNumbers = numChk.checked;
      draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 });
    });
  }

  // ── 穿透逻辑：点击行名进入二级 ──
  function bindDrilldown(canvasEl) {
    const hitL2 = (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const scaleX = canvasEl.width / rect.width;
      const scaleY = canvasEl.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      // 计算与 draw 相同的布局
      const exportMode = false;
      const codes = state.level === 1 ? sortedL1 : (l2ByParent[state.parent] || []);
      const firstCode = codes[0];
      const allDates = firstCode && payload.metrics[firstCode] ? payload.metrics[firstCode].dates : [];
      const nDays = Math.min(state.days, allDates.length);
      const nRows = codes.length;
      const nCols = nDays;
      const W = 1480;
      const rowH = 34, colW = Math.max(9, (W - 240) / Math.max(nCols, 1));
      const padL = 170, padR = 30, colHdrH = 46;
      const matrixTop = colHdrH;
      const rowIdx = Math.floor((my - matrixTop) / rowH);
      if (rowIdx < 0 || rowIdx >= nRows) return;
      const colIdx = Math.floor((mx - padL) / colW);
      if (colIdx < 0 || colIdx >= nCols) return;

      if (state.level === 1) {
        const parent = sortedL1[rowIdx];
        const kids = l2ByParent[parent] || [];
        if (kids.length) {
          state.level = 2; state.parent = parent;
          updateLevelLabel();
          draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 });
        }
      } else {
        state.level = 1; state.parent = null;
        updateLevelLabel();
        draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 });
      }
    };
    canvasEl.addEventListener('click', hitL2);
  }

  function updateLevelLabel() {
    const el = document.getElementById('ih-level');
    if (!el) return;
    el.textContent = state.level === 1
      ? '一级（点击行名穿透二级）'
      : `二级 · ${payload.metrics[state.parent].name}（点击返回一级）`;
  }

  window.IH_render = function (data) {
    payload = data;
    const wrap = document.getElementById('panelIndustryBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    buildControls(wrap);
    canvas = document.createElement('canvas');
    canvas.id = 'industryHeat';
    wrap.appendChild(canvas);

    // 排序一级行业（按名称）
    sortedL1 = Object.keys(payload.metrics).filter((c) => (payload.levels['1'] && payload.metrics[c].amount_share_pctile) || !(payload.levels['1'] && false));
    sortedL1.sort((a, b) => payload.metrics[a].name.localeCompare(payload.metrics[b].name, 'zh'));
    // 如果 amount_share_pctile 缺失的不排前面（全有则正常）
    if (payload.levels && payload.levels['1']) {
      sortedL1 = sortedL1.filter((c) => payload.metrics[c].amount_share_pctile !== null);
    }

    // 二级分组：parentMap 值为上级行业中文名 → 先建立 名称→code 映射
    if (payload.parentMap) {
      const codeByName = {};
      Object.keys(payload.metrics).forEach((c) => { codeByName[payload.metrics[c].name] = c; });
      Object.keys(payload.parentMap).forEach((kid) => {
        const p = codeByName[payload.parentMap[kid]];
        if (p) (l2ByParent[p] = l2ByParent[p] || []).push(kid);
      });
      Object.values(l2ByParent).forEach((arr) => arr.sort((a, b) => payload.metrics[a].name.localeCompare(payload.metrics[b].name, 'zh')));
    } else {
      // 无 parentMap：二级无法穿透，仅一级
      l2ByParent = {};
    }

    updateLevelLabel();
    draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 });
    bindDrilldown(canvas);

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      industryHeat: (off) => draw(off, { exportMode: true, scale: 1 })
    });
  };
})();
