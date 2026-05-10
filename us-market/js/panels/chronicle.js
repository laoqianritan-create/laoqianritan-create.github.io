// panels/chronicle.js · 编年史日历面板
// 渲染 1948-2026 的"年代×10列"日历网格,每格按当年涨跌染色(6 档离散)
// 点击格子 → chronicle/<year>.html

const FIRST_YEAR = 1948;
const LAST_YEAR  = 2026;
const FIRST_DECADE = Math.floor(FIRST_YEAR / 10) * 10; // 1940
const LAST_DECADE  = Math.floor(LAST_YEAR  / 10) * 10; // 2020

// 6 档离散色档(单位:%)
// 注意:从下到上判定,第一个 test 命中即返回,所以阈值数组要按从负到正排序
const TIERS = [
  { key: 'strong-down', test: v => v <= -20 },
  { key: 'down',        test: v => v <= -10 },
  { key: 'soft-down',   test: v => v <  0   },
  { key: 'soft-up',     test: v => v <  10  },
  { key: 'up',          test: v => v <  20  },
  { key: 'strong-up',   test: () => true     },
];

function tierOf(returnPct) {
  if (returnPct == null || !isFinite(returnPct)) return null;
  for (const t of TIERS) if (t.test(returnPct)) return t.key;
  return null;
}

function buildReturnMap(annualReturns) {
  const map = new Map();
  (annualReturns?.series || []).forEach(item => {
    if (item.year != null && item.value != null) {
      map.set(item.year, Number(item.value));
    }
  });
  return map;
}

function buildTitleMap(yearsIndex) {
  const map = new Map();
  (yearsIndex?.years || []).forEach(item => {
    if (item.year != null) {
      map.set(item.year, item);
    }
  });
  return map;
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function buildCellHTML(year, returnVal, titleEntry) {
  if (year < FIRST_YEAR || year > LAST_YEAR) {
    return '<div class="chronicle-cell chronicle-cell--empty"></div>';
  }
  const title = titleEntry?.title || '';
  const isDraft = titleEntry?.source === 'draft';
  const tier = tierOf(returnVal);

  const ariaTitle = title ? `${year} · ${title}` : `${year}`;
  const tierAttr = tier ? `data-tier="${tier}"` : '';

  return `
    <a class="chronicle-cell"
       href="chronicle/${year}.html"
       target="_blank"
       rel="noopener"
       data-year="${year}"
       ${tierAttr}
       title="${ariaTitle}${returnVal != null ? ' · ' + fmtPct(returnVal) : ''}${isDraft ? ' · 待补' : ''}">
      <span class="chronicle-cell-year">${year}</span>
      <span class="chronicle-cell-return">${fmtPct(returnVal)}</span>
      <span class="chronicle-cell-title">${title || '—'}</span>
    </a>`;
}

export function initPanelChronicle(annualReturns, yearsIndex, opts = {}) {
  const containerId = opts.containerId || 'chronicleGrid';
  const container = document.getElementById(containerId);
  if (!container) return;

  const returnMap = buildReturnMap(annualReturns);
  const titleMap  = buildTitleMap(yearsIndex);

  let gridHTML = '<div class="chronicle-scroll"><div class="chronicle-grid">';
  for (let decade = FIRST_DECADE; decade <= LAST_DECADE; decade += 10) {
    gridHTML += `<div class="chronicle-decade">${decade}s</div>`;
    for (let i = 0; i < 10; i += 1) {
      const year = decade + i;
      gridHTML += buildCellHTML(year, returnMap.get(year), titleMap.get(year));
    }
  }
  gridHTML += '</div></div>';

  const sourceHTML = `<p class="chronicle-source">编年文字主体取自 燕翔等 <a href="https://u.jd.com/fDhzPLE" target="_blank" rel="noopener">《美股70年:1948~2018年美国股市行情复盘》</a>(经济科学出版社, 2020) · 2019年起为编辑整理 · 涨跌幅口径为标普500 价格回报(不含股息)</p>`;

  container.innerHTML = gridHTML + sourceHTML;
}
