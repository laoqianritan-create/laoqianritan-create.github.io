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

import { fetchJSON, cssVar, waitForEcharts, showEchartsPageFailure, fillChartMessage, panelChartHosts, clearFetchJSON } from './utils.js?v=187f93bb7f';
import { initTheme } from './theme.js?v=ea65e0e5af';
import { initLangSwitch } from './lang-switch.js?v=660db395e7';
import { initNav } from './nav.js?v=55231f61d5';
import { initExportButtons } from './export-png.js?v=f4a26649f7';
import { installPanelNotes } from './panel-notes.js?v=f4b4c54378';

import {
  initPanelPrice, initPanelDrawdown, initPanelVolatility, initPanelMonthly,
  initPanelAnnualizedMatrix, initPanelScatter, initPanelPe, initPanelEps,
  initPanelRoe, initPanelRolling, initAnnualReturnsPanel, initReturnDetailsPanel,
  initIntrayearDdPanel, initSp500AnnualDistPanel, initCapitalismPanel,
} from './panels/sp500.js?v=bdd28a55b3';

import {
  initPanelVix, initPanelVixeq, initLogYoyPanel, initLongRunIndexPanel, initPanelAiae,
} from './panels/indices.js?v=bc8a67d7cf';

import { initPanelBuffett } from './panels/buffett.js?v=00c4e405af';

import { initPanelHindenburg } from './panels/hindenburg.js?v=6845a869b3';

import { initPanelM7, initPanelSectors, initPanelBreadth } from './panels/market.js?v=8785f768c9';

import {
  initNasdaq100CompaniesPanel, initNasdaq100AnnualPanel,
  initNasdaqRankingPanel,
  initNdxScatterPanel, initNdxSectorsPanel,
} from './panels/nasdaq.js?v=fd5b42aa43';

import { initPanelChanges, initPanelRules } from './panels/rules.js?v=4b6ce604c2';
import { initPanelQuotes } from './panels/quotes.js?v=6d3f00556f';

import { initPanelChronicle } from './panels/chronicle.js?v=925c63f456';

import { initPanelStyleEtf, initPanelStyleEtfScatter } from './panels/style_etf.js?v=bf8a79393a';

import { initFedHikesPanel } from './panels/fed_hikes.js?v=d2dfdf6330';

import { initSp500CagrPanel } from './panels/cagr_paths.js?v=8ffdb42f81';
import { initBullRunsPanel } from './panels/bull_runs.js?v=6135f2cfad';
import { initSectorRsPanel } from './panels/sector_rs.js?v=0388adfbd2';
import { initGeoCrisesPanel } from './panels/geo_crises.js?v=82bd2d23be';
import { initDrawdownSuitePanel } from './panels/drawdown_suite.js?v=42fa2209cb';
import { initAthPathsPanel } from './panels/ath_paths.js?v=0eb0e6513b';


import {
  initPanelIciRiskAppetite, initPanelIciDomesticWorld, initPanelIciMmf,
  initPanelIciActiveIndex, initPanelIciPassivization, initPanelOwnership,
} from './panels/flows.js?v=33a8af6bc7';

