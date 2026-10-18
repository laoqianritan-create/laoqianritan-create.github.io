/**
 * 数据加载器
 * 输入：data/sw_returns.json（顶层 years + data + updated）
 * 输出：window.SW_DATA = { years: [...22 列...], rows: [{name, rets:[...]}], updated }
 *
 * 行排序：按 2025 年涨跌幅升序（最差在顶，最好在底），与 PNG 一致
 */
(function () {
  'use strict';

  // PNG 里的行顺序（2025 列升序），保持视觉一致
  const ROW_ORDER = [
    '食品饮料', '煤炭', '美容护理', '公用事业', '交通运输',
    '房地产', '建筑装饰', '银行', '商贸零售', '家用电器',
    '社会服务', '非银金融', '石油石化', '医药生物', '纺织服饰',
    '环保', '农林牧渔', '计算机', '轻工制造', '建筑材料',
    '汽车', '钢铁', '传媒', '基础化工', '国防军工',
    '机械设备', '电力设备', '综合', '电子', '通信',
    '有色金属'
  ];

  // 暴露给 main.js（热力图行排序保持一致）
  window.SW_ROW_ORDER = ROW_ORDER;

  window.SW_loadData = async function () {
    const buster = `?v=${Date.now()}`;
    const url = `data/sw_returns.json${buster}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`数据加载失败 HTTP ${resp.status}`);
    const raw = await resp.json();

    // years: 2005..2025 (21 列)，再追加 2026* (1 列) = 22 列
    const yearsBase = raw.years.map(String);
    const years = [...yearsBase, '2026*'];

    // metrics_meta: CAGR 列定义(后端写入)
    const metricsMeta = raw.metrics_meta && raw.metrics_meta.columns
      ? raw.metrics_meta.columns
      : [];

    // rows: 按 ROW_ORDER 取出 + 拼接 CAGR
    const rows = ROW_ORDER.map((name) => {
      const item = raw.data[name];
      if (!item) throw new Error(`数据缺少行业: ${name}`);
      const rets = [...item.rets];
      // 追加 2026 YTD 作为最后一列
      rets.push(item.ytd2026 !== undefined && item.ytd2026 !== null ? item.ytd2026 : null);
      // 4 列 CAGR (按 metricsMeta 顺序取值)
      const metrics = metricsMeta.map(col =>
        item.metrics && item.metrics[col.key] !== undefined ? item.metrics[col.key] : null
      );
      return { name, rets, metrics };
    });

    return {
      years,
      rows,
      metricsMeta,
      updated: raw.updated || null,
      ytdAsOf: raw.ytd_as_of || null
    };
  };
})();
/**
 * A股看板 · 公共工具
 *   AK_fetchJSON   : 加载 site/data 下的 JSON
 *   AK_exportPNG   : 把 canvas 导出为 3000px 高清 PNG
 *   AK_renderFreshness : 顶部数据新鲜度徽章
 *   AK.registerPanel : 面板注册表（main.js 统一调度）
 */
(function () {
  'use strict';

  const AK = window.AK = {};

  /** 加载 JSON（带缓存破坏参数） */
  AK.fetchJSON = async function (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`加载失败 ${res.status}: ${url}`);
    return res.json();
  };

  /**
   * 把 canvas 内容导出为高清 PNG。
   * 统一叠加：面板主标题 + 副标题（顶部）、来源（右下角）。
   * @param {HTMLCanvasElement} srcCanvas 屏幕上的 canvas
   * @param {number} targetPx 导出长边像素（默认 3000）
   * @param {string} filename 下载文件名
   * @param {Function} drawExport (canvas, scale) => void  离屏重绘函数（可选，不传则直接放大截屏）
   * @param {object} meta { title, desc, source, noHeader }
   *   noHeader=true 表示面板导出版已自带标题（热力图/抄底数学题），不再叠加标题条
   */
  AK.exportPNG = async function (srcCanvas, targetPx, filename, drawExport, meta) {
    await AK.fontsReady(); // 确保中文字体就绪，导出不出现系统字体回退
    const w = srcCanvas.width, h = srcCanvas.height;
    const scale = targetPx / Math.max(w, h);
    const off = document.createElement('canvas');
    off.width = Math.round(w * scale);
    off.height = Math.round(h * scale);

    if (typeof drawExport === 'function') {
      drawExport(off, scale);
    } else {
      const ctx = off.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(srcCanvas, 0, 0);
    }

    const m = meta || {};
    const title = m.title || '';
    const desc = m.desc || '';
    const source = m.source || '数据来源：A股看板 · ashare.laoqianriritan.com';
    // 导出日期（导出于 YYYY-MM-DD · 来源）
    const _now = new Date();
    const _dstr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
    const footerText = `导出于 ${_dstr} · ${source}`;
    const needHeader = !m.noHeader && (title || desc);
    const W = off.width;
    const padX = Math.round(W * 0.022);
    const headerH = needHeader ? Math.round(W * 0.078) : 0;
    // 来源独立条：图表下方追加空白条，来源画在条内 → 永不与图表下沿重叠（高度可自由调整）
    const footerH = Math.round(W * 0.048);

    const final = document.createElement('canvas');
    final.width = W;
    final.height = off.height + headerH + footerH;
    const fctx = final.getContext('2d');
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, final.width, final.height);
    fctx.drawImage(off, 0, headerH);

    if (needHeader) {
      fctx.textBaseline = 'top';
      if (title) {
        fctx.fillStyle = '#1a1a1a';
        fctx.font = `700 ${Math.round(W * 0.020)}px "NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif`;
        fctx.fillText(title, padX, headerH * 0.14);
      }
      if (desc) {
        fctx.fillStyle = '#8a8a8a';
        fctx.font = `${Math.round(W * 0.011)}px "NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif`;
        fctx.fillText(desc, padX, headerH * 0.14 + (title ? Math.round(W * 0.030) : 0));
      }
    }

    // 来源（独立 footer 条右下角，与图表下沿有固定留白；含导出日期）
    fctx.textBaseline = 'bottom';
    fctx.textAlign = 'right';
    fctx.fillStyle = '#9a9a9a';
    fctx.font = `${Math.round(W * 0.0095)}px "NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif`;
    fctx.fillText(footerText, final.width - padX, final.height - Math.round(W * 0.014));
    fctx.textAlign = 'left';

    return new Promise((resolve, reject) => {
      final.toBlob((blob) => {
        if (!blob) { reject(new Error('toBlob 失败')); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1200);
        resolve();
      }, 'image/png');
    });
  };

  /** 绑定面板导出按钮：全局 drawMap 合并 + 每个按钮仅绑定一次
   *  （修复：各面板 JS 均调用本函数遍历绑定所有按钮 → 14 个面板 = 每个按钮 14 个监听 → 点击一次下载多次） */
  AK.bindExportButtons = function (drawMap) {
    const g = (AK._exportMap = AK._exportMap || {});
    Object.assign(g, drawMap || {});
    document.querySelectorAll('.js-export').forEach((btn) => {
      if (btn.__exportBound) return;
      btn.__exportBound = true;
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-canvas');
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const orig = btn.innerHTML;
        btn.disabled = true; btn.textContent = '…';
        try {
          const fn = g[id];
          const panel = btn.closest('.panel') || btn.closest('section');
          const tEl = panel && panel.querySelector('.panel-title');
          const dEl = panel && panel.querySelector('.panel-desc');
          const meta = {
            title: tEl ? tEl.textContent.trim() : '',
            desc: dEl ? dEl.textContent.trim() : '',
            source: '数据来源：A股看板 · ashare.laoqianriritan.com'
          };
          await AK.exportPNG(canvas, 3000, btn.getAttribute('data-name') || (id + '.png'), fn, meta);
          btn.textContent = '✓';
        } catch (e) {
          console.error(e);
          btn.textContent = '!';
        }
        setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 1200);
      });
    });
  };

  /** 数据新鲜度徽章：给出一组 asOf 日期，取最新一个 */
  AK.renderFreshness = function (asOfList) {
    const strip = document.getElementById('freshnessStrip');
    if (!strip) return;
    const dates = (asOfList || []).filter(Boolean).map((s) => new Date(s + 'T00:00:00'));
    if (!dates.length) {
      strip.querySelector('.freshness-text').textContent = '数据日期未知';
      strip.classList.add('is-old');
      return;
    }
    const asOfDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - asOfDate) / 86400000);
    let tdDiff = 0;
    const cur = new Date(asOfDate);
    while (cur < today) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() !== 0 && cur.getDay() !== 6) tdDiff++;
    }
    let cls = '', status = '';
    if (tdDiff === 0) status = '最新';
    else if (tdDiff <= 2) status = `${tdDiff} 个交易日前`;
    else if (tdDiff <= 5) { cls = 'is-stale'; status = `${tdDiff} 个交易日前`; }
    else { cls = 'is-old'; status = `${tdDiff} 个交易日前 · 可能延迟`; }
    if (cls) strip.classList.add(cls);
    const fmt = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')}`;
    strip.querySelector('.freshness-text').innerHTML =
      `数据更新至 <b>${fmt}</b><span class="freshness-hint">· ${status} · 每交易日 19:00 自动刷新</span>`;
  };

  /** 面板注册表：{ panelId: async (container) => {...} } */
  const _panels = {};
  AK.registerPanel = function (panelId, fn) { _panels[panelId] = fn; };
  AK.getPanel = function (panelId) { return _panels[panelId]; };

  /** 数值格式化 */
  AK.fmtPct = function (v, digits = 1) { return (v === null || v === undefined || Number.isNaN(v)) ? '—' : `${Number(v).toFixed(digits)}%`; };
  AK.fmtNum = function (v, digits = 0) { return (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: digits }); };

  /** 颜色工具：红涨绿跌 */
  AK.colors = {
    red: '#E65A56', green: '#2FBF71', blue: '#5AAEF3', purple: '#6D61E4',
    ink: '#1A1A1A', gray: '#777777', light: '#BBBBBB', line: '#E8E8E8',
    // 数值 → 涨跌色（v 为涨跌幅/百分数，对称轴 0）
    gainLoss(v) {
      if (v > 0.001) return this.red;
      if (v < -0.001) return this.green;
      return this.gray;
    },
    // 热力图插值：-1 ~ 1 → 绿 → 白 → 红
    heat(t) {
      const x = Math.max(-1, Math.min(1, t));
      if (x < 0) { // 绿 → 白
        const k = x + 1; // 0..1
        return `rgb(${Math.round(47 + (255 - 47) * k)}, ${Math.round(191 + (255 - 191) * k)}, ${Math.round(113 + (255 - 113) * k)})`;
      }
      const k = 1 - x; // 1..0（白 → 红）
      return `rgb(${Math.round(255 - (255 - 230) * k)}, ${Math.round(255 - (255 - 90) * k)}, ${Math.round(255 - (255 - 86) * k)})`;
    }
  };

  /** 等待字体就绪 */
  AK.fontsReady = function () {
    if (document.fonts && document.fonts.ready) {
      return Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    }
    return Promise.resolve();
  };

  /** 悬浮数值提示（所有 canvas 面板共用） */
  const tipEl = null;
  AK.tooltip = {
    el: null,
    _ensure() {
      if (this.el) return;
      this.el = document.createElement('div');
      this.el.className = 'canvas-tooltip';
      document.body.appendChild(this.el);
    },
    show(ev, html) {
      this._ensure();
      this.el.innerHTML = html;
      this.el.style.display = 'block';
      const r = this.el.getBoundingClientRect();
      let px = ev.clientX + 14, py = ev.clientY + 14;
      if (px + r.width > window.innerWidth - 8) px = ev.clientX - r.width - 14;
      if (py + r.height > window.innerHeight - 8) py = ev.clientY - r.height - 14;
      this.el.style.left = px + 'px';
      this.el.style.top = py + 'px';
    },
    hide() { if (this.el) this.el.style.display = 'none'; }
  };

  /** canvas 鼠标坐标 → 绘制坐标系（CSS 像素 → 画布逻辑像素） */
  AK.canvasXY = function (canvas, ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width * canvas.width,
      y: (ev.clientY - rect.top) / rect.height * canvas.height
    };
  };

  /**
   * 画纵向跟随虚线（hover 辅助线）
   * 所有看板统一使用：浅灰色、虚线、贯穿整个绘图区
   */
  AK.drawHoverVLine = function (ctx, x, yTop, yBottom, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([4 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBottom);
    ctx.stroke();
    ctx.restore();
  };
})();
/**
 * 顶部 Banner（第六轮重构）：深酒红渐变 + 价格坐标双线灌满画布
 * 数据：banner.json { dates[], redLow[], csiAll[] }（2006-01 起）
 * 文案：「追寻适应与夏普之路」（Xiaomaoxihuanfeng-Light-2.ttf，左上）
 * 设计参考：《追寻价值之路》（燕翔）封面——暖色底、大字标题、克制装饰。
 * 已删：圆 icon / 「A股看板」标题 / 副题 / 右侧竖排刻度 / ticker 条。
 */
