// panels.js · 入口文件 — 按需初始化 + 分批数据加载
//
// 加载策略：
//   Phase 1: 立即加载首屏必需数据 → 初始化 panel-price / panel-capitalism
//   Phase 2: requestIdleCallback 分批加载其余数据（4 个文件/批）
//
// 初始化触发器（双保险）：
//   A — IntersectionObserver：面板进入视口前 200px 时触发
//   B — nav 点击：立即触发目标面板
//
// 每个面板只初始化一次（initialized Set 守卫）

import { fetchJSON, cssVar } from './utils.js';
import { initTheme } from './theme.js';
import { initNav } from './nav.js';
import { initExportButtons } from './export-png.js';

import {
  initPanelPrice, initPanelDrawdown, initPanelVolatility, initPanelMonthly,
  initPanelAnnualizedMatrix, initPanelScatter, initPanelPe, initPanelEps,
  initPanelRoe, initPanelRolling, initAnnualReturnsPanel, initReturnDetailsPanel,
  initIntrayearDdPanel, initSp500AnnualDistPanel, initCapitalismPanel,
} from './panels/sp500.js';

import {
  initPanelVix, initLogYoyPanel, initLongRunIndexPanel, initPanelAiae,
} from './panels/indices.js';

import { initPanelM7, initPanelSectors } from './panels/market.js';

import {
  initNasdaq100CompaniesPanel, initNasdaq100AnnualPanel,
  initNasdaqRankingPanel, initNasdaq100WeightsPanel,
} from './panels/nasdaq.js';

import { initPanelChanges, initPanelRules } from './panels/rules.js';

// ─────────────────────────────────────────────────────────────
// § 1  Data store — key/value + callback notifications
// ─────────────────────────────────────────────────────────────

const D         = {};           // key → loaded value  (null = load failed)
const fetching  = new Set();    // keys currently in-flight
const waiting   = {};           // key → [callbacks]

/** Store a value and fire all listeners waiting for that key */
function resolve(key, val) {
  D[key] = val;
  fetching.delete(key);
  (waiting[key] || []).forEach(fn => fn());
  delete waiting[key];
}

/**
 * Run cb once every key in `keys` has a value in D.
 * If all are already available, cb fires synchronously.
 */
function whenAll(keys, cb) {
  const missing = keys.filter(k => !(k in D));
  if (!missing.length) { cb(); return; }
  let left = missing.length;
  missing.forEach(k => {
    if (!waiting[k]) waiting[k] = [];
    waiting[k].push(() => { if (--left === 0) cb(); });
  });
}

/** Fetch url and store under key. No-op if already fetched or in-flight. */
async function load(key, url) {
  if (key in D || fetching.has(key)) return;
  fetching.add(key);
  try   { resolve(key, await fetchJSON(url)); }
  catch { console.warn(`[lazy] failed to load: ${url}`); resolve(key, null); }
}

// ─────────────────────────────────────────────────────────────
// § 2  File map  (key → relative data URL)
// ─────────────────────────────────────────────────────────────

const FILES = {
  // SP500
  price:          'data/sp500_price.json',
  volatility:     'data/sp500_volatility.json',
  monthly:        'data/sp500_monthly.json',
  constituents:   'data/sp500_constituents.json',
  drawdown:       'data/sp500_drawdowns.json',
  vix:            'data/sp500_vix.json',
  pe:             'data/sp500_pe.json',
  eps:            'data/sp500_eps.json',
  roe:            'data/sp500_roe.json',
  recession:      'data/us_recessions.json',
  century:        'data/sp500_century.json',
  annualReturns:  'data/sp500_annual_returns_long.json',
  returnDetails:  'data/sp500_return_details.json',
  m7:             'data/m7_index.json',
  sectors:        'data/sp500_sectors.json',
  changes:        'data/sp500_changes.json',
  rules:          'data/sp500_rules.json',
  aiae:           'data/aiae.json',
  intrayearDd:    'data/sp500_intrayear_dd.json',
  annualTr:       'data/sp500_annual_tr.json',
  // Cross / NDX
  nasdaqComp:     'data/nasdaq_composite.json',
  nasdaq100:      'data/nasdaq100_panels.json',
  dowCentury:     'data/dow_jones_century.json',
  ndxAnnualLong:  'data/ndx_annual_returns_long.json',
  ndxAnnualTr:    'data/ndx_annual_tr.json',
  ndxDaily:       'data/ndx_daily.json',
  ndxPrice:       'data/ndx_price.json',
  ndxVolatility:  'data/ndx_volatility.json',
  ndxMonthly:     'data/ndx_monthly.json',
  ndxDrawdowns:   'data/ndx_drawdowns.json',
  ndxRolling5y:   'data/ndx_rolling5y.json',
  ndxIntrayearDd: 'data/ndx_intrayear_dd.json',
  ndxVxn:         'data/ndx_vxn.json',
  qqqDetails:     'data/qqq_return_details.json',
};

