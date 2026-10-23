// ══════════════════════════════════════════════════════════════════
// js/daily-overview.js · 「日度全貌」独立预览页渲染器
// 纵向热力图：左列年份，每个年份的交易日折成 2-3 行小格子（非交易日不显示），
// 绿=涨 红=跌 白=0；最深绿=该指数历史最大单日涨幅，最深红=最大单日跌幅。
// 三个维度（标普500 / 纳指100 / 道琼斯）点选切换；Canvas 渲染。
// 数据：js/daily-overview-data.js 内嵌（window.__DO_DATA__），file:// 直开可用。
// 2026-10-23 老钱修订：年份间分割线；右侧不留大留白（行数自适应折行）；
// 删「数据更新」；最新收盘用 ｜ 且点位无千分逗号；热力图上/下沿留白；
// 颜色饱和点 ±8%（2026-10-23 二次修订：8% 以上足够深）。
// ══════════════════════════════════════════════════════════════════

const DIMS = [
  { key: 'spx', label: '标普500' },
  { key: 'ndx', label: '纳指100' },
  { key: 'dji', label: '道琼斯' },
];

const GREEN = [56, 158, 13];     // #389e0d（站点统一正收益色）
const RED   = [207, 19, 34];     // #cf1322（站点统一负收益色）
const SAT_RET = 0.08;            // 颜色饱和点：涨跌幅 ±8% 即为最深色（2026-10-23 老钱修订：8% 以上要足够深，不再按历史极值归一）
const GRAY  = '#999999';
const BORDER = '#e8e8e8';
const YEAR_W = 46;               // 左列年份栏宽度
const TARGET_COLS = 127;         // 每行目标格数（行数=ceil(天数/127)，2-3 行，避免右侧大留白）
const GAP_X = 1;
const GAP_Y = 1;
const BLOCK_GAP = 5;             // 年份块间距（内含分割线）
const PAD_TOP = 12;              // 热力图区上沿留白
const PAD_BOTTOM = 16;           // 热力图区下沿留白

const state = {
  dimKey: 'spx',
  cellW: 6,
  strideX: 7,
  strideY: 7,
  maxCols: TARGET_COLS,
  data: {},         // dimKey -> { updated, first, last, lastClose, years:[...], maxPos, minNeg, maxDay, minDay }
};