(function () {
  'use strict';

  const C_BG_1 = '#990C2E';   // 深酒红
  const C_BG_2 = '#6E0620';
  const C_GOLD = '#ECD7A0';   // 金黄（红利低波 + 标题）
  const C_WHITE = '#FFFFFF';  // 白（中证全指）
  const FONT_TITLE = 'Xiaomaoxihuanfeng, "Noto Sans SC", sans-serif';
  const FONT_BODY = 'NotoSansSC, "Microsoft YaHei", sans-serif';

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    // 移动端（<768px）：竖屏专用画布 780×460（≈1.7:1），内容元素等比缩小，避免 1480×470 被压成 ~120px 高导致显示不全
    const isMobile = !exportMode && (window.innerWidth < 768);
    const W = exportMode ? 2400 : (isMobile ? 780 : 1480);
    const H = exportMode ? 600 : (isMobile ? 460 : 470);   // 屏幕版加高：容纳左侧标题 + 下方三导航按钮
    const S = isMobile ? W / 1480 : 1;                     // 移动缩放系数（≈0.527）
    const padLInput = opts.padL;        // 屏幕版动态传入（按钮区宽度，随视口自适应）

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

    // 背景：深酒红渐变（右上微亮 → 左下深）
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, C_BG_1);
    bg.addColorStop(1, C_BG_2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 微弱径向高光（顶部）
    const gl = ctx.createRadialGradient(W * 0.5, -H * 0.35, 10, W * 0.5, -H * 0.35, W * 0.95);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    const dates = data.dates || [];
    const red = data.redLow || [];
    const csi = data.csiAll || [];
    const n = Math.min(dates.length, red.length, csi.length);
    if (n < 2) return;

    // 数据截至（右上角：banner 数据每交易日由 build_site_data.py 更新，直观可见）
    const asof = data.generated || data.asOf || data.updated || '';
    if (asof) {
      ctx.font = (exportMode ? 20 : 12 * S) + 'px ' + FONT_BODY;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('截至 ' + String(asof).slice(0, 10), W - (exportMode ? 210 : (isMobile ? 60 : 130)), exportMode ? 14 : 10);
      ctx.textAlign = 'left';
    }

    // ── 图表纵向灌满画布：左右留白对称、上下留白一致，文案叠在图表内部左上 ──
    const padL = exportMode ? 260 : (isMobile ? 50 : (padLInput || 150));  // 左：移动端按钮在下方，仅留小边距；桌面按按钮实际宽度
    const padR = exportMode ? 210 : (isMobile ? 60 : 130);   // 右：末端标签区
    const padT = exportMode ? 40 : (isMobile ? 32 : 40);     // 顶部：与底部一致，纵向灌满
    const padB = exportMode ? 40 : (isMobile ? 32 : 40);
    const plotL = padL, plotR = W - padR;
    const plotT = padT, plotB = H - padB;
    const plotW = plotR - plotL;

    // y 范围：0 ~ 红利低波最大值（价格坐标，0 起，线性）
    let maxV = 0;
    for (let i = 0; i < n; i++) { if (red[i] > maxV) maxV = red[i]; }
    maxV *= 1.06;
    const xs = (i) => plotL + (i / (n - 1)) * plotW;
    const ys = (v) => plotB - (v / maxV) * (plotB - plotT);

    // ── 文案：追寻适应与夏普之路（叠在图表内部左上角，与曲线重叠）──
    const tx = exportMode ? 272 : plotL + (isMobile ? 6 : 10);  // 图表内部（> plotL）
    const ty = exportMode ? 52 : plotT + (isMobile ? 5 : 8);    // 绘图区内顶部，叠在曲线上
    const cnText = '追寻适应与夏普之路';
    const enText = 'ADAPTIVE ALLOCATION & SHARPE · 2006—2026';
    ctx.fillStyle = C_GOLD;
    ctx.font = (exportMode ? 64 : 40 * S) + 'px ' + FONT_TITLE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cnText, tx, ty);
    const cnW = ctx.measureText(cnText).width;

    // 英文小字点缀：右端对齐中文右端（两端对齐），字号自适应 ≤ 中文宽度
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    let enFs = exportMode ? 30 : 18 * S;
    ctx.font = enFs + 'px ' + FONT_BODY;
    while (ctx.measureText(enText).width > cnW && enFs > 10) {
      enFs -= 0.5;
      ctx.font = enFs + 'px ' + FONT_BODY;
    }
    ctx.textAlign = 'right';
    ctx.fillText(enText, tx + cnW, ty + (exportMode ? 112 : 68 * S));
    ctx.textAlign = 'left';

    // 浅色水平网格 + 左侧价格刻度标签（y 轴）
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.font = (exportMode ? 22 : 11.5 * S) + 'px ' + FONT_BODY;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let g = 0; g <= 4; g++) {
      const y = plotB - (g / 4) * (plotB - plotT);
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();
      const val = (maxV * g) / 4;
      const label = val >= 1000 ? (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k' : String(Math.round(val));
      ctx.fillText(label, plotL - 12, y);
    }

    // 年份刻度（稀疏打点）
    ctx.font = (exportMode ? 24 : 13 * S) + 'px ' + FONT_BODY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const years = [];
    for (let i = 0; i < n; i++) {
      const y = dates[i].slice(0, 4);
      if (i === 0 || y !== dates[i - 1].slice(0, 4)) {
        if (+y % 4 === 0 || +y === 2006 || +y === 2026) years.push([y, i]);
      }
    }
    years.forEach(([y, i]) => ctx.fillText(y, xs(i), plotB + 8));

    // 曲线（价格坐标，线性）
    const drawLine = (vals, color, lw) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawLine(red, C_GOLD, exportMode ? 5 : (isMobile ? 1.8 : 2.4));
    drawLine(csi, C_WHITE, exportMode ? 5 : (isMobile ? 1.8 : 2.4));

    // 曲线下轻微面积填充（增加质感）
    const fillArea = (vals, color) => {
      const g2 = ctx.createLinearGradient(0, plotT, 0, plotB);
      g2.addColorStop(0, color.replace(')', ',0.16)').replace('rgb', 'rgba'));
      g2.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(plotL, plotB);
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.lineTo(plotR, plotB);
      ctx.closePath();
      ctx.fill();
    };
    fillArea(csi, 'rgb(255,255,255)');
    fillArea(red, 'rgb(236,215,160)');

    // 末端标签（数值 + 名称，右对齐，错开防重叠）
    const lastRed = red[n - 1], lastCsi = csi[n - 1];
    const lx = plotR + (exportMode ? 36 : (isMobile ? 10 : 18));
    const lyr = ys(lastRed), lyc = ys(lastCsi);
    // 末端圆点
    [[plotR, lyr, C_GOLD], [plotR, lyc, C_WHITE]].forEach(([x, y, c]) => {
      ctx.beginPath();
      ctx.arc(x, y, exportMode ? 9 : (isMobile ? 4 : 5), 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = '#7A0A24';
      ctx.lineWidth = exportMode ? 3 : (isMobile ? 1.5 : 2);
      ctx.stroke();
    });
    const gapY = exportMode ? 46 : (isMobile ? 20 : 24);
    const items = [
      { y: lyr, c: C_GOLD, name: '红利低波', v: lastRed },
      { y: lyc, c: C_WHITE, name: '中证全指', v: lastCsi },
    ];
    if (Math.abs(lyr - lyc) < gapY * 1.4) {
      items[0].y = Math.min(lyr, lyc) - gapY * 0.7;
      items[1].y = Math.max(lyr, lyc) + gapY * 0.7;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.font = (exportMode ? 46 : (isMobile ? 21 : 26)) + 'px ' + FONT_BODY;
      ctx.fillText(it.v.toLocaleString('zh-CN', { maximumFractionDigits: 0 }), lx, it.y);
      ctx.font = (exportMode ? 24 : (isMobile ? 12 : 14)) + 'px ' + FONT_BODY;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(it.name, lx, it.y + (exportMode ? 34 : (isMobile ? 16 : 19)));
    });
  }

  // 字体注册（Xiaomaoxihuanfeng）后渲染：等 fonts.ready + 显式 load，避免竞态回退到 Noto
  const ready = new Promise((resolve) => {
    try {
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.ready,
          document.fonts.load('44px Xiaomaoxihuanfeng'),
          document.fonts.load('15px Xiaomaoxihuanfeng')
        ]).then(() => resolve(true)).catch(() => resolve(true));
      } else resolve(true);
    } catch (e) { resolve(true); }
  });

  window.BN_render = function (data) {
    const wrap = document.getElementById('heroBanner');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'heroBannerCanvas';
    canvas.style.cursor = 'crosshair';   // 「可交互看板」信号，非静态图
    wrap.appendChild(canvas);
    // 屏幕版：按按钮实际宽度 + 固定留白反推图表左边距（canvas 逻辑 px），随视口自适应
    const calcPadL = () => {
      try {
        const nav = document.querySelector('.banner-nav');
        const cssW = wrap.getBoundingClientRect().width;
        if (!nav || !cssW) return 150;
        const navRight = nav.getBoundingClientRect().right - wrap.getBoundingClientRect().left;
        return Math.ceil((navRight + 52) / (cssW / 1480)); // +52px 视口留白（右移图表，杜绝与按钮重叠）
      } catch (e) { return 150; }
    };
    const doDraw = () => {
      draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1, padL: calcPadL() });
      refreshGeo();   // 重绘后同步交互几何
    };

    // ── 交互层：hover/touch → 十字线 + 数值 tooltip（banner 即看板）──
    let overlay = null;
    function buildOverlay() {
      overlay = document.createElement('canvas');
      overlay.id = 'heroBannerOverlay';
      overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;';
      wrap.appendChild(overlay);
    }
    let geo = null;
    function refreshGeo() {
      const scale = window.devicePixelRatio || 1;
      const W = canvas.width / scale, H = canvas.height / scale;
      const n = Math.min(data.dates.length, data.redLow.length, data.csiAll.length);
      if (n < 2) { geo = null; return; }
      const isMobile = window.innerWidth < 768;
      const padL = isMobile ? 50 : (calcPadL() || 150);
      const padR = isMobile ? 60 : 130;
      const padT = isMobile ? 32 : 40;
      const padB = isMobile ? 32 : 40;
      const plotL = padL, plotR = W - padR, plotT = padT, plotB = H - padB;
      let maxV = 0;
      for (let i = 0; i < n; i++) { if (data.redLow[i] > maxV) maxV = data.redLow[i]; }
      maxV *= 1.06;
      geo = { W, H, plotL, plotR, plotT, plotB, n, dates: data.dates, red: data.redLow, csi: data.csiAll, maxV,
              xs: (i) => plotL + (i / (n - 1)) * (plotR - plotL), ys: (v) => plotB - (v / maxV) * (plotB - plotT) };
    }
    function drawOverlay(clientX, clientY) {
      if (!overlay || !geo) return;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      overlay.width = Math.round(r.width * dpr);
      overlay.height = Math.round(r.height * dpr);
      const octx = overlay.getContext('2d');
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.scale(dpr, dpr);
      octx.clearRect(0, 0, r.width, r.height);
      // CSS 坐标 → 逻辑坐标
      const lx = (clientX - r.left) / r.width * geo.W;
      const ly = (clientY - r.top) / r.height * geo.H;
      if (lx < geo.plotL || lx > geo.plotR || ly < geo.plotT || ly > geo.plotB) return;
      let i = Math.round((lx - geo.plotL) / (geo.plotR - geo.plotL) * (geo.n - 1));
      i = Math.max(0, Math.min(geo.n - 1, i));
      const k = r.width / geo.W;   // 逻辑 → CSS
      const cx = geo.xs(i) * k;
      const cyR = geo.ys(geo.red[i]) * k;
      const cyC = geo.ys(geo.csi[i]) * k;
      // 十字线
      octx.strokeStyle = 'rgba(255,255,255,0.65)';
      octx.setLineDash([5, 4]);
      octx.lineWidth = 1;
      octx.beginPath(); octx.moveTo(cx, 0); octx.lineTo(cx, r.height); octx.stroke();
      octx.setLineDash([]);
      // 数据点圆点
      [[cx, cyR, '#ECD7A0'], [cx, cyC, '#FFFFFF']].forEach(([x, y, c]) => {
        octx.beginPath(); octx.arc(x, y, 4, 0, Math.PI * 2);
        octx.fillStyle = c; octx.fill();
        octx.strokeStyle = '#7A0A24'; octx.lineWidth = 1.5; octx.stroke();
      });
      // tooltip：日期 + 两指数点位
      const dateStr = String(geo.dates[i]).slice(0, 10);
      const lines = [
        [dateStr, 'rgba(255,255,255,0.95)', 12.5, true],
        ['中证全指 ' + geo.csi[i].toLocaleString('zh-CN', { maximumFractionDigits: 0 }), '#FFFFFF', 13, false],
        ['红利低波 ' + geo.red[i].toLocaleString('zh-CN', { maximumFractionDigits: 0 }), '#ECD7A0', 13, false]
      ];
      octx.font = '12.5px NotoSansSC, "Microsoft YaHei", sans-serif';
      const w = Math.max(...lines.map((l) => octx.measureText(l[0]).width));
      const tw = w + 22, th = 16 + 20 * 2 + 8;
      let tx = cx + 14, ty = cyC - 8;
      if (tx + tw > r.width - 6) tx = cx - tw - 14;
      if (ty < 6) ty = 6;
      if (ty + th > r.height - 6) ty = r.height - th - 6;
      octx.fillStyle = 'rgba(20,5,12,0.82)';
      octx.strokeStyle = 'rgba(255,255,255,0.35)';
      octx.lineWidth = 1;
      const rr = 8;
      octx.beginPath();
      octx.moveTo(tx + rr, ty); octx.arcTo(tx + tw, ty, tx + tw, ty + th, rr);
      octx.arcTo(tx + tw, ty + th, tx, ty + th, rr); octx.arcTo(tx, ty + th, tx, ty, rr);
      octx.arcTo(tx, ty, tx + tw, ty, rr); octx.closePath();
      octx.fill(); octx.stroke();
      let yy = ty + 14;
      lines.forEach(([txt, color, fs, bold]) => {
        octx.font = (bold ? '700 ' : '400 ') + fs + 'px NotoSansSC, "Microsoft YaHei", sans-serif';
        octx.fillStyle = color;
        octx.textAlign = 'left'; octx.textBaseline = 'top';
        octx.fillText(txt, tx + 11, yy);
        yy += 20;
      });
    }
    function clearOverlay() {
      if (!overlay) return;
      const octx = overlay.getContext('2d');
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
    }
    buildOverlay();
    refreshGeo();
    canvas.addEventListener('mousemove', (e) => drawOverlay(e.clientX, e.clientY));
    canvas.addEventListener('mouseleave', clearOverlay);
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) drawOverlay(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchend', clearOverlay);

    // 立即绘制：不等字体（fallback 字体先出图，避免移动端/慢网字体加载挂起导致空白）
    try { doDraw(); } catch (e) { console.error('[banner] 首绘失败', e); }
    // 字体就绪后重绘一次（确保使用 Xiaomaoxihuanfeng）
    ready.then(doDraw).catch(() => {});
    // 兜底：若字体仍未就绪，稍后重绘一次确保使用 Xiaomaoxihuanfeng
    try {
      if (document.fonts && document.fonts.check && !document.fonts.check('44px Xiaomaoxihuanfeng')) {
        setTimeout(() => {
          try {
            if (document.fonts.check('44px Xiaomaoxihuanfeng')) {
              doDraw();
            }
          } catch (e) { /* 忽略 */ }
        }, 800);
      }
    } catch (e) { /* 忽略 */ }

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(doDraw);
    });
  };
})();
/**
 * 热力图渲染器（canvas）
 * 绿(#2FBF71) → 浅绿 → 白 → 浅红 → 红(#E65A56)，TwoSlopeNorm 以 0 为对称轴。
 * 年度涨跌幅区: VMIN=-50, VMAX=105 (大波动)
 * CAGR 区:     VMIN_M=-12, VMAX_M=18  (年化复合,数值小)
 * 单元格内数值 1 位小数；亮度 > 0.55 用深字，否则白字。
 *
 * 入口：SW_drawHeatmap(canvas, { years, rows, metricsMeta }, opts?)
 *   opts.scale       — 像素倍数（屏幕 dpr，导图 1）
 *   opts.exportMode  — true=导出版(顶部加标题+色条+底部页脚)；false=屏幕版
 */