// ─────────────────────────────────────────────────────────────
// § 3  Panel registry  (panelId → { requires[], init() })
// ─────────────────────────────────────────────────────────────

// labelOverrides for the two log-yoy panels (extracted for readability)
const SP500_LOG_OVERRIDES = {
  '1935-03': { xOff: 0,   yOff: 0 },
  '1938-03': { xOff: 0,   yOff: 0 },
  '1942-04': { xOff: 0,   yOff: 0 },
  '1972-12': { xOff: 0,   yOff: 0 },
  '1974-09': { xOff: 0,   yOff: 0 },
  '2020-03': { xOff: -30, yOff: 0 },
  '2021-12': { xOff: -30, yOff: 36 },
  '2022-09': { xOff: 30,  yOff: 0 },
  // 末段（牛市进行中）的 anchor 月份会随数据更新前移；同时保留 04/05 两键，
  // 哪个匹配上就用哪个，避免上游数据每月新增一根月线就让 override 失效。
  // xOff -30：与 2022-09 (xOff +30) 对称（同样距离锚点 30px），标签放在
  // 锚点左侧——因为 2026.05 锚点贴在图表右边缘，往右挪会出框。
  '2026-04': { xOff: -30, yOff: 18 },
  '2026-05': { xOff: -30, yOff: 18 },
};

const NASDAQ_LOG_OVERRIDES = {
  '1982-07': { xOff: -25, yOff: 0 },
  '1983-06': { xOff: -30, yOff: 0,  force: true },
  '1984-07': { xOff: 0,   yOff: 0 },
  '1987-11': { xOff: 0,   yOff: 0 },
  '1989-09': { xOff: 0,   yOff: 0 },
  '1990-10': { xOff: 0,   yOff: 0 },
  '1998-08': { xOff: 0,   yOff: 0, force: true },
  '2002-09': { xOff: 0,   yOff: 0 },
  '2026-04': { xOff: -25, yOff: 18 },
  '2026-05': { xOff: -25, yOff: 18 },
};

