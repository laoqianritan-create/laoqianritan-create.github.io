// panels/geo_crises.js · S&P 500 & geopolitical crises — bear-market view (Yardeni geo_fig2 form)
// Data: site sp500_price.json (daily price index) + sp500_drawdowns.json (bear bands).
// Event list and label heights from spec 01 (OCR verbatim + normalized coordinates); labels placed with markPoint.
// Caliber note: this chart starts Dec 1927 (the original starts 1921 and is monthly before 1964) — stated in the panel notes.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009142337';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009142337';

// Spec 01 §3.6: 15 events (date, English/Chinese name, yNorm = normalized label height 0=bottom 1=top)
const EVENTS = [
  { d: '1930-06-17', zh: 'Smoot-Hawley Tariff', y: 0.40 },
  { d: '1939-09-01', zh: 'Germany Invades Poland', y: 0.53 },
  { d: '1941-12-07', zh: 'Pearl Harbor', y: 0.35 },
  { d: '1950-06-25', zh: 'Korean War Begins', y: 0.42 },
  { d: '1956-10-29', zh: 'Suez Crisis', y: 0.56 },
  { d: '1962-10-16', zh: 'Cuban Missile Crisis', y: 0.71 },
  { d: '1967-06-05', zh: 'Six-Day War', y: 0.55 },
  { d: '1973-10-06', zh: 'Yom Kippur War', y: 0.29 },
  { d: '1979-01-16', zh: 'Iran Revolution', y: 0.57 },
  { d: '1990-08-02', zh: 'Iraq Invades Kuwait', y: 0.72 },
  { d: '1991-01-17', zh: 'Gulf War I', y: 0.48 },
  { d: '2001-09-11', zh: '9/11 Attacks', y: 0.84 },
  { d: '2003-03-20', zh: 'Gulf War II', y: 0.60 },
  { d: '2022-02-22', zh: 'Russia Invades Ukraine', y: 0.66 },
  { d: '2026-02-28', zh: 'Gulf War III', y: 0.76 },
];

const Y_MIN = 10;
const Y_MAX = 10000;
const yFromNorm = y => Math.pow(10, Math.log10(Y_MIN) + y * (Math.log10(Y_MAX) - Math.log10(Y_MIN)));

export function initGeoCrisesPanel(priceData, drawdownData) {
  const dom = document.getElementById('chartGeoCrises');
  const series = priceData?.series;
  if (!dom || !series?.length) return;

  const line = series.filter(p => p.date >= '1927-12-01').map(p => [p.date, p.close]);

  const dds = drawdownData?.drawdowns || [];
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const bearBands = dds
    .filter(x => (x.decline ?? 0) <= -0.20 && x.peak_date && x.days > 0)
    .map(x => [{ xAxis: x.peak_date }, { xAxis: addDays(x.peak_date, x.days) }]);

  const blueColor = '#1e40af';
  const pinkColor = 'rgba(244,114,182,0.20)';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const last = series[series.length - 1];

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
          { name: 'S&P 500 price index*', itemStyle: { color: blueColor } },
          { name: 'Bear markets', itemStyle: { color: 'rgba(244,114,182,0.55)' } },
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
          name: 'Bear markets',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(244,114,182,0.55)' },
          tooltip: { show: false },
          markArea: { silent: true, itemStyle: { color: pinkColor }, data: bearBands },
          z: 0,
        },
        {
          name: 'S&P 500 price index*',
          type: 'line',
          data: line,
          showSymbol: false,
          lineStyle: { width: 1.6, color: blueColor },
          itemStyle: { color: blueColor },
          markPoint: {
            symbol: 'circle',
            symbolSize: 3,
            itemStyle: { color: '#666' },
            label: {
              show: true,
              position: 'top',
              distance: 3,
              fontSize: 10,
              fontFamily: CHART_FONT,
              color: textColor,
              backgroundColor: 'rgba(255,255,255,0.88)',
              borderColor: cssVar('--border') || '#e8e8e8',
              borderWidth: 1,
              padding: [2, 4],
              formatter: p => `${p.data.zh}\n${p.data.dt}`,
            },
            data: EVENTS.map(e => ({ name: e.zh, zh: e.zh, dt: e.d, coord: [e.d, yFromNorm(e.y)] })),
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
          const pt = params.find(p => p.seriesName === 'S&P 500 price index*' && Array.isArray(p.value));
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

  renderMetricStrip('geoCrisesSummary', [
    buildMetricCard('Events', `${EVENTS.length} labels`, '1930 tariff war → 2026 Gulf War III, positioned per the original normalized coordinates'),
    buildMetricCard('Bear bands', `${bearBands.length}`, 'From the site drawdown table (close-to-close ≥20%, peak→trough)'),
    buildMetricCard('Latest', formatNumber(last.close, 2), `Data through ${last.date} · log axis 10–10000`),
    buildMetricCard('Caliber gap', 'Original starts 1921, monthly to 1964', 'This chart starts Dec 1927, daily throughout (free caliber)'),
    buildMetricCard('Event dates', '1 correction by history', 'Yom Kippur War set to 1973-10-06 (original OCR conflicts with history)'),
  ]);
}
