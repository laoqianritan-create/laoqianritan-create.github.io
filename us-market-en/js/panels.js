// panels.js · Entry point — lazy init + batched data loading
//
// Loading strategy:
//   Phase 1: load critical above-the-fold data immediately → init panel-price / panel-capitalism
//   Phase 2: requestIdleCallback batches the remaining data (4 files per batch)
//
// Init triggers (defense in depth):
//   A — IntersectionObserver: fires 200px before a panel enters the viewport
//   B — Nav click: fires immediately on the target panel
//
// Each panel inits at most once (guarded by the `initialized` Set)

import { fetchJSON, cssVar } from './utils.js';
import { initTheme } from './theme.js';
import { initLangSwitch } from './lang-switch.js';
import { initNav } from './nav.js';
import { initExportButtons } from './export-png.js';

import {
  initPanelPrice, initPanelDrawdown, initPanelVolatility, initPanelMonthly,
  initPanelAnnualizedMatrix, initPanelScatter, initPanelPe, initPanelEps,
  initPanelRoe, initPanelRolling, initAnnualReturnsPanel, initReturnDetailsPanel,
  initIntrayearDdPanel, initSp500AnnualDistPanel, initCapitalismPanel,
} from './panels/sp500.js';

import {
  initPanelVix, initPanelVixeq, initLogYoyPanel, initLongRunIndexPanel, initPanelAiae,
} from './panels/indices.js';

import { initPanelBuffett } from './panels/buffett.js';

import { initPanelHindenburg } from './panels/hindenburg.js';

import { initPanelM7, initPanelSectors, initPanelBreadth } from './panels/market.js';

import {
  initNasdaq100CompaniesPanel, initNasdaq100AnnualPanel,
  initNasdaqRankingPanel, initNasdaq100WeightsPanel,
  initNdxScatterPanel,
} from './panels/nasdaq.js';

import { initPanelChanges, initPanelRules } from './panels/rules.js';

import { initPanelChronicle } from './panels/chronicle.js';

