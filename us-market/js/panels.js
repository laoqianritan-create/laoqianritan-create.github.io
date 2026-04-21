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
  initIntrayearDdPanel,
  initSp500AnnualDistPanel,
  initCapitalismPanel,
} from './panels/sp500.js';

import {
  initPanelVix,
  initLogYoyPanel,
  initLongRunIndexPanel,
  initPanelAiae,
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

    // AIAE 单独 fetch（缺失时也不影响其它面板）
    let aiaeData = null;
    try { aiaeData = await fetchJSON('data/aiae.json'); } catch (e) { console.warn('aiae.json 缺失，AIAE 面板将不渲染', e); }
    // 年内回撤 vs 全年涨幅
    let intrayearDdData = null;
    try { intrayearDdData = await fetchJSON('data/sp500_intrayear_dd.json'); } catch (e) { console.warn('sp500_intrayear_dd.json 缺失，年内回撤面板将不渲染', e); }
    // 年度总回报分布（Bilello 同款 histogram）
    let annualTrData = null;
    try { annualTrData = await fetchJSON('data/sp500_annual_tr.json'); } catch (e) { console.warn('sp500_annual_tr.json 缺失，年度回报分布面板将不渲染', e); }
    // 纳指100 系列面板数据
    const ndxData = {};
    for (const [key, file] of [
      ['annualLong',    'ndx_annual_returns_long.json'],
      ['annualTr',      'ndx_annual_tr.json'],
      ['daily',         'ndx_daily.json'],
      ['price',         'ndx_price.json'],
      ['volatility',    'ndx_volatility.json'],
      ['monthly',       'ndx_monthly.json'],
      ['drawdowns',     'ndx_drawdowns.json'],
      ['rolling5y',     'ndx_rolling5y.json'],
      ['intrayearDd',   'ndx_intrayear_dd.json'],
      ['vxn',           'ndx_vxn.json'],
      ['qqqDetails',    'qqq_return_details.json'],
    ]) {
      try { ndxData[key] = await fetchJSON(`data/${file}`); }
      catch (e) { console.warn(`${file} 缺失`, e); }
    }

    initPanelPrice(priceData, recessionData, sp500CenturyData);
    initCapitalismPanel();
    initLongRunIndexPanel('chartNasdaqComposite', 'nasdaqCompositeSummary', nasdaqCompositeData, recessionData, '纳斯达克综指', 'nasdaqCompositeScaleToggle');
    // ── 牛熊周期面板的手工坐标 ──
    // 标签默认 distance=10 紧贴极值点；override 用来：
    //  - 把标签推进上下方的大片空白区（牛市 yOff 正值往下、负值往上拔；熊市相反）
    //  - 解决边界裁切（2026 进行中段贴右边界，xOff 负值左拉）
    //  - 修正自动 stagger 把单个标签错位的情况（1972 / 2002 / 2022）
    initLogYoyPanel('chartSp500LogYoy', sp500CenturyData, '标普500 同比', {
      '1935-03': { xOff: 0,   yOff: 0 },                    // 取消 +50 下推，恢复贴近曲线（上方空白让出来）
      '1938-03': { xOff: 0,   yOff: 0 },
      '1942-04': { xOff: 0,   yOff: 0 },
      '1972-12': { xOff: 0,   yOff: 0 },                    // 取消 stagger，回到正上方
      '1974-09': { xOff: 0,   yOff: 0 },
      '2020-03': { xOff: -30, yOff: 0 },                    // 往左挪避开 2022
      '2021-12': { xOff: -30, yOff: 36 },                   // 左下方（推进 0%~+50% 空白区）
      '2022-09': { xOff: 30,  yOff: 0 },                    // 往右挪避开 2020
      '2026-04': { xOff: -25, yOff: 18 },                   // 稍微往下+往右（之前 -40, 0）
    });
    initLogYoyPanel('chartNasdaqLogYoy', nasdaqCompositeData, '纳斯达克综指 同比', {
      '1982-07': { xOff: -25, yOff: 0 },                   // 减少左移幅度，往右回挪一些
      '1983-06': { xOff: -30, yOff: 0,  force: true },    // 短牛 force 显示，xOff 留左移避让；yOff 回 0 走标准间距
      '1984-07': { xOff: 0,   yOff: 0 },
      '1987-11': { xOff: 0,   yOff: 0 },
      '1989-09': { xOff: 0,   yOff: 0 },                    // 取消 stagger，回到正上方
      '1990-10': { xOff: 0,   yOff: 0 },
      '1998-08': { xOff: 0,   yOff: 0, force: true },      // 短熊强制显示
      '2002-09': { xOff: 0,   yOff: 0 },                    // 取消 stagger，回到正下方
      '2026-04': { xOff: -25, yOff: 18 },                  // 稍微往下+往右
    });
    initAnnualReturnsPanel(annualReturnsData);
    if (annualTrData) initSp500AnnualDistPanel(annualTrData);
    initPanelAnnualizedMatrix(sp500CenturyData);
    initReturnDetailsPanel(returnDetailsData);
    initPanelDrawdown(priceData, drawdownData);
    initPanelVolatility(volatilityData);
    initPanelMonthly(monthlyData);
    initPanelVix(priceData, vixData, recessionData);
    initPanelPe(peData, sp500CenturyData);
    if (aiaeData) initPanelAiae(aiaeData);
    if (intrayearDdData) initIntrayearDdPanel(intrayearDdData);
    initPanelEps(epsData, sp500CenturyData);
    initPanelRoe(roeData);
    initPanelRolling(sp500CenturyData);
    initPanelM7(m7Data);
    initPanelSectors(sectorsData);
    initPanelChanges(changesData);
    initPanelRules(rulesData);
    initPanelScatter(constituentsData);
    initNasdaq100CompaniesPanel(nasdaq100Data);
    // 纳指100年度回报：从 QQQ 1999+ 切到 ^NDX 1986+
    if (ndxData.annualLong) {
      initAnnualReturnsPanel(ndxData.annualLong, {
        chartId: 'chartNasdaq100Annual',
        summaryId: 'nasdaq100AnnualSummary',
      });
    } else {
      initNasdaq100AnnualPanel(nasdaq100Data);
    }
    // 纳指100年度回报分布（histogram，价格回报）
    if (ndxData.annualTr) {
      initSp500AnnualDistPanel(ndxData.annualTr, {
        wrapId: 'ndxTrDistWrap',
        summaryId: 'ndxTrDistSummary',
        returnKind: '价格回报口径（不含股息）',
        sourceLabel: 'yfinance ^NDX 日线',
        sourceDesc: '1986+ 年末收盘点位计算年度价格回报，不含股息。',
      });
    }
    // 纳指100跨年持有矩阵（从 ndx_daily 1986+）
    if (ndxData.daily) {
      initPanelAnnualizedMatrix(ndxData.daily, {
        containerId: 'ndxAnnualizedMatrix',
        rangeId: 'ndxMatrixRange',
        startYear: 1986,
      });
    }
    // 纳指100回报分解（QQQ 2000+，价格 + 股息 + top25 回购聚合）
    if (ndxData.qqqDetails) {
      initReturnDetailsPanel(ndxData.qqqDetails, {
        chartId: 'chartNdxReturnDetails',
        summaryId: 'ndxReturnDetailsSummary',
        indexLabel: 'QQQ',
      });
    }
    // 纳指100回撤
    if (ndxData.price && ndxData.drawdowns) {
      initPanelDrawdown(ndxData.price, ndxData.drawdowns, {
        chartId: 'chartNdxDrawdown',
        tbodyId: 'ndxDrawdownTbody',
        tableId: 'ndxDrawdownTable',
        ddMin: -85,
        hideCause: true,
      });
    }
    // 纳指100年内DD
    if (ndxData.intrayearDd) {
      initIntrayearDdPanel(ndxData.intrayearDd, { gridId: 'ndxDdGrid' });
    }
    // 纳指100波动率
    if (ndxData.volatility) {
      initPanelVolatility(ndxData.volatility, {
        chartId: 'chartNdxVolatility',
        label: '纳指100',
      });
    }
    // 纳指100月度涨跌
    if (ndxData.monthly) {
      initPanelMonthly(ndxData.monthly, { containerId: 'ndxMonthlyHeatmap' });
    }
    // 纳指100 VXN
    if (ndxData.price && ndxData.vxn) {
      initPanelVix(ndxData.price, ndxData.vxn, recessionData, {
        chartId: 'chartNdxVxn',
        indexLabel: '纳指100',
        volLabel: 'VXN',
        volThreshold: 30,
        summaryId: 'ndxVxnSummary',
      });
    }
    // 纳指100五年滚动（已预计算）
    if (ndxData.rolling5y) {
      initPanelRolling(ndxData.rolling5y, {
        chartId: 'chartNdxRolling',
        precomputed: true,
      });
    }
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