import { initUsAssetLadderPanel } from './panels/us_asset_ladder.js?v=0ee2e1fe89';
import {
  initCnnFearGreedPanel, initAaiiPanel, initNaaimPanel, initMiseryPanel,
} from './panels/sentiment.js?v=63ce96a656';

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
  price:          'data/sp500_price.json?v=fe3ac021fa',
  volatility:     'data/sp500_volatility.json?v=65eba596da',
  monthly:        'data/sp500_monthly.json?v=37694f9303',
  constituents:   'data/sp500_constituents.json?v=88c691eec5',
  drawdown:       'data/sp500_drawdowns.json?v=bbcc358f2d',
  sectorRS:       'data/sp500_sector_rs.json?v=495dbaf7e4',
  vix:            'data/sp500_vix.json?v=5c988a094f',
  vixeq:          'data/sp500_vixeq.json?v=9ec878aa4b',
  pe:             'data/sp500_pe.json?v=577dc85f48',
  eps:            'data/sp500_eps.json?v=0ebfb1175b',
  roe:            'data/sp500_roe.json?v=93361b6165',
  recession:      'data/us_recessions.json?v=194282684d',
  century:        'data/sp500_century.json?v=704eee28d7',
  annualReturns:  'data/sp500_annual_returns_long.json?v=17a6c6b232',
  returnDetails:  'data/sp500_return_details.json?v=849d101f21',
  m7:             'data/m7_index.json?v=8530815b03',
  sectors:        'data/sp500_sectors.json?v=6251f289fb',
  changes:        'data/sp500_changes.json?v=4f84590533',
  rules:          'data/sp500_rules.json?v=793f9d99d8',
  quotes:         'data/bofa_longest_pictures_quotes.json?v=ed54a89f69',
  aiae:           'data/aiae.json?v=758a708668',
  breadth:        'data/sp500_breadth.json?v=9331949050',
  buffett:        'data/buffett.json?v=55b0d49d01',
  hindenburg:     'data/sp500_hindenburg.json?v=541787efad',
  intrayearDd:    'data/sp500_intrayear_dd.json?v=4d4c18f03d',
  annualTr:       'data/sp500_annual_tr.json?v=3eb32c6e28',
  cagrPaths:      'data/sp500_cagr_paths.json?v=2e2ad339c5',
  // Cross / NDX
  nasdaqComp:     'data/nasdaq_composite.json?v=b5a7d2d3e6',
  nasdaq100:      'data/nasdaq100_panels.json?v=2983a8d963',
  dowCentury:     'data/dow_jones_century.json?v=5b71556b9e',
  ndxAnnualLong:  'data/ndx_annual_returns_long.json?v=9a16e4ac23',
  ndxAnnualTr:    'data/ndx_annual_tr.json?v=f6752f299e',
  ndxDaily:       'data/ndx_daily.json?v=1815ed2760',
  ndxPrice:       'data/ndx_price.json?v=210386122f',
  ndxVolatility:  'data/ndx_volatility.json?v=b660d7701e',
  ndxMonthly:     'data/ndx_monthly.json?v=04383e4ceb',
  ndxDrawdowns:   'data/ndx_drawdowns.json?v=0927feab02',
  ndxRolling5y:   'data/ndx_rolling5y.json?v=5fc792df8f',
  ndxIntrayearDd: 'data/ndx_intrayear_dd.json?v=538c0647df',
  ndxVxn:         'data/ndx_vxn.json?v=5f247d541a',
  qqqDetails:     'data/qqq_return_details.json?v=a13112efc8',
  equalWeight:    'data/sp500_equal_weight.json?v=1239d5dbae',
  ndxBreadth:     'data/ndx_breadth.json?v=ac1cd11299',
  // Style ETF
  styleEtf:       'data/style_etf.json?v=0038f920f7',
  // ICI Flows（资金流）
  iciFlows:       'data/ici_flows.json?v=de2994737c',
  iciMmf:         'data/ici_mmf.json?v=c8bea96a02',
  iciActiveIndex: 'data/ici_active_index.json?v=843e2b9bea',
  ownership:      'data/ownership.json?v=3cb2bf7256',
  // Fed hikes（加息×股指）
  fedHikes:       'data/fed_hikes.json?v=93ec95f55b',
  // 大类资产长期涨幅
  assetLadder:    'data/us_asset_ladder.json?v=d03589fee0',
  // 市场情绪四件套
  cnnFg:          'data/cnn_fear_greed.json?v=9f7d93d235',
  aaii:           'data/aaii_sentiment.json?v=ad116eab23',
  naaim:          'data/naaim_exposure.json?v=958a8727e5',
  misery:         'data/us_misery_index.json?v=89982a081f',
  // Chronicle
  chronicleYears: 'data/chronicle/years.json?v=37fa00aa3d',
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
    requires: ['price', 'recession', 'century', 'equalWeight', 'drawdown'],
    init() { initPanelPrice(D.price, D.recession, D.century, D.equalWeight, D.drawdown); },
  },
  'panel-cagr-paths': {
    requires: ['cagrPaths', 'recession'],
    init() { if (D.cagrPaths) initSp500CagrPanel(D.cagrPaths, D.recession); },
  },
  'panel-bull-runs': {
    requires: ['price'],
    init() { if (D.price) initBullRunsPanel(D.price); },
  },
  'panel-sector-rs': {
    requires: ['sectorRS', 'sectors'],
    init() { if (D.sectorRS && D.sectors) initSectorRsPanel(D.sectorRS, D.sectors); },
  },
  'panel-geo-crises': {
    requires: ['price', 'drawdown', 'century', 'recession'],
    init() { if (D.price && D.drawdown && D.century && D.recession) initGeoCrisesPanel(D.price, D.drawdown, D.century, D.recession); },
  },
  'panel-dd-suite': {
    requires: ['price', 'drawdown', 'intrayearDd'],
    init() {
      if (!D.price || !D.drawdown) return;
      initDrawdownSuitePanel(D.price, D.drawdown);
      initPanelDrawdown(D.price, D.drawdown, {
        scatterId: 'chartDdScatter', tableToggleId: 'ddTableToggle', ddMin: -90,
      });
      if (D.intrayearDd) initIntrayearDdPanel(D.intrayearDd);
    },
  },
  'panel-ath-paths': {
    requires: ['price'],
    init() { if (D.price) initAthPathsPanel(D.price); },
  },
  'panel-capitalism': {
    requires: [],
    init() { initCapitalismPanel(); },
  },
  'panel-us-asset-ladder': {
    requires: ['assetLadder', 'recession'],
    init() { if (D.assetLadder) initUsAssetLadderPanel(D.assetLadder, D.recession); },
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
  'panel-quotes': {
    requires: ['quotes'],
    init() { initPanelQuotes(D.quotes); },
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
          scatterId: 'chartNdxDdScatter', tableToggleId: 'ndxTableToggle',
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
  'panel-nasdaq100-companies': {
    requires: ['nasdaq100'],
    init() { initNasdaq100CompaniesPanel(D.nasdaq100); },
  },
  'panel-ndx-sectors': {
    requires: ['nasdaq100'],
    init() { initNdxSectorsPanel(D.nasdaq100); },
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
  // ── Style ETF ──────────────────────────────────────────────
  'panel-style-etf': {
    requires: ['styleEtf'],
    init() { if (D.styleEtf) initPanelStyleEtf(D.styleEtf); },
  },
  'panel-style-etf-scatter': {
    requires: ['styleEtf'],
    init() { if (D.styleEtf) initPanelStyleEtfScatter(D.styleEtf); },
  },
  // ── ICI 资金流 ─────────────────────────────────────────────
  'panel-ici-risk-appetite': {
    requires: ['iciFlows'],
    init() { if (D.iciFlows) initPanelIciRiskAppetite(D.iciFlows); },
  },
  'panel-ici-domestic-world': {
    requires: ['iciFlows'],
    init() { if (D.iciFlows) initPanelIciDomesticWorld(D.iciFlows); },
  },
  'panel-ici-mmf': {
    requires: ['iciMmf'],
    init() { if (D.iciMmf) initPanelIciMmf(D.iciMmf); },
  },
  'panel-ici-active-index': {
    requires: ['iciActiveIndex'],
    init() { if (D.iciActiveIndex) initPanelIciActiveIndex(D.iciActiveIndex); },
  },
  'panel-ici-passivization': {
    requires: ['iciActiveIndex'],
    init() { if (D.iciActiveIndex) initPanelIciPassivization(D.iciActiveIndex); },
  },
  'panel-ownership': {
    requires: ['ownership'],
    init() { if (D.ownership) initPanelOwnership(D.ownership); },
  },
  // ── Fed hikes（加息×股指）──────────────────────────────────
  'panel-spx-hikes': {
    requires: ['fedHikes', 'price'],
    init() { if (D.fedHikes) initFedHikesPanel('chartSpxHikes', 'spxHikesSummary', D.fedHikes, D.price, {
      start: '1954-01-01',
      indexLabel: '标普500',
      anns: [
        { date: '1972-06-01', label: '1972–73 加息后遭遇滞胀，1973–74 熊市 −48%', y: 4.5 },
        { date: '1979-08-06', label: '1979.08 沃尔克就任，利率加到 20%', y: 1.15 },
        { date: '2000-05-16', label: '2000.05 最后一轮加息，互联网泡沫破裂', y: 20 },
        { date: '2004-06-30', label: '2004.06 连续 17 次加息，两年后次贷危机', y: 11 },
        { date: '2015-12-16', label: '2015.12 时隔九年重启加息', y: 30 },
        { date: '2022-03-17', label: '2022.03 四十年最快加息周期', y: 62, side: 'left' },
        { date: '2026-09-17', label: '2026.09 再度加息', y: 135 },
      ],
      labels: {
        nav: '净值（对数）', dd: '回撤幅度',
        posRate: '实际利率为正（钱贵）', negRate: '实际利率为负（钱便宜）',
        hikeDay: '美联储宣布加息日', realRate: '实际利率',
        after1d: '加息后 1 日（{index}）', after1y: '加息后 1 年（{index}）',
        winrate: '胜率', median: '中位', hikeNoun: '次加息', hikeNounFull: '次有满一年数据',
        sinceStart: '起点', annualized: '年化', maxDd: '区间最大回撤',
        realRateNow: '实际利率（当前）', histHi: '历史最高', histLo: '最低',
        tight: '钱贵',
        easy: '钱便宜',
        posRateShort: '实际利率为正',
        negRateShort: '实际利率为负',
      },
    }); },
  },
  'panel-ndx-hikes': {
    requires: ['fedHikes', 'ndxPrice'],
    init() { if (D.fedHikes) initFedHikesPanel('chartNdxHikes', 'ndxHikesSummary', D.fedHikes, D.ndxPrice, {
      start: '1985-10-01',
      indexLabel: '纳指100',
      anns: [
        { date: '2000-03-27', label: '2000.03 互联网泡沫见顶，随后最大回撤 −83%', y: 30 },
        { date: '2004-06-30', label: '2004.06 连续 17 次加息', y: 14 },
        { date: '2015-12-16', label: '2015.12 时隔九年重启加息', y: 45 },
        { date: '2018-12-19', label: '2018.12 年内第四次加息，年末急跌', y: 80 },
        { date: '2022-03-17', label: '2022.03 四十年最快加息周期', y: 115 },
        { date: '2026-09-17', label: '2026.09 再度加息', y: 200 },
      ],
      labels: {
        nav: '净值（对数）', dd: '回撤幅度',
        posRate: '实际利率为正（钱贵）', negRate: '实际利率为负（钱便宜）',
        hikeDay: '美联储宣布加息日', realRate: '实际利率',
        after1d: '加息后 1 日（{index}）', after1y: '加息后 1 年（{index}）',
        winrate: '胜率', median: '中位', hikeNoun: '次加息', hikeNounFull: '次有满一年数据',
        sinceStart: '起点', annualized: '年化', maxDd: '区间最大回撤',
        realRateNow: '实际利率（当前）', histHi: '历史最高', histLo: '最低',
        tight: '钱贵',
        easy: '钱便宜',
        posRateShort: '实际利率为正',
        negRateShort: '实际利率为负',
      },
    }); },
  },
  // ── 市场情绪 ───────────────────────────────────────────────
  'panel-cnn-fg': {
    requires: ['cnnFg', 'price'],
    init() { if (D.cnnFg) initCnnFearGreedPanel(D.cnnFg, D.price); },
  },
  'panel-aaii': {
    requires: ['aaii'],
    init() { if (D.aaii) initAaiiPanel(D.aaii); },
  },
  'panel-naaim': {
    requires: ['naaim'],
    init() { if (D.naaim) initNaaimPanel(D.naaim); },
  },
  'panel-misery': {
    requires: ['misery', 'recession'],
    init() { if (D.misery) initMiseryPanel(D.misery, D.recession); },
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
function isChartRendered(el) {
  if (!el) return false;
  if (el.querySelector('[_echarts_instance_], canvas')) return true;
  if (el.querySelector('.chart-load-msg')) return false;
  // HTML 热力图等非 ECharts 渲染
  return el.childElementCount > 0 && el.textContent.trim().length > 0;
}

function showLoading(id) {
  panelChartHosts(id).forEach((el) => {
    if (isChartRendered(el)) return;
    if (el.querySelector('.chart-load-msg[data-kind="loading"]')) return;
    fillChartMessage(el, 'loading');
  });
}

function retryPanel(id) {
  const def = PANELS[id];
  if (!def) return;
  initialized.delete(id);
  def.requires.forEach((key) => {
    if (D[key] == null) {
      delete D[key];
      fetching.delete(key);
      if (FILES[key]) clearFetchJSON(FILES[key]);
    }
  });
  triggerPanel(id);
}

function triggerPanel(id) {
  if (initialized.has(id)) return;
  const def = PANELS[id];
  if (!def) return;

  showLoading(id);

  // Start loading any data this panel needs that isn't already in flight
  def.requires.forEach(key => {
    if (!(key in D) && !fetching.has(key) && FILES[key]) load(key, FILES[key]);
  });

  // Fire init when all required data resolves (including nulls for failures)
  whenAll(def.requires, () => {
    if (initialized.has(id)) return;   // guard against race
    initialized.add(id);
    const failed = def.requires.filter((k) => D[k] == null);
    try { def.init(); }
    catch (e) { console.error(`[lazy] init error — ${id}:`, e); }
    if (!failed.length) return;
    // 数据缺失且容器仍空：给出可见重试，不覆盖已画出的图，不改 whenAll / initialized 既有语义
    panelChartHosts(id).forEach((el) => {
      if (isChartRendered(el)) return;
      fillChartMessage(el, 'data-fail', () => retryPanel(id));
    });
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
  'cagrPaths', 'annualTr', 'returnDetails', 'drawdown', 'intrayearDd',
  'volatility', 'monthly', 'vix', 'buffett', 'hindenburg', 'pe', 'aiae', 'eps', 'roe',
  'm7', 'sectors', 'changes', 'rules', 'quotes', 'constituents',
  // Cross / NDX
  'nasdaqComp',
  'ndxAnnualLong', 'ndxAnnualTr', 'ndxDaily', 'ndxPrice',
  'ndxVolatility', 'ndxMonthly', 'ndxDrawdowns', 'ndxRolling5y',
  'ndxIntrayearDd', 'ndxVxn', 'qqqDetails',
  'nasdaq100', 'dowCentury', 'fedHikes',
  // Style ETF
  'styleEtf',
  // 大类资产 + 市场情绪（独立分类，排最后）
  'assetLadder', 'cnnFg', 'aaii', 'naaim', 'misery',
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

  try {
    await waitForEcharts();
  } catch (e) {
    console.error('[lazy] echarts unavailable', e);
    showEchartsPageFailure();
    initExportButtons();
    installPanelNotes();
    return;
  }

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

  // URL hash 命中某个面板时,显式 triggerPanel(id) 作为保险
  // (IntersectionObserver 在少数场景下不会立即触发初始 intersect,
  //  导致 hash 直达时目标面板空白, 必须手动点分类才渲染)
  const hashId = (window.location.hash || '').slice(1);
  if (hashId && hashId.startsWith('panel-') && hashId !== 'panel-chronicle') {
    // Chronicle 已在上面走独立路径处理; 其余 hash 一律显式触发
    setTimeout(() => triggerPanel(hashId), 50);
  }

  // Export buttons can be wired up immediately (handlers are lazy-safe)
  initExportButtons();

  // 老钱 2026-10-07：图表下方的指标卡与注释折进「看板说明」（B 方案，A 股站同款）
  installPanelNotes();
}

main().catch(console.error);
