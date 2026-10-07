// ══════════════════════════════════════════════════════
// summary.js · 汇总页（中文站）—— 全部面板的缩略总览
//
// 数据：data/summary_thumbs.json（scripts/build_summary.py 生成，随每日管线刷新）
// 排布：**一整片横向网格**——55 张卡片从左到右平铺换行（与美债看板汇总页同构），
//       不按分类切成竖列；分类信息走「卡片右上角小标签」+ 顶部标签筛选。
// 交互：点卡片 → index.html#panel-xxx；点分类标签 → 只留该类；点顶部「汇总」→ 还原全部。
// 迷你图用页面已载入的 ECharts，剥掉坐标轴/图例/tooltip，进入视口才实例化（懒渲染）。
// ══════════════════════════════════════════════════════

const DATA_URL = 'data/summary_thumbs.json?v=20261007232053';
const PALETTE = ['#2563eb', '#389e0d', '#cf1322', '#d48806', '#722ed1'];

/* 分类主题色（老钱 2026-10-07 指定）：
   纳斯达克100与道琼斯(cross) → 绿 #389e0d；资金流(flows) → 红 #cf1322。
   其余分类沿用 PALETTE 默认（单序列＝蓝）。取色只用 theme.css 既有色号，同分类多序列用同色透明度分档区分。 */
const CAT_THEME = { cross: '#389e0d', flows: '#cf1322' };
const hexA = (hex, a) => `rgba(${(parseInt(hex.slice(1), 16) >> 16) & 255},${(parseInt(hex.slice(1), 16) >> 8) & 255},${parseInt(hex.slice(1), 16) & 255},${a})`;
function seriesColor(rec, s, i) {
  const theme = CAT_THEME[rec.cat];
  if (!theme) return s.name ? PALETTE[i % PALETTE.length] : PALETTE[0];
  if (!s.name || i === 0) return theme;
  return hexA(theme, i === 1 ? 0.5 : 0.28);
}

const grid = document.getElementById('summaryGrid');
let charts = [];   // {el, rec}
let catLabel = {}; // cat id → 中文名

/* 汇总入口在汇总页上即为当前页 → 标记 active；分类标签初始不选中（本页展示全部） */
document.querySelectorAll('.nav-summary, .category-summary').forEach(el => el.classList.add('active'));
document.querySelectorAll('.category-tab').forEach(el => el.classList.remove('active'));

function miniOption(rec) {
  const series = (rec.series || []).filter(s => (s.pts && s.pts.length) || (s.xy && s.xy.length));
  const base = {
    animation: false,
    grid: { left: 4, right: 4, top: 6, bottom: 6, containLabel: false },
    tooltip: { show: false },
    legend: { show: false },
    xAxis: { type: 'category', show: false, boundaryGap: rec.kind === 'bar' },
    yAxis: { type: 'value', show: false, scale: true },
  };
  if (rec.kind === 'scatter') {
    return {
      ...base,
      xAxis: { type: 'value', show: false, scale: true },
      yAxis: { type: 'value', show: false, scale: true },
      series: series.map(s => ({
        type: 'scatter', data: s.xy, symbolSize: 3, color: CAT_THEME[rec.cat] || PALETTE[0], silent: true,
      })),
    };
  }
  return {
    ...base,
    series: series.map((s, i) => {
      const color = seriesColor(rec, s, i);
      const data = (s.labels || []).map((l, j) => [l, s.pts[j]]);
      return {
        type: rec.kind === 'bar' ? 'bar' : 'line',
        data: s.labels ? data : s.pts,
        color,
        silent: true,
        symbol: 'none',
        smooth: false,
        lineStyle: { width: 1.6 },
        areaStyle: rec.kind === 'area' ? { opacity: 0.14 } : undefined,
        barMaxWidth: 14,
      };
    }),
  };
}