(function () {
  'use strict';

  // 年度涨跌幅配色
  const VMIN = -50;
  const VMAX = 105;
  // CAGR 配色(更紧的范围，让数值差异看得见)
  const VMIN_M = -12;
  const VMAX_M = 18;

  // 红涨绿跌，0 对称：绿 → 浅绿 → 白 → 浅红 → 红
  const STOPS = [
    [0.00, [47, 191, 113]],
    [0.40, [201, 240, 218]],
    [0.50, [255, 255, 255]],
    [0.60, [247, 205, 203]],
    [1.00, [230, 90, 86]]
  ];

  function normVal(val, vmin, vmax) {
    if (val >= 0) return 0.5 + (val / vmax) * 0.5;
    return 0.5 + (val / Math.abs(vmin)) * 0.5;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function mapColor(val, vmin, vmax) {
    if (val === null || val === undefined || Number.isNaN(val)) {
      return { rgb: [240, 240, 240], lum: 0.94 };
    }
    const t = clamp(normVal(val, vmin, vmax), 0, 1);
    let i = 0;
    while (i < STOPS.length - 1 && STOPS[i + 1][0] < t) i++;
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[Math.min(i + 1, STOPS.length - 1)];
    const span = t1 - t0 || 1;
    const k = (t - t0) / span;
    const rgb = [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k));
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return { rgb, lum };
  }
  function rgbStr([r, g, b]) { return `rgb(${r},${g},${b})`; }

  /** 计算布局 */
  function layout(years, rows, metricsMeta, exportMode) {
    const n_year = years.length;            // 22
    const n_metric = metricsMeta.length;    // 4
    const n_rows = rows.length;             // 31

    if (exportMode) {
      const W = 3000;
      const padL = 320, padR = 80;
      // 年度列 + CAGR 列 + 分隔 gap
      const gapW = 30;                      // 年度区与 CAGR 区之间的视觉分隔
      const usable = W - padL - padR - gapW;
      // CAGR 单格稍宽,以便容纳两位小数 + %
      const yearCellW = usable / (n_year + n_metric * 1.45);
      const metricCellW = yearCellW * 1.45;
      const cellH = 60;
      const headerH = 0;
      const legendH = 40;
      const colHdrH = 78;                   // 两行标题(label + sublabel)
      const footerH = 0;
      const padBot = 50;
      const matrixTop = headerH + legendH + colHdrH;
      const matrixBot = matrixTop + cellH * n_rows;
      const H = matrixBot + footerH + padBot;
      const metricStartX = padL + n_year * yearCellW + gapW;
      return {
        W, H, padL, padR, gapW,
        yearCellW, metricCellW, cellH,
        headerH, legendH, colHdrH, footerH, padBot,
        matrixTop, matrixBot,
        metricStartX, exportMode: true
      };
    }

    // 屏幕模式：按视口宽度自适应
    const W = 1480;
    const padL = 140, padR = 20;
    const gapW = 16;
    const usable = W - padL - padR - gapW;
    const yearCellW = usable / (n_year + n_metric * 1.4);
    const metricCellW = yearCellW * 1.4;
    const cellH = 38;
    const colHdrH = 54;                     // 两行标题
    const sortHdrH = 46;                    // 列头上方排序按钮区（独立空间，与年份标签留出间距）
    const matrixTop = sortHdrH + colHdrH;
    const matrixBot = matrixTop + cellH * n_rows;
    const H = matrixBot + 16;
    const metricStartX = padL + n_year * yearCellW + gapW;
    return {
      W, H, padL, padR, gapW,
      yearCellW, metricCellW, cellH,
      headerH: 0, legendH: 0, colHdrH, sortHdrH, footerH: 0, padBot: 0,
      matrixTop, matrixBot,
      metricStartX, exportMode: false
    };
  }

  function fmtVal(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return v.toFixed(1);
  }

  // ── 列排序（升序/降序）──
  let sortCol = null, sortDir = null, sortType = null;

  function drawSortArrow(ctx, x, y, w, h, dir, redTint, active) {
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    if (active) {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 1); ctx.arcTo(x + w + 2, y - 1, x + w + 2, y + h + 1, 3);
      ctx.arcTo(x + w + 2, y + h + 1, x - 2, y + h + 1, 3); ctx.arcTo(x - 2, y + h + 1, x - 2, y - 1, 3);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = active ? '#FFFFFF' : (redTint ? '#E65A56' : '#888888');
    ctx.beginPath();
    if (dir === 1) {
      ctx.moveTo(cx - 4.5, cy + 2); ctx.lineTo(cx + 4.5, cy + 2); ctx.lineTo(cx, cy - 4);
    } else {
      ctx.moveTo(cx - 4.5, cy - 2); ctx.lineTo(cx + 4.5, cy - 2); ctx.lineTo(cx, cy + 4);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function applySort(rows, colIdx, dir, type) {
    return rows.slice().sort((a, b) => {
      const av = type === 'year' ? a.rets[colIdx] : (a.metrics || [])[colIdx];
      const bv = type === 'year' ? b.rets[colIdx] : (b.metrics || [])[colIdx];
      const aN = (av === null || av === undefined || Number.isNaN(av)) ? (dir === 1 ? Infinity : -Infinity) : av;
      const bN = (bv === null || bv === undefined || Number.isNaN(bv)) ? (dir === 1 ? Infinity : -Infinity) : bv;
      return (aN - bN) * dir;
    });
  }

  /** 主渲染 */
  window.SW_drawHeatmap = function (canvas, payload, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const scale = opts.scale || (window.devicePixelRatio || 1);

    const { years, rows, metricsMeta = [] } = payload;
    // 年度涨跌幅色阶：按全表 P2 / P98 分位动态截断（超界值用端点色 + 右上角小三角）
    const annualVals = [];
    rows.forEach((r) => (r.rets || []).forEach((v) => {
      if (v !== null && v !== undefined && !Number.isNaN(v)) annualVals.push(v);
    }));
    annualVals.sort((a, b) => a - b);
    let VMIN = -50, VMAX = 105;
    if (annualVals.length) {
      VMIN = annualVals[Math.floor(annualVals.length * 0.02)];
      VMAX = annualVals[Math.max(0, Math.ceil(annualVals.length * 0.98) - 1)];
      if (VMIN >= 0) VMIN = -1;
      if (VMAX <= 0) VMAX = 1;
    }
    const L = layout(years, rows, metricsMeta, exportMode);

    canvas.width = L.W * scale;
    canvas.height = L.H * scale;
    if (!exportMode) {
      canvas.style.width = '100%';
      canvas.style.maxWidth = L.W + 'px';
      canvas.style.height = 'auto';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, L.W, L.H);

    // ── 导出版：只画色阶条（标题由 exportPNG 统一加） ──
    if (exportMode) {
      drawLegendBar(ctx, L, VMIN, VMAX);
    }

    // ── 列标题（年度） ──
    const colHdrSize = exportMode ? 24 : 14;
    const sublabelSize = exportMode ? 17 : 10;

    ctx.font = `400 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const colHdrBaseY = L.matrixTop - 6;

    // ── 屏幕版：排序按钮区（▲▼ 在列头上方） ──
    const sortBtns = [];   // {cx, y, h, colIdx, dir, type:'year'|'metric'}
    if (!exportMode) {
      const sTop = L.matrixTop - L.sortHdrH + 2;
      const sH = 18;                        // 按钮固定高度，其下方为年份标签（留 6px 间隙）
      const btnW = 16;
      years.forEach((y, j) => {
        const cx = L.padL + (j + 0.5) * L.yearCellW;
        const isYtd = y === '2026*';
        sortBtns.push({ cx: cx - btnW / 2, y: sTop, w: btnW, h: sH, colIdx: j, dir: 1, type: 'year' });
        sortBtns.push({ cx: cx + btnW / 2, y: sTop, w: btnW, h: sH, colIdx: j, dir: -1, type: 'year' });
        drawSortArrow(ctx, cx - btnW / 2, sTop, btnW, sH, 1, isYtd,
          sortCol === j && sortDir === 1 && sortType === 'year');
        drawSortArrow(ctx, cx + btnW / 2, sTop, btnW, sH, -1, isYtd,
          sortCol === j && sortDir === -1 && sortType === 'year');
      });
      metricsMeta.forEach((col, j) => {
        const cx = L.metricStartX + (j + 0.5) * L.metricCellW;
        sortBtns.push({ cx: cx - btnW / 2, y: sTop, w: btnW, h: sH, colIdx: j, dir: 1, type: 'metric' });
        sortBtns.push({ cx: cx + btnW / 2, y: sTop, w: btnW, h: sH, colIdx: j, dir: -1, type: 'metric' });
        drawSortArrow(ctx, cx - btnW / 2, sTop, btnW, sH, 1, false,
          sortCol === j && sortDir === 1 && sortType === 'metric');
        drawSortArrow(ctx, cx + btnW / 2, sTop, btnW, sH, -1, false,
          sortCol === j && sortDir === -1 && sortType === 'metric');
      });
      canvas.__sortBtns = sortBtns;
    }

    years.forEach((y, j) => {
      const cx = L.padL + (j + 0.5) * L.yearCellW;
      const isYtd = y === '2026*';
      ctx.fillStyle = isYtd ? '#E65A56' : '#333333';
      ctx.fillText(y, cx, colHdrBaseY);
    });

    // ── 列标题（CAGR）——label + sublabel 双行 ──
    metricsMeta.forEach((col, j) => {
      const cx = L.metricStartX + (j + 0.5) * L.metricCellW;
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `400 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(col.label, cx, colHdrBaseY - sublabelSize - 2);

      ctx.fillStyle = '#999999';
      ctx.font = `300 ${sublabelSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.fillText(col.sublabel, cx, colHdrBaseY);
    });

    // ── 行渲染 ──
    const rowLblSize = exportMode ? 26 : 14;
    const cellTxtSize = exportMode ? 22 : 11;
    const metricTxtSize = exportMode ? 24 : 12;

    rows.forEach((row, i) => {
      const rowY = L.matrixTop + i * L.cellH;

      // 行标签
      ctx.fillStyle = '#333333';
      ctx.font = `400 ${rowLblSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.name, L.padL - 12, rowY + L.cellH / 2);

      // 年度色块 + 数值
      row.rets.forEach((val, j) => {
        const x = L.padL + j * L.yearCellW;
        const y = rowY;
        const { rgb, lum } = mapColor(val, VMIN, VMAX);
        ctx.fillStyle = rgbStr(rgb);
        ctx.fillRect(x, y, L.yearCellW, L.cellH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, L.yearCellW - 1, L.cellH - 1);
        // 超界（低于 P2 / 高于 P98）格：右上角白色小三角提示「两端已截断」
        if (val !== null && val !== undefined && !Number.isNaN(val) && (val < VMIN || val > VMAX)) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.beginPath();
          ctx.moveTo(x + L.yearCellW - 1, y + 1);
          ctx.lineTo(x + L.yearCellW - 8, y + 1);
          ctx.lineTo(x + L.yearCellW - 1, y + 8);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = lum > 0.55 ? '#222222' : '#FFFFFF';
        ctx.font = `400 ${cellTxtSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtVal(val), x + L.yearCellW / 2, y + L.cellH / 2);
      });

      // CAGR 色块 + 数值 + %
      (row.metrics || []).forEach((val, j) => {
        const x = L.metricStartX + j * L.metricCellW;
        const y = rowY;
        const { rgb, lum } = mapColor(val, VMIN_M, VMAX_M);
        ctx.fillStyle = rgbStr(rgb);
        ctx.fillRect(x, y, L.metricCellW, L.cellH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, L.metricCellW - 1, L.cellH - 1);
        ctx.fillStyle = lum > 0.55 ? '#222222' : '#FFFFFF';
        // 加粗一点点表明这是「指标」而非「年度」
        ctx.font = `500 ${metricTxtSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const txt = (val === null || val === undefined) ? '—' : `${val.toFixed(1)}%`;
        ctx.fillText(txt, x + L.metricCellW / 2, y + L.cellH / 2);
      });
    });

    // ── 顶/底边框线 ──
    const matrixRight = L.metricStartX + metricsMeta.length * L.metricCellW;
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(L.padL, L.matrixTop);
    ctx.lineTo(matrixRight, L.matrixTop);
    ctx.moveTo(L.padL, L.matrixBot);
    ctx.lineTo(matrixRight, L.matrixBot);
    ctx.stroke();

    // ── 年度区与 CAGR 区之间的竖向分隔线 ──
    const sepX = L.padL + years.length * L.yearCellW + L.gapW / 2;
    ctx.strokeStyle = '#BBBBBB';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sepX, L.matrixTop - L.colHdrH);
    ctx.lineTo(sepX, L.matrixBot);
    ctx.stroke();
    ctx.setLineDash([]);

    // 导出版页脚
    if (exportMode) {
      const footY = L.matrixBot + 60;
      ctx.fillStyle = '#555555';
      ctx.font = '300 24px NotoSansSC, "Microsoft YaHei", sans-serif';

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let leftLine = '数据来源：Wind 申万一级行业指数';
      if (opts.ytdAsOf) leftLine += `  ·  2026 年为年初至今涨跌幅（截至 ${opts.ytdAsOf}）`;
      else leftLine += '  ·  2026 年为年初至今涨跌幅';
      leftLine += '  ·  CAGR 基于完整年度数据';
      ctx.fillText(leftLine, L.padL, footY);

      ctx.textAlign = 'right';
    }

    // ── 悬浮数值提示（屏幕版） ──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__layout = L;
      canvas.__payload = { years, rows, metricsMeta };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const L2 = canvas.__layout;
          const P = canvas.__payload;
          if (!L2 || !P) return;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          const sy = y / (window.devicePixelRatio || 1);
          // 行
          const i = Math.floor((sy - L2.matrixTop) / L2.cellH);
          if (i < 0 || i >= P.rows.length) { window.AK.tooltip.hide(); return; }
          const row = P.rows[i];
          // 年度区
          if (sx >= L2.padL && sx < L2.metricStartX) {
            const j = Math.floor((sx - L2.padL) / L2.yearCellW);
            if (j < 0 || j >= P.years.length) { window.AK.tooltip.hide(); return; }
            const v = row.rets[j];
            window.AK.tooltip.show(ev,
              `<b>${row.name}</b> · ${P.years[j]}<br>涨跌幅：<b>${fmtVal(v)}%</b>`);
            return;
          }
          // CAGR 区
          const mj = Math.floor((sx - L2.metricStartX) / L2.metricCellW);
          if (mj >= 0 && mj < P.metricsMeta.length) {
            const v = (row.metrics || [])[mj];
            const col = P.metricsMeta[mj];
            window.AK.tooltip.show(ev,
              `<b>${row.name}</b> · ${col.label}<br>年化：<b>${v === null || v === undefined ? '—' : v.toFixed(1) + '%'}</b>`);
            return;
          }
          window.AK.tooltip.hide();
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());

        // 排序按钮点击
        canvas.addEventListener('click', (ev) => {
          const L2 = canvas.__layout, P = canvas.__payload, btns = canvas.__sortBtns;
          if (!L2 || !P || !btns || !btns.length) return;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          const sy = y / (window.devicePixelRatio || 1);
          const hit = btns.find((b) => sx >= b.cx && sx <= b.cx + b.w && sy >= b.y && sy <= b.y + b.h);
          if (!hit) return;
          sortCol = hit.colIdx; sortDir = hit.dir; sortType = hit.type;
          const sorted = applySort(P.rows, hit.colIdx, hit.dir, hit.type);
          P.rows.length = 0; P.rows.push(...sorted);
          window.SW_drawHeatmap(canvas, { years: P.years, rows: P.rows, metricsMeta: P.metricsMeta }, {});
        });
      }
    }
  };

  function drawLegendBar(ctx, L, vmin, vmax) {
    const barW = Math.round(L.W * 0.32);
    const barH = 22;
    const barX = (L.W - barW) / 2;
    const barY = 10;

    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0.00, '#2FBF71');
    grad.addColorStop(0.40, '#C9F0DA');
    grad.addColorStop(0.50, '#FFFFFF');
    grad.addColorStop(0.60, '#F7CDCB');
    grad.addColorStop(1.00, '#E65A56');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

    ctx.fillStyle = '#555555';
    ctx.font = '300 22px NotoSansSC, "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(fmtVal(vmin), barX - 12, barY + barH / 2);
    ctx.textAlign = 'left';
    ctx.fillText('+' + fmtVal(vmax), barX + barW + 12, barY + barH / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0', barX + barW * 0.5, barY + barH + 6);

    // CAGR 色阶说明小字
    ctx.fillStyle = '#888888';
    ctx.font = '300 17px NotoSansSC, "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
  }
})();
/**
 * 抄底数学题 · 亏损对照表 canvas 渲染器
 * 与热力图共用架构:屏幕版 dpr scale, 导出版 3000px scale=1
 * A 股配色:亏损用绿色(越亏越深),0% 淡背景
 *
 * 入口: SW_drawLossTable(canvas, opts)
 *   opts.exportMode  — true=3000px 导出版(带标题+页脚)
 *   opts.scale       — 像素倍数
 */