const PANELS = {
  // ── SP500 ──────────────────────────────────────────────────
  'panel-price': {
    requires: ['price', 'recession', 'century'],
    init() { initPanelPrice(D.price, D.recession, D.century); },
  },
  'panel-capitalism': {
    requires: [],
    init() { initCapitalismPanel(); },
  },
  'panel-annual': {
    requires: ['annualReturns'],
    init() { initAnnualReturnsPanel(D.annualReturns); },
  },
  'panel-annual-dist': {
    requires: ['annualTr'],
    init() { if (D.annualTr) initSp500AnnualDistPanel(D.annualTr); },
  },
  'panel-annualized-matrix': {
    requires: ['century'],
    init() { initPanelAnnualizedMatrix(D.century); },
  },
  'panel-return-details': {
    requires: ['returnDetails'],
    init() { initReturnDetailsPanel(D.returnDetails); },
  },
  'panel-drawdown': {
    requires: ['price', 'drawdown'],
    init() { initPanelDrawdown(D.price, D.drawdown); },
  },
  'panel-intrayear-dd': {
    requires: ['intrayearDd'],
    init() { if (D.intrayearDd) initIntrayearDdPanel(D.intrayearDd); },
  },
  'panel-volatility': {
    requires: ['volatility'],
    init() { initPanelVolatility(D.volatility); },
  },
  'panel-monthly': {
    requires: ['monthly'],
    init() { initPanelMonthly(D.monthly); },
  },
  'panel-vix': {
    requires: ['price', 'vix', 'recession'],
    init() { initPanelVix(D.price, D.vix, D.recession); },
  },
  'panel-pe': {
    requires: ['pe', 'century'],
    init() { initPanelPe(D.pe, D.century); },
  },
  'panel-aiae': {
    requires: ['aiae'],
    init() { if (D.aiae) initPanelAiae(D.aiae); },
  },
  'panel-eps': {
    requires: ['eps', 'century'],
    init() { initPanelEps(D.eps, D.century); },
  },
  'panel-roe': {
    requires: ['roe'],
    init() { initPanelRoe(D.roe); },
  },
  'panel-rolling': {
    requires: ['century'],
    init() { initPanelRolling(D.century); },
  },
  'panel-sp500-logyoy': {
    requires: ['century'],
    init() { initLogYoyPanel('chartSp500LogYoy', D.century, '标普500 同比', SP500_LOG_OVERRIDES); },
  },
  'panel-m7': {
    requires: ['m7'],
    init() { initPanelM7(D.m7); },
  },
  'panel-sectors': {
    requires: ['sectors'],
    init() { initPanelSectors(D.sectors); },
  },
  'panel-changes': {
    requires: ['changes'],
    init() { initPanelChanges(D.changes); },
  },
  'panel-rules': {
    requires: ['rules'],
    init() { initPanelRules(D.rules); },
  },
  'panel-scatter': {
    requires: ['constituents'],
    init() { initPanelScatter(D.constituents); },
  },
  // ── NDX / Cross ────────────────────────────────────────────
  'panel-nasdaq-composite': {
    requires: ['nasdaqComp', 'recession'],
    init() {
      initLongRunIndexPanel('chartNasdaqComposite', 'nasdaqCompositeSummary',
        D.nasdaqComp, D.recession, '纳斯达克综指', 'nasdaqCompositeScaleToggle');
    },
  },
  'panel-nasdaq-logyoy': {
    requires: ['nasdaqComp'],
    init() { initLogYoyPanel('chartNasdaqLogYoy', D.nasdaqComp, '纳斯达克综指 同比', NASDAQ_LOG_OVERRIDES); },
  },
  'panel-nasdaq100-annual': {
    requires: ['ndxAnnualLong', 'nasdaq100'],
    init() {
      if (D.ndxAnnualLong) {
        initAnnualReturnsPanel(D.ndxAnnualLong, { chartId: 'chartNasdaq100Annual', summaryId: 'nasdaq100AnnualSummary' });
      } else {
        initNasdaq100AnnualPanel(D.nasdaq100);
      }
    },
  },
  'panel-ndx-annual-dist': {
    requires: ['ndxAnnualTr'],
    init() {
      if (D.ndxAnnualTr) {
        initSp500AnnualDistPanel(D.ndxAnnualTr, {
          wrapId: 'ndxTrDistWrap', summaryId: 'ndxTrDistSummary',
          returnKind: '价格回报口径（不含股息）',
          sourceLabel: 'yfinance ^NDX 日线',
          sourceDesc: '1986+ 年末收盘点位计算年度价格回报，不含股息。',
        });
      }
    },
  },
  'panel-ndx-matrix': {
    requires: ['ndxDaily'],
    init() {
      if (D.ndxDaily) {
        initPanelAnnualizedMatrix(D.ndxDaily, {
          containerId: 'ndxAnnualizedMatrix', rangeId: 'ndxMatrixRange', startYear: 1986,
        });
      }
    },
  },
  'panel-ndx-return-details': {
    requires: ['qqqDetails'],
    init() {
      if (D.qqqDetails) {
        initReturnDetailsPanel(D.qqqDetails, {
          chartId: 'chartNdxReturnDetails', summaryId: 'ndxReturnDetailsSummary', indexLabel: 'QQQ',
        });
      }
    },
  },
  'panel-ndx-drawdown': {
    requires: ['ndxPrice', 'ndxDrawdowns'],
    init() {
      if (D.ndxPrice && D.ndxDrawdowns) {
        initPanelDrawdown(D.ndxPrice, D.ndxDrawdowns, {
          chartId: 'chartNdxDrawdown', tbodyId: 'ndxDrawdownTbody',
          tableId: 'ndxDrawdownTable', ddMin: -85, hideCause: true,
        });
      }
    },
  },
  'panel-ndx-intrayear-dd': {
    requires: ['ndxIntrayearDd'],
    init() { if (D.ndxIntrayearDd) initIntrayearDdPanel(D.ndxIntrayearDd, { gridId: 'ndxDdGrid' }); },
  },
  'panel-ndx-volatility': {
    requires: ['ndxVolatility'],
    init() {
      if (D.ndxVolatility) initPanelVolatility(D.ndxVolatility, { chartId: 'chartNdxVolatility', label: '纳指100' });
    },
  },
  'panel-ndx-monthly': {
    requires: ['ndxMonthly'],
    init() { if (D.ndxMonthly) initPanelMonthly(D.ndxMonthly, { containerId: 'ndxMonthlyHeatmap' }); },
  },
  'panel-ndx-vxn': {
    requires: ['ndxPrice', 'ndxVxn', 'recession'],
    init() {
      if (D.ndxPrice && D.ndxVxn) {
        initPanelVix(D.ndxPrice, D.ndxVxn, D.recession, {
          chartId: 'chartNdxVxn', indexLabel: '纳指100',
          volLabel: 'VXN', volThreshold: 30, summaryId: 'ndxVxnSummary',
        });
      }
    },
  },
  'panel-ndx-rolling': {
    requires: ['ndxRolling5y'],
    init() {
      if (D.ndxRolling5y) initPanelRolling(D.ndxRolling5y, { chartId: 'chartNdxRolling', precomputed: true });
    },
  },
  'panel-nasdaq100-member-returns': {
    requires: ['nasdaq100'],
    init() {
      initNasdaqRankingPanel('chartNasdaq100MemberReturns', 'nasdaq100MemberReturnSummary',
        D.nasdaq100.companies, {
          key: 'return1y', label: '近1年收益', summaryLabel: '全样本均值',
          showAllByDefault: true, gridLeft: 132, gridRight: 72, barMaxWidth: 8, xAxisSplitNumber: 6,
          xAxisMin: v => Math.min(-200, Math.floor(v / 100) * 100),
          xAxisMax: (_, v) => Math.max(1000, Math.ceil(v / 100) * 100),
          color: v => v >= 0 ? (cssVar('--green') || '#389e0d') : (cssVar('--red') || '#cf1322'),
        });
    },
  },
  'panel-nasdaq100-ytd': {
    requires: ['nasdaq100'],
    init() {
      initNasdaqRankingPanel('chartNasdaq100Ytd', 'nasdaq100YtdSummary',
        D.nasdaq100.companies, {
          key: 'ytdReturn', label: '年内收益', summaryLabel: '年初至今均值',
          showAllByDefault: true, gridLeft: 132, gridRight: 72, barMaxWidth: 8, xAxisSplitNumber: 5,
          xAxisMin: v => Math.min(-100, Math.floor(v / 10) * 10),
          xAxisMax: (_, v) => Math.max(100, Math.ceil(v / 10) * 10),
          color: v => v >= 0 ? (cssVar('--green') || '#389e0d') : (cssVar('--red') || '#cf1322'),
        });
    },
  },
  'panel-nasdaq100-weights': {
    requires: ['nasdaq100'],
    init() { initNasdaq100WeightsPanel(D.nasdaq100); },
  },
  'panel-nasdaq100-companies': {
    requires: ['nasdaq100'],
    init() { initNasdaq100CompaniesPanel(D.nasdaq100); },
  },
  'panel-dow-century': {
    requires: ['dowCentury', 'recession'],
    init() {
      initLongRunIndexPanel('chartDowCentury', 'dowCenturySummary',
        D.dowCentury, D.recession, '道琼斯指数', 'dowCenturyScaleToggle');
    },
  },
};

