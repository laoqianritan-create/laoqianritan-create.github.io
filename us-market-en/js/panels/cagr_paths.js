// panels/cagr_paths.js · S&P 500 with 3%–11% CAGR growth paths (Dec 1935 = 1, log scale)
// Data: data/sp500_cagr_paths.json (price index + self-computed total return, monthly dividend reinvestment)
// Layout mirrors Yardeni Research's chart; caliber and cross-checks live in the JSON `caliber` field.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261010221035';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  buildRecessionOverlaySeries,
} from '../chart-helpers.js?v=20261010221035';

const CAGR_RATES = [3, 4, 5, 6, 7, 8, 9, 10, 11];
const DAY_MS = 24 * 3600 * 1000;

export function initSp500CagrPanel(cagrData, recessionData) {
  const dom = document.getElementById('chartSp500CagrPaths');
  if (!dom || !cagrData?.series?.length) return;

  const chart = registerChart(echarts.init(dom));
  const S = cagrData.series;
  const baseDate = cagrData.base_date || S[0].date;
  const baseTs = new Date(baseDate).getTime();
  const lastDate = S[S.length - 1].date;
  const lastTs = new Date(lastDate).getTime();
  const years = (lastTs - baseTs) / (365.25 * DAY_MS);

  const priceData = S.map(p => [p.date, p.p]);
  const trData = S.map(p => [p.date, p.t]);

  const blueColor = '#2563eb';
  const redColor = cssVar('--red') || '#cf1322';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  // Constant-CAGR reference lines: all start at Dec 1935 = 1 (straight lines on a log axis)
  const cagrSeries = CAGR_RATES.map(r => ({
    name: `${r}% path`,
    type: 'line',
    data: [[baseDate, 1], [lastDate, Math.pow(1 + r / 100, years)]],
    showSymbol: false,
    silent: true,
    lineStyle: { color: grayColor, width: 1 },
    endLabel: {
      show: true,
      formatter: `${r}%`,
      color: grayColor,
      fontSize: 11,
      distance: 3,
      fontFamily: CHART_FONT,
    },
    tooltip: { show: false },
    z: 1,
  }));

  const recessionSeries = buildRecessionOverlaySeries(priceData, recessionData);

  function getOption() {
    return {
    animation: false,
    grid: { left: 70, right: 56, top: 40, bottom: 60 },
    legend: {
      top: 0,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 18,
      itemHeight: 3,
      itemGap: 16,
      textStyle: {
        fontSize: 12,
        color: cssVar('--text-secondary') || '#666',
        fontFamily: CHART_FONT,
      },
      data: [
        { name: 'Total Return (incl. dividends)', itemStyle: { color: blueColor } },
        { name: 'Price Index (excl. dividends)', itemStyle: { color: redColor } },
        { name: 'Recession Period', itemStyle: { color: 'rgba(153,153,153,0.35)' } },
      ],
    },
    xAxis: {
      type: 'time',
      axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'log',
      min: 0.5,
      max: 30000,
      axisLabel: {
        fontSize: 11,
        color: grayColor,
        fontFamily: CHART_FONT,
        formatter: value => formatNumber(value, value < 10 ? 1 : 0),
      },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [
      ...(recessionSeries ? [recessionSeries] : []),
      ...cagrSeries,
      {
        name: 'Total Return (incl. dividends)',
        type: 'line',
        data: trData,
        showSymbol: false,
        lineStyle: { width: 2, color: blueColor },
        itemStyle: { color: blueColor },
        z: 3,
      },
      {
        name: 'Price Index (excl. dividends)',
        type: 'line',
        data: priceData,
        showSymbol: false,
        lineStyle: { width: 2, color: redColor },
        itemStyle: { color: redColor },
        z: 2,
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--card-bg') || '#fff',
      borderColor: cssVar('--border') || '#e8e8e8',
      textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
      formatter: params => {
        const tr = params.find(p => p.seriesName === 'Total Return (incl. dividends)');
        const px = params.find(p => p.seriesName === 'Price Index (excl. dividends)');
        let html = params[0].axisValueLabel;
        if (tr) html += `<br/>Total return: <b>${formatNumber(tr.value[1], 1)}</b>`;
        if (px) html += `<br/>Price index: <b>${formatNumber(px.value[1], 2)}</b>`;
        return html;
      },
    },
    dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const latest = cagrData.latest || {};
  const cagr = cagrData.cagr || {};
  renderMetricStrip('cagrPathsSummary', [
    buildMetricCard('Base', `${String(baseDate).slice(0, 7)} = 1`, 'Rebased to 1; constant growth rates are straight lines on a log scale.'),
    buildMetricCard('Total return', latest.tr != null ? formatNumber(latest.tr, 1) : '--', `Dividends reinvested monthly · ${latest.date || '--'}`),
    buildMetricCard('Price index', latest.price != null ? formatNumber(latest.price, 2) : '--', `Excludes dividends · ${latest.date || '--'}`),
    buildMetricCard('Price CAGR', cagr.price != null ? `${cagr.price}%` : '--', `Annualized since Dec 1935 (${cagr.years || '--'} years).`),
    buildMetricCard('Total-return CAGR', cagr.tr != null ? `${cagr.tr}%` : '--', 'Annualized with dividends reinvested.'),
    buildMetricCard('Dividend yield', latest.dividend_yield != null ? `${latest.dividend_yield}%` : '--', `TTM basis · data through ${latest.yield_asof || '--'}`),
  ]);
}
