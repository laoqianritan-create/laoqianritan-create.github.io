/**
 * 看板：普通人投资的三种「合适」（#panel-three-clocks · 2026-11-19 上线）
 * 静态示意图，无数据、不参与日更与 check_freshness。
 * 画法：lieflat-charts（F2 Hairline Line / F3 Hairline Area / F11 Tick Gauge 骨架，wire 预设：灰阶 + 唯一橙色主角），
 *       rnd() 确定性手绘抖动，刷新长一样。
 * 文案：全部集中在下方 COPY，key 与 drafts/three-clocks/三种时钟_文案.md 一一对应（page.title / page.desc 写在 index.html）。
 * 交互：桌面悬停弹便利贴；触屏点击切换，点空白处关闭。下载按钮把三栏 SVG 拼成 3000px PNG，经 AK.exportPNG 加标题与来源。
 */
(function () {
  'use strict';

  // ── 文案（老钱 2026-11-19 定稿，逐字）──
  const COPY = {
    'c1.title': '① 攒够本金 vs. 未来要用',
    'c1.desc': '每月一笔结余 · 未来用钱日',
    'c1.axis.y': '存款',
    'c1.axis.x': '时间（月）',
    'c1.threshold': '一笔钱',
    'c1.spend': '取出 / 使用',
    'c1.mark.enough': '① 攒够一笔钱',
    'c1.mark.enough.sub': '攒够 ≠ 该投资的理由',
    'c1.mark.flag': '② 未来用钱日',
    'c1.mark.flag.sub': '硬约束：到点就得取出',
    'c1.bracket': '能投的窗口：攒够之后 · 用钱之前',
    'c1.caption': '一级台阶 = 一个月的结余 · 示意',

    'c2.title': '② 周期时钟：进场时点决定体验',
    'c2.axis.y': '牛熊周期',
    'c2.bull': '牛',
    'c2.bear': '熊',
    'c2.entry.bad': '坏入场：人声鼎沸，着急上车',
    'c2.entry.good': '好入场：想到股市就闹心',
    'c2.sharpe.title': '同样的起点和终点，体验差很多：',
    'c2.sharpe.high': '高夏普：稳，拿得住',
    'c2.sharpe.low': '低夏普：上蹿下跳，容易下车',

    'c3.title': '③ 人生时钟：能扛多大波动',
    'c3.axis.y': '风险偏好',
    'c3.axis.x': '年龄 / 家底 →',
    'c3.stage.young': '青年',
    'c3.stage.mid': '中年',
    'c3.stage.old': '退休',
    'c3.curve.note': '越老、家底越厚，越输不起',
    'c3.gauge.title': '情绪光谱：指针在风险与机会之间来回摆',
    'c3.gauge.left': '恐惧',
    'c3.gauge.left.sub': '回撤（风险）',
    'c3.gauge.right': '贪婪',
    'c3.gauge.right.sub': '盈利（机会）',

    'note1.title': '储蓄：攒够 ≠ 该投',
    'note1.p1': '攒够一笔钱，只说明你手里有了子弹，不说明该开枪。',
    'note1.p2': '投资后真正要紧的是这笔钱哪天要用。用钱日越近，越不该放进高波动的盘子；离用钱日足够远的钱，才能更好地静候周期。',
    'note2.title': '周期：入场时机高度影响结果',
    'note2.p1': 'A 股牛短熊长、波动又大，同一个指数，不同的入场时机高度影响体验和收益。',
    'note2.p2': '择时做不到精确，但至少别在人声鼎沸时满仓。标的也得挑：夏普值高的，回撤小、拿得住，体验和收益才都好。',
    'note3.title': '人生：没有理性人，都是普通人',
    'note3.p1': '年纪越大、家底越厚，越输不起，风险偏好自然往下走。',
    'note3.p2': '情绪是一道从恐惧到贪婪的光谱：先想清楚自己（的年龄和本金体量）能扛多大回撤，再谈能赚多少。',

    'foot.conclusion': '好投资的交集： 钱已攒够且短期不用、周期不在高位、回撤扛得住',
    'foot.conclusion.hl': ['短期不用', '不在高位', '扛得住'],
    'src.url': 'ashare.laoqianriritan.com'
  };

  const FONT = "'NotoSansSC', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";
  // wire 预设（lieflat-charts color-presets.js · WIRE）；站点卡片为白底，故 BG/HALO 取白
  const W = { BG: '#FFFFFF', TXT: '#1F1E1C', MUT: 'rgba(31,30,28,.60)', LAB: 'rgba(31,30,28,.72)',
    FAINT: 'rgba(31,30,28,.32)', GRID: 'rgba(31,30,28,.16)', DATA: '#22211F', DATA2: '#8F8E86',
    FD: '#C0BFB7', HERO: '#F5572F', HALO: 'rgba(255,255,255,.95)' };
  const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000;
  const D2R = Math.PI / 180, pol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)];
  const NS = 'http://www.w3.org/2000/svg';
  const el = (p, t, a) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); p.appendChild(n); return n; };
  const txt = (p, a, s) => { const n = el(p, 'text', a); n.textContent = s; return n; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function wob(pts, seed, amp, step) {
    amp = amp == null ? 2.2 : amp; step = step || 16;
    const out = []; let c = 0;
    for (let s = 0; s < pts.length - 1; s++) {
      const [x1, y1] = pts[s], [x2, y2] = pts[s + 1], L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const n = Math.max(1, Math.round(L / step)), nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
      for (let j = 0; j < n; j++) {
        const t = j / n, e = j === 0 ? 0 : (rnd(seed + (c++), 7) - 0.5) * amp;
        out.push([x1 + (x2 - x1) * t + nx * e, y1 + (y2 - y1) * t + ny * e]);
      }
    }
    out.push(pts[pts.length - 1]);
    return 'M' + out.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ');
  }
  function sketch(g, pts, o) {
    o = o || {};
    const stroke = o.stroke || W.DATA, w = o.w || 3, seed = o.seed || 1, amp = o.amp == null ? 2.4 : o.amp;
    const ghost = o.ghost !== false, dash = o.dash || null, draw = o.draw !== false, delay = o.delay || 0,
      dur = o.dur || 1.2, step = o.step || 16;
    if (ghost) {
      const a = { d: wob(pts, seed + 500, amp * 1.6, step), fill: 'none', stroke, 'stroke-width': w * 0.45, opacity: 0.38,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'fade', style: `animation-delay:${delay + 0.4}s` };
      if (dash) a['stroke-dasharray'] = dash;
      el(g, 'path', a);
    }
    const a = { d: wob(pts, seed, amp, step), fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (dash) { a['stroke-dasharray'] = dash; a.class = 'fade'; a.style = `animation-delay:${delay}s`; }
    else if (draw) { a.pathLength = 1; a.class = 'draw'; a.style = `animation-delay:${delay}s;animation-duration:${dur}s`; }
    else { a.class = 'fade'; a.style = `animation-delay:${delay}s`; }
    return el(g, 'path', a);
  }
  function ring(g, cx, cy, r, o) {
    o = o || {};
    const seed = o.seed || 3, pts = [];
    for (let k = 0; k <= 26; k++) { const a = -100 + k * (375 / 26), rr = r * (1 + (rnd(seed + k, 5) - 0.5) * 0.08); pts.push(pol(cx, cy, rr, a)); }
    if (o.fill) el(g, 'circle', { cx, cy, r: r * 0.92, fill: o.fill, class: 'pop', style: `animation-delay:${o.delay || 0}s` });
    return sketch(g, pts, { stroke: o.stroke || W.DATA, w: o.w || 2.6, seed, amp: 1, ghost: false, delay: o.delay || 0, dur: 0.6 });
  }
  function arrow(g, x1, y1, x2, y2, o) {
    o = o || {};
    const stroke = o.stroke || W.LAB, w = o.w || 2.2, head = o.head || 14, bend = o.bend || 0, delay = o.delay || 0;
    const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2 - Math.abs(bend) * 0.3, pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2]); }
    sketch(g, pts, { stroke, w, seed: o.seed || 9, amp: 1.2, ghost: false, delay, dur: 0.6 });
    const [px, py] = pts[10], ang = Math.atan2(y2 - py, x2 - px) / D2R;
    [150, -150].forEach((d) => { const [hx, hy] = pol(x2, y2, head, ang + d);
      el(g, 'path', { d: `M${x2} ${y2} L${hx.toFixed(1)} ${hy.toFixed(1)}`, stroke, 'stroke-width': w, 'stroke-linecap': 'round', class: 'fade', style: `animation-delay:${delay + 0.5}s` }); });
  }
  function T(g, x, y, s, o) {
    o = o || {};
    const a = { x, y, 'font-size': o.size || 28, 'font-weight': o.weight || 400, fill: o.fill || W.TXT, 'text-anchor': o.anchor || 'start',
      class: 'fade', style: `animation-delay:${o.delay == null ? 0.9 : o.delay}s;paint-order:stroke;stroke:${W.HALO};stroke-width:7px;stroke-linejoin:round;` };
    return txt(g, a, s);
  }
  // 文字超出 [x0,x1] 时整体平移回来（改文案变长时防裁切）
  function fitX(t, x0, x1) {
    try {
      const b = t.getBBox();
      if (!b.width) return;
      let dx = 0;
      if (b.x + b.width > x1) dx = x1 - (b.x + b.width);
      if (b.x + dx < x0) dx = x0 - b.x;
      if (dx) t.setAttribute('x', parseFloat(t.getAttribute('x')) + dx);
    } catch (e) { /* 未渲染时忽略 */ }
  }
  const cap = (g, y, s) => { const t = txt(g, { x: 500, y, 'font-size': 21, 'font-weight': 600, fill: '#A3A29B', 'text-anchor': 'middle', 'letter-spacing': '.12em', class: 'fade', style: 'animation-delay:1.3s' }, s); return t; };

  function icon(s, h, m, seed) {
    ring(s, 24, 24, 19, { seed, w: 2.2 });
    const [hx, hy] = pol(24, 24, 10, h * 30 + m * 0.5 - 90), [mx, my] = pol(24, 24, 14.5, m * 6 - 90);
    el(s, 'path', { d: `M24 24 L${hx} ${hy}`, stroke: W.DATA, 'stroke-width': 2.6, 'stroke-linecap': 'round' });
    el(s, 'path', { d: `M24 24 L${mx} ${my}`, stroke: W.DATA, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
    el(s, 'circle', { cx: 24, cy: 24, r: 2.2, fill: W.HERO });
    [0, 90, 180, 270].forEach((a) => { const [x1, y1] = pol(24, 24, 15.5, a), [x2, y2] = pol(24, 24, 17.5, a);
      el(s, 'line', { x1, y1, x2, y2, stroke: W.DATA, 'stroke-width': 1.6, 'stroke-linecap': 'round' }); });
  }
  function clip(s) {
    const d = 'M15 24 V66 a6 6 0 0 0 12 0 V14 a9 9 0 0 0 -18 0 V72 a12 12 0 0 0 24 0 V32';
    el(s, 'path', { d, fill: 'none', stroke: '#5E5D57', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    el(s, 'path', { d, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 0.9, opacity: 0.55, 'stroke-linecap': 'round', transform: 'translate(-.8 -.6)' });
  }

  // ════ ① 储蓄 · 骨架 F2 hairline line（日历地板）→ 阶梯 ════
  function clock1(s) {
    const B = 640, X0 = 80, SW = 21, H = 11.5, N = 40, U = 30, K = 16;
    const x = (i) => X0 + i * SW, lv = (k) => B - k * H;
    sketch(s, [[60, B], [960, B]], { stroke: W.LAB, w: 2.4, seed: 11, draw: false, ghost: false });
    sketch(s, [[60, B + 4], [60, 120]], { stroke: W.LAB, w: 2.4, seed: 12, draw: false, ghost: false });
    arrow(s, 60, 140, 60, 112, { head: 16, w: 2.4 }); arrow(s, 935, B, 962, B, { head: 16, w: 2.4 });
    T(s, 80, 124, COPY['c1.axis.y'], { size: 26, fill: W.MUT });
    T(s, 960, B + 40, COPY['c1.axis.x'], { size: 24, fill: W.MUT, anchor: 'end' });
    for (let i = 0; i < N; i++) el(s, 'line', { x1: x(i), y1: B, x2: x(i), y2: B - 9 - rnd(i + 1, 4) * 4, stroke: W.FD, 'stroke-width': 1.6, class: 'fade', style: `animation-delay:${i * 0.01}s` });
    sketch(s, [[64, lv(K)], [x(K) + 40, lv(K)]], { stroke: W.FAINT, w: 2, dash: '10 9', seed: 31, ghost: false, delay: 0.5 });
    T(s, 70, lv(K) - 12, COPY['c1.threshold'], { size: 24, fill: W.MUT });
    const pts = [[x(0), B]]; let k = 0;
    for (let i = 0; i < U; i++) { k++; pts.push([x(i), lv(k)]); pts.push([x(i + 1), lv(k)]); }
    sketch(s, pts, { stroke: W.DATA, w: 3.4, seed: 41, amp: 1.4, step: 10, dur: 1.6 });
    const low = 4, p2 = [[x(U), lv(k)], [x(U), lv(low)]]; let k2 = low;
    for (let i = U; i < N - 1; i++) { k2++; p2.push([x(i + 1), lv(k2 - 1)]); p2.push([x(i + 1), lv(k2)]); }
    sketch(s, p2, { stroke: W.DATA2, w: 2.6, seed: 51, amp: 1.4, delay: 1.4, dur: 0.8 });
    arrow(s, x(U) + 16, lv(k) + 30, x(U) + 16, lv(low) - 20, { stroke: W.DATA2, w: 2, head: 12, delay: 1.6 });
    fitX(T(s, x(U) + 30, lv(18), COPY['c1.spend'], { size: 24, fill: W.MUT, delay: 1.7 }), 0, 995);
    const P = [x(K - 1), lv(K)];
    ring(s, P[0], P[1], 15, { seed: 61, w: 2.8, fill: W.BG, delay: 1 });
    el(s, 'circle', { cx: P[0], cy: P[1], r: 5, fill: W.DATA, class: 'pop', style: 'animation-delay:1.1s' });
    T(s, 96, 262, COPY['c1.mark.enough'], { size: 34, weight: 700, delay: 1.1 });
    T(s, 96, 302, COPY['c1.mark.enough.sub'], { size: 26, fill: W.MUT, delay: 1.2 });
    arrow(s, 250, 318, P[0] - 18, P[1] - 20, { bend: -40, delay: 1.2 });
    const UX = x(U);
    sketch(s, [[UX, B + 6], [UX, 150]], { stroke: W.HERO, w: 4, seed: 71, amp: 1.2, ghost: false, delay: 1.2, dur: 0.7 });
    el(s, 'path', { d: `M${UX} 152 L${UX + 74} 172 L${UX} 194 Z`, fill: W.HERO, opacity: 0.92, class: 'pop', style: 'animation-delay:1.7s' });
    sketch(s, [[UX, 152], [UX + 74, 172], [UX, 194]], { stroke: W.HERO, w: 2.4, seed: 72, amp: 1, ghost: false, draw: false, delay: 1.7 });
    fitX(T(s, UX - 18, 178, COPY['c1.mark.flag'], { size: 34, weight: 700, anchor: 'end', delay: 1.7 }), 70, UX - 10);
    fitX(T(s, UX - 18, 216, COPY['c1.mark.flag.sub'], { size: 26, fill: W.MUT, anchor: 'end', delay: 1.8 }), 70, UX - 10);
    const bx1 = P[0], bx2 = UX, by = B + 34, bm = (bx1 + bx2) / 2;
    sketch(s, [[bx1, by - 8], [bx1, by], [bm - 12, by], [bm, by + 12], [bm + 12, by], [bx2, by], [bx2, by - 8]], { stroke: W.LAB, w: 2.2, seed: 81, amp: 1, ghost: false, delay: 1.9, dur: 0.6 });
    fitX(T(s, bm, by + 52, COPY['c1.bracket'], { size: 26, fill: W.LAB, anchor: 'middle', delay: 2 }), 5, 995);
    cap(s, 800, COPY['c1.caption']);
  }

  // ════ ② 周期 · 骨架 F3 hairline area → 零轴双向 ════
  function clock2(s) {
    const Z = 290, X0 = 70, X1 = 950, N = 190, raw = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), v = Math.sin(2 * Math.PI * (t * 3.15 + 0.08));
      let y = v > 0 ? Math.pow(v, 2.0) * 1.25 : -Math.pow(-v, 0.6) * 0.55; // 牛短而陡，熊长而平
      y += 0.16 * Math.sin(2 * Math.PI * t * 11 + 1.3) + (rnd(i + 1, 3) - 0.5) * 0.14;
      raw.push(y);
    }
    const mx = Math.max(...raw), mn = Math.min(...raw);
    const yv = raw.map((v) => (v > 0 ? Z - v / mx * 200 : Z + v / mn * 125));
    const xi = (i) => X0 + i * (X1 - X0) / (N - 1);
    T(s, X0, 60, COPY['c2.axis.y'], { size: 24, fill: W.MUT });
    sketch(s, [[X0 - 10, Z], [X1 + 10, Z]], { stroke: W.FAINT, w: 2, dash: '10 8', seed: 5, ghost: false });
    for (let i = 0; i < N; i += 2) { const up = yv[i] < Z;
      el(s, 'line', { x1: xi(i), y1: Z, x2: xi(i), y2: yv[i], stroke: up ? W.DATA2 : W.FD, 'stroke-width': 1.6, opacity: 0.55 + rnd(i + 1, 7) * 0.4, class: 'fade', style: `animation-delay:${i * 0.006}s` }); }
    sketch(s, yv.map((y, i) => [xi(i), y]), { stroke: W.DATA, w: 3.2, seed: 7, amp: 1, step: 8, dur: 1.6, delay: 0.3 });
    const ext = [];
    for (let i = 6; i < N - 6; i++) { const w = yv.slice(i - 6, i + 7);
      const typ = (yv[i] === Math.min(...w) && yv[i] < Z - 110) ? 'peak' : (yv[i] === Math.max(...w) && yv[i] > Z + 70) ? 'trough' : null;
      if (typ && !ext.some((e) => e[1] === typ && i - e[0] < 18)) ext.push([i, typ]); }
    const peaks = ext.filter((e) => e[1] === 'peak').map((e) => e[0]), troughs = ext.filter((e) => e[1] === 'trough').map((e) => e[0]);
    const top = peaks.reduce((a, b) => (yv[b] < yv[a] ? b : a), peaks[0]);
    const deep = troughs.reduce((a, b) => (yv[b] > yv[a] ? b : a), troughs[0]);
    peaks.forEach((i) => { if (i !== top) T(s, xi(i), yv[i] - 18, COPY['c2.bull'], { size: 30, weight: 700, anchor: 'middle', delay: 1.3 }); });
    troughs.forEach((i) => { if (i !== deep) T(s, xi(i), yv[i] + 44, COPY['c2.bear'], { size: 30, weight: 700, anchor: 'middle', fill: W.LAB, delay: 1.3 }); });
    const cx = xi(top), cy = yv[top];
    ring(s, cx, cy, 14, { seed: 91, w: 2.6, fill: W.BG, delay: 1.4 });
    el(s, 'path', { d: `M${cx - 6} ${cy - 6} L${cx + 6} ${cy + 6} M${cx + 6} ${cy - 6} L${cx - 6} ${cy + 6}`, stroke: W.DATA, 'stroke-width': 2.6, 'stroke-linecap': 'round', class: 'fade', style: 'animation-delay:1.5s' });
    // 坏入场：标在最高峰正上方居中（放右侧会压到下一个波峰）
    fitX(T(s, cx, cy - 28, COPY['c2.entry.bad'], { size: 28, weight: 700, anchor: 'middle', delay: 1.5 }), 5, 995);
    el(s, 'circle', { cx: xi(deep), cy: yv[deep], r: 12, fill: W.HERO, class: 'pop', style: 'animation-delay:1.6s' });
    ring(s, xi(deep), yv[deep], 19, { seed: 93, stroke: W.HERO, w: 2.2, delay: 1.6 });
    fitX(T(s, xi(deep), yv[deep] + 56, COPY['c2.entry.good'], { size: 28, weight: 700, anchor: 'middle', delay: 1.7 }), 5, 995);
    const IY = 545;
    T(s, X0, IY + 20, COPY['c2.sharpe.title'], { size: 26, fill: W.LAB, delay: 1.8 });
    const a = [110, 770], b = [900, 650], M = 40, lo = [], hi = [];
    for (let k = 0; k <= M; k++) { const t = k / M, bx = a[0] + (b[0] - a[0]) * t, by = a[1] + (b[1] - a[1]) * t;
      hi.push([bx, by - 14 * Math.sin(Math.PI * t)]);
      const j = k === 0 || k === M ? 0 : (Math.sin(t * 19) * 34 + Math.sin(t * 7 + 1) * 18) * (1 - 0.3 * t) + (rnd(k + 3, 9) - 0.5) * 14;
      lo.push([bx, by + j]); }
    sketch(s, lo, { stroke: W.DATA2, w: 2.4, seed: 101, amp: 1, step: 30, delay: 1.9, dur: 1 });
    sketch(s, hi, { stroke: W.DATA, w: 3.4, seed: 103, amp: 1, delay: 2, dur: 1 });
    [a, b].forEach((p) => el(s, 'circle', { cx: p[0], cy: p[1], r: 7, fill: W.DATA, class: 'pop', style: 'animation-delay:2.1s' }));
    fitX(T(s, 640, 620, COPY['c2.sharpe.high'], { size: 26, weight: 700, delay: 2.2 }), 5, 995);
    fitX(T(s, 900, 800, COPY['c2.sharpe.low'], { size: 24, fill: W.MUT, anchor: 'end', delay: 2.2 }), 5, 995);
  }

  // ════ ③ 人生 · 上：F3 hairline area；下：F11 tick gauge ════
  function clock3(s) {
    const B = 400, X0 = 80, X1 = 940;
    sketch(s, [[60, B], [960, B]], { stroke: W.LAB, w: 2.4, seed: 111, draw: false, ghost: false });
    sketch(s, [[60, B + 4], [60, 72]], { stroke: W.LAB, w: 2.4, seed: 112, draw: false, ghost: false });
    arrow(s, 60, 92, 60, 64, { head: 16, w: 2.4 }); arrow(s, 935, B, 962, B, { head: 16, w: 2.4 });
    T(s, 80, 74, COPY['c3.axis.y'], { size: 26, fill: W.MUT });
    T(s, 960, B + 46, COPY['c3.axis.x'], { size: 24, fill: W.MUT, anchor: 'end' });
    const N = 72, cv = [];
    for (let i = 0; i < N; i++) { const t = i / (N - 1); cv.push([X0 + t * (X1 - X0 - 40), B - (40 + 250 * (1 - Math.pow(t, 1.5) * 0.86))]); }
    for (let i = 0; i < N; i++) el(s, 'line', { x1: cv[i][0], y1: B, x2: cv[i][0], y2: cv[i][1], stroke: W.FD, 'stroke-width': 1.5, opacity: 0.5 + rnd(i + 1, 3) * 0.45, class: 'fade', style: `animation-delay:${i * 0.008}s` });
    sketch(s, cv, { stroke: W.DATA, w: 3.4, seed: 121, amp: 1.4, delay: 0.3 });
    [[0.08, 'c3.stage.young'], [0.42, 'c3.stage.mid'], [0.74, 'c3.stage.old']].forEach(([t, key]) => {
      const xx = X0 + t * (X1 - X0 - 40);
      el(s, 'line', { x1: xx, y1: B, x2: xx, y2: B + 12, stroke: W.LAB, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
      T(s, xx, B + 46, COPY[key], { size: 28, anchor: 'middle', fill: W.LAB }); });
    fitX(T(s, 470, 140, COPY['c3.curve.note'], { size: 30, weight: 700, delay: 1.2 }), 5, 995);
    const q = cv[Math.round(N * 0.62)]; arrow(s, 600, 156, q[0] + 8, q[1] - 16, { bend: 30, delay: 1.3 });
    const cx = 500, cy = 780, R0 = 175, TK = 60;
    fitX(T(s, cx, 505, COPY['c3.gauge.title'], { size: 26, fill: W.LAB, anchor: 'middle', delay: 1.4 }), 5, 995);
    for (let k = 0; k < TK; k++) { const a = 180 + (k + 0.5) / TK * 180, len = 16 + rnd(k + 1, 3) * 10 + (Math.abs(k - TK / 2) / (TK / 2)) * 12;
      const [x1, y1] = pol(cx, cy, R0, a), [x2, y2] = pol(cx, cy, R0 + len, a);
      el(s, 'line', { x1, y1, x2, y2, stroke: k < TK / 2 ? W.DATA2 : W.DATA, 'stroke-width': k < TK / 2 ? 1.8 : 2, 'stroke-linecap': 'round', class: 'fade', style: `animation-delay:${1.4 + k * 0.012}s` }); }
    const [m1x, m1y] = pol(cx, cy, R0 - 12, 270); el(s, 'circle', { cx: m1x, cy: m1y, r: 3, fill: W.FAINT });
    const arc = []; for (let k = 0; k <= 16; k++) arc.push(pol(cx, cy, R0 - 46, 215 + k * (110 / 16)));
    sketch(s, arc, { stroke: W.FAINT, w: 2, dash: '7 8', seed: 131, ghost: false, delay: 1.9 });
    const [nx, ny] = pol(cx, cy, R0 - 14, 312);
    sketch(s, [[cx, cy], [nx, ny]], { stroke: W.HERO, w: 5.5, seed: 141, amp: 0.8, ghost: false, delay: 2, dur: 0.5 });
    el(s, 'circle', { cx, cy, r: 13, fill: W.BG, stroke: W.DATA, 'stroke-width': 3, class: 'pop', style: 'animation-delay:2s' });
    T(s, cx - R0 - 44, cy - 6, COPY['c3.gauge.left'], { size: 32, weight: 700, anchor: 'end', delay: 2.1 });
    fitX(T(s, cx - R0 - 44, cy + 32, COPY['c3.gauge.left.sub'], { size: 22, fill: W.MUT, anchor: 'end', delay: 2.1 }), 5, 995);
    T(s, cx + R0 + 44, cy - 6, COPY['c3.gauge.right'], { size: 32, weight: 700, anchor: 'start', delay: 2.1 });
    fitX(T(s, cx + R0 + 44, cy + 32, COPY['c3.gauge.right.sub'], { size: 22, fill: W.MUT, anchor: 'start', delay: 2.1 }), 5, 995);
  }

  function venn(s) {
    ring(s, 44, 32, 22, { seed: 201, w: 1.8 }); ring(s, 72, 32, 22, { seed: 203, w: 1.8 }); ring(s, 58, 54, 22, { seed: 205, w: 1.8 });
    el(s, 'circle', { cx: 58, cy: 40, r: 5, fill: W.HERO, class: 'pop', style: 'animation-delay:1s' });
  }

  function conclusionHTML() {
    let h = esc(COPY['foot.conclusion']);
    (COPY['foot.conclusion.hl'] || []).forEach((w) => { h = h.split(esc(w)).join('<b>' + esc(w) + '</b>'); });
    return h;
  }

  // ── 组装 DOM ──
  const COLS = [
    { k: 'c1', note: 'note1', icon: [8, 0, 21], draw: clock1 },
    { k: 'c2', note: 'note2', icon: [2, 45, 33], draw: clock2 },
    { k: 'c3', note: 'note3', icon: [10, 20, 47], draw: clock3 }
  ];
  const VB_H = 830;

  function build(panel) {
    const body = panel.querySelector('.tc-body');
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'tc-clocks';
    COLS.forEach((c, i) => {
      const col = document.createElement('div');
      col.className = 'tc-col'; col.dataset.i = String(i + 1);
      col.setAttribute('role', 'button'); col.setAttribute('tabindex', '0');
      col.setAttribute('aria-label', COPY[c.k + '.title'] + '（展开解读）');
      const desc = COPY[c.k + '.desc'];
      col.innerHTML =
        `<div class="tc-head"><svg class="tc-icon" viewBox="0 0 48 48" aria-hidden="true"></svg>` +
        `<div><div class="tc-title">${esc(COPY[c.k + '.title'])}</div>${desc ? `<div class="tc-desc">${esc(desc)}</div>` : ''}</div></div>` +
        `<svg class="tc-chart" viewBox="0 0 1000 ${VB_H}" role="img" aria-label="${esc(COPY[c.k + '.title'])}（示意图）"></svg>` +
        `<div class="tc-sticky" role="note"><svg class="tc-clip" viewBox="0 0 40 92" aria-hidden="true"></svg>` +
        `<h4>${esc(COPY[c.note + '.title'])}</h4><p>${esc(COPY[c.note + '.p1'])}</p><p>${esc(COPY[c.note + '.p2'])}</p></div>`;
      grid.appendChild(col);
    });
    body.appendChild(grid);
    const foot = document.createElement('div');
    foot.className = 'tc-foot';
    foot.innerHTML = '<svg class="tc-venn" viewBox="0 0 120 80" aria-hidden="true"></svg><div class="tc-foot-text">' + conclusionHTML() + '</div>';
    body.appendChild(foot);
    const src = document.createElement('div');
    src.className = 'tc-src'; src.textContent = COPY['src.url'];
    body.appendChild(src);

    const cols = [...grid.querySelectorAll('.tc-col')];
    cols.forEach((col, i) => {
      icon(col.querySelector('.tc-icon'), ...COLS[i].icon);
      clip(col.querySelector('.tc-clip'));
      COLS[i].draw(col.querySelector('.tc-chart'));
    });
    venn(foot.querySelector('.tc-venn'));

    // 交互：桌面悬停（CSS）；触屏 / 键盘点击切换，点空白处关闭
    const toggle = (col) => { const on = !col.classList.contains('open'); cols.forEach((o) => o.classList.remove('open')); if (on) col.classList.add('open'); };
    cols.forEach((col) => {
      col.addEventListener('click', (e) => { e.stopPropagation(); toggle(col); });
      col.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(col); } });
    });
    // 只响应真实点击：站内其他面板在手机端会程序化 .click()（如热力图「近 5 年」），冒泡上来不应关掉便利贴
    document.addEventListener('click', (e) => { if (e.isTrusted) cols.forEach((o) => o.classList.remove('open')); });
    // 截图 / 预览参数：?tc_open=1|2|3|all 强制展开；?tc_still=1 关动画
    const qs = new URLSearchParams(location.search);
    if (qs.get('tc_still')) document.documentElement.classList.add('tc-still');
    const op = qs.get('tc_open');
    if (op) cols.forEach((c) => { if (op === 'all' || op.split(',').includes(c.dataset.i)) c.classList.add('open'); });
    return cols;
  }

  // ── 导出：三栏拼成一张 3000px 宽 SVG → canvas → AK.exportPNG（叠加 panel-title / desc / 来源） ──
  function exportSVG(panel) {
    const cols = [...panel.querySelectorAll('.tc-col')];
    const HEAD = 150, CH = VB_H, FOOT = 150, Hh = HEAD + CH + FOOT;
    let out = `<svg xmlns="${NS}" width="3000" height="${Hh}" viewBox="0 0 3000 ${Hh}" font-family="${FONT.replace(/'/g, '&apos;')}">` +
      `<rect width="3000" height="${Hh}" fill="#FFFFFF"/>`;
    cols.forEach((col, i) => {
      const ox = i * 1000, c = COLS[i];
      if (i) out += `<line x1="${ox}" y1="40" x2="${ox}" y2="${HEAD + CH - 20}" stroke="${W.GRID}" stroke-width="3" stroke-dasharray="10 8"/>`;
      out += `<g transform="translate(${ox + 40} 34) scale(1.9)">${col.querySelector('.tc-icon').innerHTML}</g>`;
      out += `<text x="${ox + 150}" y="${COPY[c.k + '.desc'] ? 84 : 102}" font-size="42" font-weight="700" fill="${W.TXT}">${esc(COPY[c.k + '.title'])}</text>`;
      if (COPY[c.k + '.desc']) out += `<text x="${ox + 150}" y="128" font-size="28" fill="${W.MUT}">${esc(COPY[c.k + '.desc'])}</text>`;
      out += `<g transform="translate(${ox} ${HEAD})">${col.querySelector('.tc-chart').innerHTML}</g>`;
    });
    const fy = HEAD + CH;
    out += `<line x1="30" y1="${fy}" x2="2970" y2="${fy}" stroke="${W.GRID}" stroke-width="3" stroke-dasharray="10 8"/>`;
    out += `<g transform="translate(40 ${fy + 22}) scale(1.3)">${panel.querySelector('.tc-venn').innerHTML}</g>`;
    let tsp = esc(COPY['foot.conclusion']);
    (COPY['foot.conclusion.hl'] || []).forEach((w) => { tsp = tsp.split(esc(w)).join(`<tspan fill="${W.HERO}" font-weight="700">${esc(w)}</tspan>`); });
    out += `<text x="230" y="${fy + 88}" font-size="40" fill="${W.TXT}">${tsp}</text>`;
    out += '</svg>';
    return { svg: out, w: 3000, h: Hh };
  }
  async function doExport(panel, btn) {
    const orig = btn.innerHTML;
    btn.disabled = true; btn.textContent = '…';
    try {
      const { svg, w, h } = exportSVG(panel);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG 栅格化失败')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const title = (panel.querySelector('.panel-title') || {}).textContent || '';
      const desc = (panel.querySelector('.panel-desc') || {}).textContent || '';
      await window.AK.exportPNG(cv, 3000, 'three-clocks.png', null, { title: title.trim(), desc: desc.trim(), source: 'A股看板 · ' + COPY['src.url'] });
      btn.textContent = '✓';
    } catch (e) { console.error('[three-clocks] 导出失败', e); btn.textContent = '!'; }
    setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 1200);
  }

  function init() {
    const panel = document.getElementById('panel-three-clocks');
    if (!panel || panel.__tcInit) return;
    panel.__tcInit = true;
    try {
      build(panel);
      const btn = panel.querySelector('.tc-export');
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); if (!btn.disabled) doExport(panel, btn); });
    } catch (e) {
      console.error('[three-clocks] 渲染失败', e);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
