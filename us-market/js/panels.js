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

import { initPanelM7, initPanelSectors, initPanelBreadth } from './panels/market.js';

import {
  initNasdaq100CompaniesPanel, initNasdaq100AnnualPanel,
  initNasdaqRankingPanel, initNasdaq100WeightsPanel,
  initNdxScatterPanel,
} from './panels/nasdaq.js';

import { initPanelChanges, initPanelRules } from './panels/rules.js';

import { initPanelChronicle } from './panels/chronicle.js';

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
    requires: ['ndxDaily'],
    init() {
      if (!D.ndxDaily?.series) return;
      // 把日线降采样为月末序列(每月保留最后一个值),复用 SP500 同款多窗口算法
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
        D.dowCentury, D.recession, '道琼斯指数', 'dowCenturyScaleToggle');
    },
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

// Keys to load in idle time, roughly in page-scroll order
// 编年史依赖前置: chronicleYears (8KB) + annualReturns (8KB) 必须最先 idle 加载,
// 否则用户点"返回日历"会被 2MB+ 的 sp500_price/volatility 等堵在网络队列后面
const DEFERRED_KEYS = [
  'chronicleYears', 'annualReturns',
  // SP500 in scroll order
  'annualTr', 'returnDetails', 'drawdown', 'intrayearDd',
  'volatility', 'monthly', 'vix', 'buffett', 'pe', 'aiae', 'eps', 'roe',
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
  initLangSwitch();
  initNav();

  // 检测 URL hash:若用户带着 #panel-chronicle 进来(典型场景:从年页"返回日历"),
  // 跳过 SP500 重数据 Phase 1 (sp500_price 2.1MB + sp500_century),
  // 直接加载编年史 16KB 依赖,首屏 < 1s
  const targetHash = window.location.hash || '';
  const isChronicleTarget = targetHash === '#panel-chronicle';

  if (isChronicleTarget) {
    // Phase 1 (编年史路径):只加载日历必需的两份 8KB JSON
    await Promise.all([
      load('chronicleYears', FILES.chronicleYears),
      load('annualReturns', FILES.annualReturns),
    ]);
    triggerPanel('panel-chronicle');
    triggerPanel('panel-capitalism'); // 无数据依赖,同步 init,几乎免费

    setupLazyInit();
    // 其它面板继续在 idle 时装填,但优先级靠后(已从 DEFERRED_KEYS 里前置 chronicle 两条)
    loadBatch(DEFERRED_KEYS.filter(k => k !== 'chronicleYears' && k !== 'annualReturns'));
  } else {
    // Phase 1 (默认 SP500 路径):critical data for the first visible panel (panel-price)
    await Promise.all(
      ['price', 'century', 'recession'].map(k => load(k, FILES[k]))
    );
    triggerPanel('panel-price');
    triggerPanel('panel-capitalism');

    setupLazyInit();
    loadBatch(DEFERRED_KEYS);
  }

  // Export buttons can be wired up immediately (handlers are lazy-safe)
  initExportButtons();
}

main().catch(console.error);
