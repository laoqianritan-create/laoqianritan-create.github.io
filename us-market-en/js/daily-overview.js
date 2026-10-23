// ══════════════════════════════════════════════════════════════════
// js/daily-overview.js (EN mirror) · Daily Overview renderer
// Vertical heatmap: year column on the left, each year's trading days
// wrapped into 2-3 short rows (non-trading days skipped). Green=up,
// red=down, white=0; deepest green = that index's record daily gain,
// deepest red = record daily loss. Three selectable dimensions
// (S&P 500 / Nasdaq 100 / Dow Jones); Canvas rendering.
// Data: js/daily-overview-data.js embedded (window.__DO_DATA__),
// works when opened directly via file://.
// EN mirror of site/js/daily-overview.js (labels only differ).
// ══════════════════════════════════════════════════════════════════

const DIMS = [
  { key: 'spx', label: 'S&P 500' },
  { key: 'ndx', label: 'Nasdaq 100' },
  { key: 'dji', label: 'Dow Jones' },
];

const GREEN = [56, 158, 13];     // #389e0d (site-wide positive color)
const RED   = [207, 19, 34];     // #cf1322 (site-wide negative color)
const SAT_RET = 0.05;            // Color saturates at ±5% daily move
const GRAY  = '#999999';
const BORDER = '#e8e8e8';
const YEAR_W = 46;               // Left year-column width
const TARGET_COLS = 127;         // Target cells per row (rows = ceil(days/127), 2-3 rows, no big right whitespace)
const GAP_X = 1;
const GAP_Y = 1;
const BLOCK_GAP = 5;             // Gap between year blocks (holds the divider line)
const PAD_TOP = 12;              // Top padding of the heatmap area
const PAD_BOTTOM = 16;           // Bottom padding of the heatmap area

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

// ── Helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }
function colorStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function fmtPct(v, digits = 2) { return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`; }
function fmtNum(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }   // counts (trading days)
function fmtPts(n) { return n.toFixed(2); }                                               // price points: no thousands comma
function dateStrFromInt(n) {
  const y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function cellColor(ret) {
  if (ret == null) return null;               // first trading day of the series (no prior close)
  if (ret === 0) return 'rgb(255,255,255)';
  if (ret > 0) {
    const t = Math.min(1, ret / SAT_RET);      // gain ≥5% → deepest green
    return colorStr([lerp(255, GREEN[0], t), lerp(255, GREEN[1], t), lerp(255, GREEN[2], t)]);
  }
  const t = Math.min(1, -ret / SAT_RET);       // loss ≥5% → deepest red
  return colorStr([lerp(255, RED[0], t), lerp(255, RED[1], t), lerp(255, RED[2], t)]);
}

// ── Data (embedded) ──
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
  const years = Array.from(byYear.values()).sort((a, b) => b.year - a.year); // newest year on top
  for (const y of years) {
    // Wrap by TARGET_COLS: normal years 2 rows, six-day-era early years 3 rows, rows near full width
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
  if (!raw || !Array.isArray(raw.series)) throw new Error(`embedded data missing: ${key}`);
  const built = buildYears(raw.series);
  state.data[key] = {
    updated: raw.updated, first: raw.first, last: raw.last, lastClose: raw.lastClose,
    ...built,
  };
  return state.data[key];
}

// ── Layout (adaptive to container width, no horizontal drag) ──
function computeLayout() {
  const wrap = document.getElementById('heatWrap');
  const availW = Math.max(320, wrap.clientWidth - 12);
  const data = state.data[state.dimKey];
  state.maxCols = Math.max(data.maxCols, 1);
  const cellW = Math.max(3, Math.floor((availW - YEAR_W - state.maxCols * GAP_X) / state.maxCols));
  state.cellW = cellW;
  state.strideX = cellW + GAP_X;
  state.strideY = cellW + GAP_Y;
  // yTop per year block (block height varies with 2/3 rows)
  let cursor = PAD_TOP;
  for (const y of data.years) {
    y.yTop = cursor;
    y.blockH = y.rows.length * state.strideY;
    cursor += y.blockH + BLOCK_GAP;
  }
  return cursor - BLOCK_GAP + PAD_BOTTOM;   // total height
}

// ── Render ──
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

  // Year-column background (includes top/bottom padding)
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, YEAR_W, heightPx);
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(YEAR_W + 0.5, 0);
  ctx.lineTo(YEAR_W + 0.5, heightPx);
  ctx.stroke();

  data.years.forEach((y) => {
    const yTop = y.yTop;
    // Year label, vertically centered on the block
    ctx.fillStyle = GRAY;
    ctx.font = '600 10px Inter, -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(y.year), YEAR_W - 6, yTop + y.blockH / 2);

    // Divider line between years (decade lines darker/thicker)
    if (yTop > PAD_TOP) {
      const decade = y.year % 10 === 0;
      ctx.fillStyle = decade ? '#b8b8b8' : '#e0e0e0';
      const yy = yTop - BLOCK_GAP / 2;
      ctx.fillRect(0, yy - (decade ? 1 : 0), widthPx, decade ? 2 : 1);
    }

    // Cells, row by row
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
  el('statDays').textContent = `${fmtNum(total)} trading days`;
  el('statMaxGain').textContent = data.maxDay ? fmtPct(data.maxDay.ret) : '—';
  el('statMaxGain').title = data.maxDay ? data.maxDay.date : '';
  el('statMaxLoss').textContent = data.minDay ? fmtPct(data.minDay.ret) : '—';
  el('statMaxLoss').title = data.minDay ? data.minDay.date : '';
  // Latest close: date ｜ points (points without thousands comma)
  el('statLatest').textContent = data.last ? `${data.last}｜${fmtPts(data.lastClose)}` : '—';
  el('legendLeft').textContent = data.minDay ? fmtPct(data.minDay.ret) : '—';
  el('legendLeft').title = data.minDay ? `Largest daily loss ${data.minDay.date}` : '';
  el('legendRight').textContent = data.maxDay ? fmtPct(data.maxDay.ret) : '—';
  el('legendRight').title = data.maxDay ? `Largest daily gain ${data.maxDay.date}` : '';
}

// ── Hover ──
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
    <div class="tt-sub">Close ${fmtPts(day.close)}</div>`;
  tooltip.classList.add('is-visible');
  const pad = 12, off = 14;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let left = clientX + off;                                  // viewport coords (tooltip is fixed)
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

// ── Dimension switch / redraw ──
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

// ── Export PNG ──
document.getElementById('btnExport').addEventListener('click', () => {
  const dim = DIMS.find(d => d.key === state.dimKey);
  const a = document.createElement('a');
  const fname = `daily-overview_${dim.label.replace(/[^A-Za-z0-9]/g, '')}_${new Date().toISOString().slice(0, 10)}.png`;
  a.download = fname;
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// ── Init ──
document.querySelectorAll('.dim-tab').forEach(btn => {
  btn.addEventListener('click', () => setDim(btn.dataset.dim));
});
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(state.dimKey), 150);
});
// Pre-build all three dims (embedded, instant)
DIMS.forEach(d => { try { loadDim(d.key); } catch (_) {} });
render(state.dimKey);