(function () {
  'use strict';

  const ROW_LBLS = [
    '80 元（高位跌 20）', '70 元（高位跌 30）', '60 元（高位跌 40）',
    '50 元（高位跌 50）', '40 元（高位跌 60）', '30 元（高位跌 70）',
    '20 元（高位跌 80）', '10 元（高位跌 90）'
  ];
  const COL_LBLS = ['100 元买入', '80 元买入', '70 元买入', '60 元买入', '50 元买入', '40 元买入'];
  const CURRENT_PRICES = [80, 70, 60, 50, 40, 30, 20, 10];
  const BUY_PRICES     = [100, 80, 70, 60, 50, 40];

  // 生成数据矩阵: (现价 - 买入价) / 买入价 * 100; 现价 > 买入价则 null (未触及)
  // 现价 == 买入价 时是 0.00% (刚好回本, 对角线)
  const DATA = CURRENT_PRICES.map((cur) =>
    BUY_PRICES.map((buy) => (cur > buy ? null : ((cur - buy) / buy) * 100))
  );

  // A 股配色:绿=跌,越亏越深绿; 0% 临界=极淡红
  const COLORS = {
    blank: { bg: '#f8f9fb', fg: '#b8bec7' },  // /
    zero:  { bg: '#fbe9ea', fg: '#c1443c' },  // 刚好回本
    lv1:   { bg: '#dfefdc', fg: '#1e6d3b' },  // -1% ~ -20%
    lv2:   { bg: '#9dd0a2', fg: '#0f4a1f' },  // -20% ~ -40%
    lv3:   { bg: '#4fac54', fg: '#ffffff' },  // -40% ~ -60%
    lv4:   { bg: '#2c8730', fg: '#ffffff' },  // -60% ~ -75%
    lv5:   { bg: '#155a1a', fg: '#ffffff' }   // <= -75%
  };

  function classify(val) {
    if (val === null || val === undefined) return 'blank';
    if (val === 0) return 'zero';
    const abs = Math.abs(val);
    if (abs < 20) return 'lv1';
    if (abs < 40) return 'lv2';
    if (abs < 60) return 'lv3';
    if (abs < 75) return 'lv4';
    return 'lv5';
  }

  function fmtVal(v) {
    if (v === null || v === undefined) return '/';
    if (v === 0) return '0.00%';
    return v.toFixed(2) + '%';
  }

  function layout(exportMode) {
    const nRows = ROW_LBLS.length;   // 8
    const nCols = COL_LBLS.length;   // 6

    if (exportMode) {
      const W = 3000;
      const padL = 460, padR = 60;
      const cellW = (W - padL - padR) / nCols;
      const cellH = 140;
      const headerH = 0;
      const colHdrH = 96;
      const footerH = 0;
      const padBot = 50;
      const matrixTop = headerH + colHdrH;
      const matrixBot = matrixTop + cellH * nRows;
      return {
        W, H: matrixBot + footerH + padBot,
        padL, padR, cellW, cellH, headerH, colHdrH, footerH, padBot,
        matrixTop, matrixBot, exportMode: true
      };
    }
    // 屏幕版
    const W = 1180;
    const padL = 200, padR = 20;
    const cellW = (W - padL - padR) / nCols;
    const cellH = 48;
    const colHdrH = 48;
    const matrixTop = colHdrH;
    const matrixBot = matrixTop + cellH * nRows;
    return {
      W, H: matrixBot + 8,
      padL, padR, cellW, cellH, headerH: 0, colHdrH, footerH: 0, padBot: 0,
      matrixTop, matrixBot, exportMode: false
    };
  }

  window.SW_drawLossTable = function (canvas, opts) {
    opts = opts || {};
    const exportMode = !!opts.exportMode;
    const scale = opts.scale || (window.devicePixelRatio || 1);
    const L = layout(exportMode);

    canvas.width = L.W * scale;
    canvas.height = L.H * scale;
    if (!exportMode) {
      canvas.style.width = '100%';
      canvas.style.maxWidth = L.W + 'px';
      canvas.style.height = 'auto';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, L.W, L.H);

    // 导出版：只画图例（标题由 exportPNG 统一加）
    if (exportMode) {
      drawLegend(ctx, L.W - 640, 20, exportMode);
    }

    // 表头(带 padL 的行标签列 + 6 个列标题)
    const colHdrSize = exportMode ? 26 : 13;
    const hdrY = L.matrixTop - L.colHdrH;
    ctx.font = `500 ${colHdrSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle';

    // 行标签表头(深色底 白字)
    ctx.fillStyle = '#4a5060';
    ctx.fillRect(0, hdrY, L.padL, L.colHdrH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('现价（高位回撤）', L.padL / 2, hdrY + L.colHdrH / 2);

    COL_LBLS.forEach((lbl, j) => {
      const x = L.padL + j * L.cellW;
      ctx.fillStyle = '#4a5060';
      ctx.fillRect(x, hdrY, L.cellW, L.colHdrH);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(lbl, x + L.cellW / 2, hdrY + L.colHdrH / 2);
    });

    // 数据行
    const rowLblSize = exportMode ? 22 : 12;
    const cellValSize = exportMode ? 26 : 14;

    ROW_LBLS.forEach((rowLbl, i) => {
      const y = L.matrixTop + i * L.cellH;

      // 行标签(浅灰底 深字)
      ctx.fillStyle = '#f4f5f7';
      ctx.fillRect(0, y, L.padL, L.cellH);
      ctx.fillStyle = '#333333';
      ctx.font = `500 ${rowLblSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rowLbl, L.padL / 2, y + L.cellH / 2);

      // 数据格
      DATA[i].forEach((val, j) => {
        const x = L.padL + j * L.cellW;
        const c = COLORS[classify(val)];
        ctx.fillStyle = c.bg;
        ctx.fillRect(x, y, L.cellW, L.cellH);
        // 白色分隔
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = exportMode ? 3 : 1.5;
        ctx.strokeRect(x, y, L.cellW, L.cellH);

        ctx.fillStyle = c.fg;
        ctx.font = `700 ${cellValSize}px NotoSansSC, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtVal(val), x + L.cellW / 2, y + L.cellH / 2);
      });
    });

    // 表头下白色分隔线(整行)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = exportMode ? 3 : 1.5;
    ctx.strokeRect(0, hdrY, L.padL + COL_LBLS.length * L.cellW, L.colHdrH);
    COL_LBLS.forEach((_, j) => {
      const x = L.padL + j * L.cellW;
      ctx.strokeRect(x, hdrY, L.cellW, L.colHdrH);
    });

    // 导出版页脚
    if (exportMode) {
      const footY = L.matrixBot + 55;
      ctx.fillStyle = '#555555';
      ctx.font = '300 22px NotoSansSC, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('注: / 表示该买入价尚未被触及；表内数值 = (现价 − 买入价) / 买入价', L.padL, footY);
      ctx.textAlign = 'right';
    }

    // ── 悬浮数值提示（屏幕版） ──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__layout = L;
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const L2 = canvas.__layout;
          if (!L2) return;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          const sy = y / (window.devicePixelRatio || 1);
          const i = Math.floor((sy - L2.matrixTop) / L2.cellH);
          const j = Math.floor((sx - L2.padL) / L2.cellW);
          if (i < 0 || i >= ROW_LBLS.length || j < 0 || j >= COL_LBLS.length) {
            window.AK.tooltip.hide(); return;
          }
          const val = DATA[i][j];
          window.AK.tooltip.show(ev,
            `<b>${ROW_LBLS[i]}</b> · ${COL_LBLS[j]}<br>当前亏损：<b>${fmtVal(val)}</b>`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  };

  function drawLegend(ctx, startX, y, exportMode) {
    const size = exportMode ? 22 : 12;
    const boxW = exportMode ? 66 : 40;
    const boxH = exportMode ? 30 : 20;
    const gap = exportMode ? 8 : 4;

    ctx.font = `400 ${size}px NotoSansSC, "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('亏损色阶', startX - 20, y + boxH / 2);

    const items = [
      { lbl: '-20%', c: COLORS.lv1 },
      { lbl: '-40%', c: COLORS.lv3 },
      { lbl: '-60%', c: COLORS.lv4 },
      { lbl: '-90%', c: COLORS.lv5 }
    ];
    items.forEach((item, i) => {
      const x = startX + i * (boxW + gap);
      ctx.fillStyle = item.c.bg;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = item.c.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${size - 4}px NotoSansSC, "Microsoft YaHei", sans-serif`;
      ctx.fillText(item.lbl, x + boxW / 2, y + boxH / 2);
    });
  }
})();
/**
 * 长周期对数增长面板（七条线）
 * 数据：panel_longgrowth.json { generated, series: { code: {name, unit, dates[], values[]} } }
 * 展示：全部指标 2006-01 归一 = 1，纵轴对数，斜率即年化增速。
 */
(function () {
  'use strict';

  // Laoqian Chart 取色规范：按数据系列顺序取色（蓝/深灰/红/紫/深蓝灰/青绿/绿/青蓝）
  const COLORS = {
    M2: '#5AAEF3', 存款: '#333333', GDP: '#E65A56', 总市值: '#6D61E4',
    一线房价: '#5B6E96', 二线房价: '#62D9AD', 黄金: '#B8860B',
    中证全指全收益: '#23C2DB'
  };
  // 图例显示名（单行放不下时缩短，不改曲线名）
  const LEGEND_NAMES = { M2: 'M2', 存款: '存款', GDP: 'GDP', 总市值: '总市值', 一线房价: '一线房价', 二线房价: '二线房价', 黄金: '黄金', 中证全指全收益: '全收益' };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1600 : 720;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 200 : 118;   // 右侧留出 CAGR 标签空间
    const padT = exportMode ? 70 : 60;
    const padB = exportMode ? 50 : 46;

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

    // 收集全部序列，取共同起点（2006-01 或最早）
    const codes = Object.keys(data.series || {});
    let startIdx = 0;
    const baseDate = data.baseDate || '2006-01';
    // 每条序列独立归一（以自身首个有效点 = 1）
    const series = codes.map((code) => {
      const s = data.series[code];
      const vals = s.values;
      let first = -1;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] !== null && vals[i] !== undefined && !Number.isNaN(vals[i])) { first = i; break; }
      }
      const base = first >= 0 ? vals[first] : 1;
      const norm = vals.map((v) => (v === null || v === undefined || Number.isNaN(v)) ? null : v / base);
      return { code, name: s.name, unit: s.unit, dates: s.dates, norm };
    });

    // 日期轴（取覆盖最全的序列作 master；每条线按日期二分对齐 x 位置）
    const master = series.reduce((a, b) => (b.dates.length > a.dates.length ? b : a), series[0]);
    const dates = master.dates;
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
    // 日期 → master 索引（二分最近）
    const idxOf = (d) => {
      if (d <= dates[0]) return 0;
      if (d >= dates[n - 1]) return n - 1;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (dates[m] <= d) lo = m; else hi = m;
      }
      return (d - dates[lo] <= dates[hi] - d) ? lo : hi;
    };
    // 每条线预计算 x 索引数组
    series.forEach((s) => {
      s.xidx = s.dates.map((d) => idxOf(d));
    });

    // y 范围：对数（以 2 为底？不，直接自然对数求范围）
    let yMin = Infinity, yMax = -Infinity;
    series.forEach((s) => {
      s.norm.forEach((v) => {
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

    // 网格线（对数刻度：0.5x/1x/2x/4x/8x/16x/32x）
    const gridLevels = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
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

    // x 轴年份刻度
    const yearTicks = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => {
      ctx.fillText(y, xs(i), H - padB + 8);
    });

    // 标题（导出版）

    // 画线
    series.forEach((s) => {
      const color = COLORS[s.code] || '#888888';
      ctx.strokeStyle = color;
      ctx.lineWidth = exportMode ? 6 : 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.norm.length; i++) {
        const v = s.norm[i];
        if (v === null || v <= 0) { started = false; continue; }
        const x = xs(s.xidx[i]), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // ── hover 纵向跟随虚线 ──
    if (!exportMode && opts.hoverIdx !== undefined && opts.hoverIdx !== null) {
      const hx = xs(opts.hoverIdx);
      window.AK.drawHoverVLine(ctx, hx, padT, H - padB, scale);
    }

    // ── 末端 CAGR 标签（每个数字，防重叠：按末端 y 排序 + 左右交替 + 间距挤开）──
    const ends = [];
    series.forEach((s) => {
      let li = -1;
      for (let i = s.norm.length - 1; i >= 0; i--) {
        if (s.norm[i] !== null && s.norm[i] > 0) { li = i; break; }
      }
      if (li < 0) return;
      let fi = -1;
      for (let i = 0; i <= li; i++) {
        if (s.norm[i] !== null && s.norm[i] > 0) { fi = i; break; }
      }
      if (fi < 0) return;
      const v0 = s.norm[fi], v1 = s.norm[li];
      const y0 = Date.parse(s.dates[fi]), y1 = Date.parse(s.dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      ends.push({
        s, x: xs(s.xidx[li]), y: ys(v1), v1, cagr,
        color: COLORS[s.code] || '#888888'
      });
    });
    ends.sort((a, b) => b.y - a.y);   // 像素 y 从高到低
    const lh2 = exportMode ? 34 : 16; // 标签行高
    const used = [];                   // 已占用的标签 y 中心
    const dotColor = (c) => (c === '#E65A56' ? '#5AAEF3' : '#E65A56'); // 末端点与曲线反色
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    ends.forEach((e, i) => {
      const txt = `${(e.cagr * 100).toFixed(1)}%`;
      const tw = ctx.measureText(txt).width;
      const side = 1;                                       // 统一放曲线最右侧（老钱规范）
      const bx = side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12) - tw;
      const ha = side === 1 ? 'left' : 'right';
      // 检查是否与已放标签重叠，重叠则上下挤开
      let dy = 0;
      for (let k = 0; k < 24; k++) {
        const cand = e.y + dy;
        const clash = used.some((u) => Math.abs(u - cand) < lh2 * 1.15);
        if (!clash) break;
        dy = (k % 2 === 0) ? dy - lh2 * 1.15 : dy + lh2 * 1.15;
        if (k > 10) dy += lh2 * 1.15;   // 持续不够就逐步下移
      }
      const labelY = e.y + dy;
      used.push(labelY);
      // 末端点（与曲线反色）
      ctx.fillStyle = dotColor(e.color);
      ctx.beginPath();
      ctx.arc(e.x, e.y, exportMode ? 9 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 连接线（标签与数据点）
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x + (side === 1 ? (exportMode ? 8 : 6) : -(exportMode ? 8 : 6)), e.y);
      ctx.lineTo(side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12), labelY);
      ctx.stroke();
      // 标签
      ctx.fillStyle = e.color;
      ctx.textAlign = ha;
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx, labelY);
    });

    // 图例（横向单行罗列：按CAGR从高到低排序，超宽逐级缩短系列名，绝不折行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 20;
    const lh = exportMode ? 50 : 22;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const lgap = exportMode ? 52 : 24;
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';

    // 计算每条线的CAGR，按从高到低排序图例
    const seriesWithCagr = series.map((s, i) => {
      let li = -1;
      for (let k = s.norm.length - 1; k >= 0; k--) { if (s.norm[k] !== null && s.norm[k] > 0) { li = k; break; } }
      let fi = -1;
      for (let k = 0; k <= li; k++) { if (s.norm[k] !== null && s.norm[k] > 0) { fi = k; break; } }
      if (fi < 0 || li < 0) return { s, i, cagr: -Infinity };
      const v0 = s.norm[fi], v1 = s.norm[li];
      const y0 = Date.parse(s.dates[fi]), y1 = Date.parse(s.dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      return { s, i, cagr, lastVal: s.norm[li] };
    }).sort((a, b) => b.cagr - a.cagr);

    const lastVals = seriesWithCagr.map((x) => x.lastVal);
    // 逐级缩短系列名直到单行放下（最短 4 字）
    let legendNames = seriesWithCagr.map((x) => LEGEND_NAMES[x.s.code] || x.s.name);
    const legendW = (ns) => ns.reduce((w, nm, i) => {
      const label = `${nm}${lastVals[i] !== null ? `  ${lastVals[i].toFixed(1)}x` : ''}`;
      return w + ctx.measureText(label).width + (exportMode ? 56 : 24) + lgap;
    }, 0);
    let minLen = 8;
    while (legendW(legendNames) > W - padR - lx0 - 16 && minLen > 4) {
      minLen--;
      legendNames = legendNames.map((nm) => (nm.length > minLen ? nm.slice(0, minLen) : nm));
    }
    let lx = lx0, ly = ly0;
    seriesWithCagr.forEach((x, i) => {
      const s = x.s;
      const color = COLORS[s.code] || '#888888';
      const label = `${legendNames[i]}${lastVals[i] !== null ? `  ${lastVals[i].toFixed(1)}x` : ''}`;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(label, lx + (exportMode ? 56 : 24), ly);
      lx += ctx.measureText(label).width + (exportMode ? 56 : 24) + lgap;
    });

    // 页脚：导出模式下不画（由 exportPNG 统一加 footer）

    // ── 悬浮数值提示（屏幕版）：鼠标 x → 最近 master 交易日 → 每条线按自身日期就近取值 ──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__lgData = { series, dates, data, drawFn: draw };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__lgData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) {
            window.AK.tooltip.hide();
            // 离开绘图区：重绘去掉竖线
            D.drawFn(canvas, D.data, { exportMode: false, scale: window.devicePixelRatio || 1 });
            return;
          }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          const date = D.dates[i];

          // 重绘带竖线
          D.drawFn(canvas, D.data, { exportMode: false, scale: window.devicePixelRatio || 1, hoverIdx: i });

          let html = `<b>${date}</b><br>`;
          D.series.forEach((s) => {
            let v = null;
            if (s.norm.length) {
              const j = nearestIdx(s, date);
              v = (j >= 0) ? s.norm[j] : null;
            }
            if (v === null || v === undefined) return;
            html += `<span style="color:${COLORS[s.code] || '#888'}">●</span> ${s.name}：<b>${v.toFixed(1)}x</b><br>`;
          });
          window.AK.tooltip.show(ev, html.slice(0, -4));
        });
        canvas.addEventListener('mouseleave', () => {
          window.AK.tooltip.hide();
          const D = canvas.__lgData;
          if (D) D.drawFn(canvas, D.data, { exportMode: false, scale: window.devicePixelRatio || 1 });
        });
      }
    }
  }

  // 该线自身 dates（升序）中距离目标日期最近的点索引
  function nearestIdx(s, t) {
    const d = s.dates;
    if (!d.length || t < d[0]) return 0;
    if (t > d[d.length - 1]) return d.length - 1;
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (d[m] <= t) lo = m; else hi = m;
    }
    return (t - d[lo] <= d[hi] - t) ? lo : hi;
  }

  window.LG_render = function (data) {
    const wrap = document.getElementById('panelLongBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'longGrowth';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      longGrowth: (off, scale) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
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

    // 排序一级行业（按名称）：一级 = 不在 parentMap 中的代码（parentMap 只含 131 个二级）
    sortedL1 = Object.keys(payload.metrics).filter((c) =>
      payload.levels['1'] && !(payload.parentMap && Object.prototype.hasOwnProperty.call(payload.parentMap, c))
    );
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
/**
 * 全市场成交金额 / 换手面板
 * 数据：market_turnover.json { generated, dates[], amount[]（亿元）, totalMv[]（亿元）, turnover[]（%） }
 * 展示：上 = 全市场成交金额（柱/面积）；下 = 换手率折线 + 窗口均值虚线 + 分位带
 * 周期：3 / 5 / 7 / 10 / 20 年（交易日近似）
 */
(function () {
  'use strict';

  const YEARS = [3, 5, 7, 10, 20];

  let state = { years: 10 };

  function draw(canvasEl, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1800 : 860;
    const padL = exportMode ? 170 : 80;
    const padR = exportMode ? 150 : 70;
    const padT = exportMode ? 70 : 48;
    const padB = exportMode ? 50 : 44;

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

    // 周期裁剪
    const nYears = state.years;
    const maxDays = data.dates.length;
    const want = Math.round(nYears * 245);
    const startIdx = Math.max(0, maxDays - want);
    const dates = data.dates.slice(startIdx);
    const amount = data.amount.slice(startIdx);
    const turnover = data.turnover.slice(startIdx);
    const n = dates.length;

    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // 标题

    // ── 上图：成交金额（柱） ──
    const h1 = (H - padT - padB) * 0.44;
    const top1 = padT;
    let aMax = 0;
    amount.forEach((v) => { if (v > aMax) aMax = v; });
    if (!aMax) aMax = 1;
    const y1 = (v) => top1 + h1 * (1 - v / aMax);

    // y 网格
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = (aMax / 4) * g;
      const y = y1(v);
      ctx.strokeStyle = '#EDEDED'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.fillText((v / 1e4).toFixed(v >= 1e4 ? 1 : 2) + '万亿', padL - 10, y);
    }
    // 柱（降采样：n>800 时画线）
    if (n > 800) {
      ctx.strokeStyle = '#E65A56'; ctx.lineWidth = exportMode ? 2 : 1;
      ctx.beginPath();
      amount.forEach((v, i) => {
        const x = xs(i), y = y1(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      const bw = Math.max(1, (W - padL - padR) / n * 0.7);
      ctx.fillStyle = '#E65A56';
      amount.forEach((v, i) => {
        const x = xs(i) - bw / 2;
        ctx.fillRect(x, y1(v), bw, top1 + h1 - y1(v));
      });
    }
    // 上图标题
    ctx.fillStyle = '#333333'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.fillText('全市场成交金额（两市合计）', padL, top1 - 8);

    // 上图：最新值水平虚线（红色）
    const lastAmt = amount[n - 1];
    if (lastAmt !== null && lastAmt !== undefined) {
      const ly = y1(lastAmt);
      ctx.strokeStyle = '#E65A56'; ctx.lineWidth = exportMode ? 3 : 1.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(W - padR, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#E65A56'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
      ctx.fillText(`最新 ${(lastAmt / 1e4).toFixed(2)} 万亿`, W - padR, ly - 8);
    }

    // ── 下图：换手率折线 + 均值 + 分位带 ──
    const h2 = (H - padT - padB) * 0.44;
    const top2 = top1 + h1 + (H - padT - padB) * 0.06;
    const vals = turnover.filter((v) => v !== null && v !== undefined);
    let tMin = Math.min(...vals), tMax = Math.max(...vals);
    if (!isFinite(tMin)) { tMin = 0; tMax = 1; }
    const tPad = (tMax - tMin) * 0.08 || 0.1;
    tMin -= tPad; tMax += tPad;
    const y2 = (v) => top2 + h2 * (1 - (v - tMin) / (tMax - tMin));

    for (let g = 0; g <= 4; g++) {
      const v = tMin + (tMax - tMin) * g / 4;
      const y = y2(v);
      ctx.strokeStyle = '#EDEDED'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.fillText(v.toFixed(1) + '%', padL - 10, y);
    }

    // 换手率折线（黑色）
    ctx.strokeStyle = '#333333'; ctx.lineWidth = exportMode ? 4 : 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    turnover.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      const x = xs(i), y = y2(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 下图：最新值水平虚线（黑色）
    let lastTr = null, lastTrIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (turnover[i] !== null && turnover[i] !== undefined) { lastTr = turnover[i]; lastTrIdx = i; break; }
    }
    if (lastTr !== null) {
      const ly = y2(lastTr);
      ctx.strokeStyle = '#333333'; ctx.lineWidth = exportMode ? 3 : 1.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(W - padR, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#333333'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
      ctx.fillText(`最新 ${lastTr.toFixed(2)}%`, W - padR, ly - 8);
    }

    // 下图标题
    ctx.fillStyle = '#333333'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.fillText('换手率（成交额 / 全市场总市值）', padL, top2 - 8);

    // x 轴年份
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const yearSet = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || d.slice(0, 4) !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearSet.add([y, i]);
    });
    yearSet.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 6));

    // 页脚
    if (exportMode) {
      ctx.fillStyle = '#888888'; ctx.font = '300 22px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const asOf = (data.generated || '').slice(0, 10);
      ctx.fillText(`数据截至 ${asOf} · 两市成交额（新浪）· 总市值（乐咕）· 自由流通市值无日度历史，采用总市值口径`, padL, H - 64);
      ctx.textAlign = 'right';
    }

    // ── 悬浮数值提示（屏幕版）：最近交易日 → 成交额 / 换手 ──
    if (!exportMode && opts.bindHover !== false) {
      canvasEl.__mtData = { dates, amount, turnover, xs };
      if (!canvasEl.__hoverBound) {
        canvasEl.__hoverBound = true;
        canvasEl.addEventListener('mousemove', (ev) => {
          const D = canvasEl.__mtData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvasEl, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const n = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (n - 1));
          const i = Math.max(0, Math.min(n - 1, idx));
          const amt = D.amount[i];
          const tr = D.turnover[i];
          let html = `<b>${D.dates[i]}</b><br>成交金额：<b>${(amt / 1e4).toFixed(2)} 万亿</b>`;
          if (tr !== null && tr !== undefined) html += `<br>换手率：<b>${tr.toFixed(2)}%</b>`;
          window.AK.tooltip.show(ev, html);
        });
        canvasEl.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.MT_render = function (data) {
    const wrap = document.getElementById('panelTurnoverBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    // 周期切换控制
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-controls';
    ctrl.innerHTML = `<div class="ctrl-group"><label>窗口</label><span class="seg" id="mt-years"></span></div>`;
    wrap.appendChild(ctrl);
    const seg = ctrl.querySelector('#mt-years');
    YEARS.forEach((y) => {
      const b = document.createElement('button');
      b.textContent = `${y} 年`;
      if (y === state.years) b.classList.add('active');
      b.addEventListener('click', () => {
        state.years = y;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });
      });
      seg.appendChild(b);
    });

    const canvas = document.createElement('canvas');
    canvas.id = 'turnover';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      turnover: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
/**
 * 收益来源拆解面板（表格版）
 * 数据：return_decomp.json { generated, indexes: [ {code, name, start, end, totalReturnPct, dividendPct, earningsPct, valuationPct} ] }
 */
(function () {
  'use strict';

  let payload = null;
  let canvasMain = null;

  const COLS = [
    { key: 'name', label: '指数', align: 'left', w: 0.16 },
    { key: 'range', label: '区间', align: 'left', w: 0.16 },
    { key: 'totalReturnPct', label: '全收益', align: 'right', w: 0.14 },
    { key: 'dividendPct', label: '股息', align: 'right', w: 0.12 },
    { key: 'earningsPct', label: '盈利', align: 'right', w: 0.12 },
    { key: 'valuationPct', label: '估值', align: 'right', w: 0.12 },
    { key: 'peRange', label: 'PE 起止', align: 'right', w: 0.18 },
  ];

  const COLOR_POS = '#C0392B';   // 正收益 红
  const COLOR_NEG = '#1E8449';   // 负收益 绿
  const COLOR_ZERO = '#888';

  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    const sign = v > 0 ? '+' : '';
    return sign + v.toFixed(1) + '%';
  }

  function pctColor(v) {
    if (v === null || v === undefined) return '#aaa';
    if (v > 0.05) return COLOR_POS;
    if (v < -0.05) return COLOR_NEG;
    return COLOR_ZERO;
  }

  function drawMain(canvasEl, exportMode, scale) {
    const W = exportMode ? 3000 : 1480;
    const padL = exportMode ? 60 : 30;
    const padR = exportMode ? 60 : 30;
    const headH = exportMode ? 90 : 44;
    const rowH = exportMode ? 96 : 48;
    const colGap = 0;
    const idx = payload.indexes || [];
    const nRows = idx.length;
    const H = headH + rowH * nRows + (exportMode ? 40 : 20);

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

    const tableW = W - padL - padR;
    // 列 x 坐标
    let cx = padL;
    const colXs = [];
    COLS.forEach((c) => {
      colXs.push(cx);
      cx += tableW * c.w;
    });

    // 表头
    ctx.fillStyle = '#F7F8FA';
    ctx.fillRect(padL, 0, tableW, headH);
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, headH);
    ctx.lineTo(W - padR, headH);
    ctx.stroke();

    const headFont = (exportMode ? 26 : 13) + 'px NotoSansSC, sans-serif';
    ctx.font = headFont;
    ctx.fillStyle = '#666';
    COLS.forEach((c, i) => {
      const tx = c.align === 'right' ? colXs[i] + tableW * c.w - 16 : colXs[i] + 16;
      ctx.textAlign = c.align === 'right' ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, tx, headH / 2);
    });

    // 行
    idx.forEach((r, ri) => {
      const ry = headH + ri * rowH;
      // 斑马纹
      if (ri % 2 === 1) {
        ctx.fillStyle = '#FAFBFC';
        ctx.fillRect(padL, ry, tableW, rowH);
      }
      // 行底线
      ctx.strokeStyle = '#EEEEEE';
      ctx.beginPath();
      ctx.moveTo(padL, ry + rowH);
      ctx.lineTo(W - padR, ry + rowH);
      ctx.stroke();

      const cy = ry + rowH / 2;
      const bodyFont = (exportMode ? 30 : 14.5) + 'px NotoSansSC, sans-serif';
      ctx.font = bodyFont;
      ctx.textBaseline = 'middle';

      // 指数名（粗体）
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'left';
      ctx.font = (exportMode ? '700 ' : '600 ') + (exportMode ? 30 : 14.5) + 'px NotoSansSC, sans-serif';
      ctx.fillText(r.name, colXs[0] + 16, cy);
      ctx.font = bodyFont;

      // 区间
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.fillText((r.start || '').slice(0, 7) + ' 起', colXs[1] + 16, cy);

      // 全收益 / 股息 / 盈利 / 估值（右对齐，按正负着色）
      const pctCols = ['totalReturnPct', 'dividendPct', 'earningsPct', 'valuationPct'];
      pctCols.forEach((key, ci) => {
        const colIdx = 2 + ci;
        const v = r[key];
        ctx.fillStyle = pctColor(v);
        ctx.textAlign = 'right';
        ctx.font = (exportMode ? '700 ' : '600 ') + (exportMode ? 30 : 14.5) + 'px NotoSansSC, sans-serif';
        ctx.fillText(fmtPct(v), colXs[colIdx] + tableW * COLS[colIdx].w - 16, cy);
        ctx.font = bodyFont;
      });

      // PE 起止
      ctx.fillStyle = '#666';
      ctx.textAlign = 'right';
      if (r.peStart && r.peEnd) {
        ctx.fillText(r.peStart.toFixed(1) + ' → ' + r.peEnd.toFixed(1), colXs[6] + tableW * COLS[6].w - 16, cy);
      } else {
        ctx.fillText('—', colXs[6] + tableW * COLS[6].w - 16, cy);
      }
    });
  }

  window.RD_render = function (data) {
    payload = data;
    const wrap = document.getElementById('panelReturnBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    canvasMain = document.createElement('canvas');
    canvasMain.id = 'returnDecomp';
    wrap.appendChild(canvasMain);

    drawMain(canvasMain, false, window.devicePixelRatio || 1);

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => drawMain(canvasMain, false, window.devicePixelRatio || 1));
    });

    window.AK.bindExportButtons({
      returnDecomp: (off) => drawMain(off, true, 1)
    });
  };
})();
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
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 48;

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
    const padT = exportMode ? 70 : 60;
    const padB = exportMode ? 50 : 46;

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
      const side = 1;                                       // 统一放曲线最右侧（老钱规范）
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
    // 图例（横向单行：按CAGR从高到低排序，超宽逐级缩短，不折行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const lgap = exportMode ? 52 : 24;

    // 计算每条线的CAGR，按从高到低排序图例
    const factorsWithCagr = factors.map((f) => {
      const nav = data.factors[f].nav || [];
      const dates = data.dates || [];
      let li = nav.length - 1;
      let fi = 0;
      while (fi < nav.length && (nav[fi] === null || nav[fi] === undefined)) fi++;
      if (fi >= nav.length || li < 0) return { f, cagr: -Infinity, lastVal: nav[li] };
      const v0 = nav[fi], v1 = nav[li];
      const y0 = Date.parse(dates[fi]), y1 = Date.parse(dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      return { f, cagr, lastVal: v1 };
    }).sort((a, b) => b.cagr - a.cagr);

    const lastVals = factorsWithCagr.map((x) => x.lastVal);
    let legendNames = factorsWithCagr.map((x) => x.f);
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
    factorsWithCagr.forEach((x, i) => {
      const f = x.f;
      const color = COLORS[f] || '#888888';
      const label = `${legendNames[i]}${lastVals[i] !== null ? `  ${lastVals[i].toFixed(1)}x` : ''}`;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(label, lx + (exportMode ? 56 : 24), ly);
      lx += ctx.measureText(label).width + (exportMode ? 56 : 24) + lgap;
    });

    // 页脚：导出模式下不画（由 exportPNG 统一加 footer）

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
    const padT = exportMode ? 70 : 60;
    const padB = exportMode ? 50 : 46;

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

    // ── 图例（横向单行，按CAGR从高到低排序，自适缩短）──
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const lgap = exportMode ? 52 : 24;

    // 计算每条线的CAGR，按从高到低排序图例
    const seriesWithCagr = series.map((s) => {
      let li = -1;
      for (let k = s.nav.length - 1; k >= 0; k--) { if (s.nav[k] !== null && s.nav[k] > 0) { li = k; break; } }
      let fi = -1;
      for (let k = 0; k <= li; k++) { if (s.nav[k] !== null && s.nav[k] > 0) { fi = k; break; } }
      if (fi < 0 || li < 0) return { s, cagr: -Infinity };
      const v0 = s.nav[fi], v1 = s.nav[li];
      const y0 = Date.parse(dates[fi]), y1 = Date.parse(dates[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      const cagr = (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
      return { s, cagr };
    }).sort((a, b) => b.cagr - a.cagr);

    // 图例不显示涨幅数字（用户要求）
    let legendNames = seriesWithCagr.map((x) => x.s.name);
    const legendW = (ns) => ns.reduce((w, nm, i) => {
      return w + ctx.measureText(nm).width + (exportMode ? 56 : 24) + lgap;
    }, 0);
    let minLen = 12;
    while (legendW(legendNames) > W - padR - lx0 - 16 && minLen > 2) {
      minLen--;
      legendNames = legendNames.map((nm) => (nm.length > minLen ? nm.slice(0, minLen) : nm));
    }
    let lx = lx0, ly = ly0;
    seriesWithCagr.forEach((x, i) => {
      const s = x.s;
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
/**
 * A股恐贪指数面板（面板 10）
 * 数据：fear_greed.json { series: { fear_greed: {dates, values}, csi_all: {dates, values} } }
 * 展示：恐贪指数 0-100（左轴，含分档色带 + 80/20 买卖参考虚线）+ 中证全指（右轴，红涨绿跌）
 * 交互：时间轴滑动（选择显示起点）、hover 数值
 */
(function () {
  'use strict';

  const FG_COLOR = '#333333';      // 恐贪线（深灰，1px）
  const CSI_COLOR = '#E65A56';     // 中证全指（红，红涨）
  const BUY_COLOR = '#30CB13';     // 20 恐惧买入（绿虚线）
  const SELL_COLOR = '#E65A56';    // 80 贪婪卖出（红虚线）

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const startIdx = opts.startIdx || 0;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1400 : 640;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 200 : 108;
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 46;

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

    const fg = data.series.fear_greed;
    const csi = data.series.csi_all;
    const dates = fg.dates;
    const n = dates.length;
    if (!n) return;

    // 时间窗口 [startIdx, n-1]
    const s0 = Math.max(0, Math.min(startIdx, n - 1));
    const span = Math.max(1, n - 1 - s0);
    const xs = (i) => padL + ((i - s0) / span) * (W - padL - padR);

    // 恐贪 y（0-100 固定）
    const yFg = (v) => padT + (1 - v / 100) * (H - padT - padB);
    // 中证全指 y（数据范围，窗口内）
    const csiVals = [];
    for (let i = s0; i < n; i++) {
      const v = csi.values[i];
      if (v !== null && v !== undefined && !Number.isNaN(v)) csiVals.push(v);
    }
    let cMin = csiVals.length ? Math.min(...csiVals) : 0;
    let cMax = csiVals.length ? Math.max(...csiVals) : 1;
    const cPad = (cMax - cMin) * 0.05 || 1;
    cMin -= cPad; cMax += cPad;
    const yCsi = (v) => padT + (1 - (v - cMin) / (cMax - cMin)) * (H - padT - padB);

    // ── 分档色带（恐贪：低=恐慌 红系，高=贪婪 绿系）──
    const bands = [
      { lo: 0, hi: 25, c: '#E65A56', a: exportMode ? 0.14 : 0.10, label: '极度恐慌' },
      { lo: 25, hi: 45, c: '#E65A56', a: exportMode ? 0.09 : 0.06, label: '恐慌' },
      { lo: 45, hi: 55, c: '#999999', a: exportMode ? 0.08 : 0.06, label: '中性' },
      { lo: 55, hi: 75, c: '#30CB13', a: exportMode ? 0.09 : 0.06, label: '贪婪' },
      { lo: 75, hi: 100, c: '#30CB13', a: exportMode ? 0.14 : 0.10, label: '极度贪婪' },
    ];
    bands.forEach((b) => {
      ctx.fillStyle = b.c;
      ctx.globalAlpha = b.a;
      ctx.fillRect(padL, yFg(b.hi), W - padL - padR, yFg(b.lo) - yFg(b.hi));
      ctx.globalAlpha = 1;
    });

    // ── 80 / 20 买卖参考虚线（附件范式：红=贪婪卖出、绿=恐惧买入）──
    ctx.setLineDash(exportMode ? [14, 10] : [7, 5]);
    ctx.lineWidth = exportMode ? 3 : 1.4;
    ctx.strokeStyle = SELL_COLOR;
    ctx.beginPath(); ctx.moveTo(padL, yFg(80)); ctx.lineTo(W - padR, yFg(80)); ctx.stroke();
    ctx.strokeStyle = BUY_COLOR;
    ctx.beginPath(); ctx.moveTo(padL, yFg(20)); ctx.lineTo(W - padR, yFg(20)); ctx.stroke();
    ctx.setLineDash([]);
    // 标签
    ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = SELL_COLOR;
    ctx.fillText('80 · 贪婪 → 卖出', W - padR - (exportMode ? 8 : 4), yFg(80) - (exportMode ? 26 : 12));
    ctx.fillStyle = BUY_COLOR;
    ctx.fillText('20 · 恐惧 → 买入', W - padR - (exportMode ? 8 : 4), yFg(20) + (exportMode ? 26 : 12));

    // ── 网格 + 恐贪刻度 ──
    ctx.lineWidth = 1;
    for (let g = 0; g <= 100; g += 25) {
      const y = yFg(g);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(g), padL - 12, y);
    }
    // 右轴（中证全指刻度，红）
    ctx.fillStyle = CSI_COLOR;
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach((f) => {
      const v = cMin + (cMax - cMin) * f;
      const y = padT + (1 - f) * (H - padT - padB);
      ctx.fillText(v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toFixed(0), W - padR + 12, y);
    });

    // x 轴年份（窗口内）
    const yearTicks = new Set();
    for (let i = s0; i < n; i++) {
      const y = dates[i].slice(0, 4);
      if ((i === s0 || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    }
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 标题（导出版，无副标题）

    // ── 曲线 ──
    function poly(values, xf, yf, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = s0; i < n; i++) {
        const v = values[i];
        if (v === null || v === undefined || Number.isNaN(v)) { started = false; continue; }
        const x = xf(i), y = yf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    poly(fg.values, xs, yFg, FG_COLOR, exportMode ? 3 : 1);   // 恐贪曲线 1px
    poly(csi.values, xs, yCsi, CSI_COLOR, exportMode ? 4 : 1.6);

    // 末端点 + 最新值标签
    const fgLast = fg.values[n - 1], csiLast = csi.values[n - 1];
    if (fgLast !== null) {
      const x = xs(n - 1), y = yFg(fgLast);
      ctx.fillStyle = '#5AAEF3';
      ctx.beginPath(); ctx.arc(x, y, exportMode ? 10 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = FG_COLOR;
      ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${fgLast.toFixed(1)}`, x + (exportMode ? 18 : 12), y);
    }
    if (csiLast !== null) {
      const x = xs(n - 1), y = yCsi(csiLast);
      ctx.fillStyle = '#30CB13';
      ctx.beginPath(); ctx.arc(x, y, exportMode ? 8 : 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = CSI_COLOR;
      ctx.font = (exportMode ? 26 : 12) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(csiLast >= 10000 ? (csiLast / 10000).toFixed(2) + '万' : csiLast.toFixed(0), x - (exportMode ? 18 : 12), y);
    }

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 18;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const items = [
      { c: FG_COLOR, label: `A股恐贪指数  ${fgLast !== null ? fgLast.toFixed(1) : '—'}` },
      { c: CSI_COLOR, label: `中证全指  ${csiLast !== null ? (csiLast >= 10000 ? (csiLast / 10000).toFixed(2) + '万' : csiLast.toFixed(0)) : '—'}` },
      { c: SELL_COLOR, label: '80 贪婪卖出' },
      { c: BUY_COLOR, label: '20 恐惧买入' },
    ];
    let lx = lx0, ly = ly0;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.label, lx + (exportMode ? 56 : 24), ly);
      lx += ctx.measureText(it.label).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.textAlign = 'right';
    }

    // ── hover 悬浮（屏幕版）──
    if (!exportMode && opts.bindHover !== false) {
      canvas.__fgData = { fg, csi, dates, s0, n, span, yFg, yCsi, xs };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__fgData;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const idx = Math.round((sx - padL) / (W - padL - padR) * D.span) + D.s0;
          const i = Math.max(D.s0, Math.min(D.n - 1, idx));
          const fv = D.fg.values[i], cv = D.csi.values[i];
          let html = `<b>${D.dates[i]}</b><br>`;
          if (fv !== null && fv !== undefined) html += `<span style="color:#333">●</span> 恐贪指数：<b>${fv.toFixed(1)}</b><br>`;
          if (cv !== null && cv !== undefined) html += `<span style="color:#E65A56">●</span> 中证全指：<b>${cv.toFixed(0)}</b>`;
          window.AK.tooltip.show(ev, html.replace(/<br>$/, ''));
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.FG_render = function (data) {
    const wrap = document.getElementById('panelFearBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const fg = data.series.fear_greed;
    const n = fg.dates.length;

    const canvas = document.createElement('canvas');
    canvas.id = 'fearGreed';
    wrap.appendChild(canvas);

    // 时间轴滑块控件（放图表下方；默认显示 2024-01 至今）
    const ctrl = document.createElement('div');
    ctrl.className = 'fg-controls';
    const lbl = document.createElement('span');
    lbl.className = 'fg-range-label';
    lbl.id = 'fgRangeLabel';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'fgRange';
    slider.min = '0';
    slider.max = String(n - 1);
    slider.value = '0';
    slider.step = '1';
    slider.className = 'fg-range';
    ctrl.appendChild(lbl);
    ctrl.appendChild(slider);
    wrap.appendChild(ctrl);

    // 默认起点：2024-01-01（用户反馈：默认 2024 至今避免曲线过密）
    let defStart = 0;
    for (let i = 0; i < n; i++) {
      if (fg.dates[i] >= '2024-01-01') { defStart = i; break; }
    }
    slider.value = String(defStart);

    let curStart = defStart;
    const redraw = (start) => {
      curStart = start;
      draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1, startIdx: start });
      lbl.textContent = `显示 ${fg.dates[start].slice(0, 4)} — ${fg.dates[n - 1].slice(0, 4)}`;
    };
    redraw(defStart);

    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      lbl.textContent = `显示 ${fg.dates[v].slice(0, 4)} — ${fg.dates[n - 1].slice(0, 4)}`;
      draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1, startIdx: v });
    });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1, startIdx: curStart }));
    });

    window.AK.bindExportButtons({
      fearGreed: (off) => draw(off, data, { exportMode: true, scale: 1, startIdx: curStart })
    });
  };
})();
/**
 * 面板 11：偏股混合基金 滚动年化（1/3/5/7 年可切换）
 * 数据：fund_index.json { series: { '885001.WI': {dates, values, rolling1, rolling3, rolling5, rolling7} } }
 * 展示：885001 每日 N 年滚动年化收益（%）；>0 红 / <0 绿；0 虚线
 */