const canvas = document.getElementById('heatCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('heatTooltip');

// ── 工具 ──
function lerp(a, b, t) { return a + (b - a) * t; }
function colorStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function fmtPct(v, digits = 2) { return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`; }
function fmtNum(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }   // 计数（交易日数）用
function fmtPts(n) { return n.toFixed(2); }                                               // 点位用：无千分逗号
function dateStrFromInt(n) {
  const y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function cellColor(ret) {
  if (ret == null) return null;               // 无前收（该指数首个交易日）
  if (ret === 0) return 'rgb(255,255,255)';
  if (ret > 0) {
    const t = Math.min(1, ret / SAT_RET);      // 涨幅 ≥8% → 最深绿
    return colorStr([lerp(255, GREEN[0], t), lerp(255, GREEN[1], t), lerp(255, GREEN[2], t)]);
  }
  const t = Math.min(1, -ret / SAT_RET);       // 跌幅 ≥8% → 最深红
  return colorStr([lerp(255, RED[0], t), lerp(255, RED[1], t), lerp(255, RED[2], t)]);
}

// ── 数据（内嵌）──
function buildYears(series) {
  const byYear = new Map();
  let maxPos = 0, minNeg = 0, maxDay = null, minDay = null;
  for (const [dateInt, close, ret] of series) {
    const y = Math.floor(dateInt / 10000);
    if (!byYear.has(y)) byYear.set(y, { year: y, days: [] });
    const day = { date: dateStrFromInt(dateInt), close, ret };
    byYear.get(y).days.push(day);
    if (ret != null) {
      if (ret > maxPos) { maxPos = ret; maxDay = day; }
      if (ret < minNeg) { minNeg = ret; minDay = day; }
    }
  }
  const years = Array.from(byYear.values()).sort((a, b) => b.year - a.year); // 最新年在顶
  for (const y of years) {
    // 按 TARGET_COLS 折行：正常年份 2 行、六日制早期年份 3 行，行尽量满宽
    const k = Math.ceil(y.days.length / TARGET_COLS);
    const cs = Math.ceil(y.days.length / k);
    y.rows = [];
    for (let r = 0; r < k; r++) {
      y.rows.push({ start: r * cs, len: Math.min(cs, y.days.length - r * cs) });
    }
  }
  let maxCols = 0;
  for (const y of years) for (const r of y.rows) maxCols = Math.max(maxCols, r.len);
  return { years, maxPos, minNeg, maxDay, minDay, maxCols };
}

function loadDim(key) {
  if (state.data[key]) return state.data[key];
  const raw = (window.__DO_DATA__ || {})[key];
  if (!raw || !Array.isArray(raw.series)) throw new Error(`内嵌数据缺失: ${key}`);
  const built = buildYears(raw.series);
  state.data[key] = {
    updated: raw.updated, first: raw.first, last: raw.last, lastClose: raw.lastClose,
    ...built,
  };
  return state.data[key];
}

// ── 布局尺寸（自适应容器宽，不横向拖拽）──
function computeLayout() {
  const wrap = document.getElementById('heatWrap');
  const availW = Math.max(320, wrap.clientWidth - 12);
  const data = state.data[state.dimKey];
  state.maxCols = Math.max(data.maxCols, 1);
  const cellW = Math.max(3, Math.floor((availW - YEAR_W - state.maxCols * GAP_X) / state.maxCols));
  state.cellW = cellW;
  state.strideX = cellW + GAP_X;
  state.strideY = cellW + GAP_Y;
  // 计算每个年份块的 yTop（块高随行数 2/3 变化）
  let cursor = PAD_TOP;
  for (const y of data.years) {
    y.yTop = cursor;
    y.blockH = y.rows.length * state.strideY;
    cursor += y.blockH + BLOCK_GAP;
  }
  return cursor - BLOCK_GAP + PAD_BOTTOM;   // 总高
}

// ── 渲染 ──
function setupCanvas(widthPx, heightPx) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${heightPx}px`;
  canvas.width = Math.round(widthPx * dpr);
  canvas.height = Math.round(heightPx * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
}

function draw(dimKey) {
  const data = state.data[dimKey];
  const heightPx = computeLayout();
  const widthPx = YEAR_W + state.maxCols * state.strideX;
  setupCanvas(widthPx, heightPx);

  // 年份列底纹（含上下沿留白）
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, YEAR_W, heightPx);
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(YEAR_W + 0.5, 0);
  ctx.lineTo(YEAR_W + 0.5, heightPx);
  ctx.stroke();

  data.years.forEach((y) => {
    const yTop = y.yTop;
    // 年份标签：垂直居中于年份块
    ctx.fillStyle = GRAY;
    ctx.font = '600 10px Inter, -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(y.year), YEAR_W - 6, yTop + y.blockH / 2);

    // 年份间分割线（十年分隔线加深加粗）
    if (yTop > PAD_TOP) {
      const decade = y.year % 10 === 0;
      ctx.fillStyle = decade ? '#b8b8b8' : '#e0e0e0';
      const yy = yTop - BLOCK_GAP / 2;
      ctx.fillRect(0, yy - (decade ? 1 : 0), widthPx, decade ? 2 : 1);
    }

    // 格子：按行分块绘制
    y.rows.forEach((r, sub) => {
      for (let i = 0; i < r.len; i++) {
        const day = y.days[r.start + i];
        const c = cellColor(day.ret);
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(YEAR_W + i * state.strideX, yTop + sub * state.strideY, state.cellW, state.cellW);
      }
    });
  });

  updateStats(dimKey);
}

function updateStats(dimKey) {
  const data = state.data[dimKey];
  const el = id => document.getElementById(id);
  el('statRange').textContent = `${data.first.slice(0, 4)} – ${data.last.slice(0, 4)}`;
  const total = data.years.reduce((s, y) => s + y.days.length, 0);
  el('statDays').textContent = `${fmtNum(total)} 个交易日`;
  el('statMaxGain').textContent = data.maxDay ? fmtPct(data.maxDay.ret) : '—';
  el('statMaxGain').title = data.maxDay ? data.maxDay.date : '';
  el('statMaxLoss').textContent = data.minDay ? fmtPct(data.minDay.ret) : '—';
  el('statMaxLoss').title = data.minDay ? data.minDay.date : '';
  // 最新收盘：日期 ｜ 点位（点位不带千分逗号）——数据更新已并入，删独立项
  el('statLatest').textContent = data.last ? `${data.last}｜${fmtPts(data.lastClose)}` : '—';
  el('legendLeft').textContent = data.minDay ? fmtPct(data.minDay.ret) : '—';
  el('legendLeft').title = data.minDay ? `最大单日跌幅 ${data.minDay.date}` : '';
  el('legendRight').textContent = data.maxDay ? fmtPct(data.maxDay.ret) : '—';
  el('legendRight').title = data.maxDay ? `最大单日涨幅 ${data.maxDay.date}` : '';
}

// ── 悬停 ──
function locate(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const data = state.data[state.dimKey];
  if (!data) return null;
  if (x <= YEAR_W || x >= YEAR_W + state.maxCols * state.strideX) return null;
  if (y < PAD_TOP) return null;
  const year = data.years.find(blk => y >= blk.yTop && y < blk.yTop + blk.blockH);
  if (!year) return null;
  const sub = Math.floor((y - year.yTop) / state.strideY);
  const row = year.rows[sub];
  if (!row) return null;
  const cInRow = Math.floor((x - YEAR_W) / state.strideX);
  if (cInRow < 0 || cInRow >= row.len) return null;
  const day = year.days[row.start + cInRow];
  if (!day) return null;
  return { day, year: year.year };
}

function showTooltip(hit, clientX, clientY) {
  const { day } = hit;
  const up = day.ret > 0;
  const c = cellColor(day.ret);
  tooltip.innerHTML = `
    <div class="tt-title">${day.date}</div>
    <div class="tt-row" style="color:${up ? colorStr(GREEN) : colorStr(RED)}">
      <span class="tt-dot" style="background:${c}"></span>
      <b>${fmtPct(day.ret)}</b>
    </div>
    <div class="tt-sub">收盘 ${fmtPts(day.close)}</div>`;
  tooltip.classList.add('is-visible');
  const pad = 12, off = 14;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let left = clientX + off;                                  // 视口坐标（tooltip 为 fixed）
  if (left + tw > window.innerWidth - pad) left = clientX - tw - off;
  let top = clientY + off;
  if (top + th > window.innerHeight - pad) top = clientY - th - off;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

canvas.addEventListener('mousemove', e => {
  const hit = locate(e);
  if (hit) showTooltip(hit, e.clientX, e.clientY);
  else tooltip.classList.remove('is-visible');
});
canvas.addEventListener('mouseleave', () => tooltip.classList.remove('is-visible'));

// ── 维度切换 / 重绘 ──
function render(key) {
  const heat = document.getElementById('heatWrap');
  heat.style.opacity = '0.35';
  try {
    loadDim(key);
    draw(key);
    document.getElementById('loadError')?.classList.remove('is-visible');
  } catch (err) {
    console.error('[daily-overview] render failed:', err);
    document.getElementById('loadError')?.classList.add('is-visible');
  }
  heat.style.opacity = '1';
}

function setDim(key) {
  state.dimKey = key;
  document.querySelectorAll('.dim-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dim === key);
  });
  render(key);
}

// ── 导出 PNG ──
document.getElementById('btnExport').addEventListener('click', () => {
  const dim = DIMS.find(d => d.key === state.dimKey);
  const a = document.createElement('a');
  a.download = `日度全貌_${dim.label}_${new Date().toISOString().slice(0, 10)}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// ── 初始化 ──
document.querySelectorAll('.dim-tab').forEach(btn => {
  btn.addEventListener('click', () => setDim(btn.dataset.dim));
});
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(state.dimKey), 150);
});
// 预构建三份数据（内嵌，秒读）
DIMS.forEach(d => { try { loadDim(d.key); } catch (_) {} });
render(state.dimKey);
