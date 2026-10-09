// panels/geo_crises.js · Geopolitical crises (bear view + recession view merged, dimensions toggled via legend)
// Data: sp500_price.json (daily) + sp500_drawdowns.json (bear bands) + sp500_century.json (monthly line, recession view)
//       + us_recessions.json (FRED USREC recession bands).
// Merge note (user feedback 2026-10-09): original geo_fig2 / geo_fig3 combined into one chart with legend checkboxes —
//   bear bands (19) + events·bear set (15, with dates) ON by default; recession bands (15) + events·recession set
//   (13, red lines, dateless) OFF by default. Label positions follow each original's normalized coordinates.
// Caliber: price starts Dec 1927 (original starts 1921, monthly before 1964); the legend CAGR follows the monthly line.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009150347';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009150347';

// geo_fig2: 15 events (spec 01 §3.6, boxes carry dates)
const EVENTS_BEAR = [
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

// geo_fig3: 13 events (spec 01 §4.6, red lines + dateless boxes)
const EVENTS_REC = [
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

export function initGeoCrisesPanel(priceData, drawdownData, centuryData, recessionData) {
  const dom = document.getElementById('chartGeoCrises');
  const price = priceData?.series;
  const monthly = centuryData?.series;
  if (!dom || !price?.length) return;

  const lineDaily = price.filter(p => p.date >= '1927-12-01').map(p => [p.date, p.close]);
  const lineMonthly = (monthly || []).filter(p => p.date >= '1927-12-01').map(p => [p.date, p.value]);

  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const bearBands = (drawdownData?.drawdowns || [])
    .filter(x => (x.decline ?? 0) <= -0.20 && x.peak_date && x.days > 0)
    .map(x => [{ xAxis: x.peak_date }, { xAxis: addDays(x.peak_date, x.days) }]);
  const recBands = (recessionData?.periods || [])
    .filter(r => r.end >= '1929-01-01')
    .map(r => [{ xAxis: r.start < '1928-01-01' ? '1927-12-01' : r.start }, { xAxis: r.end }]);

  const blueColor = '#1e40af';
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const LEG_PRICE = 'S&P 500 price index';
  const LEG_BEAR = 'Bear bands (≥20%)';
  const LEG_REC = 'Recession bands (NBER)';
  const LEG_EV_BEAR = 'Events · bear view (15)';
  const LEG_EV_REC = 'Events · recession view (13)';

  function getOption() {
    return {
      animation: false,
      grid: { left: 64, right: 30, top: 52, bottom: 64 },
      legend: {
        top: 0,
        left: 'center',
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 14,
        selected: {
          [LEG_PRICE]: true,
          [LEG_BEAR]: true,
          [LEG_REC]: false,
          [LEG_EV_BEAR]: true,
          [LEG_EV_REC]: false,
        },
        textStyle: { fontSize: 12, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT },
        data: [
          { name: LEG_PRICE, itemStyle: { color: blueColor } },
          { name: LEG_BEAR, itemStyle: { color: 'rgba(244,114,182,0.55)' } },
          { name: LEG_REC, itemStyle: { color: 'rgba(150,150,150,0.5)' } },
          { name: LEG_EV_BEAR, itemStyle: { color: '#666' } },
          { name: LEG_EV_REC, itemStyle: { color: '#ef4444' } },
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
          name: LEG_BEAR,
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(244,114,182,0.55)' },
          tooltip: { show: false },
          legendHoverLink: false,
          markArea: { silent: true, itemStyle: { color: 'rgba(244,114,182,0.20)' }, data: bearBands },
          z: 0,
        },
        {
          name: LEG_REC,
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(150,150,150,0.5)' },
          tooltip: { show: false },
          legendHoverLink: false,
          markArea: { silent: true, itemStyle: { color: 'rgba(150,150,150,0.18)' }, data: recBands },
          z: 0,
        },
        {
          name: LEG_EV_BEAR,
          type: 'line',
          data: [],
          itemStyle: { color: '#666' },
          tooltip: { show: false },
          legendHoverLink: false,
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
            data: EVENTS_BEAR.map(e => ({ name: e.zh, zh: e.zh, dt: e.d, coord: [e.d, yFromNorm(e.y)] })),
          },
          z: 2,
        },
        {
          name: LEG_EV_REC,
          type: 'line',
          data: [],
          itemStyle: { color: '#ef4444' },
          tooltip: { show: false },
          legendHoverLink: false,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ef4444', width: 1, type: 'solid', opacity: 0.75 },
            label: { show: false },
            data: EVENTS_REC.map(e => ({ xAxis: e.d })),
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
            data: EVENTS_REC.map(e => ({ name: e.zh, zh: e.zh, coord: [e.d, yFromNorm(e.y)] })),
          },
          z: 2,
        },
        {
          name: LEG_PRICE,
          type: 'line',
          data: lineDaily,
          showSymbol: false,
          lineStyle: { width: 1.6, color: blueColor },
          itemStyle: { color: blueColor },
          z: 3,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const pt = params.find(p => p.seriesName === LEG_PRICE && Array.isArray(p.value));
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

  // The monthly line follows the recession dimension: checking it swaps the price line to the monthly average caliber.
  chart.on('legendselectchanged', e => {
    if (e.name !== LEG_REC) return;
    const showMonthly = !!e.selected[LEG_REC];
    chart.setOption({
      series: [{
        name: LEG_PRICE,
        data: showMonthly ? lineMonthly : lineDaily,
        lineStyle: { width: showMonthly ? 1.4 : 1.6 },
      }],
    });
  });

  renderMetricStrip('geoCrisesSummary', [
    buildMetricCard('Bear view', `${EVENTS_BEAR.length} events / ${bearBands.length} bear bands`, 'Pink bands + dated event boxes (original geo_fig2 form, on by default)'),
    buildMetricCard('Recession view', `${EVENTS_REC.length} events / ${recBands.length} recession bands`, 'Grey bands + red lines with dateless boxes, monthly line (original geo_fig3 form, via legend)'),
    buildMetricCard('Latest', formatNumber(price[price.length - 1].close, 2), `Data through ${price[price.length - 1].date} · log axis 10–10000`),
    buildMetricCard('Caliber gap', 'Original starts 1921, monthly to 1964', 'This chart starts Dec 1927, daily (free caliber); the recession view swaps to monthly'),
    buildMetricCard('Event dates', '1 correction by history', 'Yom Kippur War set to 1973-10-06 (original OCR conflicts with history)'),
  ]);
}