(function () {
  'use strict';

  const C_PG = '#E65A56';   // 红（正）
  const C_NEG = '#30CB13';  // 绿（负）
  const WINDOWS = [
    { key: 'rolling1', label: '1年' },
    { key: 'rolling3', label: '3年' },
    { key: 'rolling5', label: '5年' },
    { key: 'rolling7', label: '7年' },
  ];
  let state = { rollKey: 'rolling3' };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 640;
    const padL = exportMode ? 190 : 96;
    const padR = exportMode ? 200 : 118;
    const padT = exportMode ? 70 : 60;
    const padB = exportMode ? 50 : 46;
    const rollKey = opts.rollKey || state.rollKey;
    const winLabel = (WINDOWS.find((w) => w.key === rollKey) || WINDOWS[1]).label;

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

    const pg = data.series && data.series['885001.WI'];
    if (!pg) return;
    const dates = pg.dates || [];
    const rollRaw = pg[rollKey] || [];
    // rolling 可能为 {dates, values} 对象或数组
    const roll = Array.isArray(rollRaw) ? rollRaw : (rollRaw.values || []);
    const n = Math.min(dates.length, roll.length);

    // 有效数据范围（去掉开头 null）
    let first = -1, last = -1;
    for (let i = 0; i < n; i++) {
      const v = roll[i];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (last < 0) return;

    const xs = (i) => padL + (first === last ? 0.5 : (i - first) / (last - first)) * (W - padL - padR);
    let pMin = Infinity, pMax = -Infinity;
    for (let i = first; i <= last; i++) {
      const v = roll[i];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      if (v < pMin) pMin = v;
      if (v > pMax) pMax = v;
    }
    const pad = Math.max((pMax - pMin) * 0.08, 3);
    pMin = Math.min(pMin - pad, -1); pMax = Math.max(pMax + pad, 1);
    const yP = (v) => padT + (1 - (v - pMin) / (pMax - pMin)) * (H - padT - padB);

    // 网格 + 零线
    ctx.lineWidth = 1;
    const step = Math.ceil((pMax - pMin) / 8 / 5) * 5 || 5;
    for (let g = Math.ceil(pMin / step) * step; g <= pMax; g += step) {
      const y = yP(g);
      ctx.strokeStyle = (Math.abs(g) < 1e-9) ? '#BBBBBB' : '#EDEDED';
      ctx.lineWidth = (Math.abs(g) < 1e-9) ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${g}%`, padL - 12, y);
    }
    // 0 线标注
    const y0 = yP(0);
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('0', padL + 6, y0);

    // x 轴年份
    const yearTicks = new Set();
    for (let i = first; i <= last; i++) {
      const y = dates[i].slice(0, 4);
      if ((i === first || y !== dates[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    }
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 标题（导出版）

    // 曲线（红正绿负）
    ctx.lineJoin = 'round';
    for (let i = first; i <= last; i++) {
      const v = roll[i];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      const x = xs(i), y = yP(v);
      ctx.strokeStyle = (v >= 0) ? C_PG : C_NEG;
      ctx.lineWidth = exportMode ? 5 : 2.2;
      ctx.beginPath();
      ctx.moveTo(x - (exportMode ? 3 : 1.5), y);
      ctx.lineTo(x + (exportMode ? 3 : 1.5), y);
      ctx.stroke();
    }

    // 末端标签
    const xl = xs(last), yl = yP(roll[last]);
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.arc(xl, yl, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = (roll[last] >= 0) ? C_PG : C_NEG;
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${roll[last].toFixed(1)}%`, xl + (exportMode ? 16 : 10), yl);

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    const items = [
      { c: C_PG, label: `${winLabel}滚动年化 > 0` },
      { c: C_NEG, label: `${winLabel}滚动年化 < 0` },
    ];
    let lx = lx0;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly0 - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.label, lx + (exportMode ? 56 : 24), ly0);
      lx += ctx.measureText(it.label).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.textAlign = 'right';
    }

    // hover（屏幕版）
    if (!exportMode) {
      canvas.__tmData = { dates, roll, first, last, xs, yP, rollKey, winLabel };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__tmData;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const idx = Math.round((sx - padL) / (W - padL - padR) * (D.last - D.first)) + D.first;
          const i = Math.max(D.first, Math.min(D.last, idx));
          const v = D.roll[i];
          if (v === null || v === undefined || Number.isNaN(v)) { window.AK.tooltip.hide(); return; }
          const color = (v >= 0) ? C_PG : C_NEG;
          window.AK.tooltip.show(ev, `<b>${D.dates[i]}</b><br><span style="color:${color}">●</span> ${D.winLabel}滚动年化：<b>${v.toFixed(2)}%</b>`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.TM_render = function (data) {
    const wrap = document.getElementById('panelTimingBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    // 维度选择器（1/3/5/7 年）——放在图表上方（老钱要求）
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-controls';
    ctrl.innerHTML = `<div class="ctrl-group"><label>维度</label><span class="seg" id="tm-win"></span></div>`;
    wrap.appendChild(ctrl);
    const seg = ctrl.querySelector('#tm-win');
    WINDOWS.forEach((w) => {
      const b = document.createElement('button');
      b.textContent = `${w.label}滚动年化`;
      if (w.key === state.rollKey) b.classList.add('active');
      b.addEventListener('click', () => {
        state.rollKey = w.key;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1, rollKey: w.key });
      });
      seg.appendChild(b);
    });

    const canvas = document.createElement('canvas');
    canvas.id = 'timing';
    wrap.appendChild(canvas);

    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1, rollKey: state.rollKey }));
    });

    window.AK.bindExportButtons({
      timing: (off) => draw(off, data, { exportMode: true, scale: 1, rollKey: state.rollKey })
    });
  };
})();
/**
 * 面板 12：神奇择时指标（中证A500全收益 vs 偏股混合 vs 偏债混合基金指数）
 * 数据：fund_index.json { series: { 'A500TR.CSI': {...}, '885001.WI': {...}, '885003.WI': {...} } }
 * 展示：三类资产净值（2005 起点 = 100），对数坐标，末端 CAGR
 * 思路：A股宽基全收益 vs 偏股/偏债混合的相对强弱 = 股债配置的择时温度计
 */