// ─────────────────────────────────────────────────────────────
// § 4  Lazy init engine
// ─────────────────────────────────────────────────────────────

const initialized = new Set();

/**
 * Request initialization of a panel by id.
 * - Starts fetching any missing required data files immediately.
 * - Schedules init() to run once all required keys are available.
 * - Safe to call multiple times; will only ever init once.
 */
function triggerPanel(id) {
  if (initialized.has(id)) return;
  const def = PANELS[id];
  if (!def) return;

  // Start loading any data this panel needs that isn't already in flight
  def.requires.forEach(key => {
    if (!(key in D) && !fetching.has(key) && FILES[key]) load(key, FILES[key]);
  });

  // Fire init when all required data resolves (including nulls for failures)
  whenAll(def.requires, () => {
    if (initialized.has(id)) return;   // guard against race
    initialized.add(id);
    try { def.init(); }
    catch (e) { console.error(`[lazy] init error — ${id}:`, e); }
  });
}

function setupLazyInit() {
  // Trigger A: IntersectionObserver — fire 200px before panel enters viewport
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) triggerPanel(e.target.id); });
  }, { rootMargin: '200px 0px' });

  document.querySelectorAll('.panel[id]').forEach(el => io.observe(el));

  // Trigger B: nav click — fire immediately on user intent
  document.querySelectorAll('[data-panel]').forEach(el => {
    el.addEventListener('click', () => triggerPanel(el.dataset.panel), { passive: true });
  });
}

