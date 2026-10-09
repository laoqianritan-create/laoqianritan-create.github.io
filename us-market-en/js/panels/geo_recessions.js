// panels/geo_recessions.js · S&P 500 & geopolitical crises — recession view (Yardeni geo_fig3 form)
// Data: site sp500_century.json (monthly price index from Dec 1927) + us_recessions.json (FRED USREC bands).
// 13 events and label heights from spec 01 §4.6 (OCR verbatim + normalized coordinates); the original boxes carry no dates,
// dates are expressed by red vertical lines.
// Caliber note: starts Dec 1927, month-end prices (the original starts Jan 1921, monthly averages), CAGR differs accordingly.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009143214';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009143214';

// Spec 01 §4.6: 13 events (red line + dateless label box); dates from the geo_fig2 list / history
const EVENTS = [
  { d: '1930-06-17', zh: 'Smoot-Hawley Tariff', y: 0.40 },
  { d: '1939-09-01', zh: 'Germany Invades Poland', y: 0.45 },
  { d: '1941-12-07', zh: 'Pearl Harbor', y: 0.30 },
  { d: '1950-06-25', zh: 'Korean War Begins', y: 0.18 },
  { d: '1956-10-29', zh: 'Suez Crisis', y: 0.45 },
  { d: '1962-10-16', zh: 'Cuban Missile Crisis', y: 0.33 },
  { d: '1967-06-05', zh: 'Six-Day War', y: 0.52 },
  { d: '1973-10-06', zh: 'Yom Kippur War', y: 0.37 },
  { d: '1979-01-16', zh: 'Iran Revolution', y: 0.57 },
  { d: '1990-08-02', zh: 'Iraq Invades Kuwait', y: 0.50 },
  { d: '2001-09-11', zh: '9/11 Attacks', y: 0.84 },
  { d: '2022-02-22', zh: 'Russia Invades Ukraine', y: 0.79 },
  { d: '2023-10-07', zh: 'Hamas Attacks Israel', y: 0.64 },
];

const Y_MIN = 10;
const Y_MAX = 10000;
const yFromNorm = y => Math.pow(10, Math.log10(Y_MIN) + y * (Math.log10(Y_MAX) - Math.log10(Y_MIN)));

export function initGeoRecessionsPanel(centuryData, recessionData) {
  const dom = document.getElementById('chartGeoRecessions');
  const series = centuryData?.series;
  if (!dom || !series?.length) return;

  const line = series.filter(p => p.date >= '1927-12-01').map(p => [p.date, p.value]);
  const recBands = (recessionData?.periods || [])
    .filter(r => r.end >= '1929-01-01')
    .map(r => [{ xAxis: r.start < '1928-01-01' ? '1927-12-01' : r.start }, { xAxis: r.end }]);

  const blueColor = '#1e40af';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const f = series[0];
  const l = series[series.length - 1];
  const years = (new Date(l.date) - new Date(f.date)) / (365.25 * 86400000);
  const cagr = Math.pow(l.value / f.value, 1 / years) - 1;
  const cagrTxt = `CAGR ${f.date.slice(0, 7)}–${l.date.slice(0, 7)} ${(cagr * 100).toFixed(2)}%`;

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
        textStyle: { fontSize: 12, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT },
        data: [
          { name: `S&P 500* (${cagrTxt})`, itemStyle: { color: blueColor } },
          { name: 'Recession', itemStyle: { color: 'rgba(150,150,150,0.5)' } },
        ],
      },
      xAxis: {
        type: 'time',
        min: '1927-01-01',
        max: '2030-12-31',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'log',
        min: Y_MIN,
        max: Y_MAX,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: 'Recession',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(150,150,150,0.5)' },
          tooltip: { show: false },
          markArea: { silent: true, itemStyle: { color: 'rgba(150,150,150,0.18)' }, data: recBands },
          z: 0,
        },
        {
          name: `S&P 500* (${cagrTxt})`,
          type: 'line',
          data: line,
          showSymbol: false,
          lineStyle: { width: 1.6, color: blueColor },
          itemStyle: { color: blueColor },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ef4444', width: 1, type: 'solid', opacity: 0.75 },
            label: { show: false },
            data: EVENTS.map(e => ({ xAxis: e.d })),
          },
          markPoint: {
            symbol: 'circle',
            symbolSize: 3,
            itemStyle: { color: '#ef4444' },
            label: {
              show: true,
              position: 'top',
              distance: 3,
              fontSize: 10,
              fontFamily: CHART_FONT,
              color: textColor,
              backgroundColor: 'rgba(255,255,255,0.88)',
              borderColor: '#ef4444',
              borderWidth: 1,
              padding: [2, 4],
              formatter: p => p.data.zh,
            },
            data: EVENTS.map(e => ({ name: e.zh, zh: e.zh, coord: [e.d, yFromNorm(e.y)] })),
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
          const pt = params.find(p => Array.isArray(p.value) && typeof p.value[1] === 'number');
          if (!pt) return '';
          return `${pt.value[0]}<br/>S&P 500: <b>${formatNumber(pt.value[1], 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('geoRecessionsSummary', [
    buildMetricCard('Events', `${EVENTS.length} labels`, 'Red lines + boxes without dates (per the original); dates via hover and this card'),
    buildMetricCard('Recession bands', `${recBands.length}`, 'FRED USREC recession periods (site us_recessions)'),
    buildMetricCard('Long-run CAGR', `${(cagr * 100).toFixed(2)}%`, `${f.date.slice(0, 7)} → ${l.date.slice(0, 7)} price index; original Jan1921–Apr2026 is 6.72%`),
    buildMetricCard('Latest', formatNumber(l.value, 2), `Monthly through ${l.date}`),
    buildMetricCard('Caliber gap', 'Original starts 1921, monthly averages', 'This chart starts Dec 1927, month-end prices (free caliber); axis 10–10000'),
  ]);
}