(function () {
  'use strict';

  const C_A500 = '#5AAEF3';   // 蓝
  const C_EQUITY = '#E65A56'; // 红（偏股）
  const C_DEBT = '#333333';   // 深灰（偏债）

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 640;
    const padL = exportMode ? 190 : 96;
    const padR = exportMode ? 200 : 118;
    const padT = exportMode ? 70 : 60;
    const padB = exportMode ? 50 : 46;

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

    const a = data.series && data.series['A500TR.CSI'];
    const e = data.series && data.series['885001.WI'];
    const d = data.series && data.series['885003.WI'];
    if (!a || !e || !d) return;

    // 统一日期轴（公共起点 2005-01-04 起）
    const t0 = '2005-01-04';
    const aIdx0 = a.dates.findIndex((x) => x >= t0);
    const eIdx0 = e.dates.findIndex((x) => x >= t0);
    const dIdx0 = d.dates.findIndex((x) => x >= t0);
    if (aIdx0 < 0 || eIdx0 < 0 || dIdx0 < 0) return;
    const aD = a.dates.slice(aIdx0);
    const eDates = e.dates.slice(eIdx0);
    const dD = d.dates.slice(dIdx0);
    const master = [];
    for (const x of aD) master.push(x);
    for (const x of eDates) if (!master.includes(x)) master.push(x);
    for (const x of dD) if (!master.includes(x)) master.push(x);
    master.sort();
    const n = master.length;

    const aMap = new Map(); for (let i = aIdx0; i < a.dates.length; i++) aMap.set(a.dates[i], a.values[i]);
    const eMap = new Map(); for (let i = eIdx0; i < e.dates.length; i++) eMap.set(e.dates[i], e.values[i]);
    const dMap = new Map(); for (let i = dIdx0; i < d.dates.length; i++) dMap.set(d.dates[i], d.values[i]);
    const aBase = a.values[aIdx0] || 1, eBase = e.values[eIdx0] || 1, dBase = d.values[dIdx0] || 1;
    const aNorm = master.map((dt) => (aMap.has(dt) ? aMap.get(dt) / aBase * 100 : null));
    const eNorm = master.map((dt) => (eMap.has(dt) ? eMap.get(dt) / eBase * 100 : null));
    const dNorm = master.map((dt) => (dMap.has(dt) ? dMap.get(dt) / dBase * 100 : null));

    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
    let yMin = Infinity, yMax = -Infinity;
    aNorm.concat(eNorm, dNorm).forEach((v) => { if (v !== null && v > 0) { const lv = Math.log(v); if (lv < yMin) yMin = lv; if (lv > yMax) yMax = lv; } });
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    const yPad = (yMax - yMin) * 0.05 || 0.1; yMin -= yPad; yMax += yPad;
    const ys = (v) => padT + (1 - (Math.log(v) - yMin) / (yMax - yMin)) * (H - padT - padB);

    // 网格（对数）
    const gridLevels = [100, 200, 400, 800, 1600, 3200];
    ctx.lineWidth = 1;
    gridLevels.forEach((lv) => {
      if (lv < Math.exp(yMin) || lv > Math.exp(yMax)) return;
      const y = ys(lv);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${lv}`, padL - 12, y);
    });

    // x 轴年份
    const yearTicks = new Set();
    master.forEach((dt, i) => {
      const y = dt.slice(0, 4);
      if ((i === 0 || y !== master[i - 1].slice(0, 4)) && +y % 2 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), H - padB + 8));

    // 曲线（偏债先画、偏股中间、A500后画）
    function poly(norm, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      for (let i = 0; i < n; i++) {
        const v = norm[i];
        if (v === null || v === undefined || Number.isNaN(v) || v <= 0) { started = false; continue; }
        const x = xs(i), y = ys(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    poly(dNorm, C_DEBT, exportMode ? 4 : 1.8);
    poly(eNorm, C_EQUITY, exportMode ? 4 : 1.8);
    poly(aNorm, C_A500, exportMode ? 5 : 2.2);

    // ── hover 纵向跟随虚线 ──
    if (!exportMode && opts.hoverIdx !== undefined && opts.hoverIdx !== null) {
      const hx = xs(opts.hoverIdx);
      window.AK.drawHoverVLine(ctx, hx, padT, H - padB, scale);
    }

    // 末端 CAGR 标签（防重叠）
    const cagr = (norm) => {
      let li = -1;
      for (let i = n - 1; i >= 0; i--) { if (norm[i] !== null && norm[i] > 0) { li = i; break; } }
      if (li < 0) return null;
      let fi = -1;
      for (let i = 0; i <= li; i++) { if (norm[i] !== null && norm[i] > 0) { fi = i; break; } }
      if (fi < 0) return null;
      const v0 = norm[fi], v1 = norm[li];
      const y0 = Date.parse(master[fi]), y1 = Date.parse(master[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      return { x: xs(li), y: ys(v1), cagr: (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0, v1 };
    };
    const eA = cagr(aNorm), eE = cagr(eNorm), eD = cagr(dNorm);
    const ends = [];
    if (eA) ends.push({ ...eA, color: C_A500 });
    if (eE) ends.push({ ...eE, color: C_EQUITY });
    if (eD) ends.push({ ...eD, color: C_DEBT });
    ends.sort((p, q) => q.y - p.y);
    ctx.font = (exportMode ? 28 : 13) + 'px NotoSansSC, sans-serif';
    const used = [];
    ends.forEach((e, i) => {
      const txt = `${(e.cagr * 100).toFixed(1)}%`;
      const tw = ctx.measureText(txt).width;
      const side = (i === 0) ? 1 : -1;
      const bx = side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12) - tw;
      const ha = side === 1 ? 'left' : 'right';
      let dy = 0;
      for (let k = 0; k < 20; k++) {
        const cand = e.y + dy;
        if (!used.some((u) => Math.abs(u - cand) < (exportMode ? 34 : 16) * 1.2)) break;
        dy = (k % 2 === 0) ? dy - (exportMode ? 34 : 16) : dy + (exportMode ? 34 : 16);
      }
      const labelY = e.y + dy;
      used.push(labelY);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x + (side === 1 ? (exportMode ? 8 : 6) : -(exportMode ? 8 : 6)), e.y);
      ctx.lineTo(side === 1 ? e.x + (exportMode ? 20 : 12) : e.x - (exportMode ? 20 : 12), labelY);
      ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.textAlign = ha; ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx, labelY);
    });

    // 图例（横向单行，按CAGR从高到低排序，不带数字）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';

    // 计算三条线的CAGR，按从高到低排序
    const calcCagr = (norm) => {
      let li = -1;
      for (let i = n - 1; i >= 0; i--) { if (norm[i] !== null && norm[i] > 0) { li = i; break; } }
      let fi = -1;
      for (let i = 0; i <= li; i++) { if (norm[i] !== null && norm[i] > 0) { fi = i; break; } }
      if (fi < 0 || li < 0) return -Infinity;
      const v0 = norm[fi], v1 = norm[li];
      const y0 = Date.parse(master[fi]), y1 = Date.parse(master[li]);
      const years = (y1 - y0) / (365.25 * 24 * 3600 * 1000);
      return (years > 0 && v0 > 0) ? Math.pow(v1 / v0, 1 / years) - 1 : 0;
    };
    const items = [
      { c: C_A500, label: '中证A500全收益', cagr: calcCagr(aNorm) },
      { c: C_EQUITY, label: '偏股混合基金', cagr: calcCagr(eNorm) },
      { c: C_DEBT, label: '偏债混合基金', cagr: calcCagr(dNorm) },
    ].sort((a, b) => b.cagr - a.cagr);
    let lx = lx0;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly0 - (exportMode ? 8 : 4), exportMode ? 40 : 16, exportMode ? 8 : 3);
      ctx.fillStyle = '#333333';
      ctx.fillText(it.label, lx + (exportMode ? 56 : 24), ly0);
      lx += ctx.measureText(it.label).width + (exportMode ? 56 : 24) + (exportMode ? 52 : 24);
    });

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.textAlign = 'right';
    }

    // hover（屏幕版）
    if (!exportMode && opts.bindHover !== false) {
      canvas.__fdData = { master, aNorm, eNorm, dNorm, xs, data, drawFn: draw };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__fdData;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) {
            window.AK.tooltip.hide();
            D.drawFn(canvas, D.data, { exportMode: false, scale: window.devicePixelRatio || 1 });
            return;
          }
          const idx = Math.max(0, Math.min(D.master.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.master.length - 1))));

          // 重绘带竖线
          D.drawFn(canvas, D.data, { exportMode: false, scale: window.devicePixelRatio || 1, hoverIdx: idx });

          let html = `<b>${D.master[idx]}</b><br>`;
          if (D.aNorm[idx] !== null) html += `<span style="color:${C_A500}">●</span> A500全收益：<b>${D.aNorm[idx].toFixed(1)}</b><br>`;
          if (D.eNorm[idx] !== null) html += `<span style="color:${C_EQUITY}">●</span> 偏股混合：<b>${D.eNorm[idx].toFixed(1)}</b><br>`;
          if (D.dNorm[idx] !== null) html += `<span style="color:${C_DEBT}">●</span> 偏债混合：<b>${D.dNorm[idx].toFixed(1)}</b>`;
          window.AK.tooltip.show(ev, html.replace(/<br>$/, ''));
        });
        canvas.addEventListener('mouseleave', () => {
          window.AK.tooltip.hide();
          const D = canvas.__fdData;
          if (D) D.drawFn(canvas, D.data, { exportMode: false, scale: window.devicePixelRatio || 1 });
        });
      }
    }
  }

  window.FI_render = function (data) {
    const wrap = document.getElementById('panelFundBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'fundIndex';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      fundIndex: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
/**
 * 面板 13：宽基指数覆盖范围（格子网）
 * 数据：coverage.json { indexes: [{code, name, count}] }
 * 展示：1 格 = 50 只成分股；行内格子按指数分层逻辑摆放——
 *       沪深300(0–300) → 中证500(300–800，紧接300后) → 中证1000(800–1800) → 中证2000(1800–3800)，
 *       中证全指从 0 全覆盖，中证A500 全市场选样从 0 起；数量标签固定最右侧，杜绝重叠。
 */
(function () {
  'use strict';

  const PER = 50;           // 1 格 = 50 只
  // 渲染顺序 + 格子起始格位（格单位，基于市值分层逻辑）
  const ORDER = [
    { code: '000300', start: 0 },
    { code: '000905', start: 6 },     // 中证500 = 剔除300后的第301–800名 → 紧接300后
    { code: '000852', start: 16 },    // 中证1000 → 801–1800名
    { code: '932000', start: 36 },    // 中证2000 → 1801–3800名
    { code: '000985', start: 0 },     // 中证全指 → 全覆盖
    { code: '000510', start: 0 },     // 中证A500 → 全市场选样
  ];
  const PALETTE = ['#5AAEF3', '#333333', '#E65A56', '#6D61E4', '#5B6E96', '#62D9AD'];

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const rowH = exportMode ? 120 : 58;
    const padL = exportMode ? 360 : 190;
    const padR = exportMode ? 260 : 150;
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 50;
    const colW = exportMode ? 18 : 9;
    const gap = exportMode ? 3 : 1.5;
    const cellStep = colW + gap;

    // 按 ORDER 排序 + 起格
    const byCode = {};
    (data.indexes || []).forEach((it) => { byCode[it.code] = it; });
    const rows = ORDER
      .map((o) => (byCode[o.code] ? { ...byCode[o.code], start: o.start } : null))
      .filter(Boolean);
    if (!rows.length) return;

    // 总格数（中证全指最宽）
    const maxEnd = Math.max(...rows.map((r) => r.start + Math.ceil(r.count / PER)));
    const totalW = maxEnd * cellStep;
    const x0 = (W - padL - padR - totalW) / 2 + padL;   // 格子区水平居中
    const nRows = rows.length;
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

    // 顶部分层刻度（300 / 800 / 1800 / 3800 边界格线）
    const segBorders = [6, 16, 36, 76];  // 格位边界（300,800,1800,3800 只）
    ctx.strokeStyle = '#E8E8E8';
    ctx.lineWidth = 1;
    segBorders.forEach((gb) => {
      const gx = x0 + gb * cellStep;
      ctx.beginPath(); ctx.moveTo(gx, padT - 8); ctx.lineTo(gx, padT + nRows * rowH + 6); ctx.stroke();
    });

    // 行 + 格子（按分层起始位摆放）
    rows.forEach((it, i) => {
      const y = padT + i * rowH;
      const cells = Math.ceil(it.count / PER);
      const color = PALETTE[i % PALETTE.length];

      // 行标签
      ctx.fillStyle = '#333333';
      ctx.font = (exportMode ? 34 : 15) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(it.name, padL - (exportMode ? 24 : 14), y + rowH / 2);

      // 格子（起始 = 分层格位）
      for (let c = 0; c < cells; c++) {
        const gx = x0 + (it.start + c) * cellStep;
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

      // 数量标签（固定最右侧，避免与格子重叠）
      ctx.fillStyle = '#555555';
      ctx.font = (exportMode ? 30 : 13) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${it.count.toLocaleString()} 只`, W - padR - (exportMode ? 20 : 10), y + rowH / 2);
    });

    // 图例（横向单行）
    const lx0 = exportMode ? padL + 20 : padL + 10;
    const ly0 = exportMode ? 30 : 20;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = (exportMode ? 28 : 14) + 'px NotoSansSC, sans-serif';
    let lx = lx0;
    rows.forEach((it, i) => {
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
    }

    // hover（屏幕版）：显示 该指数覆盖 X 只 ≈ Y 格
    if (!exportMode) {
      canvas.__cvData = { rows, padL, x0, cellStep, rowH, padT, PER };
      if (!canvas.__hoverBound) {
        canvas.__hoverBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__cvData;
          const { x, y } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          const sy = y / (window.devicePixelRatio || 1);
          const i = Math.floor((sy - D.padT) / D.rowH);
          if (i < 0 || i >= D.rows.length) { window.AK.tooltip.hide(); return; }
          const it = D.rows[i];
          const cells = Math.ceil(it.count / D.PER);
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
/**
 * A股看板 · 主控（懒加载引擎）
 * 首屏只加载 Banner + 申万热力图（轻量），其余面板进入视口才拉取数据并渲染。
 * 参考美股复盘看板 panels.js 懒加载引擎：面板注册表 + IntersectionObserver + 数据缓存。
 */
(function () {
  'use strict';

  const AK = window.AK;

  // ── 数据映射（key → JSON URL）──
  const DATA = {
    banner: 'data/banner.json',
    heatmap: 'data/sw_returns.json',
    longgrowth: 'data/panel_longgrowth.json',
    industry: 'data/industry_heat.json',
    turnover: 'data/market_turnover.json',
    returnDecomp: 'data/return_decomp.json',
    investor: 'data/investor_structure.json',
    huazheng: 'data/panel_huazheng.json',
    fearGreed: 'data/fear_greed.json',
    fundIndex: 'data/fund_index.json',
    coverage: 'data/coverage.json',
    wideBase: 'data/wide_base.json',
    valuation: 'data/index_valuation.json',
    assetAlloc: 'data/asset_allocation.json',
    trendTemp: 'data/trend_temperature.json'
  };

  // ── 面板注册表：进入视口 → 拉数据 → 渲染（timing 与 fund 共用 fund_index.json）──
  const PANELS = [
    { id: 'panel-long',      key: 'longgrowth',    render: (d) => window.LG_render(d) },
    { id: 'panel-huazheng',  key: 'huazheng',      render: (d) => window.HZ_render(d) },
    { id: 'panel-coverage',  key: 'coverage',      render: (d) => window.CV_render(d) },
    { id: 'panel-widebase',  key: 'wideBase',      render: (d) => window.WB_render(d) },
    { id: 'panel-valuation', key: 'valuation',     render: (d) => window.IV_render(d) },
    { id: 'panel-return',    key: 'returnDecomp',  render: (d) => window.RD_render(d) },
    { id: 'panel-asset',     key: 'assetAlloc',    render: (d) => window.AA_render(d) },
    { id: 'panel-turnover',  key: 'turnover',      render: (d) => window.MT_render(d) },
    { id: 'panel-industry',  key: 'industry',      render: (d) => window.IH_render(d) },
    { id: 'panel-trend',     key: 'trendTemp',     render: (d) => window.TT_render(d) },
    { id: 'panel-fear',      key: 'fearGreed',     render: (d) => window.FG_render(d) },
    { id: 'panel-fund',      key: 'fundIndex',     render: (d) => window.FI_render(d) },
    { id: 'panel-timing',    key: 'fundIndex',     render: (d) => window.TM_render(d) },
    { id: 'panel-investor',  key: 'investor',      render: (d) => window.IS_render(d) }
  ];

  // ── 导航高亮：当前面板对应导航项加 active（红下划线）──
  const navLinks = Array.from(document.querySelectorAll('.site-nav a[href^="#panel-"]'));
  const navIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = '#' + e.target.id;
      navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === id));
      if (history.replaceState) history.replaceState(null, '', id);
    });
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  function bindNavHighlight() {
    PANELS.forEach((p) => {
      const el = document.getElementById(p.id);
      if (el) navIO.observe(el);
    });
  }

  // ── 数据缓存（同一 key 只 fetch 一次）──
  const cache = {};
  async function loadData(key) {
    if (cache[key]) return cache[key];
    const url = DATA[key];
    const p = AK.fetchJSON(url).then((d) => {
      cache[key] = d;
      return d;
    });
    cache[key] = p;
    return p;
  }

  function applyAsOf(panelId, d) {
    if (!d || typeof d !== 'object') return;
    const v = d.generated || d.asOf || d.updated;
    if (!v) return;
    const el = document.querySelector('#' + panelId + ' .panel-asof');
    if (el) el.textContent = '数据截至 ' + String(v).slice(0, 10);
  }

  async function init() {
    try {
      // ── 首屏立即加载：Banner + 申万热力图（轻量）──
      const [bannerRes, heatmapRes] = await Promise.allSettled([
        loadData('banner'),
        loadData('heatmap')
      ]);

      const asOfList = [];
      [bannerRes, heatmapRes].forEach((p) => {
        if (p.status === 'fulfilled') {
          const d = p.value;
          if (d && d.generated) asOfList.push(String(d.generated).slice(0, 10));
          if (d && d.asOf) asOfList.push(d.asOf);
        }
      });

      // 顶部动态 Banner
      try {
        if (bannerRes.status === 'fulfilled' && bannerRes.value && window.BN_render) {
          window.BN_render(bannerRes.value);
        }
      } catch (e) { console.error('[banner]', e); }

      // 顶部新鲜度
      AK.renderFreshness(asOfList);

      // 申万热力图（首屏）
      try {
        if (heatmapRes.status === 'fulfilled') renderHeatmap(heatmapRes.value);
        else showPanelError('panel-heatmap', '热力图数据加载失败');
      } catch (e) {
        console.error('[heatmap]', e);
        showPanelError('panel-heatmap', '热力图渲染失败：' + e.message);
      }

      // 损失表（同一份 sw_returns）
      if (window.SW_drawLossTable) {
        try { renderLossTable(); } catch (e) { console.error('[loss]', e); }
      }

      // ── 懒加载引擎：面板进入视口（提前 600px 预载）→ 拉数据 → 渲染 ──
      const loaded = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const panel = PANELS.find((p) => p.id === entry.target.id);
          if (!panel || loaded.has(panel.id)) return;
          loaded.add(panel.id);
          loadPanel(panel);
        });
      }, { rootMargin: '600px 0px' });

      PANELS.forEach((p) => {
        const el = document.getElementById(p.id);
        if (el) io.observe(el);
      });

      // 兜底：所有面板都已在视口内但 observer 未触发时，直接渲染剩余面板
      PANELS.forEach((p) => {
        if (!loaded.has(p.id)) {
          const el = document.getElementById(p.id);
          if (el && el.getBoundingClientRect().top < window.innerHeight + 600) {
            loaded.add(p.id);
            loadPanel(p);
          }
        }
      });
    } catch (err) {
      console.error('[A股看板] 初始化失败', err);
      showPanelError('panel-heatmap', '初始化失败：' + err.message);
    }
  }

  async function loadPanel(panel) {
    try {
      const d = await loadData(panel.key);
      if (!d) { showPanelError(panel.id, panel.key + ' 数据加载失败'); return; }
      panel.render(d);
      applyAsOf(panel.id, d);
    } catch (e) {
      console.error('[' + panel.id + ']', e);
      showPanelError(panel.id, '数据渲染失败：' + e.message);
    }
  }

  function renderHeatmap(raw) {
    const canvas = document.getElementById('heatmap');
    if (!canvas) return;
    applyAsOf('panel-heatmap', raw);
    // 原始 JSON → heatmap.js 期望的 { years, rows, metricsMeta } 结构
    const full = normalizeHeatmap(raw);
    let cur = full;
    const draw = (opts) => window.SW_drawHeatmap(canvas, cur, opts);

    // 手机端年份截断：默认近 5 年，可切「全部年份」（桌面自动隐藏）
    const segEl = document.createElement('div');
    segEl.className = 'hm-range-seg';
    segEl.innerHTML = '<button type="button" data-r="5">近5年</button><button type="button" data-r="all" class="on">全部年份</button>';
    const wrap = canvas.parentElement;
    if (wrap) wrap.insertBefore(segEl, canvas);
    segEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (b.dataset.r === '5') {
        const n = Math.min(5, full.years.length);
        cur = { ...full, years: full.years.slice(-n), rows: full.rows.map((r) => ({ ...r, rets: (r.rets || []).slice(-n) })) };
      } else {
        cur = full;
      }
      draw({ exportMode: false, scale: window.devicePixelRatio || 1 });
    });
    if (window.innerWidth <= 768) {
      segEl.style.display = 'inline-flex';
      segEl.querySelector('button[data-r="5"]').click();
    } else {
      segEl.style.display = 'none';
    }
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });

    // 导出按钮（热力图 exportMode 自带标题，只补来源）
    const be = document.getElementById('btnExportHeatmap');
    if (be && !be.__bound) {
      be.__bound = true;
      const orig = be.innerHTML;
      be.addEventListener('click', async () => {
        be.disabled = true; be.textContent = '…';
        try {
          await window.AK.exportPNG(canvas, 3000, '申万行业热力图.png',
            (off) => window.SW_drawHeatmap(off, full, { exportMode: true, scale: 1 }),
            { title: '申万一级行业年度涨跌幅 · 长期 CAGR',
              desc: '2005 — 2026 · 31 个一级行业 · 红涨绿跌 · 右侧 4 列为年化复合收益率',
              source: '数据来源：A股看板 · ashare.laoqianriritan.com' });
          be.textContent = '✓';
        } catch (e) { console.error(e); be.textContent = '!'; }
        setTimeout(() => { be.disabled = false; be.innerHTML = orig; }, 1200);
      });
    }
  }

  function normalizeHeatmap(raw) {
    const years = [...raw.years.map(String), '2026*'];
    const metricsMeta = raw.metrics_meta && raw.metrics_meta.columns
      ? raw.metrics_meta.columns
      : [];
    // sw_returns.json 的 data 为 { 行业名: {rets, ytd2026, metrics} }，转成数组并追加 2026 YTD + CAGR 列
    const order = window.SW_ROW_ORDER || Object.keys(raw.data || {});
    const rows = order.map((name) => {
      const item = (raw.data || {})[name];
      if (!item) return null;
      const rets = [...(item.rets || [])];
      rets.push(item.ytd2026 !== undefined && item.ytd2026 !== null ? item.ytd2026 : null);
      const metrics = metricsMeta.map((col) =>
        item.metrics && item.metrics[col.key] !== undefined ? item.metrics[col.key] : null
      );
      return { name, rets, metrics };
    }).filter(Boolean);
    return { years, rows, metricsMeta };
  }

  function renderLossTable() {
    const canvas = document.getElementById('lossTable');
    if (!canvas) return;
    // 数据截至：与热力图同源 sw_returns.json
    loadData('heatmap').then((d) => applyAsOf('panel-loss', d)).catch(() => {});
    const draw = (opts) => window.SW_drawLossTable(canvas, opts);
    draw({ exportMode: false, scale: window.devicePixelRatio || 1 });

    // 导出按钮（抄底数学题 exportMode 自带标题，只补来源）
    const be = document.getElementById('btnExportLossTable');
    if (be && !be.__bound) {
      be.__bound = true;
      const orig = be.innerHTML;
      be.addEventListener('click', async () => {
        be.disabled = true; be.textContent = '…';
        try {
          await window.AK.exportPNG(canvas, 3000, '抄底数学题.png',
            (off) => window.SW_drawLossTable(off, { exportMode: true, scale: 1 }),
            { title: '关于抄底的一道基础数学题',
              desc: '不同买入价与现价的亏损对照表 · 跌得越多，反弹回本越难',
              source: '数据来源：A股看板 · ashare.laoqianriritan.com' });
          be.textContent = '✓';
        } catch (e) { console.error(e); be.textContent = '!'; }
        setTimeout(() => { be.disabled = false; be.innerHTML = orig; }, 1200);
      });
    }
  }

  function showPanelError(panelId, msg) {
    const el = document.getElementById(panelId);
    if (!el) return;
    const body = el.querySelector('.panel-body');
    if (!body) return;
    body.innerHTML = '<div class="panel-error">⚠ ' + msg + '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindNavHighlight(); init(); });
  } else {
    bindNavHighlight();
    init();
  }
})();
/**
 * 面板：股债性价比 · ERP（德邦《A股动静框架之静态指标》· 资产联动）
 * 数据：asset_allocation.json
 *   [{ date:'2007-01', pe_ttm, earning_yield, yield, erp, rel_ratio, erp_pct }]
 *   中证800 PE-TTM 倒数（盈利收益率）− 中债10Y国债收益率 = ERP
 * 展示：上子图 ERP（%）+ 当前分位；下子图 股债相对收益率（盈利收益率 / 10Y 国债，相除）
 */
