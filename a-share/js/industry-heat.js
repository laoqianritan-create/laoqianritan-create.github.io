/**
 * 行业交易热度面板
 * 数据：industry_heat.json { generated, date_groups: [[...]xN], metrics: { code: {name, g, rps[], ma20_above[]} } }
 *
 * 交互：
 *  · 指标切换：成交金额占比分位 / RPS / MA20站上率
 *  · 周期切换：3 / 5 / 10 / 20 / 60 / 120 / 250 个交易日
 *  · 显示/隐藏数字
 *  · 一级矩阵点击行业行 → 二级矩阵；二级返回一级
 *
 * 配色：热度 0 → 深绿、100 → 深红（无白色过渡），与全站红涨绿跌一致。
 */
(function () {
  'use strict';

  const METRICS = [
    { key: 'rps', label: 'RPS', sub: '250日涨幅行业排名百分位' },
    { key: 'ma20_above', label: 'MA20站上率', sub: '行业指数收盘站上20日均线天数占比(250日)' }
  ];
  const PERIODS = [3, 5, 10, 20, 60, 120, 250];

  let state = {
    metric: 'rps',          // 默认 RPS（250 日涨幅排名）
    days: 60,               // 默认 60 个交易日
    showNumbers: true,
    level: 1,
    parent: null            // 一级代码（二级时）
  };

  let payload = null;
  let canvas = null;
  let sortedL1 = [];   // 一级行业排序后的代码
  let l2ByParent = {}; // parentCode -> [codes]
  let metricBtns = []; // 指标切换按钮引用（二级禁用成交金额占比）

  // ── 颜色：与看板1 同款红涨绿跌发散色阶，但取消白色过渡 ──
  // 0 → 深绿、100 → 深红，中间经浅绿/浅红平滑过渡（无白色段）
  const STOPS = [
    [0.00, [47, 191, 113]],
    [0.40, [188, 232, 205]],
    [0.60, [242, 178, 174]],
    [1.00, [230, 90, 86]]
  ];
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function normVal(v, lo, hi) {
    if (v >= 50) return 0.5 + ((v - 50) / Math.max(1e-6, hi - 50)) * 0.5;
    return 0.5 + ((v - 50) / Math.max(1e-6, 50 - lo)) * 0.5;
  }
  function heatRGB(pct, lo, hi) {
    if (pct === null || pct === undefined || Number.isNaN(pct)) return [245, 245, 245];
    const t = clamp01(normVal(pct, lo, hi));
    let i = 0;
    while (i < STOPS.length - 1 && STOPS[i + 1][0] < t) i++;
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[Math.min(i + 1, STOPS.length - 1)];
    const k = (t - t0) / (t1 - t0 || 1);
    return [
      Math.round(c0[0] + (c1[0] - c0[0]) * k),
      Math.round(c0[1] + (c1[1] - c0[1]) * k),
      Math.round(c0[2] + (c1[2] - c0[2]) * k)
    ];
  }
  function heatColor(pct, lo, hi) {
    const c = heatRGB(pct, lo, hi);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  // 当前指标在当前日期窗口内的实际数值范围（动态 vmin/vmax，带 8% 边距）
  function metricRange(metricKey, dates) {
    let lo = Infinity, hi = -Infinity;
    const codes = state.level === 2 ? (l2ByParent[state.parent] || []) : sortedL1;
    for (const c of codes) {
      const row = payload.metrics[c];
      if (!row) continue;
      for (const d of dates) {
        const v = getValByDate(row, metricKey, d);
        if (v === null || v === undefined || Number.isNaN(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!isFinite(lo)) return { lo: 50, hi: 50 };
    const pad = (hi - lo) * 0.08;
    return { lo: lo - pad, hi: hi + pad };
  }

  // ── 按日期对齐取值（共享日期轴：date_groups[row.g]；行业 dates 长度不同 → 索引对齐会越界空白）──
  function groupDates(row) {
    const g = (payload.date_groups && payload.date_groups[row.g]) || row.dates || [];
    return g;
  }
  function getValByDate(row, metricKey, date) {
    if (!row.__maps) row.__maps = {};
    if (!row.__maps[metricKey]) {
      const m = new Map();
      const dts = groupDates(row);
      const vals = row[metricKey] || [];
      for (let i = 0; i < dts.length; i++) m.set(dts[i], vals[i]);
      row.__maps[metricKey] = m;
    }
    return row.__maps[metricKey].get(date);
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
    if (firstCode && payload.metrics[firstCode]) allDates = groupDates(payload.metrics[firstCode]);

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
      STOPS.forEach(([t, c]) => grad.addColorStop(t, `rgb(${c[0]},${c[1]},${c[2]})`));
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

    // 列标题（日期；按自然月取标签——每月首个交易日显示一次，任何窗口不重叠）
    ctx.fillStyle = '#555555';
    ctx.font = (exportMode ? 20 : 10.5) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    // 短窗口（≤30 列）逐列显示；60 日以上按自然月（每月第一个交易日）打点
    const labelFmt = nCols > 120 ? (d) => d.slice(0, 7) : (d) => d.slice(5);
    if (nCols <= 30) {
      dates.forEach((d, j) => ctx.fillText(d.slice(5), padL + (j + 0.5) * colW, matrixTop - 6));
    } else {
      let prevMonth = '';
      let lastTick = -1;
      for (let j = 0; j < nCols; j++) {
        const m = dates[j].slice(0, 7);
        if (m === prevMonth) continue;
        prevMonth = m;
        ctx.fillText(labelFmt(dates[j]), padL + (j + 0.5) * colW, matrixTop - 6);
        lastTick = j;
      }
      // 末端：若最后一个月首日与最右列间隔足够（≥8 列），补最右列标签
      if (lastTick >= 0 && nCols - 1 - lastTick >= 8) {
        ctx.fillText(labelFmt(dates[nCols - 1]), padL + (nCols - 0.5) * colW, matrixTop - 6);
      }
    }

    // 当前指标动态色阶范围（窗口内）
    const range = metricRange(metricKey, dates);

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
        const v = getValByDate(row, metricKey, dates[j]);
        const x = padL + j * colW;
        const rgb = heatRGB(v, range.lo, range.hi);
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(x, y, colW, rowH);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);
        if (state.showNumbers && v !== null && v !== undefined) {
          const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
          ctx.fillStyle = lum > 0.55 ? '#222222' : '#FFFFFF';
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
    metricBtns = [];
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
      metricBtns.push(b);
      metricSeg.appendChild(b);
    });

    const periodSeg = ctrl.querySelector('#ih-period');
    PERIODS.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p;
      if (p === state.days) b.classList.add('active');
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
    // 一级行 hover 变小手 + 悬浮数值提示
    canvasEl.addEventListener('mousemove', (ev) => {
      const rect = canvasEl.getBoundingClientRect();
      const scaleX = canvasEl.width / rect.width;
      const scaleY = canvasEl.height / rect.height;
      const mx = (ev.clientX - rect.left) * scaleX;
      const my = (ev.clientY - rect.top) * scaleY;
      const dpr = window.devicePixelRatio || 1;
      const sx = mx / dpr, sy = my / dpr;

      const exportMode = false;
      const codes = state.level === 1 ? sortedL1 : (l2ByParent[state.parent] || []);
      const firstCode = codes[0];
      const allDates = firstCode && payload.metrics[firstCode] ? groupDates(payload.metrics[firstCode]) : [];
      const nDays = Math.min(state.days, allDates.length);
      const startIdx = allDates.length - nDays;
      const nRows = codes.length;
      const nCols = nDays;
      const W = 1480;
      const rowH = 34, colW = Math.max(9, (W - 240) / Math.max(nCols, 1));
      const padL = 170, padR = 30, colHdrH = 46;
      const matrixTop = colHdrH;
      const rowIdx = Math.floor((sy - matrixTop) / rowH);
      if (rowIdx < 0 || rowIdx >= nRows) { canvasEl.style.cursor = 'default'; window.AK.tooltip.hide(); return; }
      const code = codes[rowIdx];
      const row = payload.metrics[code];
      const colIdx = Math.floor((sx - padL) / colW);

      // 一级行 → 小手（含行标签区）
      if (state.level === 1) canvasEl.style.cursor = 'pointer';
      else canvasEl.style.cursor = 'default';

      if (colIdx < 0 || colIdx >= nCols) { window.AK.tooltip.hide(); return; }

      // 数值提示（行业名 + 日期 + 当前指标值，按日期对齐取值）
      const m = METRICS.find((x) => x.key === state.metric);
      if (!m) { window.AK.tooltip.hide(); return; }
      const winDates = allDates.slice(startIdx);
      const date = winDates[colIdx] || '';
      const v = date ? getValByDate(row, state.metric, date) : null;
      window.AK.tooltip.show(ev,
        `<b>${row.name}</b> · ${date}<br>${m.label}：<b>${v === null || v === undefined ? '—' : Math.round(v * 10) / 10}</b>`);
    });
    canvasEl.addEventListener('mouseleave', () => { canvasEl.style.cursor = 'default'; window.AK.tooltip.hide(); });

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
      const allDates = firstCode && payload.metrics[firstCode] ? groupDates(payload.metrics[firstCode]) : [];
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
      // 点击行名区（colIdx<0）或矩阵区均可穿透；仅右侧 padding 不触发
      if (mx >= W - padR) return;

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
    sortedL1 = Object.keys(payload.metrics).filter((c) => payload.levels['1']);
    sortedL1.sort((a, b) => payload.metrics[a].name.localeCompare(payload.metrics[b].name, 'zh'));

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
