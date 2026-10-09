// panels/mwew_ratio.js · S&P 500 market-weight / equal-weight ratio (Yardeni Breadth II Fig 1 form)
// Data: site sp500_price.json (market-cap leg) + sp500_equal_weight.json (RSP equal-weight leg) + sp500_drawdowns.json (bear/correction bands).
// Caliber: ratio = (market-weight index / base) ÷ (equal-weight index / base), May 2003 = 1 (RSP inception);
// the original starts in 1990 (LSEG equal-weight index); the only free equal-weight leg is RSP (from 2003-05),
// so the start-date caliber differs — stated in the panel notes.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009221049';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261009221049';

export function initMwewRatioPanel(priceData, ewData, drawdownData) {
  const dom = document.getElementById('chartMwewRatio');
  const price = priceData?.series;
  const ewSeries = ewData?.series;
  if (!dom || !price?.length || !ewSeries?.length) return;

  const ewMap = new Map(ewSeries.map(x => [x.date, x.close]));
  const joined = price.filter(p => ewMap.has(p.date));
  if (joined.length < 100) return;

  const p0 = joined[0].close;
  const e0 = ewMap.get(joined[0].date);
  const ratioData = joined.map(p => [p.date, +((p.close / p0) / (ewMap.get(p.date) / e0)).toFixed(4)]);

  // Bear / correction bands from the drawdown table: peak_date → peak_date+days (trough), ≥20% bear, 10–20% correction
  const dds = drawdownData?.drawdowns || [];
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const bands = dds
    .filter(x => (x.decline ?? 0) <= -0.10 && x.peak_date && x.days > 0)
    .map(x => ({
      start: x.peak_date,
      end: addDays(x.peak_date, x.days),
      bear: x.decline <= -0.20,
    }));
  const bearBands = bands.filter(b => b.bear).map(b => [{ xAxis: b.start }, { xAxis: b.end }]);
  const corrBands = bands.filter(b => !b.bear).map(b => [{ xAxis: b.start }, { xAxis: b.end }]);

  const blueColor = '#2563eb';
  const bearColor = 'rgba(207,19,34,0.12)';
  const corrColor = 'rgba(37,99,235,0.08)';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const latest = ratioData[ratioData.length - 1];
  let minPt = ratioData[0];
  let maxPt = ratioData[0];
  for (const pt of ratioData) {
    if (pt[1] < minPt[1]) minPt = pt;
    if (pt[1] > maxPt[1]) maxPt = pt;
  }
  const fmtYM = iso => iso.slice(0, 7).replace('-', '/');

  function getOption() {
    return {
      animation: false,
      grid: { left: 64, right: 30, top: 46, bottom: 64 },
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
          { name: 'MW/EW Ratio', itemStyle: { color: blueColor } },
          { name: 'Bear Markets (≥20%)', itemStyle: { color: 'rgba(207,19,34,0.45)' } },
          { name: 'Corrections (10–20%)', itemStyle: { color: 'rgba(37,99,235,0.30)' } },
        ],
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0.6,
        max: 1.2,
        interval: 0.1,
        axisLabel: {
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
          formatter: v => v.toFixed(1),
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: 'Bear Markets (≥20%)',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(207,19,34,0.45)' },
          tooltip: { show: false },
          markArea: {
            silent: true,
            itemStyle: { color: bearColor },
            data: bearBands,
          },
          z: 0,
        },
        {
          name: 'Corrections (10–20%)',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(37,99,235,0.30)' },
          tooltip: { show: false },
          markArea: {
            silent: true,
            itemStyle: { color: corrColor },
            data: corrBands,
          },
          z: 0,
        },
        {
          name: 'MW/EW Ratio',
          type: 'line',
          data: ratioData,
          showSymbol: false,
          lineStyle: { width: 2, color: blueColor },
          itemStyle: { color: blueColor },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            label: { show: true, formatter: '1.0', position: 'insideEndTop', fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
            data: [{ yAxis: 1.0 }],
          },
          z: 2,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const pt = params.find(p => p.seriesName === 'MW/EW Ratio' && p.value && Array.isArray(p.value));
          if (!pt) return '';
          return `${pt.value[0]}<br/>MW/EW ratio: <b>${formatNumber(pt.value[1], 3)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('mwewSummary', [
    buildMetricCard('Latest ratio', formatNumber(latest[1], 3), `Base ${fmtYM(joined[0].date)} = 1 · data through ${latest[0]}`),
    buildMetricCard('Period high', `${formatNumber(maxPt[1], 3)} (${fmtYM(maxPt[0])})`, 'Above 1 = market-weight beating equal-weight'),
    buildMetricCard('Period low', `${formatNumber(minPt[1], 3)} (${fmtYM(minPt[0])})`, 'Below 1 = equal-weight beating market-weight'),
    buildMetricCard('Shading', `${bearBands.length} bears / ${corrBands.length} corrections`, 'From the drawdown table: ≥20% bear, 10–20% correction (peak→trough)'),
    buildMetricCard('Start caliber', 'May 2003 (RSP inception)', 'Original starts 1990; the only free equal-weight leg starts 2003'),
  ]);
}
