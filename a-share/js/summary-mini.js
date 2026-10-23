/**
 * A股看板 · 汇总页迷你缩略图渲染器（summary.html 专用）
 * 设计哲学（模仿美债看板 /us-debt/summary/ 的 MiniChart）：
 *   · 每张卡片不是完整面板的截图，而是为小尺寸专门重绘的迷你图
 *   · 去标题、去图例（或极小图例）、去注释、去交互
 *   · 坐标轴稀疏、字号 7~10px、压缩边距
 * 画布统一 560×280（2:1），卡片图表区 160px 高。
 * 全部函数挂 window.SM，单卡失败由调用方 try/catch 兜底。
 */
(function () {
  'use strict';

  var W = 560, H = 280;
  var RED = '#E65A56', GREEN = '#2FBF71', BLUE = '#5AAEF3', PURPLE = '#6D61E4';
  var INK = '#1A1A1A', GRAY = '#777777', LIGHT = '#BBBBBB', LINE = '#E8E8E8';

  /* ─── 通用工具 ─────────────────────────────── */

  /** 创建 canvas 并铺满宿主（host 内部需要已清空） */
  function setup(host) {
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    return { canvas: canvas, ctx: ctx };
  }

  /** 折线（线性坐标） */
  function polyline(ctx, pts, color, width) {
    if (!pts.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p === null || p === undefined) { started = false; continue; }
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; }
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }

  /** 从 dates 里挑出约 n 个均匀年份刻度 */
  function yearTicks(dates, n) {
    var out = [];
    if (!dates || !dates.length) return out;
    var first = String(dates[0]).slice(0, 4);
    var last = String(dates[dates.length - 1]).slice(0, 4);
    var fy = parseInt(first, 10), ly = parseInt(last, 10);
    if (isNaN(fy) || isNaN(ly) || ly < fy) return out;
    var span = ly - fy;
    var step = Math.max(1, Math.ceil(span / (n - 1)));
    var y = fy;
    while (y <= ly) {
      // 找该年份在 dates 中首次出现的位置
      var idx = -1;
      for (var i = 0; i < dates.length; i++) {
        if (parseInt(String(dates[i]).slice(0, 4), 10) >= y) { idx = i; break; }
      }
      if (idx >= 0) out.push([String(y), idx]);
      y += step;
    }
    return out;
  }

  /** 系列归一化：以首个有效点为 1，返回 {norm, firstIdx} */
  function normAt1(vals) {
    var first = -1;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] !== null && vals[i] !== undefined && !isNaN(vals[i]) && vals[i] > 0) { first = i; break; }
    }
    var base = first >= 0 ? vals[first] : 1;
    var norm = [];
    for (var j = 0; j < vals.length; j++) {
      var v = vals[j];
      norm.push((v === null || v === undefined || isNaN(v) || v <= 0) ? null : v / base);
    }
    return { norm: norm, firstIdx: first };
  }

  /** 对数 y 范围（自然对数） */
  function logRange(seriesList) {
    var yMin = Infinity, yMax = -Infinity;
    seriesList.forEach(function (s) {
      s.forEach(function (v) {
        if (v === null || v === undefined || v <= 0) return;
        var lv = Math.log(v);
        if (lv < yMin) yMin = lv;
        if (lv > yMax) yMax = lv;
      });
    });
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    var pad = (yMax - yMin) * 0.05 || 0.1;
    return { yMin: yMin - pad, yMax: yMax + pad };
  }

  /** 通用对数折线迷你图：多条序列（已归一化），末端 CAGR 小标签，稀疏网格 */
  function drawLogLines(ctx, dates, seriesArr, colors, opts) {
    opts = opts || {};
    var padL = opts.padL || 34, padR = opts.padR || 84;
    var padT = opts.padT || 10, padB = opts.padB || 18;
    var n = dates.length;
    var xs = function (i) { return padL + (n <= 1 ? 0.5 : i / (n - 1)) * (W - padL - padR); };

    var range = logRange(seriesArr);
    var ys = function (v) { return padT + (1 - (Math.log(v) - range.yMin) / (range.yMax - range.yMin)) * (H - padT - padB); };

    // 网格 + 左标签（取 2 的幂，落在范围内的画）
    ctx.lineWidth = 1;
    var levels = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
    levels.forEach(function (lv) {
      if (lv < Math.exp(range.yMin) || lv > Math.exp(range.yMax)) return;
      var y = ys(lv);
      ctx.strokeStyle = '#F0F0F0';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#B0B4BC';
      ctx.font = '7px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(lv + 'x', padL - 4, y);
    });

    // 年份刻度
    var ticks = yearTicks(dates, 6);
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks.forEach(function (t) { ctx.fillText(t[0], xs(t[1]), H - padB + 4); });

    // 画线
    for (var k = 0; k < seriesArr.length; k++) {
      var pts = [];
      for (var i = 0; i < seriesArr[k].length; i++) {
        var v = seriesArr[k][i];
        pts.push((v === null || v === undefined || v <= 0) ? null : [xs(i), ys(v)]);
      }
      polyline(ctx, pts, colors[k] || '#888888', opts.lineWidth || 1.4);
    }

    // 末端 CAGR 标签（小号、防重叠：按 y 排序上下错开）
    if (opts.showEnd !== false) {
      var ends = [];
      for (var s2 = 0; s2 < seriesArr.length; s2++) {
        var arr = seriesArr[s2];
        var li = -1;
        for (var i2 = arr.length - 1; i2 >= 0; i2--) {
          if (arr[i2] !== null && arr[i2] > 0) { li = i2; break; }
        }
        if (li < 0) continue;
        var fi = -1;
        for (var i3 = 0; i3 <= li; i3++) {
          if (arr[i3] !== null && arr[i3] > 0) { fi = i3; break; }
        }
        if (fi < 0) continue;
        var v0 = arr[fi], v1 = arr[li];
        var y0 = Date.parse(dates[fi]), y1 = Date.parse(dates[li]);
        var yrs = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
        var cagr = (yrs > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / yrs) - 1 : 0;
        ends.push({ x: xs(li), y: ys(v1), cagr: cagr, color: colors[s2] || '#888' });
      }
      ends.sort(function (a, b) { return a.y - b.y; }); // 从上到下
      var used = [];
      ctx.font = '8px NotoSansSC, sans-serif';
      ends.forEach(function (e) {
        var txt = (e.cagr * 100).toFixed(1) + '%';
        var tw = ctx.measureText(txt).width;
        var dy = 0;
        for (var kk = 0; kk < 20; kk++) {
          var cand = e.y + dy;
          var clash = used.some(function (u) { return Math.abs(u - cand) < 10; });
          if (!clash) break;
          dy = (kk % 2 === 0) ? dy - 10 : dy + 10;
        }
        var labelY = e.y + dy;
        used.push(labelY);
        // 末端点
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.stroke();
        // 连线 + 标签
        ctx.strokeStyle = '#CCCCCC'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(e.x + 3, e.y); ctx.lineTo(e.x + 6, labelY); ctx.stroke();
        ctx.fillStyle = e.color;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, e.x + 7, labelY);
      });
    }
  }

  /** 通用「上下双子图」折线迷你图：boxes=[{top,h,data...}] */
  function drawDual(ctx, boxes, xRange) {
    // boxes: [{ top, h, dates, seriesArr, colors, yFmt, gridLine, refLines }]
    boxes.forEach(function (b) {
      var top = b.top, h = b.h;
      var padL = 30, padR = 10, padT = 4, padB = 13;
      var n = b.dates.length;
      var xs = function (i) { return padL + (n <= 1 ? 0.5 : i / (n - 1)) * (W - padL - padR); };
      var yMin = Infinity, yMax = -Infinity;
      b.seriesArr.forEach(function (arr) {
        arr.forEach(function (v) {
          if (v === null || v === undefined || isNaN(v)) return;
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        });
      });
      if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
      // 固定值域优先；其次 yMinFloor（y 下限不低于 0）
      if (Array.isArray(b.yDomain)) { yMin = b.yDomain[0]; yMax = b.yDomain[1]; }
      else {
        var span = yMax - yMin || 1;
        yMin -= span * 0.06; yMax += span * 0.06;
        if (b.yMinFloor !== undefined && yMin < b.yMinFloor) yMin = b.yMinFloor;
      }
      var ys = function (v) { return top + padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB); };

      // 网格 + 左标签（3~4 条）
      var gLines = b.gridLine != null ? [b.gridLine] : [];
      if (gLines.length) {
        gLines.forEach(function (gv) {
          var y = ys(gv);
          ctx.strokeStyle = '#E8E8E8';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#B0B4BC';
          ctx.font = '7px NotoSansSC, sans-serif';
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(b.fmt(gv), padL - 4, y);
        });
      }
      // y 范围上下标签
      ctx.fillStyle = '#B0B4BC';
      ctx.font = '7px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(b.fmt(yMax), padL - 4, top + padT + 1);
      ctx.fillText(b.fmt(yMin), padL - 4, top + h - padB);

      // 参考线
      (b.refLines || []).forEach(function (r) {
        var y = ys(r.val);
        ctx.strokeStyle = r.color || '#CCCCCC';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.setLineDash([]);
      });

      // 年份刻度（下子图才画 x 标签）
      if (b.xLabel !== false) {
        var ticks = yearTicks(b.dates, 5);
        ctx.fillStyle = '#B0B4BC';
        ctx.font = '7px NotoSansSC, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ticks.forEach(function (t) { ctx.fillText(t[0], xs(t[1]), b.top + h - padB + 3); });
      }

      // 线
      for (var k = 0; k < b.seriesArr.length; k++) {
        var pts = [];
        for (var i = 0; i < b.seriesArr[k].length; i++) {
          var v = b.seriesArr[k][i];
          pts.push((v === null || v === undefined || isNaN(v)) ? null : [xs(i), ys(v)]);
        }
        polyline(ctx, pts, b.colors[k] || '#888888', b.lineWidth || 1.3);
      }
    });
  }

  /* ─── 卡片 1：申万一级行业年度涨跌幅 · 长期 CAGR（迷你色块矩阵） ─── */

  function renderHeatmap(canvas, raw) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var years = raw.years ? raw.years.map(String) : [];
    var metricsMeta = raw.metrics_meta && raw.metrics_meta.columns ? raw.metrics_meta.columns : [];
    var order = Object.keys(raw.data || {});
    var rows = order.map(function (name) {
      var item = raw.data[name];
      if (!item) return null;
      var rets = (item.rets || []).slice();
      rets.push(item.ytd2026 !== undefined && item.ytd2026 !== null ? item.ytd2026 : null);
      return { name: name, rets: rets };
    }).filter(Boolean);
    if (!rows.length || !years.length) return;

    var padL = 8, padT = 14, padB = 16;
    var gap = 6;
    var nYear = years.length, nMetric = metricsMeta.length;
    var usable = W - padL - gap;
    var yearCellW = usable / (nYear + nMetric * 1.35);
    var metricCellW = yearCellW * 1.35;
    var cellH = (H - padT - padB) / rows.length;

    // 年度列头（每 3 年标一个）
    var vmin = -50, vmax = 105;
    var allV = [];
    rows.forEach(function (r) { (r.rets || []).forEach(function (v) { if (v !== null && !isNaN(v)) allV.push(v); }); });
    allV.sort(function (a, b) { return a - b; });
    if (allV.length) {
      vmin = allV[Math.floor(allV.length * 0.02)];
      vmax = allV[Math.max(0, Math.ceil(allV.length * 0.98) - 1)];
      if (vmin >= 0) vmin = -1;
      if (vmax <= 0) vmax = 1;
    }
    function mapColor(val) {
      if (val === null || val === undefined || isNaN(val)) return 'rgb(244,245,247)';
      var t = val >= 0 ? 0.5 + (val / vmax) * 0.5 : 0.5 + (val / Math.abs(vmin)) * 0.5;
      t = Math.max(0, Math.min(1, t));
      var stops = [
        [0.0, [47, 191, 113]], [0.4, [201, 240, 218]], [0.5, [255, 255, 255]],
        [0.6, [247, 205, 203]], [1.0, [230, 90, 86]]
      ];
      var i = 0;
      while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
      var t0 = stops[i][0], c0 = stops[i][1];
      var t1 = stops[Math.min(i + 1, stops.length - 1)][0], c1 = stops[Math.min(i + 1, stops.length - 1)][1];
      var k = (t - t0) / ((t1 - t0) || 1);
      var rgb = [0, 1, 2].map(function (j) { return Math.round(c0[j] + (c1[j] - c0[j]) * k); });
      return 'rgb(' + rgb.join(',') + ')';
    }

    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    years.forEach(function (y, j) {
      if (j % 3 !== 0 && j !== nYear - 1) return;
      var isYtd = y.indexOf('*') >= 0;
      ctx.fillStyle = isYtd ? RED : '#9AA0A6';
      ctx.fillText(isYtd ? 'YTD' : y, padL + (j + 0.5) * yearCellW, padT - 2);
    });
    metricsMeta.forEach(function (col, j) {
      ctx.fillStyle = '#9AA0A6';
      ctx.fillText(col.label.length > 4 ? col.label.slice(0, 4) : col.label, padL + nYear * yearCellW + gap + (j + 0.5) * metricCellW, padT - 2);
    });

    rows.forEach(function (row, i) {
      var rowY = padT + i * cellH;
      row.rets.forEach(function (val, j) {
        var x = padL + j * yearCellW;
        ctx.fillStyle = mapColor(val);
        ctx.fillRect(x, rowY, Math.max(1, yearCellW - 0.5), Math.max(1, cellH - 0.5));
      });
      metricsMeta.forEach(function (col, j) {
        var val = row.metrics ? row.metrics[j] : null;
        var x = padL + nYear * yearCellW + gap + j * metricCellW;
        ctx.fillStyle = mapColor2(val);
        ctx.fillRect(x, rowY, Math.max(1, metricCellW - 0.5), Math.max(1, cellH - 0.5));
      });
    });

    // 指标区（CAGR）需要单独色阶 -12~18
    function mapColor2(val) {
      if (val === null || val === undefined || isNaN(val)) return 'rgb(244,245,247)';
      var a = -12, b = 18;
      var t = val >= 0 ? 0.5 + (val / b) * 0.5 : 0.5 + (val / Math.abs(a)) * 0.5;
      t = Math.max(0, Math.min(1, t));
      var stops = [
        [0.0, [47, 191, 113]], [0.4, [201, 240, 218]], [0.5, [255, 255, 255]],
        [0.6, [247, 205, 203]], [1.0, [230, 90, 86]]
      ];
      var i = 0;
      while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
      var t0 = stops[i][0], c0 = stops[i][1];
      var t1 = stops[Math.min(i + 1, stops.length - 1)][0], c1 = stops[Math.min(i + 1, stops.length - 1)][1];
      var k = (t - t0) / ((t1 - t0) || 1);
      var rgb = [0, 1, 2].map(function (j) { return Math.round(c0[j] + (c1[j] - c0[j]) * k); });
      return 'rgb(' + rgb.join(',') + ')';
    }

    // 底部分隔
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(padL, padT + rows.length * cellH, W - padL, 1);
  }

  /* ─── 卡片 2：不同事物的增长情况（对数折线 8 条） ─── */

  var LG_COLORS = {
    M2: BLUE, 存款: '#333333', GDP: RED, 总市值: PURPLE,
    一线房价: '#5B6E96', 二线房价: '#62D9AD', 黄金: '#B8860B', 中证全指全收益: '#23C2DB'
  };
  function renderLonggrowth(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var codes = Object.keys(data.series || {});
    if (!codes.length) return;
    var master = null, masterLen = 0;
    codes.forEach(function (c) { var s = data.series[c]; if (s && s.dates && s.dates.length > masterLen) { masterLen = s.dates.length; master = s; } });
    var dates = master.dates;
    var seriesArr = [], colors = [];
    codes.forEach(function (c) {
      var s = data.series[c];
      var norm = normAt1(s.values).norm;
      // 对齐到 master 长度（按日期二分）
      var aligned = [];
      for (var i = 0; i < dates.length; i++) {
        var d = dates[i];
        var idx = -1;
        for (var j = 0; j < s.dates.length; j++) {
          if (s.dates[j] >= d) { idx = j; break; }
        }
        if (idx < 0) idx = s.dates.length - 1;
        aligned.push(norm[idx] !== undefined ? norm[idx] : null);
      }
      seriesArr.push(aligned);
      colors.push(LG_COLORS[c] || '#888888');
    });
    drawLogLines(ctx, dates, seriesArr, colors, { padL: 34, padR: 84, lineWidth: 1.5 });
  }

  /* ─── 卡片 3：华证六因子（对数折线 6 条） ─── */

  var HZ_COLORS = { 成长: BLUE, 价值: '#333333', 低波: RED, 动量: PURPLE, 质量: '#5B6E96', 红利: '#62D9AD' };
  function renderHuazheng(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var factors = Object.keys(data.factors || {});
    if (!factors.length) return;
    var dates = data.factors[factors[0]].dates || [];
    var seriesArr = [], colors = [];
    factors.forEach(function (f) {
      seriesArr.push(normAt1(data.factors[f].nav || []).norm);
      colors.push(HZ_COLORS[f] || '#888888');
    });
    drawLogLines(ctx, dates, seriesArr, colors, { padL: 34, padR: 84, lineWidth: 1.5 });
  }

  /* ─── 卡片 4：宽基指数覆盖范围（格子条） ─── */

  function renderCoverage(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var indexes = data.indexes || [];
    if (!indexes.length) return;
    // 用「首字母分组排序」简化：按 count 升序，行 = 指数
    var order = [
      { code: '000300', start: 0 },
      { code: '000905', start: 6 },
      { code: '000852', start: 16 },
      { code: '932000', start: 36 },
      { code: '000985', start: 0 },
      { code: '000510', start: 0 }
    ];
    var palette = [BLUE, '#333333', RED, PURPLE, '#5B6E96', '#62D9AD'];
    var PER = 50;
    var padL = 66, padR = 52, padT = 8, padB = 8;
    var rowH = (H - padT - padB) / order.length;
    var maxCells = 76; // 3800/50
    var chartW = W - padL - padR;
    var cellW = chartW / maxCells;

    order.forEach(function (o, i) {
      var item = indexes.filter(function (x) { return x.code === o.code; })[0];
      var count = item ? item.count : 0;
      var name = item ? item.name : o.code;
      var cells = Math.max(1, Math.round(count / PER));
      var rowY = padT + i * rowH;
      var y = rowY + 4, h = rowH - 8;
      // 行标签
      ctx.fillStyle = INK;
      ctx.font = '8px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(name, padL - 6, rowY + rowH / 2);
      // 数量（右侧）
      ctx.fillStyle = GRAY;
      ctx.textAlign = 'left';
      ctx.fillText(String(count), W - padR + 6, rowY + rowH / 2);
      // 格子带
      var color = palette[i % palette.length];
      for (var c = 0; c < cells; c++) {
        var x = padL + (o.start + c) * cellW;
        if (x > W - padR) break;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, Math.max(1.5, cellW - 0.8), h);
        ctx.globalAlpha = 1;
      }
      // 分隔线
      ctx.fillStyle = '#F0F0F0';
      ctx.fillRect(padL, rowY + rowH - 0.5, chartW, 0.5);
    });
  }

  /* ─── 卡片 5：宽基指数全收益净值（对数折线） ─── */

  var WB_COLORS = {
    H00300: BLUE, H00905: '#333333', H00852: RED, '399606': PURPLE,
    '000688': '#5B6E96', '932000': '#62D9AD', H00985: '#30CB13',
    'A500TR.CSI': '#23C2DB', H30269: '#FFDC4C'
  };
  function renderWideBase(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var codes = Object.keys(data.series || {});
    if (!codes.length) return;
    var master = null, masterLen = 0;
    codes.forEach(function (c) { var s = data.series[c]; if (s && s.dates && s.dates.length > masterLen) { masterLen = s.dates.length; master = s; } });
    var dates = master.dates;
    var seriesArr = [], colors = [];
    codes.forEach(function (c) {
      var s = data.series[c];
      var norm = normAt1(s.values).norm;
      var aligned = [];
      for (var i = 0; i < dates.length; i++) {
        var idx = -1;
        for (var j = 0; j < s.dates.length; j++) { if (s.dates[j] >= dates[i]) { idx = j; break; } }
        if (idx < 0) idx = s.dates.length - 1;
        aligned.push(norm[idx] !== undefined ? norm[idx] : null);
      }
      seriesArr.push(aligned);
      colors.push(WB_COLORS[c] || '#888888');
    });
    drawLogLines(ctx, dates, seriesArr, colors, { padL: 34, padR: 84, lineWidth: 1.2 });
  }

  /* ─── 卡片 6：主要宽基指数估值分位（横向条形） ─── */

  function renderValuation(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var items = (data && data.items) || data || [];
    if (!items.length) return;
    var n = items.length;
    var padL = 62, padR = 46, padT = 6, padB = 8;
    var rowH = (H - padT - padB) / n;
    var chartW = W - padL - padR;
    function pctColor(p) {
      var x = Math.max(0, Math.min(100, p));
      if (x <= 50) {
        var k = x / 50;
        var c = [47 + (170 - 47) * k, 191 + (190 - 191) * k, 113 + (120 - 113) * k];
        return 'rgb(' + c.map(function (v) { return Math.round(v); }).join(',') + ')';
      }
      var k2 = (x - 50) / 50;
      var c2 = [170 + (230 - 170) * k2, 190 - (190 - 90) * k2, 120 - (120 - 86) * k2];
      return 'rgb(' + c2.map(function (v) { return Math.round(v); }).join(',') + ')';
    }
    // 中位参考线 50
    var midX = padL + chartW * 0.5;
    ctx.strokeStyle = '#E0E0E0';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(midX, padT); ctx.lineTo(midX, H - padB); ctx.stroke();
    ctx.setLineDash([]);

    items.forEach(function (it, i) {
      var rowY = padT + i * rowH;
      var y = rowY + 4, h = Math.max(6, rowH - 8);
      ctx.fillStyle = INK;
      ctx.font = '8px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(it.name, padL - 6, rowY + rowH / 2);
      var p = it.pct;
      if (p === null || p === undefined || isNaN(p)) return;
      var bw = chartW * (p / 100);
      var x = p >= 50 ? midX : midX - bw;
      ctx.fillStyle = pctColor(p);
      ctx.fillRect(x, y, Math.max(1.5, bw), h);
      // 端点数值
      ctx.fillStyle = GRAY;
      ctx.textAlign = p >= 50 ? 'left' : 'right';
      ctx.font = '7px NotoSansSC, sans-serif';
      ctx.fillText((p / 100).toFixed(0) + '', x + (p >= 50 ? 3 : -3), rowY + rowH / 2);
    });
    // 50 标签
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('50', midX, H - 2);
  }

  /* ─── 卡片 7：指数收益来源拆解（堆叠条） ─── */

  function renderReturnDecomp(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var indexes = (data && data.indexes) || [];
    if (!indexes.length) return;
    var n = indexes.length;
    var padL = 58, padR = 8, padT = 6, padB = 8;
    var rowH = (H - padT - padB) / n;
    var chartW = W - padL - padR;
    var maxAbs = 1;
    indexes.forEach(function (x) {
      ['totalReturnPct', 'dividendPct', 'earningsPct', 'valuationPct'].forEach(function (k) {
        var v = x[k];
        if (v !== null && v !== undefined && !isNaN(v)) maxAbs = Math.max(maxAbs, Math.abs(v));
      });
    });
    var zeroX = padL + chartW * 0.5;
    var scale = chartW * 0.5 / maxAbs;

    // 0 中轴
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zeroX, padT); ctx.lineTo(zeroX, H - padB); ctx.stroke();

    // 图例（极小，顶部右侧）
    var legend = [['股息', '#62D9AD'], ['盈利', BLUE], ['估值', RED]];
    var lx = W - 8;
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var li = legend.length - 1; li >= 0; li--) {
      var lw = ctx.measureText(legend[li][0]).width + 10;
      lx -= lw;
      ctx.fillStyle = legend[li][1];
      ctx.fillRect(lx, 3, 6, 6);
      ctx.fillStyle = '#9AA0A6';
      ctx.fillText(legend[li][0], lx + 8, 6);
    }

    indexes.forEach(function (x, i) {
      var rowY = padT + i * rowH;
      var y = rowY + 6, h = Math.max(5, rowH - 12);
      ctx.fillStyle = INK;
      ctx.font = '8px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(x.name, padL - 6, rowY + rowH / 2);

      var total = x.totalReturnPct;
      if (total === null || total === undefined || isNaN(total)) return;
      // 从 0 出发画总收益条
      var x0 = zeroX, x1 = zeroX + total * scale;
      var startX = Math.min(x0, x1), endX = Math.max(x0, x1);
      ctx.fillStyle = total >= 0 ? '#F6E3E2' : '#E1F0E6';
      ctx.fillRect(startX, y, Math.max(1, endX - startX), h);
      // 三段分解断点（股息→盈利→估值累计）
      var acc = 0;
      [['dividendPct', '#62D9AD'], ['earningsPct', BLUE], ['valuationPct', RED]].forEach(function (seg) {
        var v = x[seg[0]];
        if (v === null || v === undefined || isNaN(v)) return;
        acc += v;
        var bx = zeroX + acc * scale;
        if (bx >= Math.min(x0, x1) - 0.5 && bx <= Math.max(x0, x1) + 0.5) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(bx - 0.5, y, 1, h);
        }
      });
      // 总收益数值
      ctx.fillStyle = GRAY;
      ctx.font = '7px NotoSansSC, sans-serif';
      ctx.textAlign = x1 >= zeroX ? 'left' : 'right';
      ctx.fillText((total > 0 ? '+' : '') + total.toFixed(0) + '%', x1 + (x1 >= zeroX ? 3 : -3), rowY + rowH / 2);
    });
  }

  /* ─── 卡片 8：股债性价比 · 股权风险溢价（上下双折线） ─── */

  function renderAssetAlloc(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var items = (data && data.items) || data || [];
    if (!items.length) return;
    var dates = items.map(function (x) { return x.date; });
    var erp = items.map(function (x) { return x.erp; });
    var rel = items.map(function (x) { return x.rel_ratio; });
    var erpPct = items[items.length - 1] ? items[items.length - 1].erp_pct : null;

    var topH = 150, botTop = H - 118;
    drawDual(ctx, [
      {
        top: 4, h: topH - 4, dates: dates, seriesArr: [erp], colors: [RED],
        fmt: function (v) { return v.toFixed(1); }, xLabel: false, lineWidth: 1.3,
        refLines: [{ val: 0, color: '#CCCCCC' }]
      },
      {
        top: botTop, h: H - botTop - 4, dates: dates, seriesArr: [rel], colors: [BLUE],
        fmt: function (v) { return v.toFixed(1); }, xLabel: true, lineWidth: 1.3,
        refLines: [{ val: 1, color: '#CCCCCC' }]
      }
    ]);

    // 当前 ERP 分位角标
    if (erpPct !== null && erpPct !== undefined) {
      ctx.fillStyle = 'rgba(230,90,86,0.12)';
      var px = W - 56;
      ctx.fillRect(px - 4, 6, 52, 12);
      ctx.fillStyle = RED;
      ctx.font = '8px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('ERP分位 ' + Math.round(erpPct * 100) + '%', px, 12);
    }
  }

  /* ─── 卡片 9：关于抄底的一道基础数学题（迷你亏损表） ─── */

  function renderLossTable(canvas) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var ROWS = ['80', '70', '60', '50', '40', '30', '20', '10'];
    var COLS = ['100', '80', '70', '60', '50', '40'];
    var padL = 30, padR = 8, padT = 15, padB = 16;
    var nRow = ROWS.length, nCol = COLS.length;
    var cellW = (W - padL - padR) / nCol;
    var cellH = (H - padT - padB) / nRow;

    // 列头（买入价）
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    COLS.forEach(function (c, j) {
      ctx.fillStyle = '#9AA0A6';
      ctx.fillText(c, padL + (j + 0.5) * cellW, padT - 3);
    });
    // 行头（现价）
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ROWS.forEach(function (r, i) {
      ctx.fillStyle = '#9AA0A6';
      ctx.fillText(r, padL - 5, padT + (i + 0.5) * cellH);
    });

    function cellColor(v) {
      // v: 亏损百分比（0 或负）
      if (v === null) return { bg: '#F8F9FB', fg: '#B8BEC7' };
      if (v === 0) return { bg: '#FBE9EA', fg: '#C1443C' };
      var k = Math.min(1, Math.abs(v) / 90);
      // 越亏越深绿
      var g = Math.round(239 - (239 - 39) * k);
      var r = Math.round(223 - (223 - 30) * k);
      var b = Math.round(236 - (236 - 50) * k);
      return { bg: 'rgb(' + r + ',' + g + ',' + b + ')', fg: '#FFFFFF' };
    }

    var buyPrices = [100, 80, 70, 60, 50, 40];
    var curPrices = [80, 70, 60, 50, 40, 30, 20, 10];
    ROWS.forEach(function (r, i) {
      COLS.forEach(function (c, j) {
        var cur = curPrices[i], buy = buyPrices[j];
        var v = cur > buy ? null : ((cur - buy) / buy) * 100;
        var col = cellColor(v);
        var x = padL + j * cellW, y = padT + i * cellH;
        ctx.fillStyle = col.bg;
        ctx.fillRect(x + 0.5, y + 0.5, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
        if (v !== null) {
          ctx.fillStyle = col.fg;
          ctx.font = '7px NotoSansSC, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText((v * -1).toFixed(0) + '', x + cellW / 2, y + cellH / 2);
        }
      });
    });
  }

  /* ─── 卡片 10：全市场成交金额 / 换手（上下双图） ─── */

  function renderTurnover(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var dates = data.dates || [];
    var amount = data.amount || [];
    var turnover = data.turnover || [];
    if (!dates.length) return;

    // 上：成交金额（近 10 年 ≈ 2400 点，画折线面积）
    var cutoff = dates.length - 2400;
    if (cutoff < 0) cutoff = 0;
    var d10 = dates.slice(cutoff), a10 = amount.slice(cutoff);
    var topH = 150, botTop = H - 118;

    // 上子图：金额折线（蓝）
    drawDual(ctx, [{
      top: 4, h: topH - 4, dates: d10, seriesArr: [a10], colors: [BLUE],
      fmt: function (v) { return (v / 10000).toFixed(1) + '万'; }, xLabel: false, lineWidth: 1.2
    }]);

    // 下子图：换手率（近 10 年）+ 窗口均值虚线
    var t10 = turnover.slice(cutoff);
    var mean = 0, cnt = 0;
    t10.forEach(function (v) { if (v !== null && !isNaN(v)) { mean += v; cnt++; } });
    mean = cnt ? mean / cnt : 0;
    drawDual(ctx, [{
      top: botTop, h: H - botTop - 4, dates: d10, seriesArr: [t10], colors: [RED],
      fmt: function (v) { return v.toFixed(1); }, xLabel: true, lineWidth: 1.2,
      refLines: [{ val: mean, color: '#9AA0A6' }]
    }]);
  }

  /* ─── 卡片 11：行业交易热度（迷你 RPS 色块矩阵） ─── */

  function renderIndustry(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var metrics = data.metrics || {};
    var codes = Object.keys(metrics);
    if (!codes.length) return;
    // 一级行业（levels['1'].n = 31）→ 取 g===0 的
    var l1 = codes.filter(function (c) { return metrics[c].g === 0; });
    if (!l1.length) l1 = codes;
    l1.sort(function (a, b) { return a.localeCompare(b); });

    var padL = 56, padR = 6, padT = 12, padB = 14;
    var n = l1.length;
    var cellH = (H - padT - padB) / n;
    // 最近 120 个交易日 RPS
    var WIN = 120;
    var maxLen = 0;
    l1.forEach(function (c) { maxLen = Math.max(maxLen, (metrics[c].rps || []).length); });
    var cellW = (W - padL - padR) / Math.min(WIN, maxLen);
    var start = Math.max(0, maxLen - WIN);

    function heatColor(v) {
      if (v === null || v === undefined || isNaN(v)) return 'rgb(244,245,247)';
      var t = Math.max(0, Math.min(100, v)) / 100;
      // 0 深绿 → 100 深红（无白色过渡）
      var r, g, b;
      if (t <= 0.5) {
        var k = t / 0.5;
        r = Math.round(47 + (170 - 47) * k); g = Math.round(191 + (190 - 191) * k); b = Math.round(113 + (120 - 113) * k);
      } else {
        var k2 = (t - 0.5) / 0.5;
        r = Math.round(170 + (230 - 170) * k2); g = Math.round(190 - (190 - 90) * k2); b = Math.round(120 - (120 - 86) * k2);
      }
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    l1.forEach(function (c, i) {
      var name = metrics[c].name || c;
      var rowY = padT + i * cellH;
      ctx.fillStyle = '#666666';
      ctx.fillText(name, padL - 5, rowY + cellH / 2);
      var rps = metrics[c].rps || [];
      for (var j = 0; j < Math.min(WIN, maxLen); j++) {
        var idx = start + j;
        var v = rps[idx];
        if (v === undefined) continue;
        var x = padL + j * cellW;
        ctx.fillStyle = heatColor(v);
        ctx.fillRect(x, rowY + 0.5, Math.max(1, cellW - 0.4), Math.max(1, cellH - 0.8));
      }
    });
    // 顶部说明（最右）
    ctx.fillStyle = '#B0B4BC';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('近120日 RPS', W - padR, 1);
  }

  /* ─── 卡片 12：市场趋势温度（上下双折线） ─── */

  function renderTrend(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var stock = data.stock_ma250 || [];
    var macd = data.industry_macd || [];
    if (!stock.length && !macd.length) return;
    var d1 = stock.map(function (x) { return x.date; });
    var v1 = stock.map(function (x) { return x.pct_above; });
    var d2 = macd.map(function (x) { return x.date; });
    var v2 = macd.map(function (x) { return x.pct_positive; });

    var topH = 150, botTop = H - 118;
    drawDual(ctx, [
      {
        top: 4, h: topH - 4, dates: d1, seriesArr: [v1], colors: [RED],
        fmt: function (v) { return v.toFixed(0) + '%'; }, xLabel: false, lineWidth: 1.3,
        refLines: [{ val: 50, color: '#CCCCCC' }]
      },
      {
        top: botTop, h: H - botTop - 4, dates: d2, seriesArr: [v2], colors: [BLUE],
        fmt: function (v) { return v.toFixed(0) + '%'; }, xLabel: true, lineWidth: 1.3
      }
    ]);
  }

  /* ─── 卡片 13：A股恐贪指数（双轴折线） ─── */

  function renderFearGreed(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var s = (data.series || {});
    var fg = s.fear_greed || {}, csi = s.csi_all || {};
    var dates = fg.dates || [];
    var fgV = fg.values || [];
    var csiV = csi.values || [];
    if (!dates.length) return;

    var padL = 30, padR = 10, padT = 10, padB = 18;
    var n = dates.length;
    var xs = function (i) { return padL + (n <= 1 ? 0.5 : i / (n - 1)) * (W - padL - padR); };

    // 恐贪 0-100 左轴
    var ys = function (v) { return padT + (1 - v / 100) * (H - padT - padB); };
    // 分档色带
    var bands = [
      [0, 25, 'rgba(47,191,113,0.10)'], [25, 45, 'rgba(47,191,113,0.05)'],
      [45, 55, 'rgba(200,200,200,0.08)'], [55, 75, 'rgba(230,90,86,0.05)'], [75, 100, 'rgba(230,90,86,0.10)']
    ];
    bands.forEach(function (b) {
      ctx.fillStyle = b[2];
      ctx.fillRect(padL, ys(b[1]), W - padL - padR, ys(b[0]) - ys(b[1]));
    });
    // 20/80 参考虚线
    [20, 80].forEach(function (v) {
      ctx.strokeStyle = v === 20 ? '#30CB13' : RED;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(padL, ys(v)); ctx.lineTo(W - padR, ys(v)); ctx.stroke();
      ctx.setLineDash([]);
    });
    // 左轴刻度 0/50/100
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 50, 100].forEach(function (v) { ctx.fillText(String(v), padL - 4, ys(v)); });

    // 中证全指右轴范围
    var cMin = Infinity, cMax = -Infinity;
    csiV.forEach(function (v) { if (v !== null && !isNaN(v)) { if (v < cMin) cMin = v; if (v > cMax) cMax = v; } });
    if (!isFinite(cMin)) { cMin = 0; cMax = 1; }
    var cs = function (v) { return padT + (1 - (v - cMin) / (cMax - cMin || 1)) * (H - padT - padB); };

    // 恐贪线（灰 1.4px）
    var pts1 = [];
    for (var i = 0; i < fgV.length; i++) pts1.push((fgV[i] === null || isNaN(fgV[i])) ? null : [xs(i), ys(fgV[i])]);
    polyline(ctx, pts1, '#444444', 1.4);
    // 中证全指线（红）
    var pts2 = [];
    for (var j = 0; j < csiV.length; j++) pts2.push((csiV[j] === null || isNaN(csiV[j])) ? null : [xs(j), cs(csiV[j])]);
    polyline(ctx, pts2, RED, 1.0);

    // 年份刻度
    var ticks = yearTicks(dates, 6);
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks.forEach(function (t) { ctx.fillText(t[0], xs(t[1]), H - padB + 4); });
  }

  /* ─── 卡片 14：神奇择时指标（对数折线 3 条） ─── */

  var FI_COLORS = { 'A500TR.CSI': BLUE, '885001.WI': RED, '885003.WI': '#333333' };
  function renderFundIndex(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var s = (data.series || {});
    var keys = Object.keys(s);
    if (!keys.length) return;
    var master = null, masterLen = 0;
    keys.forEach(function (c) { var x = s[c]; if (x && x.dates && x.dates.length > masterLen) { masterLen = x.dates.length; master = x; } });
    var dates = master.dates;
    var seriesArr = [], colors = [];
    keys.forEach(function (c) {
      var x = s[c];
      var norm = normAt1(x.values).norm;
      var aligned = [];
      for (var i = 0; i < dates.length; i++) {
        var idx = -1;
        for (var j = 0; j < x.dates.length; j++) { if (x.dates[j] >= dates[i]) { idx = j; break; } }
        if (idx < 0) idx = x.dates.length - 1;
        aligned.push(norm[idx] !== undefined ? norm[idx] : null);
      }
      seriesArr.push(aligned);
      colors.push(FI_COLORS[c] || '#888888');
    });
    drawLogLines(ctx, dates, seriesArr, colors, { padL: 34, padR: 84, lineWidth: 1.5 });
  }

  /* ─── 卡片 15：偏股混合基金滚动年化（rolling3 折线） ─── */

  function renderTiming(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var s = (data.series || {})['885001.WI'] || {};
    var r3 = s.rolling3 || {};
    var dates = r3.dates || [], vals = r3.values || [];
    if (!dates.length) return;

    var padL = 30, padR = 10, padT = 10, padB = 18;
    var n = dates.length;
    var xs = function (i) { return padL + (n <= 1 ? 0.5 : i / (n - 1)) * (W - padL - padR); };
    var yMin = Infinity, yMax = -Infinity;
    vals.forEach(function (v) { if (v !== null && !isNaN(v)) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } });
    if (!isFinite(yMin)) { yMin = -10; yMax = 30; }
    var span = yMax - yMin || 1;
    yMin -= span * 0.05; yMax += span * 0.05;
    var ys = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };

    // 0 虚线
    var y0 = ys(0);
    ctx.strokeStyle = '#CCCCCC';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(W - padR, y0); ctx.stroke();
    ctx.setLineDash([]);

    // 上下界标签
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(yMax.toFixed(0) + '%', padL - 4, padT + 2);
    ctx.fillText(yMin.toFixed(0) + '%', padL - 4, H - padB - 1);

    // 红涨绿跌分段线
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.4;
    var segStart = null, lastPts = [];
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v === null || isNaN(v)) { if (lastPts.length > 1) { strokeSeg(ctx, lastPts); } lastPts = []; continue; }
      var pt = [xs(i), ys(v)];
      if (lastPts.length) {
        var prevV = vals[i - 1];
        if (prevV !== null && !isNaN(prevV) && ((prevV >= 0 && v >= 0) || (prevV < 0 && v < 0))) {
          lastPts.push(pt);
        } else {
          // 跨零：插入零点
          var px0 = xs(i - 1), py0 = ys(prevV), px1 = xs(i), py1 = ys(v);
          var t0 = prevV / (prevV - v);
          var zx = px0 + (px1 - px0) * t0, zy = padT + (1 - 0 - yMin) / (yMax - yMin) * (H - padT - padB);
          zy = ys(0);
          lastPts.push([zx, zy]);
          strokeSeg(ctx, lastPts);
          lastPts = [[zx, zy], pt];
        }
      } else {
        lastPts.push(pt);
      }
    }
    if (lastPts.length > 1) strokeSeg(ctx, lastPts);

    function strokeSeg(ctx2, pts) {
      var pos = pts[0][1] < y0;
      ctx2.strokeStyle = pos ? RED : GREEN;
      ctx2.beginPath();
      ctx2.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) ctx2.lineTo(pts[k][0], pts[k][1]);
      ctx2.stroke();
    }

    // 年份刻度
    var ticks = yearTicks(dates, 6);
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks.forEach(function (t) { ctx.fillText(t[0], xs(t[1]), H - padB + 4); });
  }

  /* ─── 卡片 16：投资者结构（新增投资者 vs 中证全指） ─── */

  function renderInvestor(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    var na = (data.newAccounts || {});
    var dates = na.dates || [];
    var newWan = na.newWan || [];
    var idx = na.index || [];
    if (!dates.length) return;

    var padL = 30, padR = 10, padT = 10, padB = 18;
    var n = dates.length;
    var xs = function (i) { return padL + (n <= 1 ? 0.5 : i / (n - 1)) * (W - padL - padR); };

    // 左轴：新增投资者（万）
    var aMin = Infinity, aMax = -Infinity;
    newWan.forEach(function (v) { if (v !== null && !isNaN(v)) { if (v < aMin) aMin = v; if (v > aMax) aMax = v; } });
    if (!isFinite(aMin)) { aMin = 0; aMax = 1; }
    var as = function (v) { return padT + (1 - (v - aMin) / (aMax - aMin || 1)) * (H - padT - padB); };

    // 右轴：中证全指（归一化显示范围）
    var iMin = Infinity, iMax = -Infinity;
    idx.forEach(function (v) { if (v !== null && !isNaN(v)) { if (v < iMin) iMin = v; if (v > iMax) iMax = v; } });
    if (!isFinite(iMin)) { iMin = 0; iMax = 1; }
    var is = function (v) { return padT + (1 - (v - iMin) / (iMax - iMin || 1)) * (H - padT - padB); };

    // 柱（新增投资者，淡蓝）
    var barW = Math.max(1, (W - padL - padR) / n * 0.7);
    for (var i = 0; i < newWan.length; i++) {
      var v = newWan[i];
      if (v === null || isNaN(v)) continue;
      var x = xs(i) - barW / 2, y = as(v);
      ctx.fillStyle = 'rgba(90,174,243,0.55)';
      ctx.fillRect(x, y, barW, (H - padB) - y);
    }
    // 线（中证全指，红）
    var pts = [];
    for (var j = 0; j < idx.length; j++) pts.push((idx[j] === null || isNaN(idx[j])) ? null : [xs(j), is(idx[j])]);
    polyline(ctx, pts, RED, 1.3);

    // 轴标签
    ctx.fillStyle = '#B0B4BC';
    ctx.font = '7px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('新增(万)', padL + 2, 1);
    ctx.fillStyle = RED;
    ctx.textAlign = 'right';
    ctx.fillText('中证全指', W - padR, 1);

    var ticks = yearTicks(dates, 6);
    ctx.fillStyle = '#B0B4BC';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks.forEach(function (t) { ctx.fillText(t[0], xs(t[1]), H - padB + 4); });
  }

  /* ─── 导出 ───────────────────────────────── */

  window.SM = {
    W: W, H: H,
    renderHeatmap: renderHeatmap,
    renderLonggrowth: renderLonggrowth,
    renderHuazheng: renderHuazheng,
    renderCoverage: renderCoverage,
    renderWideBase: renderWideBase,
    renderValuation: renderValuation,
    renderReturnDecomp: renderReturnDecomp,
    renderAssetAlloc: renderAssetAlloc,
    renderLossTable: renderLossTable,
    renderTurnover: renderTurnover,
    renderIndustry: renderIndustry,
    renderTrend: renderTrend,
    renderFearGreed: renderFearGreed,
    renderFundIndex: renderFundIndex,
    renderTiming: renderTiming,
    renderInvestor: renderInvestor
  };
})();