function decoSvg(d) {
  const W = 220, H = 44;
  let inner = '';
  const t = d && d.type;
  if (t === 'yearstrip') {
    const n = Math.max(Math.min(d.n || 40, 90), 2);
    for (let i = 0; i < n; i++) {
      const x = 4 + i * ((W - 8) / (n - 1));
      const h = 10 + ((i * 37) % 22);
      inner += `<line x1="${x.toFixed(1)}" y1="${(H / 2 - h / 2).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(H / 2 + h / 2).toFixed(1)}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="${(0.3 + (i % 5) * 0.14).toFixed(2)}"/>`;
    }
  } else if (t === 'squares') {
    const n = Math.max(Math.min(d.n || 7, 9), 1);
    const s = 12;
    const gap = (W - 40 - n * s) / Math.max(n - 1, 1);
    for (let i = 0; i < n; i++) {
      const x = 20 + i * (s + gap);
      inner += `<rect x="${x.toFixed(1)}" y="${(H / 2 - s / 2).toFixed(1)}" width="${s}" height="${s}" rx="2" fill="${i % 2 === 0 ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.2" opacity="${i % 2 === 0 ? 0.5 : 0.28}"/>`;
    }
  } else if (t === 'lines') {
    const n = Math.max(Math.min(d.n || 4, 6), 1);
    for (let i = 0; i < n; i++) {
      const y = 10 + i * ((H - 20) / Math.max(n - 1, 1));
      const w = W - 40 - i * 22;
      inner += `<rect x="20" y="${y.toFixed(1)}" width="${w.toFixed(0)}" height="4" rx="2" fill="currentColor" opacity="${(0.45 - i * 0.06).toFixed(2)}"/>`;
    }
  } else if (t === 'quote') {
    inner = `<text x="${W / 2}" y="${H / 2 + 2}" text-anchor="middle" dominant-baseline="middle" font-size="32" fill="currentColor" opacity="0.42">「」</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="summary-deco" aria-hidden="true">${inner}</svg>`;
}

function renderCard(rec) {
  const a = document.createElement('a');
  a.className = 'summary-card';
  a.href = `index.html#${rec.id}`;
  a.dataset.cat = rec.cat || '';

  const head = document.createElement('div');
  head.className = 'summary-card-head';
  const t = document.createElement('span');
  t.className = 'summary-card-title';
  t.textContent = rec.zh || rec.id;
  head.appendChild(t);
  if (catLabel[rec.cat]) {
    const chip = document.createElement('span');
    chip.className = 'summary-chip';
    chip.textContent = catLabel[rec.cat];
    head.appendChild(chip);
  }
  a.appendChild(head);

  const thumb = document.createElement('div');
  thumb.className = 'summary-thumb';
  a.appendChild(thumb);

  if (rec.kind === 'none' || !(rec.series || []).length) {
    thumb.classList.add('is-text');
    const icon = document.createElement('div');
    icon.className = 'summary-thumb-icon';
    icon.innerHTML = rec.deco
      ? decoSvg(rec.deco)
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5h14M5 10h14M5 15h9" stroke-linecap="round"/></svg>';
    const txt = document.createElement('span');
    txt.textContent = rec.preview || '图表';
    thumb.appendChild(icon);
    thumb.appendChild(txt);
  } else {
    charts.push({ el: thumb, rec });
  }
  return a;
}

/* 分类标签 = 筛选；顶部「汇总」= 还原全部 */
function applyFilter(cat) {
  document.querySelectorAll('.summary-card').forEach(c => {
    c.hidden = !!cat && c.dataset.cat !== cat;
  });
  const tabs = Array.from(document.querySelectorAll('.category-tab[data-category]'));
  tabs.forEach(t => t.classList.toggle('active', !!cat && t.dataset.category === cat));
  document.querySelectorAll('.category-summary').forEach(el => el.classList.toggle('active', !cat));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function build(data) {
  grid.innerHTML = '';
  charts = [];
  catLabel = {};
  data.categories.forEach(c => { catLabel[c.id] = c.zh; });

  const g = document.createElement('div');
  g.className = 'summary-grid';
  data.panels.forEach(p => g.appendChild(renderCard(p)));
  grid.appendChild(g);

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      const item = charts.find(c => c.el === e.target);
      if (item) {
        try {
          const chart = echarts.init(item.el, null, { renderer: 'svg' });
          chart.setOption(miniOption(item.rec));
        } catch (err) { console.warn('[summary] chart failed', item.rec.id, err); }
      }
    });
  }, { rootMargin: '200px' });
  charts.forEach(c => io.observe(c.el));

  document.querySelectorAll('.category-tab[data-category]').forEach(tab => {
    tab.addEventListener('click', () => applyFilter(tab.dataset.category));
  });
  document.querySelectorAll('.category-summary').forEach(el => {
    el.addEventListener('click', (ev) => { ev.preventDefault(); applyFilter(null); });
  });
}

fetch(DATA_URL, { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(build)
  .catch(err => {
    console.warn('[summary] load failed', err);
    grid.innerHTML = '<div class="summary-loading">缩略图数据加载失败，请稍后重试。</div>';
  });