// ─────────────────────────────────────────────────────────────
// § 5  Deferred data loading  (requestIdleCallback, 4 files/batch)
// ─────────────────────────────────────────────────────────────

// Keys to load in idle time, roughly in page-scroll order
const DEFERRED_KEYS = [
  // SP500 in scroll order
  'annualReturns', 'annualTr', 'returnDetails', 'drawdown', 'intrayearDd',
  'volatility', 'monthly', 'vix', 'pe', 'aiae', 'eps', 'roe',
  'm7', 'sectors', 'changes', 'rules', 'constituents',
  // Cross / NDX
  'nasdaqComp',
  'ndxAnnualLong', 'ndxAnnualTr', 'ndxDaily', 'ndxPrice',
  'ndxVolatility', 'ndxMonthly', 'ndxDrawdowns', 'ndxRolling5y',
  'ndxIntrayearDd', 'ndxVxn', 'qqqDetails',
  'nasdaq100', 'dowCentury',
];

const scheduleIdle = fn =>
  window.requestIdleCallback
    ? requestIdleCallback(fn, { timeout: 5000 })
    : setTimeout(fn, 200);

function loadBatch(keys) {
  if (!keys.length) return;
  scheduleIdle(() => {
    keys.slice(0, 4).forEach(k => { if (FILES[k]) load(k, FILES[k]); });
    loadBatch(keys.slice(4));
  });
}

// ─────────────────────────────────────────────────────────────
// § 6  Main
// ─────────────────────────────────────────────────────────────

async function main() {
  initTheme();
  initNav();

  // Phase 1 — critical data for the first visible panel (panel-price)
  await Promise.all(
    ['price', 'century', 'recession'].map(k => load(k, FILES[k]))
  );

  // Init the two panels that are immediately visible on load
  triggerPanel('panel-price');      // needs price + century + recession
  triggerPanel('panel-capitalism'); // needs nothing — inits synchronously

  // Phase 2 — set up lazy init triggers for all other panels
  setupLazyInit();

  // Phase 3 — kick off remaining data loads in idle time
  loadBatch(DEFERRED_KEYS);

  // Export buttons can be wired up immediately (handlers are lazy-safe)
  initExportButtons();
}

main().catch(console.error);
