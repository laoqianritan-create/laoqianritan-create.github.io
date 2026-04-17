// panels.js · 入口文件 — 数据加载 + main()
// 面板 init 函数按域拆分在 js/panels/ 子目录下

import { fetchJSON, cssVar } from './utils.js';
import { initTheme } from './theme.js';
import { initNav, initPanelSnapScroll } from './nav.js';
import { initExportButtons } from './export-png.js';

import {
  initPanelPrice,
  initPanelDrawdown,
  initPanelVolatility,
  initPanelMonthly,
  initPanelAnnualizedMatrix,
  initPanelScatter,
  initPanelPe,
  initPanelEps,
  initPanelRoe,
  initPanelRolling,
  initAnnualReturnsPanel,
  initReturnDetailsPanel,
} from './panels/sp500.js';

import {
  initPanelVix,
  initLogYoyPanel,
  initLongRunIndexPanel,
} from './panels/indices.js';

import {
  initPanelM7,
  initPanelSectors,
} from './panels/market.js';

import {
  initNasdaq100CompaniesPanel,
  initNasdaq100AnnualPanel,
  initNasdaqRankingPanel,
  initNasdaq100WeightsPanel,
} from './panels/nasdaq.js';

import {
  initPanelChanges,
  initPanelRules,
} from './panels/rules.js';