import { initPanelStyleEtf, initPanelStyleEtfScatter } from './panels/style_etf.js';

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
  vixeq:          'data/sp500_vixeq.json',
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
  breadth:        'data/sp500_breadth.json',
  buffett:        'data/buffett.json',
  hindenburg:     'data/sp500_hindenburg.json',
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
  equalWeight:    'data/sp500_equal_weight.json',
  ndxBreadth:     'data/ndx_breadth.json',
  // Style ETF
  styleEtf:       'data/style_etf.json',
  // Chronicle
  chronicleYears: 'data/chronicle/years.json',
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
  // The trailing anchor month (live bull market) drifts forward as data updates;
  // keep both 04/05 keys so whichever matches wins. This prevents a single new monthly
  // bar from silently invalidating the override.
  // xOff -30: symmetric to 2022-09 (xOff +30); same 30px distance from the anchor, but
  // the label is placed to the left because the 2026-05 anchor sits at the chart's right
  // edge, so pushing it right would clip it out of frame.
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
    requires: ['price', 'recession', 'century', 'equalWeight'],
    init() { initPanelPrice(D.price, D.recession, D.century, D.equalWeight); },
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
  'panel-vixeq': {
    requires: ['vix', 'vixeq'],
    init() { initPanelVixeq(D.vix, D.vixeq); },
  },
  'panel-buffett': {
    requires: ['buffett', 'price'],
    init() { if (D.buffett) initPanelBuffett(D.buffett, D.price); },
  },
  'panel-hindenburg': {
    requires: ['hindenburg', 'price'],
    init() { if (D.hindenburg) initPanelHindenburg(D.hindenburg, D.price); },
  },
  'panel-pe': {
    requires: ['pe', 'century'],
    init() { initPanelPe(D.pe, D.century); },
  },
  'panel-breadth': {
    requires: ['breadth'],
    init() { if (D.breadth) initPanelBreadth(D.breadth); },
  },
  'panel-aiae': {
    requires: ['aiae'],
    init() { if (D.aiae) initPanelAiae(D.aiae); },
  },
  'panel-eps': {
    requires: ['eps', 'century', 'recession'],
    init() { initPanelEps(D.eps, D.century, D.recession); },
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
    init() { initLogYoyPanel('chartSp500LogYoy', D.century, 'S&P 500 YoY', SP500_LOG_OVERRIDES); },
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
        D.nasdaqComp, D.recession, 'Nasdaq Composite', 'nasdaqCompositeScaleToggle');
    },
  },
  'panel-nasdaq-logyoy': {
    requires: ['nasdaqComp'],
    init() { initLogYoyPanel('chartNasdaqLogYoy', D.nasdaqComp, 'Nasdaq Composite YoY', NASDAQ_LOG_OVERRIDES); },
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
          returnKind: 'Price-Return Basis (Excluding Dividends)',
          sourceLabel: 'yfinance ^NDX Daily',
          sourceDesc: 'Annual price returns from 1986+ year-end closing levels (excluding dividends).',
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
      if (D.ndxVolatility) initPanelVolatility(D.ndxVolatility, { chartId: 'chartNdxVolatility', label: 'Nasdaq 100' });
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
          chartId: 'chartNdxVxn', indexLabel: 'Nasdaq 100',
          volLabel: 'VXN', volThreshold: 30, summaryId: 'ndxVxnSummary',
        });
      }
    },
  },
  'panel-ndx-rolling': {
    requires: ['ndxDaily'],
    init() {
      if (!D.ndxDaily?.series) return;
      // Downsample daily to a month-end series (keep the last value of each month);
      // reuses the same multi-window algorithm as the SP500 panel
      const byMonth = new Map();
      D.ndxDaily.series.forEach(item => {
        if (item && item.date) byMonth.set(item.date.slice(0, 7), item);
      });
      const monthly = { series: Array.from(byMonth.values()) };
      initPanelRolling(monthly, {
        chartId: 'chartNdxRolling',
        toggleId: 'ndxRollingWindowToggle',
        precomputed: false,
        defaultWindow: 5,
      });
    },
  },
  'panel-ndx-scatter': {
    requires: ['nasdaq100'],
    init() {
      if (D.nasdaq100) initNdxScatterPanel(D.nasdaq100);
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
  'panel-ndx-breadth': {
    requires: ['ndxBreadth'],
    init() {
      if (D.ndxBreadth) initPanelBreadth(D.ndxBreadth, {
        pieId: 'chartNdxBreadthPie', lineId: 'chartNdxBreadthLine',
        stripId: 'ndxBreadthSummary',
      });
    },
  },
  'panel-dow-century': {
    requires: ['dowCentury', 'recession'],
    init() {
      initLongRunIndexPanel('chartDowCentury', 'dowCenturySummary',
        D.dowCentury, D.recession, 'Dow Jones', 'dowCenturyScaleToggle');
    },
  },
  // ── Style ETF ──────────────────────────────────────────────
  'panel-style-etf': {
    requires: ['styleEtf'],
    init() { if (D.styleEtf) initPanelStyleEtf(D.styleEtf); },
  },
  'panel-style-etf-scatter': {
    requires: ['styleEtf'],
    init() { if (D.styleEtf) initPanelStyleEtfScatter(D.styleEtf); },
  },
  // ── Chronicle ──────────────────────────────────────────────
  'panel-chronicle': {
    requires: ['annualReturns', 'chronicleYears'],
    init() { initPanelChronicle(D.annualReturns, D.chronicleYears); },
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

// Keys to load in idle time, roughly in page-scroll order.
// Chronicle dependencies must come first: chronicleYears (8KB) + annualReturns (8KB) need
// to be idle-loaded ahead of everything else, otherwise clicking "Back to Calendar" from a
// year page gets stuck behind 2MB+ of sp500_price/volatility in the network queue.
const DEFERRED_KEYS = [
  'chronicleYears', 'annualReturns',
  // SP500 in scroll order
  'annualTr', 'returnDetails', 'drawdown', 'intrayearDd',
  'volatility', 'monthly', 'vix', 'buffett', 'hindenburg', 'pe', 'aiae', 'eps', 'roe',
  'm7', 'sectors', 'changes', 'rules', 'constituents',
  // Cross / NDX
  'nasdaqComp',
  'ndxAnnualLong', 'ndxAnnualTr', 'ndxDaily', 'ndxPrice',
  'ndxVolatility', 'ndxMonthly', 'ndxDrawdowns', 'ndxRolling5y',
  'ndxIntrayearDd', 'ndxVxn', 'qqqDetails',
  'nasdaq100', 'dowCentury',
  // Style ETF
  'styleEtf',
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
  initLangSwitch();
  initNav();

  // Inspect URL hash: if the user lands with #panel-chronicle (typical when clicking
  // "Back to Calendar" from a year page), skip the heavy SP500 Phase 1 fetches
  // (sp500_price 2.1MB + sp500_century) and load just the 16KB Chronicle deps so
  // first paint is < 1s.
  const targetHash = window.location.hash || '';
  const isChronicleTarget = targetHash === '#panel-chronicle';

  if (isChronicleTarget) {
    // Phase 1 (Chronicle path): only the two 8KB JSONs the calendar needs
    await Promise.all([
      load('chronicleYears', FILES.chronicleYears),
      load('annualReturns', FILES.annualReturns),
    ]);
    triggerPanel('panel-chronicle');
    triggerPanel('panel-capitalism'); // No data deps; sync init, essentially free

    setupLazyInit();
    // Other panels continue filling in during idle time, but with lower priority
    // (the two chronicle keys have already been hoisted out of DEFERRED_KEYS)
    loadBatch(DEFERRED_KEYS.filter(k => k !== 'chronicleYears' && k !== 'annualReturns'));
  } else {
    // Phase 1 (default SP500 path): critical data for the first visible panel (panel-price)
    await Promise.all(
      ['price', 'century', 'recession'].map(k => load(k, FILES[k]))
    );
    triggerPanel('panel-price');
    triggerPanel('panel-capitalism');

    setupLazyInit();
    loadBatch(DEFERRED_KEYS);
  }

  // Explicit triggerPanel(id) when URL hash names a panel (safety net):
  // IntersectionObserver occasionally misses the initial intersect on
  // direct-hash landings, leaving the target panel empty until user clicks nav.
  const hashId = (window.location.hash || '').slice(1);
  if (hashId && hashId.startsWith('panel-') && hashId !== 'panel-chronicle') {
    setTimeout(() => triggerPanel(hashId), 50);
  }

  // Export buttons can be wired up immediately (handlers are lazy-safe)
  initExportButtons();
}

main().catch(console.error);
