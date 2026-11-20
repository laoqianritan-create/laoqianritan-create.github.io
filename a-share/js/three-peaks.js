/**
 * 看板：三顶的顺序：两种剧本（#panel-three-peaks · 2026-11-20）
 * 静态示意图：A 型（估值先顶）/ B 型（业绩先顶），三条曲线分别为估值、股价、业绩增速。
 * 数值来自 analysis/three-peaks 的 463 只样本、1,037 个价格顶；看板只负责把顺序画清楚。
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000;
  const H = 620;

  const COLOR = {
    val: '#333333',
    price: '#5AAEF3',
    growth: '#E65A56',
    ink: '#1A1A1A',
    muted: '#777777',
    faint: '#999999',
    grid: '#DDDDDD',
    peakLine: '#E5E5E5',
    vline: '#D9D9D9',
    bracket: '#BBBBBB',
    white: '#FFFFFF'
  };

  const FONT = '"NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif';

  // 曲线控制点：[x, 相对水平]，各自峰值 = 100。横轴不按真实月份等比例，只表达先后。
  const SERIES = {
    A: {
      val: [[70, 20], [150, 24], [230, 38], [300, 70], [330, 100], [370, 92], [430, 62], [500, 38], [570, 30], [640, 30], [720, 34], [820, 38], [900, 40], [970, 40]],
      growth: [[70, 8], [150, 10], [230, 14], [300, 17], [360, 22], [420, 31], [480, 47], [540, 72], [590, 100], [640, 92], [700, 62], [780, 38], [860, 20], [930, 12], [970, 10]],
      price: [[70, 13], [140, 17], [210, 26], [280, 42], [330, 55], [390, 52], [450, 48], [510, 52], [570, 62], [630, 72], [700, 84], [780, 96], [850, 100], [900, 88], [950, 68], [970, 60]]
    },
    B: {
      val: [[70, 18], [150, 22], [230, 28], [300, 36], [330, 42], [390, 50], [450, 62], [510, 80], [590, 100], [650, 94], [720, 78], [800, 58], [880, 44], [970, 38]],
      growth: [[70, 10], [130, 14], [200, 24], [260, 48], [300, 78], [330, 100], [380, 90], [450, 66], [520, 46], [590, 36], [680, 28], [780, 22], [880, 18], [970, 16]],
      price: [[70, 15], [140, 20], [210, 28], [280, 38], [330, 45], [390, 50], [450, 60], [510, 78], [590, 100], [650, 88], [720, 68], [800, 52], [880, 42], [970, 38]]
    }
  };

  const KIND = {
    A: {
      sub: 'A 型 · 估值先顶',
      pct: '55%',
      peaks: [
        { x: 330, y: 70, type: 'val', label: '估值顶 V', align: 'middle' },
        { x: 590, y: 70, type: 'growth', label: '增速顶 G', align: 'middle' },
        { x: 850, y: 70, type: 'price', label: '股价顶 P', align: 'middle' }
      ],
      vlines: [330, 590, 850],
      lags: [[330, 590, '11 个月'], [590, 850, '11 个月']],
      phases: [
        { x: 70, w: 260, label: '估值修复', fill: '#F2F2F2' },
        { x: 330, w: 260, label: '杀估值', fill: '#F8DEDC' },
        { x: 590, w: 260, label: '拔估值', fill: '#DCEFFB' },
        { x: 850, w: 120, label: '双杀', fill: '#F2F2F2' }
      ],
      key: '增速顶：同比还高，环比转负　·　股价顶：同比仍正，环比转弱'
    },
    B: {
      sub: 'B 型 · 业绩先顶',
      pct: '45%',
      peaks: [
        { x: 330, y: 70, type: 'growth', label: '增速顶 G', align: 'middle' },
        { x: 590, y: 70, type: 'val', label: '估值顶 V', align: 'end', labelX: 560 },
        { x: 590, y: 70, type: 'price', label: '股价顶 P', align: 'start', labelX: 620, ring: true }
      ],
      vlines: [330, 590],
      lags: [[330, 590, '约 11 个月']],
      phases: [
        { x: 70, w: 260, label: '业绩冲顶', fill: '#F8DEDC' },
        { x: 330, w: 260, label: '拔估值', fill: '#DCEFFB' },
        { x: 590, w: 380, label: '双杀', fill: '#F2F2F2' }
      ],
      key: '业绩先减速，估值和股价再冲一段'
    }
  };

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    }
    return el;
  }

  function add(parent, tag, attrs) {
    const el = svgEl(tag, attrs);
    parent.appendChild(el);
    return el;
  }

  function addText(parent, x, y, str, attrs) {
    const t = add(parent, 'text', Object.assign({ x: x, y: y }, attrs || {}));
    t.textContent = str;
    return t;
  }

  /** Catmull-Rom → 三次贝塞尔，得到一条平滑、不过冲太多的曲线 */
  function smoothPath(points) {
    const pts = points.map((p) => [p[0], 520 - p[1] * 4.5]);
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + cp1x + ' ' + cp1y + ' ' + cp2x + ' ' + cp2y + ' ' + p2[0] + ' ' + p2[1];
    }
    return d;
  }

  function drawAxes(svg) {
    add(svg, 'line', { x1: 70, y1: 520, x2: 970, y2: 520, stroke: COLOR.grid, 'stroke-width': 1.2 });
    add(svg, 'line', { x1: 70, y1: 70, x2: 70, y2: 520, stroke: COLOR.grid, 'stroke-width': 1.2 });
    add(svg, 'line', { x1: 70, y1: 70, x2: 970, y2: 70, stroke: COLOR.peakLine, 'stroke-dasharray': '4 6', 'stroke-width': 1.2 });
    addText(svg, 58, 74, '100', { 'font-size': 14, fill: COLOR.faint, 'text-anchor': 'end' });
    addText(svg, 58, 524, '0', { 'font-size': 14, fill: COLOR.faint, 'text-anchor': 'end' });
    addText(svg, 70, 56, '峰值 = 100', { 'font-size': 13.5, fill: COLOR.faint });
    addText(svg, 970, 600, '时间 →', { 'font-size': 14, fill: COLOR.faint, 'text-anchor': 'end' });
  }

  function drawSubhead(svg, kind) {
    const k = KIND[kind];
    const t = addText(svg, 70, 28, k.sub + ' ', {
      'font-size': 24,
      'font-weight': 700,
      fill: COLOR.ink
    });
    const pct = add(t, 'tspan', { 'font-size': 15.5, 'font-weight': 400, fill: COLOR.faint });
    pct.textContent = k.pct;
  }

  function drawLegend(svg) {
    const items = [
      { x: 710, color: COLOR.val, label: '估值' },
      { x: 800, color: COLOR.price, label: '股价' },
      { x: 890, color: COLOR.growth, label: '增速' }
    ];
    items.forEach((it) => {
      add(svg, 'line', { x1: it.x, y1: 22, x2: it.x + 22, y2: 22, stroke: it.color, 'stroke-width': 3, 'stroke-linecap': 'round' });
      addText(svg, it.x + 28, 28, it.label, { 'font-size': 15.5, fill: '#666666' });
    });
  }

  function drawCurves(svg, kind) {
    const s = SERIES[kind];
    // 先画增速，再画估值，最后画股价；蓝色压在最上面，峰值标记再单独画。
    [['growth', COLOR.growth], ['val', COLOR.val], ['price', COLOR.price]].forEach(([key, color]) => {
      add(svg, 'path', {
        d: smoothPath(s[key]),
        fill: 'none',
        stroke: color,
        'stroke-width': key === 'val' ? 3.6 : 3.4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
    });
  }

  function drawVlines(svg, kind) {
    KIND[kind].vlines.forEach((x) => {
      add(svg, 'line', { x1: x, y1: 70, x2: x, y2: 520, stroke: COLOR.vline, 'stroke-dasharray': '5 5', 'stroke-width': 1.2 });
    });
  }

  function drawPeak(svg, p) {
    const color = p.type === 'val' ? COLOR.val : (p.type === 'growth' ? COLOR.growth : COLOR.price);
    const x = p.x;
    const y = p.y;

    if (p.ring) {
      // B 型的股价顶是套在估值顶外面的空心圆：同一时点，两条不同的序列。
      add(svg, 'circle', { cx: x, cy: y, r: 11, fill: 'none', stroke: COLOR.price, 'stroke-width': 3 });
    } else if (p.type === 'val') {
      const r = 8;
      add(svg, 'path', {
        d: 'M' + x + ' ' + (y - r) + ' L' + (x + r) + ' ' + y + ' L' + x + ' ' + (y + r) + ' L' + (x - r) + ' ' + y + ' Z',
        fill: color,
        stroke: COLOR.white,
        'stroke-width': 2
      });
    } else if (p.type === 'growth') {
      add(svg, 'rect', { x: x - 7, y: y - 7, width: 14, height: 14, fill: color, stroke: COLOR.white, 'stroke-width': 2 });
    } else {
      add(svg, 'circle', { cx: x, cy: y, r: 8, fill: color, stroke: COLOR.white, 'stroke-width': 2 });
    }

    addText(svg, p.labelX || x, 50, p.label, {
      'font-size': 18,
      'font-weight': 700,
      fill: color,
      'text-anchor': p.align || 'middle'
    });
  }

  function drawLag(svg, x1, x2, label) {
    add(svg, 'path', {
      d: 'M' + x1 + ' 536 V546 M' + x1 + ' 541 H' + x2 + ' M' + x2 + ' 536 V546',
      fill: 'none',
      stroke: COLOR.bracket,
      'stroke-width': 1.2
    });
    addText(svg, (x1 + x2) / 2, 530, label, { 'font-size': 14, fill: COLOR.muted, 'text-anchor': 'middle' });
  }

  function drawPhases(svg, kind) {
    KIND[kind].phases.forEach((ph) => {
      add(svg, 'rect', {
        x: ph.x,
        y: 552,
        width: ph.w,
        height: 24,
        rx: 3,
        fill: ph.fill,
        stroke: COLOR.white,
        'stroke-width': 2
      });
      addText(svg, ph.x + ph.w / 2, 569, ph.label, { 'font-size': 15, fill: '#555555', 'text-anchor': 'middle' });
    });
  }

  function drawPanel(svg, kind) {
    const k = KIND[kind];
    add(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: COLOR.white });
    drawSubhead(svg, kind);
    drawLegend(svg);
    drawAxes(svg);
    drawVlines(svg, kind);
    drawCurves(svg, kind);
    k.peaks.forEach((p) => drawPeak(svg, p));
    k.lags.forEach(([x1, x2, label]) => drawLag(svg, x1, x2, label));
    drawPhases(svg, kind);
    addText(svg, 70, 612, k.key, { 'font-size': 15, fill: COLOR.muted });
  }

  function makePanelSVG(kind) {
    const svg = svgEl('svg', {
      xmlns: NS,
      viewBox: '0 0 ' + W + ' ' + H,
      width: W,
      height: H,
      'font-family': FONT,
      role: 'img',
      'aria-label': kind === 'A'
        ? 'A 型：估值顶最先，增速顶约 11 个月后，股价顶再约 11 个月后'
        : 'B 型：增速顶最先，估值顶和股价顶约 11 个月后同期出现'
    });
    drawPanel(svg, kind);
    return svg;
  }

  function buildExportSVG() {
    const svg = svgEl('svg', {
      xmlns: NS,
      viewBox: '0 0 3000 960',
      width: 3000,
      height: 960,
      'font-family': FONT
    });
    add(svg, 'rect', { x: 0, y: 0, width: 3000, height: 960, fill: COLOR.white });

    const gA = add(svg, 'g', { transform: 'translate(0,0) scale(1.5)' });
    gA.appendChild(makePanelSVG('A'));
    const gB = add(svg, 'g', { transform: 'translate(1500,0) scale(1.5)' });
    gB.appendChild(makePanelSVG('B'));

    add(svg, 'line', { x1: 1500, y1: 12, x2: 1500, y2: 948, stroke: '#EEEEEE', 'stroke-width': 1.5 });
    return svg;
  }

  async function exportPanel(panel) {
    const btn = panel.querySelector('.tp-export');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      if (window.AK && AK.fontsReady) await AK.fontsReady();
      const svg = buildExportSVG();
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('SVG 转图片失败'));
        img.src = url;
      });

      const cv = document.createElement('canvas');
      cv.width = 3000;
      cv.height = 960;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = COLOR.white;
      ctx.fillRect(0, 0, 3000, 960);
      ctx.drawImage(img, 0, 0, 3000, 960);
      URL.revokeObjectURL(url);

      const title = (panel.querySelector('.panel-title') || {}).textContent || '';
      const desc = (panel.querySelector('.panel-desc') || {}).textContent || '';
      await window.AK.exportPNG(cv, 3000, 'three-peaks.png', null, {
        title: title.trim(),
        desc: desc.trim(),
        source: 'A股看板 · ashare.laoqianriritan.com'
      });
    } catch (err) {
      console.error('[three-peaks] 导出失败', err);
    } finally {
      btn.disabled = false;
    }
  }

  function build(panel) {
    const body = panel.querySelector('.tp-body');
    if (!body) return;
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'tp-grid';

    ['A', 'B'].forEach((kind) => {
      const col = document.createElement('div');
      col.className = 'tp-col';
      const svg = makePanelSVG(kind);
      svg.classList.add('tp-svg');
      col.appendChild(svg);
      grid.appendChild(col);
    });

    body.appendChild(grid);

    const btn = panel.querySelector('.tp-export');
    if (btn && !btn.__tpBound) {
      btn.__tpBound = true;
      btn.addEventListener('click', () => exportPanel(panel));
    }
  }

  function init() {
    const panel = document.getElementById('panel-three-peaks');
    if (!panel) return;
    build(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