async function main() {
  initTheme();
  initNav();

  try {
    const [
      priceData,
      volatilityData,
      monthlyData,
      constituentsData,
      drawdownData,
      vixData,
      peData,
      epsData,
      roeData,
      recessionData,
      sp500CenturyData,
      nasdaqCompositeData,
      annualReturnsData,
      returnDetailsData,
      nasdaq100Data,
      dowCenturyData,
      m7Data,
      sectorsData,
      changesData,
      rulesData,
    ] = await Promise.all([
      fetchJSON('data/sp500_price.json'),
      fetchJSON('data/sp500_volatility.json'),
      fetchJSON('data/sp500_monthly.json'),
      fetchJSON('data/sp500_constituents.json'),
      fetchJSON('data/sp500_drawdowns.json'),
      fetchJSON('data/sp500_vix.json'),
      fetchJSON('data/sp500_pe.json'),
      fetchJSON('data/sp500_eps.json'),
      fetchJSON('data/sp500_roe.json'),
      fetchJSON('data/us_recessions.json'),
      fetchJSON('data/sp500_century.json'),
      fetchJSON('data/nasdaq_composite.json'),
      fetchJSON('data/sp500_annual_returns_long.json'),
      fetchJSON('data/sp500_return_details.json'),
      fetchJSON('data/nasdaq100_panels.json'),
      fetchJSON('data/dow_jones_century.json'),
      fetchJSON('data/m7_index.json'),
      fetchJSON('data/sp500_sectors.json'),
      fetchJSON('data/sp500_changes.json'),
      fetchJSON('data/sp500_rules.json'),
    ]);

    initPanelPrice(priceData, recessionData, sp500CenturyData);
    initLongRunIndexPanel('chartNasdaqComposite', 'nasdaqCompositeSummary', nasdaqCompositeData, recessionData, '纳斯达克综指', 'nasdaqCompositeScaleToggle');
    // ── 牛熊周期面板的手工坐标 ──
    // 标签默认紧贴极值点（distance=10 写死）。下面 override 仅处理用户拍板的特例：
    // - position 切换 top/bottom 用来"翻到曲线对面"（1935 例外往上）
    // - xOff 用来左右挪动避让/避免被边界裁切
    // - yOff 一律 0（不允许飘离曲线超过 distance）
    initLogYoyPanel('chartSp500LogYoy', sp500CenturyData, '标普500 同比', {
      '1935-03': { xOff: -30, yOff: 0, position: 'top' }, // 往左上角
      '1938-03': { xOff: 0,   yOff: 0 },                   // 锁正下方
      '1942-04': { xOff: 0,   yOff: 0 },                   // 锁正下方
      '1974-09': { xOff: 0,   yOff: 0 },                   // 锁正下方
      '2021-12': { xOff: 0,   yOff: 0 },                   // 锁正上方
      '2026-04': { xOff: 0,   yOff: 0 },                   // 锁正上方
    });
    initLogYoyPanel('chartNasdaqLogYoy', nasdaqCompositeData, '纳斯达克综指 同比', {
      '1982-07': { xOff: -55, yOff: 0 },                  // 整体往左避开 1984
      '1984-07': { xOff: 0,   yOff: 0 },                   // 锁正下方
      '1987-11': { xOff: 0,   yOff: 0 },                   // 锁正下方
      '1990-10': { xOff: 0,   yOff: 0 },                   // 锁正下方
      '1998-08': { xOff: 0,   yOff: 0, force: true },     // 短熊强制显示 + 锁正下方
      '2026-04': { xOff: -55, yOff: 0 },                  // 进行中牛市贴右边界，整体左移避免被裁
    });
    initAnnualReturnsPanel(annualReturnsData);
    initPanelAnnualizedMatrix(sp500CenturyData);
    initReturnDetailsPanel(returnDetailsData);
    initPanelDrawdown(priceData, drawdownData);
    initPanelVolatility(volatilityData);
    initPanelMonthly(monthlyData);
    initPanelVix(priceData, vixData, recessionData);
    initPanelPe(peData, sp500CenturyData);
    initPanelEps(epsData);
    initPanelRoe(roeData);
    initPanelRolling(sp500CenturyData);
    initPanelM7(m7Data);
    initPanelSectors(sectorsData);
    initPanelChanges(changesData);
    initPanelRules(rulesData);
    initPanelScatter(constituentsData);
    initNasdaq100CompaniesPanel(nasdaq100Data);
    initNasdaq100AnnualPanel(nasdaq100Data);
    initNasdaqRankingPanel('chartNasdaq100MemberReturns', 'nasdaq100MemberReturnSummary', nasdaq100Data.companies, {
      key: 'return1y',
      label: '近1年收益',
      summaryLabel: '全样本均值',
      showAllByDefault: true,
      gridLeft: 132,
      gridRight: 72,
      barMaxWidth: 8,
      xAxisSplitNumber: 6,
      xAxisMin: minValue => Math.min(-200, Math.floor(minValue / 100) * 100),
      xAxisMax: (_minValue, maxValue) => Math.max(1000, Math.ceil(maxValue / 100) * 100),
      color: value => (value >= 0 ? (cssVar('--green') || '#389e0d') : (cssVar('--red') || '#cf1322')),
    });
    initNasdaqRankingPanel('chartNasdaq100Ytd', 'nasdaq100YtdSummary', nasdaq100Data.companies, {
      key: 'ytdReturn',
      label: '年内收益',
      summaryLabel: '年初至今均值',
      showAllByDefault: true,
      gridLeft: 132,
      gridRight: 72,
      barMaxWidth: 8,
      xAxisSplitNumber: 5,
      xAxisMin: minValue => Math.min(-100, Math.floor(minValue / 10) * 10),
      xAxisMax: (_minValue, maxValue) => Math.max(100, Math.ceil(maxValue / 10) * 10),
      color: value => (value >= 0 ? (cssVar('--green') || '#389e0d') : (cssVar('--red') || '#cf1322')),
    });
    initNasdaq100WeightsPanel(nasdaq100Data);
    initLongRunIndexPanel('chartDowCentury', 'dowCenturySummary', dowCenturyData, recessionData, '道琼斯指数', 'dowCenturyScaleToggle');
    initExportButtons();
  } catch (err) {
    console.error('数据加载失败:', err);
    document.getElementById('main').innerHTML = `<div class="loading-msg">数据加载失败，请确保 data/ 目录中有 JSON 文件。<br><small>${err.message}</small></div>`;
  }
}

main();

main();
