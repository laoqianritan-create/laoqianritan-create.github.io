/**
 * A股看板 · 行业买入体验模拟器 + 长期持有窗口（两个新面板）
 * 数据与「申万一级行业年度涨跌幅 · 长期 CAGR」热力图同源（sw_returns.json，每日 19:00 自动更新）。
 * 入口：window.BS_boot(raw) —— main.js 懒加载到面板时以同一份 heatmap 数据调用；
 *       panel-buy-sim 与 panel-hold-win 共用同一入口（数据同源、面板 2 点击联动面板 1）。
 * 画布：屏幕模式 1280 基准 × dpr；导出 3000px（exportMode，叠标题/来源条）。
 * 口径：与离线研究页「你拿到年化，要先走过这条路」逐格比对一致（31 行业 × 2005—2025 全量 0 差异）。
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  /* ═══════════════ 数据装配（与热力图同源 sw_returns.json） ═══════════════ */
  let YEARS = [], YTD_YEAR = 2026, sectors = [];
  function assemble(raw) {
    YEARS = raw.years || [];
    YTD_YEAR = raw.ytd_year || (YEARS.at(-1) + 1);
    sectors = Object.keys(raw.data || {}).map((name) => {
      const it = raw.data[name];
      return { name, rets: (it.rets || []).map((v) => v / 100), ytd: it['ytd' + YTD_YEAR] != null ? it['ytd' + YTD_YEAR] / 100 : null };
    });
  }

  /* ═══════════════ 口径函数 ═══════════════ */
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.ceil(p)] - s[i]) * (p - i); };
  function pathStats(returns) {
    const nav = [1];
    returns.forEach((r) => nav.push(nav.at(-1) * (1 + r)));
    let peak = 1, mdd = 0, lastHigh = 0, drought = 0, run = 0, maxLossRun = 0;
    nav.slice(1).forEach((v, j) => {
      const t = j + 1;
      if (v >= peak - 1e-12) { peak = v; lastHigh = t; } else drought = Math.max(drought, t - lastHigh);
      mdd = Math.min(mdd, v / peak - 1);
      if (returns[j] < 0) { run++; maxLossRun = Math.max(run, maxLossRun); } else run = 0;
    });
    return { nav, cagr: nav.at(-1) ** (1 / (returns.length || 1)) - 1, mdd, drought, maxLossRun, terminal: nav.at(-1) };
  }
  function windowRows(start, end) {
    return sectors.map((s) => {
      const rs = [], ys = [];
      for (let i = 0; i < YEARS.length; i++) { const y = YEARS[i]; if (y >= start && y <= end) { rs.push(s.rets[i]); ys.push(y); } }
      const hasYtd = end === YTD_YEAR && s.ytd != null && !YEARS.includes(end);
      if (hasYtd) { rs.push(s.ytd); ys.push(YTD_YEAR); }
      return { name: s.name, ...pathStats(rs), years: ys, hasYtd };
    });
  }
  function holdingWindows(h, since, end) {
    const out = [];
    for (let y = since; y <= end - h + 1; y++) windowRows(y, y + h - 1).forEach((s) => out.push({ ...s, start: y, end: y + h - 1 }));
    return out;
  }
  const pct = (v, d = 1, sign = false) => (sign && v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
  const num = (v, d = 1) => v.toFixed(d);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** 画布换行：按字符测量，最多拆 2 行，超长以省略号截断（避免底部文字重叠） */
  function wrapText2(ctx, text, maxW, font) {
    ctx.font = font;
    const lines = [''];
    for (const ch of text) {
      const last = lines[lines.length - 1];
      if (ctx.measureText(last + ch).width > maxW && last) {
        if (lines.length >= 2) { lines[1] = lines[1].slice(0, Math.max(0, lines[1].length - 1)) + '…'; break; }
        lines.push(ch);
      } else lines[lines.length - 1] += ch;
    }
    return lines;
  }

  /* ═══════════════ 面板 1：行业买入体验模拟器 ═══════════════ */
  const stateA = { sector: '食品饮料', start: 2019, end: 2025, omit: false, hover: -1 };
  const A = { ink: '#1A1A1A', red: '#E65A56', green: '#2FBF71', gray: '#777777', light: '#999999', line: '#E5E5E5', axis: '#A6AD9E' };

  function aReturns() {
    const s = sectors.find((x) => x.name === stateA.sector);
    let rs = [], ys = [];
    for (let i = 0; i < YEARS.length; i++) { const y = YEARS[i]; if (y >= stateA.start && y <= stateA.end) { rs.push(s.rets[i]); ys.push(y); } }
    const hasYtd = stateA.end === YTD_YEAR && s.ytd != null && !YEARS.includes(stateA.end);
    if (hasYtd && s.ytd != null) { rs.push(s.ytd); ys.push(YTD_YEAR); }
    return { s, rs, ys, hasYtd };
  }
  function drawA(canvas, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const W = opts.W || 1280, dpr = opts.scale || 1;
    const f = W / 1280;
    const { s, rs, ys, hasYtd } = aReturns();
    const omit = stateA.omit;
    const best = Math.max(...rs), bestIdx = rs.indexOf(best);
    const adj = rs.map((r, i) => (omit && i === bestIdx ? 0 : r));
    const st = pathStats(adj);
    const nav = st.nav, cagr = st.cagr;
    const yearLabels = ys.map((y, i) => (hasYtd && i === ys.length - 1 ? String(y) + '*' : String(y)));

    // ── 布局 ──
    const metricH = Math.round(84 * f);
    const legendH = Math.round(38 * f);
    const chartH = Math.round(330 * f);
    const tilesH = Math.round(32 * f);
    const readH = Math.round(84 * f);
    const H = metricH + legendH + chartH + tilesH + readH + Math.round(22 * f);
    const padL0 = Math.round(64 * f), padR0 = Math.round(30 * f);
    const pw0 = W - padL0 - padR0;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    // ── 指标行（4 卡） ──
    const met = [
      ['复合年化收益', pct(st.cagr), `${stateA.start}—${stateA.end}，${rs.length} 个年度${hasYtd ? '（含 ' + YTD_YEAR + ' YTD）' : ''}`],
      ['年末最大回撤', pct(st.mdd), '只看年末点，年内可能更深'],
      ['最长未创新高期', st.drought + ' 年', '从前一次净值高点计起'],
      ['最长连续亏损', st.maxLossRun + ' 年', '年度收益严格小于 0']
    ];
    const metW = W / 4;
    met.forEach((m, i) => {
      const cx = metW * i, cy = Math.round(12 * f);
      if (i < 3) { ctx.strokeStyle = A.line; ctx.beginPath(); ctx.moveTo(cx + metW, cy + Math.round(6 * f)); ctx.lineTo(cx + metW, cy + metricH - Math.round(6 * f)); ctx.stroke(); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = A.gray; ctx.font = `400 ${Math.round(13 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
      ctx.fillText(m[0], cx + Math.round(18 * f), cy);
      ctx.fillStyle = A.ink; ctx.font = `600 ${Math.round(34 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
      ctx.fillText(m[1], cx + Math.round(18 * f), cy + Math.round(24 * f));
      ctx.fillStyle = A.light; ctx.font = `400 ${Math.round(11 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
      ctx.fillText(m[2], cx + Math.round(18 * f), cy + Math.round(66 * f));
    });

    // ── 图例（整组在绘图区内水平居中，上下留白加大） ──
    const legY = metricH + Math.round(14 * f);
    const legMid = legY + Math.round(legendH / 2) - Math.round(2 * f);
    const legFont = `400 ${Math.round(11 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
    ctx.font = legFont;
    const t1w = ctx.measureText('实际年末路径').width;
    const t2w = ctx.measureText('CAGR 匀速路径（虚线）').width;
    const g1 = Math.round(8 * f), g2 = Math.round(24 * f), ln = Math.round(26 * f);
    const legTotal = ln + g1 + t1w + g2 + ln + g1 + t2w;
    let legX = padL0 + Math.max(0, (pw0 - legTotal) / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = A.ink; ctx.fillRect(legX, legMid, ln, 2);
    ctx.fillStyle = A.gray; ctx.fillText('实际年末路径', legX + ln + g1, legMid);
    const dashX = legX + ln + g1 + t1w + g2;
    ctx.strokeStyle = A.red; ctx.lineWidth = 2; ctx.setLineDash([Math.round(5 * f), Math.round(5 * f)]);
    ctx.beginPath(); ctx.moveTo(dashX, legMid); ctx.lineTo(dashX + ln, legMid); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = A.gray; ctx.fillText('CAGR 匀速路径（虚线）', dashX + ln + g1, legMid);
    if (hasYtd) { ctx.fillStyle = A.red; ctx.font = `400 ${Math.round(10 * f)}px NotoSansSC,"PingFang SC",sans-serif`; ctx.textAlign = 'right'; ctx.fillText(YTD_YEAR + '* = 年初至今 YTD', W - Math.round(30 * f), legMid); }

    // ── 净值图：x 轴共用一条时间栅格（yearStep），折线与下方逐年色块严格对齐 ──
    const chartTop = metricH + legendH;
    const padL = Math.round(64 * f), padR = Math.round(30 * f);
    const pw = W - padL - padR;
    const n = rs.length;
    const yearStep = pw / n;
    const ph = chartH - Math.round(48 * f);
    const smooth = nav.map((_, i) => (1 + cagr) ** i);
    const allV = nav.concat(smooth);
    const maxV = Math.max(...allV) * 1.09, minV = Math.min(...allV) * 0.8;
    const X = (i) => padL + i * yearStep;
    const Y = (v) => chartTop + Math.round(20 * f) + (maxV - v) / (maxV - minV || 1) * ph;
    // 网格
    ctx.strokeStyle = A.line; ctx.lineWidth = 1; ctx.setLineDash([Math.round(3 * f), Math.round(5 * f)]);
    ctx.font = `400 ${Math.round(11 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = minV + (maxV - minV) * i / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = A.gray; ctx.fillText(v.toFixed(v < 10 ? 1 : 0), padL - Math.round(8 * f), y);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = A.light; ctx.textAlign = 'left'; ctx.fillText('净值 / 起点 = 1', padL, chartTop + Math.round(7 * f));
    // x 轴年份标签：对齐折线年末点 X(i)，全部居中均匀；起点年左对齐贴 X0（避免与 Y 轴刻度重叠）
    const xSkip = Math.max(1, Math.ceil(n / (W < 700 ? 6 : 12)));
    const yLab = chartTop + chartH - Math.round(32 * f);
    ctx.textBaseline = 'top';
    const xLabels = [String(stateA.start - 1)].concat(ys.map(String));
    xLabels.forEach((l, i) => {
      if (i % xSkip === 0 || i === xLabels.length - 1) {
        const isLast = hasYtd && i === xLabels.length - 1;
        ctx.fillStyle = isLast ? A.red : A.light;
        ctx.textAlign = (i === 0) ? 'left' : 'center';
        ctx.fillText(l, padL + i * yearStep, yLab);
      }
    });
    // 曲线
    ctx.lineWidth = Math.round(2.5 * f); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = A.red; ctx.setLineDash([Math.round(5 * f), Math.round(5 * f)]);
    ctx.beginPath(); smooth.forEach((v, i) => { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); }); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = A.ink;
    ctx.beginPath(); nav.forEach((v, i) => { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); }); ctx.stroke();
    // 数据点
    nav.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(v), (nav.length > 13 ? 2 : 3.3) * f, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? A.light : A.ink; ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.stroke();
    });
    // hover 竖线（屏幕模式）
    if (!exportMode && stateA.hover >= 0 && stateA.hover < nav.length) {
      window.AK.drawHoverVLine(ctx, X(stateA.hover), chartTop + Math.round(16 * f), chartTop + chartH - Math.round(30 * f), 1);
      ctx.beginPath(); ctx.arc(X(stateA.hover), Y(nav[stateA.hover]), (5.5) * f, 0, Math.PI * 2);
      ctx.fillStyle = A.ink; ctx.fill();
    }

    // ── 逐年色块（与折线共用 yearStep 栅格，中间留 2px 缝隙） ──
    const tileTop = chartTop + chartH;
    const tileGap = Math.max(1, Math.round(2 * f));
    const tileW = yearStep - tileGap, tileH = Math.round(28 * f);
    rs.forEach((r, i) => {
      const tx = padL + i * yearStep + tileGap / 2;
      const isYtd = hasYtd && i === rs.length - 1;
      const up = r >= 0;
      ctx.fillStyle = up ? 'rgba(230,90,86,0.13)' : 'rgba(47,191,113,0.15)';
      ctx.fillRect(tx, tileTop, tileW, tileH);
      ctx.fillStyle = up ? '#C3484C' : '#1E8E52';
      ctx.font = `500 ${Math.round(12 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pct(r, 1, true) + (isYtd ? '*' : ''), tx + tileW / 2, tileTop + Math.round(9 * f));
      ctx.fillStyle = A.light; ctx.font = `400 ${Math.round(10 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
      ctx.fillText(isYtd ? YTD_YEAR + '*' : String(ys[i]), tx + tileW / 2, tileTop + Math.round(21 * f));
      ctx.fillStyle = up ? A.red : A.green;
      ctx.fillRect(tx, tileTop + tileH, tileW, Math.max(1.5, Math.round(3 * f)));
    });

    // ── 读解（最多 3 行：主句可换行，附注固定；上下留白加大） ──
    const rdTop = tileTop + tileH + Math.round(20 * f);
    const rdLineH = Math.round(24 * f);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `400 ${Math.round(13 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
    let line1 = `${s.name}：1 元变成 ${num(st.terminal, 3)} 元。`;
    if (st.mdd < 0) line1 += `经历最深年末回撤后，需要再涨 ${pct(1 / (1 + st.mdd) - 1)} 才能回到前高。`;
    if (st.terminal < Math.max(...nav) - 1e-10) line1 += '期末仍低于本段年末最高净值。';
    if (omit) line1 += `已将 ${ys[bestIdx]} 年的 ${pct(best, 1, true)} 改为 0%。`;
    const line2 = hasYtd
      ? `${YTD_YEAR} 为年初至今（非完整年度），随每日更新自动刷新；年化按整段年数计，未按天数折算。`
      : omit
        ? '事后压力测试：只检查收益有多集中，不代表能预知或避开那一年。'
        : '只连结年末观测点；「年末最大回撤」是实际最大回撤幅度的下界，不能替代日度风控。';
    const maxLineW = W - Math.round(36 * f);
    const l1 = wrapText2(ctx, line1, maxLineW, `400 ${Math.round(13 * f)}px NotoSansSC,"PingFang SC",sans-serif`);
    l1.forEach((t, i) => { ctx.fillStyle = A.ink; ctx.fillText(t, Math.round(18 * f), rdTop + i * rdLineH); });
    ctx.fillStyle = A.gray; ctx.fillText(line2, Math.round(18 * f), rdTop + l1.length * rdLineH);
  }

  /* ═══════════════ 面板 2：长期持有窗口 ═══════════════ */
  const stateB = { since: 2015, h: 5, hover: null };
  function drawB(canvas, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const W = opts.W || 1280, dpr = opts.scale || 1;
    const f = W / 1280;
    const h = stateB.h, since = stateB.since, endY = YTD_YEAR;
    const a = holdingWindows(h, since, endY);
    const loss = a.filter((s) => s.cagr < 0).length;
    const dd = a.filter((s) => s.mdd <= -0.3).length;

    // ── 布局 ──
    const metricH = Math.round(84 * f);
    const bandH = Math.round(50 * f);
    const sumH = Math.round(114 * f);
    const starts = Array.from({ length: endY - h + 1 - since + 1 }, (_, i) => since + i);
    const rowH = Math.round(22 * f);
    const colHdrH = Math.round(36 * f);
    const bandTop = metricH + Math.round(14 * f);
    const sumTop = bandTop + Math.round(58 * f);
    const heatTop = sumTop + sumH + colHdrH;
    const H = heatTop + rowH * sectors.length + Math.round(20 * f);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    // ── 指标行 ──
    const met = [
      ['期末亏损窗口占比', pct(loss / a.length), `${loss} / ${a.length} 个行业窗口`],
      ['窗口年化中位数', pct(quantile(a.map((s) => s.cagr), 0.5)), '不同起点共同构成分布'],
      ['年末回撤 ≥30% 的占比', pct(dd / a.length), `${dd} / ${a.length} 个行业窗口`],
      ['年末最大回撤中位数', pct(quantile(a.map((s) => s.mdd), 0.5)), `完整 ${h} 年持有区间`]
    ];
    const metW = W / 4;
    met.forEach((m, i) => {
      const cx = metW * i, cy = Math.round(12 * f);
      if (i < 3) { ctx.strokeStyle = A.line; ctx.beginPath(); ctx.moveTo(cx + metW, cy + Math.round(6 * f)); ctx.lineTo(cx + metW, cy + metricH - Math.round(6 * f)); ctx.stroke(); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = A.gray; ctx.font = `400 ${Math.round(13 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
      ctx.fillText(m[0], cx + Math.round(18 * f), cy);
      ctx.fillStyle = A.ink; ctx.font = `600 ${Math.round(34 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
      ctx.fillText(m[1], cx + Math.round(18 * f), cy + Math.round(24 * f));
      ctx.fillStyle = A.light; ctx.font = `400 ${Math.round(11 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
      ctx.fillText(m[2], cx + Math.round(18 * f), cy + Math.round(66 * f));
    });

    // ── 亏损 / 不亏 色带 ──
    const bandW = W - Math.round(36 * f), bx = Math.round(18 * f);
    const lossFrac = loss / a.length;
    ctx.fillStyle = A.green; ctx.fillRect(bx, bandTop, bandW * lossFrac, Math.round(22 * f));
    ctx.fillStyle = A.red; ctx.fillRect(bx + bandW * lossFrac, bandTop, bandW * (1 - lossFrac), Math.round(22 * f));
    ctx.fillStyle = '#FFFFFF'; ctx.font = `500 ${Math.round(11 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (lossFrac > 0.12) ctx.fillText('亏损 ' + pct(lossFrac), bx + bandW * lossFrac / 2, bandTop + Math.round(11 * f));
    if (lossFrac < 0.88) ctx.fillText('不亏 ' + pct(1 - lossFrac), bx + bandW * (0.5 + lossFrac / 2), bandTop + Math.round(11 * f));
    ctx.fillStyle = A.gray; ctx.font = `400 ${Math.round(11 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${h} 年窗口：买入年 ${since}—${endY - h + 1}，期末年 ${since + h - 1}—${endY}* · 共 ${starts.length} 个起点 × 31 行业 · 列头上行=买入起点，下行=期末年（* 含 ${YTD_YEAR} YTD）`, bx, bandTop + Math.round(27 * f));

    // ── 汇总表（3 / 5 / 7 年；末列 = 各持有期最新窗口，期末 ytd_year*）──
    // 6 列等宽，左端 x=0、右端 x=W-20（1260），与下方热力图表格两端对齐
    const cols = ['持有期', '亏损窗口占比', '年化中位数', '年化 10%—90% 分位', '年末回撤中位数', `最新窗口年化中位（至 ${YTD_YEAR}*）`];
    const nCols = cols.length, colW2 = (W - Math.round(20 * f)) / nCols;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = A.light; ctx.font = `400 ${Math.round(10 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
    cols.forEach((c, i) => { ctx.fillText(c, colW2 * (i + 0.5), sumTop + Math.round(9 * f)); });
    [3, 5, 7].forEach((n, ri) => {
      const b = holdingWindows(n, since, endY), cs = b.map((x) => x.cagr);
      const latestWin = b.at(-1).start, medLatest = quantile(windowRows(latestWin, endY).map((x) => x.cagr), 0.5);
      const r0 = { loss: b.filter((x) => x.cagr < 0).length / b.length, median: quantile(cs, 0.5), p10: quantile(cs, 0.1), p90: quantile(cs, 0.9), mdd: quantile(b.map((x) => x.mdd), 0.5) };
      const ry = sumTop + Math.round(29 * f) + ri * Math.round(28 * f);
      if (n === h) { ctx.fillStyle = '#F5F6F4'; ctx.fillRect(0, ry - Math.round(13 * f), colW2 * nCols, Math.round(28 * f)); ctx.fillStyle = A.red; ctx.fillRect(0, ry - Math.round(13 * f), Math.max(2, Math.round(3 * f)), Math.round(28 * f)); }
      ctx.font = `500 ${Math.round(12 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
      ctx.fillStyle = n === h ? A.ink : A.gray;
      ctx.textAlign = 'center'; ctx.fillText(n + ' 年', colW2 * 0.5, ry);
      ctx.font = `400 ${Math.round(12 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
      const vals = [pct(r0.loss), pct(r0.median), `${pct(r0.p10)} 至 ${pct(r0.p90)}`, pct(r0.mdd), `${latestWin}—${endY}* · ${pct(medLatest)}`];
      vals.forEach((v, i) => { ctx.textAlign = 'center'; ctx.fillStyle = A.ink; ctx.fillText(v, colW2 * (i + 1.5), ry); });
    });

    // ── 热力图 ──
    const padL = Math.round(120 * f), padR = Math.round(20 * f);
    const hmW = W - padL - padR, colW = hmW / starts.length;
    const hdrY1 = heatTop + Math.round(11 * f), hdrY2 = heatTop + Math.round(25 * f);
    // 「持有期间」文案右对齐在行名栏内，绝不与第一列年份重叠
    ctx.fillStyle = A.gray; ctx.font = `400 ${Math.round(10 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('持有期间 →', padL - Math.round(10 * f), hdrY1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    starts.forEach((y, j) => {
      const endYc = y + h - 1, isYtd = endYc === endY;
      ctx.fillStyle = A.gray; ctx.fillText(String(y), padL + colW * (j + 0.5), heatTop + Math.round(5 * f));
      ctx.fillStyle = isYtd ? A.red : A.light; ctx.fillText(String(endYc) + (isYtd ? '*' : ''), padL + colW * (j + 0.5), heatTop + Math.round(18 * f));
    });
    sectors.forEach((s, i) => {
      const ry = heatTop + Math.round(30 * f) + i * rowH;
      ctx.fillStyle = A.gray; ctx.textAlign = 'right'; ctx.font = `400 ${Math.round(11 * f)}px NotoSansSC,"PingFang SC",sans-serif`;
      ctx.fillText(s.name, padL - Math.round(10 * f), ry + rowH / 2);
      starts.forEach((y, j) => {
        const b = a.find((x) => x.name === s.name && x.start === y);
        if (!b) return;
        const up = b.cagr >= 0;
        const alpha = Math.min(0.72, Math.abs(b.cagr) * 1.8 + 0.06);
        ctx.fillStyle = up ? `rgba(230,90,86,${alpha})` : `rgba(47,191,113,${alpha})`;
        ctx.fillRect(padL + j * colW, ry, colW - Math.max(1, Math.round(1.5 * f)), rowH - Math.max(1, Math.round(1.5 * f)));
        if (stateB.hover && stateB.hover[0] === s.name && stateB.hover[1] === y) {
          ctx.strokeStyle = A.ink; ctx.lineWidth = Math.max(1.5, Math.round(1.5 * f));
          ctx.strokeRect(padL + j * colW + 0.5, ry + 0.5, colW - 1, rowH - 1);
        }
        ctx.fillStyle = '#222222'; ctx.font = `400 ${Math.round(11 * f)}px NotoSansSC,-apple-system,"Helvetica Neue",Arial,sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(pct(b.cagr, 1), padL + colW * (j + 0.5), ry + rowH / 2 + Math.round(0.5 * f));
      });
    });
  }

  /* ═══════════════ 控件（只构建一次） ═══════════════ */
  let controlsBuilt = false;
  function buildControls() {
    if (controlsBuilt) return;
    controlsBuilt = true;

    // ── 面板 1 控件 ──
    const wrapA = $('buy-sim-controls');
    if (wrapA) {
      wrapA.innerHTML =
        '<div class="ctrl-group"><label>行业</label><select id="a-sector"></select></div>' +
        '<div class="ctrl-group"><label>开始年份</label><select id="a-start"></select></div>' +
        '<div class="ctrl-group"><label>结束年份</label><select id="a-end"></select></div>' +
        '<div class="ctrl-group"><label><input type="checkbox" id="a-omit"> 最佳一年改为 0%（压力测试）</label></div>';
      const opt = (sel, arr, selVal) => { sel.innerHTML = arr.map((x) => `<option value="${x.v}" ${String(x.v) === String(selVal) ? 'selected' : ''}>${esc(x.label)}</option>`).join(''); };
      opt($('a-sector'), sectors.map((s) => ({ v: s.name, label: s.name })), stateA.sector);
      const fullYears = YEARS.map((y) => ({ v: y, label: String(y) }));
      opt($('a-start'), fullYears, stateA.start);
      const endYears = [...fullYears, { v: YTD_YEAR, label: YTD_YEAR + '*（YTD）' }];
      opt($('a-end'), endYears, stateA.end);
      const redraw = () => drawA($('buySim'), { scale: window.devicePixelRatio || 1 });
      $('a-sector').addEventListener('change', (e) => { stateA.sector = e.target.value; stateA.hover = -1; redraw(); });
      $('a-start').addEventListener('change', (e) => { stateA.start = +e.target.value; if (stateA.end < stateA.start) { stateA.end = stateA.start; $('a-end').value = stateA.end; } stateA.hover = -1; redraw(); });
      $('a-end').addEventListener('change', (e) => { stateA.end = +e.target.value; if (stateA.start > stateA.end) { stateA.start = stateA.end; $('a-start').value = stateA.start; } stateA.hover = -1; redraw(); });
      $('a-omit').addEventListener('change', (e) => { stateA.omit = e.target.checked; stateA.hover = -1; redraw(); });

      // hover：跟随虚线 + tooltip
      const cv = $('buySim');
      cv.addEventListener('mousemove', (ev) => {
        const r = cv.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width * cv.width;
        const { rs, hasYtd } = aReturns();
        const navN = rs.length + 1;
        const padL = 64, padR = 30, W0 = 1280;
        const pw = W0 - padL - padR;
        const Xi = (i) => (padL + i / (navN - 1 || 1) * pw) * (cv.width / W0);
        let idx = -1, bestD = 1e9;
        for (let i = 0; i < navN; i++) { const d = Math.abs(x - Xi(i)); if (d < bestD) { bestD = d; idx = i; } }
        stateA.hover = idx;
        drawA(cv, { scale: window.devicePixelRatio || 1 });
        if (idx >= 0 && bestD < 40) {
          const b2 = Math.max(...rs), bi = rs.indexOf(b2);
          const st2 = pathStats(rs.map((r, i) => (stateA.omit && i === bi ? 0 : r)));
          const navV = st2.nav[idx];
          const lab = idx === 0 ? String(stateA.start - 1) + '（起点）' : (hasYtd && idx === navN - 1 ? YTD_YEAR + '（YTD）' : String(stateA.start + idx - 1));
          window.AK.tooltip.show(ev, `<b>${esc(stateA.sector)}</b> · ${lab}<br>年末净值：<b>${navV.toFixed(3)}</b>`);
        } else window.AK.tooltip.hide();
      });
      cv.addEventListener('mouseleave', () => { stateA.hover = -1; drawA(cv, { scale: window.devicePixelRatio || 1 }); window.AK.tooltip.hide(); });
    }

    // ── 面板 2 控件 ──
    const wrapB = $('hold-win-controls');
    if (wrapB) {
      wrapB.innerHTML =
        '<div class="ctrl-group"><label>样本起点</label><span class="seg" id="b-since"></span></div>' +
        '<div class="ctrl-group"><label>持有年数</label><span class="seg" id="b-h"></span></div>';
      const sinceSeg = $('b-since');
      [[2015, '2015（近年）'], [2005, '2005（全部）']].forEach(([v, lab]) => {
        const b = document.createElement('button'); b.textContent = lab;
        if (v === stateB.since) b.classList.add('active');
        b.addEventListener('click', () => { stateB.since = v; sinceSeg.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); redrawB(); });
        sinceSeg.appendChild(b);
      });
      const hSeg = $('b-h');
      [3, 5, 7].forEach((v) => {
        const b = document.createElement('button'); b.textContent = v + ' 年';
        if (v === stateB.h) b.classList.add('active');
        b.addEventListener('click', () => { stateB.h = v; hSeg.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); redrawB(); });
        hSeg.appendChild(b);
      });
      const redrawB = () => drawB($('holdWin'), { scale: window.devicePixelRatio || 1 });

      // hover + 点击穿透到面板 1
      const cv = $('holdWin');
      const geo = () => {
        const h = stateB.h, since = stateB.since, endY = YTD_YEAR;
        const starts = Array.from({ length: endY - h + 1 - since + 1 }, (_, i) => since + i);
        const k = cv.width / 1280;
        return { starts, k, padL: 120 * k, colW: (1280 - 140) / starts.length * k, heatTop: (84 + 14 + 58 + 114 + 36) * k, rowH: 22 * k, rowTop: 30 * k };
      };
      cv.addEventListener('mousemove', (ev) => {
        const s = window.AK.canvasXY(cv, ev), g = geo();
        const ri = Math.floor((s.y - g.heatTop - g.rowTop) / g.rowH);
        const cj = Math.floor((s.x - g.padL) / g.colW);
        if (ri < 0 || ri >= sectors.length || cj < 0 || cj >= g.starts.length) { stateB.hover = null; redrawB(); window.AK.tooltip.hide(); return; }
        const sec = sectors[ri], y = g.starts[cj];
        stateB.hover = [sec.name, y];
        redrawB();
        const b = holdingWindows(stateB.h, stateB.since, YTD_YEAR).find((x) => x.name === sec.name && x.start === y);
        const wEnd = y + stateB.h - 1, wLab = wEnd === YTD_YEAR ? `${y}—${wEnd}*（含 YTD）` : `${y}—${wEnd}`;
        if (b) window.AK.tooltip.show(ev, `<b>${esc(sec.name)}</b> ${wLab}<br>年化 <b>${pct(b.cagr)}</b> · 年末最大回撤 <b>${pct(b.mdd)}</b>`);
        else window.AK.tooltip.hide();
      });
      cv.addEventListener('mouseleave', () => { stateB.hover = null; redrawB(); window.AK.tooltip.hide(); });
      cv.addEventListener('click', (ev) => {
        const s = window.AK.canvasXY(cv, ev), g = geo();
        const ri = Math.floor((s.y - g.heatTop - g.rowTop) / g.rowH);
        const cj = Math.floor((s.x - g.padL) / g.colW);
        if (ri < 0 || ri >= sectors.length || cj < 0 || cj >= g.starts.length) return;
        stateA.sector = sectors[ri].name; stateA.start = g.starts[cj]; stateA.end = g.starts[cj] + stateB.h - 1; stateA.omit = false;
        const sa = $('a-sector'); if (sa) sa.value = stateA.sector;
        const stEl = $('a-start'); if (stEl) stEl.value = stateA.start;
        const enEl = $('a-end'); if (enEl) enEl.value = stateA.end;
        const omEl = $('a-omit'); if (omEl) omEl.checked = false;
        drawA($('buySim'), { scale: window.devicePixelRatio || 1 });
        const pa = $('panel-buy-sim');
        if (pa && pa.scrollIntoView) pa.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  /* ═══════════════ 入口（main.js 以 heatmap 数据调用；两个面板共用） ═══════════════ */
  let booted = false;
  function boot(raw) {
    if (!raw || !raw.data) return;
    assemble(raw);
    if (!booted) {
      booted = true;
      buildControls();
      window.AK.bindExportButtons({
        buySim: (off) => drawA(off, { exportMode: true, scale: 1, W: 3000 }),
        holdWin: (off) => drawB(off, { exportMode: true, scale: 1, W: 3000 })
      });
      let timer;
      window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if ($('buySim')) drawA($('buySim'), { scale: window.devicePixelRatio || 1 }); if ($('holdWin')) drawB($('holdWin'), { scale: window.devicePixelRatio || 1 }); }, 180); });
    }
    if ($('buySim')) drawA($('buySim'), { scale: window.devicePixelRatio || 1 });
    if ($('holdWin')) drawB($('holdWin'), { scale: window.devicePixelRatio || 1 });
  }
  window.BS_boot = boot;
  window.HW_boot = boot;
})();