(function () {
  'use strict';

  const COL = { erp: '#E65A56', rel: '#5AAEF3', zero: '#CCCCCC', pctBand: '#F5C0BE' };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 220 : 140;
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 40;

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

    const rows = data || [];
    const dates = rows.map((r) => r.date);
    const n = dates.length;
    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);

    // 两个子图的绘图区
    const gap = exportMode ? 50 : 40;
    const plotTop = padT, plotBottom = H - padB;
    const half = (plotBottom - plotTop - gap) / 2;
    const box1 = { top: plotTop, h: half };           // ERP
    const box2 = { top: plotTop + half + gap, h: half }; // 股债相对收益率

    function yMap(v, ymin, ymax, box) {
      return box.top + (1 - (v - ymin) / (ymax - ymin)) * box.h;
    }

    // 子图 1：ERP
    const erp = rows.map((r) => r.erp);
    let eMin = Math.min(...erp), eMax = Math.max(...erp);
    const ePad = (eMax - eMin) * 0.08 || 0.3;
    eMin -= ePad; eMax += ePad;

    // 网格
    ctx.lineWidth = 1;
    [0].forEach((lv) => {
      if (lv < eMin || lv > eMax) return;
      const y = yMap(lv, eMin, eMax, box1);
      ctx.strokeStyle = '#EDEDED';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    });
    const yticks1 = 5;
    for (let k = 0; k <= yticks1; k++) {
      const v = eMin + (eMax - eMin) * k / yticks1;
      const y = yMap(v, eMin, eMax, box1);
      ctx.strokeStyle = (k === yticks1) ? 'transparent' : '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(1) + '%', padL - 12, y);
    }

    // 每月纵向参考线（先画，曲线在上层）
    const monthTicks = new Set();
    dates.forEach((d, i) => {
      const ym = d.slice(0, 7);
      if (i === 0 || ym !== dates[i - 1].slice(0, 7)) monthTicks.add(i);
    });
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 1;
    monthTicks.forEach((i) => {
      const x = xs(i);
      ctx.beginPath(); ctx.moveTo(x, box1.top); ctx.lineTo(x, box1.top + box1.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, box2.top); ctx.lineTo(x, box2.top + box2.h); ctx.stroke();
    });

    // 分位着色带：ERP 当前分位 → 底部注释
    const lastErp = erp[n - 1];
    const lastPct = rows[n - 1].erp_pct !== undefined ? rows[n - 1].erp_pct : null;

    // ERP 曲线 + 末端
    ctx.strokeStyle = COL.erp;
    ctx.lineWidth = exportMode ? 6 : 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xs(i), y = yMap(erp[i], eMin, eMax, box1);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 末端点 + 标签
    const ey = yMap(lastErp, eMin, eMax, box1);
    ctx.fillStyle = '#5AAEF3';
    ctx.beginPath(); ctx.arc(xs(n - 1), ey, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.erp;
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${lastErp.toFixed(2)}%`, xs(n - 1) + (exportMode ? 20 : 12), ey);

    // 子图 1 标题
    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('股权风险溢价 ERP（中证800 盈利收益率 − 中债10Y国债）', padL, box1.top - (exportMode ? 34 : 18));
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    if (lastPct !== null) {
      ctx.fillText(`当前 ${lastErp.toFixed(2)}% · 历史分位 ${(lastPct * 100).toFixed(0)}% · ${dates[0]} — ${dates[n - 1]}`, padL, box1.top - (exportMode ? 8 : 4));
    }

    // ── 子图 2：股债相对收益率（相除）──
    const rel = rows.map((r) => r.rel_ratio);
    let rMin = Math.min(...rel), rMax = Math.max(...rel);
    const rPad = (rMax - rMin) * 0.08 || 0.1;
    rMin -= rPad; rMax += rPad;

    for (let k = 0; k <= yticks1; k++) {
      const v = rMin + (rMax - rMin) * k / yticks1;
      const y = yMap(v, rMin, rMax, box2);
      ctx.strokeStyle = (k === yticks1) ? 'transparent' : '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(1) + 'x', padL - 12, y);
    }
    ctx.strokeStyle = COL.rel;
    ctx.lineWidth = exportMode ? 6 : 2.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xs(i), y = yMap(rel[i], rMin, rMax, box2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const ry = yMap(rel[n - 1], rMin, rMax, box2);
    ctx.fillStyle = '#E65A56';
    ctx.beginPath(); ctx.arc(xs(n - 1), ry, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.rel;
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${rel[n - 1].toFixed(2)}x`, xs(n - 1) + (exportMode ? 20 : 12), ry);

    // ── 阶段性高点标记 ──
    function findPeaks(arr, window) {
      const peaks = [];
      // 中段：前后都有足够窗口
      for (let i = window; i < arr.length - window; i++) {
        let isPeak = true;
        for (let j = i - window; j <= i + window; j++) {
          if (j !== i && arr[j] > arr[i]) { isPeak = false; break; }
        }
        if (isPeak) peaks.push(i);
      }
      // 末尾：从 (arr.length - window) 到最后，找区间最高点
      const tailStart = arr.length - window;
      if (tailStart > 0) {
        let tailMax = -Infinity, tailIdx = -1;
        for (let i = tailStart; i < arr.length; i++) {
          if (arr[i] > tailMax) { tailMax = arr[i]; tailIdx = i; }
        }
        if (tailIdx > 0 && tailMax > arr[tailStart - 1] && !peaks.includes(tailIdx)) {
          peaks.push(tailIdx);
        }
      }
      return peaks.sort((a, b) => a - b);
    }
    function drawPeakLabels(peaks, arr, yMin, yMax, box, color) {
      ctx.fillStyle = color;
      ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      peaks.forEach((i) => {
        const x = xs(i), y = yMap(arr[i], yMin, yMax, box);
        // 小点
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, exportMode ? 5 : 2.5, 0, Math.PI * 2); ctx.fill();
        // 日期标签 yyyy.mm
        const d = dates[i];
        const label = d.slice(0, 4) + '.' + d.slice(5, 7);
        ctx.fillText(label, x, y - (exportMode ? 12 : 6));
      });
    }
    const w = 12; // 约1年窗口
    drawPeakLabels(findPeaks(erp, w), erp, eMin, eMax, box1, COL.erp);
    drawPeakLabels(findPeaks(rel, w), rel, rMin, rMax, box2, COL.rel);

    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('股债相对收益率（中证800盈利收益率 ÷ 中债10Y国债，相除）', padL, box2.top - (exportMode ? 34 : 18));

    // ── 共享 X 轴：年份标签 ──
    const yearTicks = new Set();
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % 3 === 0) yearTicks.add([y, i]);
    });
    ctx.fillStyle = '#999999';
    ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    yearTicks.forEach(([y, i]) => ctx.fillText(y, xs(i), plotBottom + (exportMode ? 16 : 8)));

    // 标题（导出版）

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${dates[n - 1]} · 乐咕乐股 PE-TTM + akshare 中美国债收益率`, padL, H - 40);
      ctx.textAlign = 'right';
    }

    // ── 悬浮提示 ──
    if (!exportMode) {
      canvas.__aaData = { rows, dates, xs, box1, box2, yMap1: (v) => yMap(v, eMin, eMax, box1), yMap2: (v) => yMap(v, rMin, rMax, box2) };
      if (!canvas.__aaBound) {
        canvas.__aaBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__aaData;
          if (!D || !D.dates.length) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          const nn = D.dates.length;
          const idx = Math.round((sx - padL) / (W - padL - padR) * (nn - 1));
          const i = Math.max(0, Math.min(nn - 1, idx));
          const r = D.rows[i];
          window.AK.tooltip.show(ev,
            `<b>${r.date}</b><br>` +
            `<span style="color:#E65A56">●</span> ERP：<b>${r.erp.toFixed(2)}%</b><br>` +
            `<span style="color:#888">●</span> 中证800 PE-TTM：<b>${r.pe_ttm.toFixed(1)}x</b><br>` +
            `<span style="color:#888">●</span> 盈利收益率：<b>${r.earning_yield.toFixed(2)}%</b><br>` +
            `<span style="color:#888">●</span> 中债10Y：<b>${r.yield.toFixed(2)}%</b><br>` +
            `<span style="color:#5AAEF3">●</span> 股债相对：<b>${r.rel_ratio.toFixed(2)}x</b>`);
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.AA_render = function (data) {
    data = (data && data.items) || data;  // JSON 为 { generated, items } 包装时解包
    const wrap = document.getElementById('panelAssetBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'assetAllocation';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      assetAllocation: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
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
    const items = data || [];
    const n = items.length;
    const padL = exportMode ? 420 : 190;
    const padR = exportMode ? 380 : 200;
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 44;
    const W = exportMode ? 3000 : 1480;
    // 屏幕模式高度随指数行数自适应（14 行时 740px），导出固定 1500
    const H = exportMode ? 1500 : Math.max(680, padT + padB + n * 46);

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

    // 条形区（分位刻度：轨道即历史分位 0-100 色阶）
    const plotLeft = padL, plotRight = W - padR;
    const plotTop = padT, plotBottom = H - padB;
    const rowH = (plotBottom - plotTop) / n;
    const barH = Math.min(rowH * 0.52, exportMode ? 44 : 20);
    const pxPct = (p) => plotLeft + (p / 100) * (plotRight - plotLeft);

    // 底部 x 轴：分位刻度（与红绿轨道一致：0=历史最低 … 100=历史最高）
    ctx.lineWidth = 1;
    [0, 20, 40, 60, 80, 100].forEach((p) => {
      const x = pxPct(p);
      ctx.strokeStyle = '#F0F0F0';
      ctx.beginPath(); ctx.moveTo(x, plotTop); ctx.lineTo(x, plotBottom); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(p), x, plotBottom + (exportMode ? 16 : 8));
    });
    ctx.fillStyle = '#AAAAAA';
    ctx.font = (exportMode ? 20 : 10) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('历史分位 %', plotRight + (exportMode ? 16 : 10), plotBottom + (exportMode ? 16 : 8));

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

      // 当前 PE 位置刻度线 → 按历史分位定位（与红绿轨道 0-100 对齐）
      const xv = pxPct(it.pct);
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

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      const latest = items[0] ? items[0].hist[items[0].hist.length - 1][0] : '';
      ctx.fillText(`数据截至 ${latest} · 乐咕乐股 legulegu PE-TTM 月度`, padL, H - 40);
      ctx.textAlign = 'right';
    }

    // ── 悬浮提示 ──
    if (!exportMode) {
      canvas.__ivData = { items, plotLeft, plotRight, plotTop, plotBottom, rowH };
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
/**
 * 面板：市场趋势温度（德邦《A股动静框架之静态指标》· 市场交易/情绪）
 * 数据：trend_temperature.json
 *   { stock_ma250: [{date,total,above_ma250,pct_above}], industry_macd: [{date,positive_count,total,pct_positive}], updated }
 * 展示：上子图 50 周均线上方个股占比（日度）；下子图 申万一级行业 MACD>0 占比（月度）
 */
(function () {
  'use strict';

  const COL = { stock: '#E65A56', macd: '#5AAEF3', ref: '#CCCCCC' };

  function draw(canvas, data, opts) {
    const exportMode = opts.exportMode;
    const scale = opts.scale || 1;
    const W = exportMode ? 3000 : 1480;
    const H = exportMode ? 1500 : 680;
    const padL = exportMode ? 170 : 90;
    const padR = exportMode ? 220 : 140;
    const padT = exportMode ? 70 : 52;
    const padB = exportMode ? 50 : 40;

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

    const stocks = data.stock_ma250 || [];
    const macds = data.industry_macd || [];
    const gap = exportMode ? 50 : 40;
    const plotTop = padT, plotBottom = H - padB;
    const half = (plotBottom - plotTop - gap) / 2;
    const box1 = { top: plotTop, h: half };
    const box2 = { top: plotTop + half + gap, h: half };

    function yMap(v, ymin, ymax, box) {
      return box.top + (1 - (v - ymin) / (ymax - ymin)) * box.h;
    }

    // 共享日期刻度函数
    function drawXAxis(dates, ticksEvery, yBase) {
      const yearTicks = new Set();
      dates.forEach((d, i) => {
        const y = d.slice(0, 4);
        if ((i === 0 || y !== dates[i - 1].slice(0, 4)) && +y % ticksEvery === 0) yearTicks.add([y, i]);
      });
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      yearTicks.forEach(([y, i]) => {
        const x = xs(i);
        ctx.fillText(y, x, yBase + (exportMode ? 14 : 6));
      });
    }

    // ── 子图 1：50 周线上方个股占比 ──
    const d1 = stocks.map((r) => r.date);
    const v1 = stocks.map((r) => r.pct_above);
    const n1 = d1.length;
    const xs = (i, nn = n1, left = padL, right = W - padR) =>
      left + (nn === 1 ? 0.5 : i / (nn - 1)) * (right - left);

    let sMin = Math.min(0, ...v1), sMax = Math.max(100, ...v1);
    const sPad = (sMax - sMin) * 0.06 || 5;
    sMin -= sPad; sMax += sPad;

    for (let k = 0; k <= 5; k++) {
      const v = sMin + (sMax - sMin) * k / 5;
      const y = yMap(v, sMin, sMax, box1);
      ctx.strokeStyle = '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(v) + '%', padL - 12, y);
    }
    // 50% 参考虚线
    const y50 = yMap(50, sMin, sMax, box1);
    ctx.strokeStyle = COL.ref;
    ctx.setLineDash([exportMode ? 8 : 4, exportMode ? 6 : 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y50); ctx.lineTo(W - padR, y50); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COL.stock;
    ctx.lineWidth = exportMode ? 5 : 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n1; i++) {
      const x = xs(i), y = yMap(v1[i], sMin, sMax, box1);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 末端
    const last1 = v1[n1 - 1];
    const e1y = yMap(last1, sMin, sMax, box1);
    ctx.fillStyle = '#5AAEF3';
    ctx.beginPath(); ctx.arc(xs(n1 - 1), e1y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.stock;
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(last1.toFixed(1) + '%', xs(n1 - 1) + (exportMode ? 20 : 12), e1y);

    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('处于 50 周均线上方的个股占比（全 A 后复权日线）', padL, box1.top - (exportMode ? 34 : 18));
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    ctx.fillText(`${d1[0]} — ${d1[n1 - 1]} · 5562 只全 A 股`, padL, box1.top - (exportMode ? 8 : 4));

    // ── 子图 2：申万一级行业 MACD>0 占比 ──
    const d2 = macds.map((r) => r.date);
    const v2 = macds.map((r) => r.pct_positive);
    const n2 = d2.length;

    let mMin = Math.min(0, ...v2), mMax = Math.max(100, ...v2);
    const mPad = (mMax - mMin) * 0.06 || 5;
    mMin -= mPad; mMax += mPad;

    for (let k = 0; k <= 5; k++) {
      const v = mMin + (mMax - mMin) * k / 5;
      const y = yMap(v, mMin, mMax, box2);
      ctx.strokeStyle = '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#999999';
      ctx.font = (exportMode ? 22 : 11) + 'px NotoSansSC, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(v) + '%', padL - 12, y);
    }
    const y50b = yMap(50, mMin, mMax, box2);
    ctx.strokeStyle = COL.ref;
    ctx.setLineDash([exportMode ? 8 : 4, exportMode ? 6 : 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y50b); ctx.lineTo(W - padR, y50b); ctx.stroke();
    ctx.setLineDash([]);

    // 柱状（月度，窄柱）+ 折线
    const barW = (W - padL - padR) / n2 * 0.6;
    ctx.fillStyle = '#5AAEF3';
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < n2; i++) {
      const x = xs(i, n2);
      const y0 = yMap(0, mMin, mMax, box2);
      const y1 = yMap(v2[i], mMin, mMax, box2);
      const h = Math.abs(y1 - y0);
      ctx.fillRect(x - barW / 2, Math.min(y0, y1), barW, Math.max(h, 1));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = exportMode ? 3 : 1.4;
    ctx.beginPath();
    for (let i = 0; i < n2; i++) {
      const x = xs(i, n2), y = yMap(v2[i], mMin, mMax, box2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 末端
    const last2 = v2[n2 - 1];
    const e2y = yMap(last2, mMin, mMax, box2);
    ctx.fillStyle = '#E65A56';
    ctx.beginPath(); ctx.arc(xs(n2 - 1, n2), e2y, exportMode ? 9 : 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#333333';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(last2.toFixed(0) + '%', xs(n2 - 1, n2) + (exportMode ? 20 : 12), e2y);

    ctx.fillStyle = '#1A1A1A';
    ctx.font = (exportMode ? 30 : 14) + 'px NotoSansSC, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('申万一级行业 MACD > 0 的行业占比（月度末）', padL, box2.top - (exportMode ? 34 : 18));
    ctx.fillStyle = '#888888';
    ctx.font = (exportMode ? 24 : 12) + 'px NotoSansSC, sans-serif';
    ctx.fillText(`${d2[0]} — ${d2[n2 - 1]} · 31 个一级行业`, padL, box2.top - (exportMode ? 8 : 4));

    // 共享 X 轴
    drawXAxis(d1, 4, plotBottom);

    // 标题（导出版）

    // 页脚（导出版）
    if (exportMode) {
      ctx.fillStyle = '#888888';
      ctx.font = '300 24px NotoSansSC, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`数据截至 ${d1[n1 - 1]} · hithink 全市场后复权日线 + 申万一级行业日线`, padL, H - 40);
      ctx.textAlign = 'right';
    }

    // ── 悬浮提示 ──
    if (!exportMode) {
      canvas.__ttData = { stocks, macds, xs1: (i) => xs(i), xs2: (i) => xs(i, n2), box1, box2, y1: (v) => yMap(v, sMin, sMax, box1), y2: (v) => yMap(v, mMin, mMax, box2) };
      if (!canvas.__ttBound) {
        canvas.__ttBound = true;
        canvas.addEventListener('mousemove', (ev) => {
          const D = canvas.__ttData;
          if (!D) return;
          const { x } = window.AK.canvasXY(canvas, ev);
          const sx = x / (window.devicePixelRatio || 1);
          if (sx < padL || sx > W - padR) { window.AK.tooltip.hide(); return; }
          // 判断在哪个子图
          const { y } = window.AK.canvasXY(canvas, ev);
          const sy = y / (window.devicePixelRatio || 1);
          if (sy >= D.box1.top && sy <= D.box1.top + D.box1.h) {
            const i = Math.max(0, Math.min(D.stocks.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.stocks.length - 1))));
            const r = D.stocks[i];
            window.AK.tooltip.show(ev,
              `<b>${r.date}</b><br>` +
              `<span style="color:#E65A56">●</span> 50周线上方：<b>${r.pct_above.toFixed(1)}%</b><br>` +
              `（${r.above_ma250} / ${r.total} 只）`);
          } else if (sy >= D.box2.top && sy <= D.box2.top + D.box2.h) {
            const i = Math.max(0, Math.min(D.macds.length - 1, Math.round((sx - padL) / (W - padL - padR) * (D.macds.length - 1))));
            const r = D.macds[i];
            window.AK.tooltip.show(ev,
              `<b>${r.date}</b><br>` +
              `<span style="color:#5AAEF3">●</span> 行业MACD>0：<b>${r.pct_positive.toFixed(0)}%</b><br>` +
              `（${r.positive_count} / ${r.total} 个行业）`);
          } else { window.AK.tooltip.hide(); }
        });
        canvas.addEventListener('mouseleave', () => window.AK.tooltip.hide());
      }
    }
  }

  window.TT_render = function (data) {
    data = (data && data.items) || data;  // JSON 为 { generated, items } 包装时解包
    const wrap = document.getElementById('panelTrendBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'trendTemperature';
    wrap.appendChild(canvas);
    draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 });

    let rafId = null;
    window.addEventListener('resize', () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => draw(canvas, data, { exportMode: false, scale: window.devicePixelRatio || 1 }));
    });

    window.AK.bindExportButtons({
      trendTemperature: (off) => draw(off, data, { exportMode: true, scale: 1 })
    });
  };
})();
/**
 * 面板：个股走势图（交互查询）
 * 输入公司名/6位代码 → /chart 接口出图（四面板走势图 JPG）→ 展示 + 下载
 * 数据：个股走服务器本地 hithink 库（秒级），ETF/指数走 akshare 降级链
 */
(function () {
  'use strict';

  // 出图服务只部署在国内站服务器（ashare.laoqianriritan.com），这是有意的服务依赖。
  // 同源优先：国内站/GH Pages 镜像都先打自己的 origin，只有跨域场景才回落固定域名，
  // 避免 GH Pages 镜像下请求必然跨域、本地 file:// 调试必挂（2026-10-18 修）。
  const FALLBACK_API = 'https://ashare.laoqianriritan.com';
  const API = (location.origin && location.origin !== 'null' && location.protocol.startsWith('http'))
    ? location.origin
    : FALLBACK_API;

  const input = document.getElementById('chartQueryInput');
  const btn = document.getElementById('chartQueryBtn');
  const suggestBox = document.getElementById('chartSuggestBox');
  const loading = document.getElementById('chartLoading');
  const errBox = document.getElementById('chartError');
  const result = document.getElementById('chartResult');
  const img = document.getElementById('chartResultImg');
  const dlBtn = document.getElementById('chartDownloadBtn');

  if (!input || !btn) return;

  let _dlUrl = null;
  let _reqSeq = 0;

  function hideAll() {
    suggestBox.hidden = true;
    loading.hidden = true;
    errBox.hidden = true;
    result.hidden = true;
  }

  function showError(msg) {
    hideAll();
    errBox.textContent = msg;
    errBox.hidden = false;
  }

  function showLoading() {
    hideAll();
    loading.hidden = false;
  }

  function showResult(code, name, blobUrl) {
    hideAll();
    if (_dlUrl) URL.revokeObjectURL(_dlUrl);
    _dlUrl = blobUrl;
    img.src = blobUrl;
    img.alt = name + ' ' + code + ' 走势图';
    dlBtn.dataset.filename = (code ? code + '_' : '') + name + '_走势图.jpg';
    result.hidden = false;
  }

  /** 出图请求：q 命中返回 JPG；多候选返回 JSON candidates。90 秒超时保护 */
  async function requestChart(q) {
    const url = API + '/chart?q=' + encodeURIComponent(q.trim());
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 90000);
    try {
      const resp = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!resp.ok) {
        let msg = '请求失败（' + resp.status + '）';
        try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e) { /* 非 JSON */ }
        throw new Error(msg);
      }
      const ct = resp.headers.get('content-type') || '';
      if (ct.indexOf('image') >= 0) {
        const blob = await resp.blob();
        return { image: true, blob };
      }
      const j = await resp.json();
      if (j && Array.isArray(j.candidates) && j.candidates.length) {
        return { image: false, candidates: j.candidates };
      }
      throw new Error(j && j.error ? j.error : '出图失败');
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('出图超过 90 秒未响应，可能网络较慢，请刷新后重试');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function doChart(q) {
    if (!q.trim()) { showError('请输入公司名或 6 位代码，如：茅台 / 600519 / 510300'); return; }
    // 按钮置灰，防止重复点击
    btn.disabled = true;
    btn.textContent = '生成中…';
    const seq = ++_reqSeq;
    const raw = q.trim();
    showLoading();
    try {
      const r = await requestChart(raw);
      if (seq !== _reqSeq) return; // 已被新请求取代
      if (r.image) {
        showResult('', raw, URL.createObjectURL(r.blob));
        return;
      }
      // 多候选 → 展示选择
      hideAll();
      renderCandidates(r.candidates);
    } catch (e) {
      if (seq !== _reqSeq) return;
      showError(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '出图';
    }
  }

  /** 多候选下拉（联想结果也可点击） */
  function renderCandidates(cands) {
    suggestBox.innerHTML = '';
    const ul = document.createElement('div');
    ul.className = 'cq-cand-list';
    cands.forEach(function (c) {
      const code = c[0], name = c[1];
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'cq-cand';
      it.textContent = name + '  ' + code;
      it.addEventListener('click', function () {
        suggestBox.hidden = true;
        input.value = code;
        doChart(code);
      });
      ul.appendChild(it);
    });
    suggestBox.appendChild(ul);
    suggestBox.hidden = false;
  }

  /** 输入联想（debounce） */
  let _suggestTimer = null;
  input.addEventListener('input', function () {
    clearTimeout(_suggestTimer);
    const v = input.value.trim();
    if (v.length < 2 || /^\d{6}$/.test(v)) { suggestBox.hidden = true; return; }
    _suggestTimer = setTimeout(function () {
      fetch(API + '/suggest?q=' + encodeURIComponent(v), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.candidates || !j.candidates.length) { suggestBox.hidden = true; return; }
          renderCandidates(j.candidates);
        })
        .catch(function () { suggestBox.hidden = true; });
    }, 300);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doChart(input.value); }
  });
  btn.addEventListener('click', function () { doChart(input.value); });

  // 下载图片（电脑保存；手机可长按 img 保存）
  dlBtn.addEventListener('click', function () {
    if (!_dlUrl) return;
    const a = document.createElement('a');
    a.href = _dlUrl;
    a.download = dlBtn.dataset.filename || '个股走势图.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // 示例提示：回车默认出图
  hideAll();
})();
