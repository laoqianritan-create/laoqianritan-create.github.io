// ══════════════════════════════════════════════════════
// summary.js · 汇总页（中文站）—— 全部面板的缩略总览
//
// 数据：data/summary_thumbs.json（scripts/build_summary.py 生成，随每日管线刷新）
// 每张卡片 = 面板标题 + 迷你图；点卡片 → index.html#panel-xxx
// 迷你图用 ECharts（页面已从 CDN 载入），剥掉坐标轴标签/图例/tooltip，
// 只在进入视口时才实例化（55 张图，懒渲染避免卡顿）。
// ══════════════════════════════════════════════════════

const DATA_URL = 'data/summary_thumbs.json?v=20261007151606';
const PALETTE = ['#2563eb', '#389e0d', '#cf1322', '#d48806', '#722ed1'];

const grid = document.getElementById('summaryGrid');
let charts = [];   // {el, rec}

/* 汇总入口在汇总页上即为当前页 → 标记 active；分类标签全部取消 active（本页展示全部分类） */
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
        type: 'scatter', data: s.xy, symbolSize: 3, color: PALETTE[0], silent: true,
      })),
    };
  }
  return {
    ...base,
    series: series.map((s, i) => {
      const color = s.name ? PALETTE[i % PALETTE.length] : PALETTE[0];
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

function renderCard(rec) {
  const a = document.createElement('a');
  a.className = 'summary-card';
  a.href = `index.html#${rec.id}`;

  const head = document.createElement('div');
  head.className = 'summary-card-head';
  head.textContent = rec.zh || rec.id;
  a.appendChild(head);

  const thumb = document.createElement('div');
  thumb.className = 'summary-thumb';
  a.appendChild(thumb);

  if (rec.kind === 'none' || !(rec.series || []).length) {
    thumb.classList.add('is-text');
    const icon = document.createElement('div');
    icon.className = 'summary-thumb-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5h14M5 10h14M5 15h9" stroke-linecap="round"/></svg>';
    const txt = document.createElement('span');
    txt.textContent = rec.preview || '图表';
    thumb.appendChild(icon);
    thumb.appendChild(txt);
  } else {
    charts.push({ el: thumb, rec });
  }
  return a;
}

function build(data) {
  grid.innerHTML = '';
  const byCat = {};
  data.panels.forEach(p => { (byCat[p.cat] = byCat[p.cat] || []).push(p); });

  data.categories.forEach(cat => {
    const list = byCat[cat.id] || [];
    if (!list.length) return;
    const sec = document.createElement('section');
    sec.className = 'summary-section';
    sec.dataset.category = cat.id;
    const h = document.createElement('h2');
    h.className = 'summary-cat-head';
    h.innerHTML = `${cat.zh}<span class="summary-cat-count">${list.length}</span>`;
    sec.appendChild(h);
    const g = document.createElement('div');
    g.className = 'summary-grid';
    list.forEach(p => g.appendChild(renderCard(p)));
    sec.appendChild(g);
    grid.appendChild(sec);
  });

  // 懒渲染迷你图
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

  // 分类标签在汇总页 = 过滤
  const tabs = Array.from(document.querySelectorAll('.category-tab[data-category]'));
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.toggle('active', t === tab));
    const target = tab.dataset.category;
    document.querySelectorAll('.summary-section').forEach(s => {
      s.hidden = s.dataset.category !== target;
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }));
}

fetch(DATA_URL, { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(build)
  .catch(err => {
    console.warn('[summary] load failed', err);
    grid.innerHTML = '<div class="summary-loading">缩略图数据加载失败，请稍后重试。</div>';
  });
