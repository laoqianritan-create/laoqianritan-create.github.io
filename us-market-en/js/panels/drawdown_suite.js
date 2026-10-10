// panels/drawdown_suite.js · Bear & bull market drawdown suite (Yardeni bb01 / bb02 / bb03–bb15 merged)
// Data: site sp500_drawdowns.json (82 drawdowns with peak/trough/days/decline) + sp500_price.json (daily price index).
// Three charts: ① horizontal bars of bear length (with average) ② horizontal bars of bear decline (with average)
// ③ full-history price on a log axis with red bear / blue correction bands and bear-segment labels.
// Caliber: site drawdowns = close-to-close, peak→trough; 19 bears ≥20% since 1928. Yardeni bb01 shows 23 — the 1930s
// consecutive declines are merged here (e.g. 1929-09→1932-06 as one). Anchors match: 2000 = 929 days/−49.1%, 2007 = 517 days/−56.8%.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261010100336';
import { registerChart, buildMetricCard, renderMetricStrip } from '../chart-helpers.js?v=20261010100336';

export function initDrawdownSuitePanel(priceData, drawdownData) {
  const domLen = document.getElementById('chartDdLength');
  const domDec = document.getElementById('chartDdDecline');
  const domHis = document.getElementById('chartDdHistory');
  const dds = drawdownData?.drawdowns;
  const price = priceData?.series;
  if (!domLen || !domDec || !domHis || !dds?.length || !price?.length) return;

  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';
  const blueColor = '#2563eb';

  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  // 轴标签日期格式（2026-10-10 老钱指令）：横条图类目轴用 yyyy/mm/dd
const fmtMDY = iso => { const [y, m, d] = iso.split('-'); return `${y}/${m}/${d}`; };

  const bears = dds.filter(x => (x.decline ?? 0) <= -0.20 && x.peak_date).sort((a, b) => a.peak_date.localeCompare(b.peak_date));
  const corrections = dds.filter(x => (x.decline ?? 0) <= -0.10 && (x.decline ?? 0) > -0.20 && x.peak_date);

  const avgDays = Math.round(bears.reduce((s, b) => s + b.days, 0) / bears.length);
  const avgDec = bears.reduce((s, b) => s + b.decline, 0) / bears.length;
  const longest = [...bears].sort((a, b) => b.days - a.days)[0];
  const deepest = [...bears].sort((a, b) => a.decline - b.decline)[0];

  // ── Chart ① bear length (newest→oldest categories, oldest lands on top; Average at bottom) ──
  const lenList = [...bears].reverse().map(b => fmtMDY(b.peak_date));
  const lenValues = [...bears].reverse().map(b => b.days);
  const lenCats2 = [...lenList, 'Average'];
  const lenValues2 = [...lenValues, avgDays];

  const chartLen = registerChart(echarts.init(domLen));
  chartLen.setOption({
    animation: false,
    grid: { left: 96, right: 56, top: 30, bottom: 40 },
    xAxis: {
      type: 'value', min: 0, max: 2000, interval: 200,
      axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
      splitLine: { lineStyle: { color: gridColor } },
    },
    yAxis: {
      type: 'category',
      data: lenCats2,
      axisLabel: { fontSize: 11, color: textColor, fontFamily: CHART_FONT },
      axisLine: { lineStyle: { color: gridColor } },
    },
    series: [{
      type: 'bar',
      data: lenValues2.map((v, i) => ({
        value: v,
        itemStyle: { color: i === lenValues2.length - 1 ? '#0f766e' : blueColor },
      })),
      barMaxWidth: 14,
      label: { show: true, position: 'right', fontSize: 10, color: textColor, fontFamily: CHART_FONT },
    }],
    tooltip: {
      trigger: 'item',
      backgroundColor: cssVar('--card-bg') || '#fff',
      borderColor: cssVar('--border') || '#e8e8e8',
      textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
      formatter: p => `${p.name}<br/>Length: <b>${p.value}</b> days`,
    },
  });
  chartLen._refreshTheme = () => {};

  // ── Chart ② bear decline (negative bars to the left; Average in green at bottom) ──
  const decList = [...bears].reverse().map(b => fmtMDY(b.peak_date));
  const decValues = [...bears].reverse().map(b => +(b.decline * 100).toFixed(1));
  const decCats = [...decList, 'Average'];
  const decValues2 = [...decValues, +(avgDec * 100).toFixed(1)];

  const chartDec = registerChart(echarts.init(domDec));
  chartDec.setOption({
    animation: false,
    grid: { left: 96, right: 56, top: 30, bottom: 40 },
    xAxis: {
      type: 'value', min: -90, max: 0, interval: 10,
      axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, formatter: v => `${v}%` },
      splitLine: { lineStyle: { color: gridColor } },
    },
    yAxis: {
      type: 'category',
      data: decCats,
      axisLabel: { fontSize: 11, color: textColor, fontFamily: CHART_FONT },
      axisLine: { lineStyle: { color: gridColor } },
    },
    series: [{
      type: 'bar',
      data: decValues2.map((v, i) => ({
        value: v,
        itemStyle: { color: i === decValues2.length - 1 ? '#16a34a' : blueColor },
      })),
      barMaxWidth: 14,
      label: { show: true, position: 'left', fontSize: 10, color: textColor, fontFamily: CHART_FONT, formatter: p => `${p.value}%` },
    }],
    tooltip: {
      trigger: 'item',
      backgroundColor: cssVar('--card-bg') || '#fff',
      borderColor: cssVar('--border') || '#e8e8e8',
      textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
      formatter: p => `${p.name}<br/>Decline: <b>${p.value}%</b>`,
    },
  });
  chartDec._refreshTheme = () => {};

  // ── Chart ③ full-history price + red bear / blue correction bands + bear labels ──
  const line = price.map(p => [p.date, p.close]);
  const bearBands = bears.map(b => [{ xAxis: b.peak_date }, { xAxis: addDays(b.peak_date, b.days) }]);
  const corrBands = corrections.map(c => [{ xAxis: c.peak_date }, { xAxis: addDays(c.peak_date, c.days) }]);

  const Y_MIN = 10;
  const Y_MAX = 10000;
  const yAtNorm = t => Math.pow(10, Math.log10(Y_MIN) + t * (Math.log10(Y_MAX) - Math.log10(Y_MIN)));
  const bearLabels = bears.map((b, i) => ({
    name: b.period,
    zh: `−${Math.abs(Math.round(b.decline * 100))}% (${b.days})`,
    coord: [addDays(b.peak_date, Math.floor(b.days / 2)), yAtNorm(i % 2 === 0 ? 0.93 : 0.85)],
  }));

  const chartHis = registerChart(echarts.init(domHis));
  chartHis.setOption({
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
        { name: 'S&P 500 price index', itemStyle: { color: blueColor } },
        { name: 'Bear markets (≥20%)', itemStyle: { color: 'rgba(207,19,34,0.45)' } },
        { name: 'Corrections (10–20%)', itemStyle: { color: 'rgba(37,99,235,0.30)' } },
      ],
    },
    xAxis: { type: 'time', axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT }, splitLine: { show: false } },
    yAxis: {
      type: 'log', min: Y_MIN, max: Y_MAX,
      axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [
      {
        name: 'Bear markets (≥20%)', type: 'line', data: [],
        itemStyle: { color: 'rgba(207,19,34,0.45)' }, tooltip: { show: false },
        markArea: { silent: true, itemStyle: { color: 'rgba(207,19,34,0.13)' }, data: bearBands },
        z: 0,
      },
      {
        name: 'Corrections (10–20%)', type: 'line', data: [],
        itemStyle: { color: 'rgba(37,99,235,0.30)' }, tooltip: { show: false },
        markArea: { silent: true, itemStyle: { color: 'rgba(37,99,235,0.08)' }, data: corrBands },
        z: 0,
      },
      {
        name: 'S&P 500 price index', type: 'line', data: line, showSymbol: false,
        lineStyle: { width: 1.6, color: blueColor }, itemStyle: { color: blueColor },
        markPoint: {
          symbol: 'circle', symbolSize: 1,
          label: {
            show: true, position: 'top', distance: 2,
            fontSize: 10, fontFamily: CHART_FONT, color: '#9f1239',
            backgroundColor: 'rgba(255,255,255,0.9)',
            borderColor: 'rgba(207,19,34,0.5)', borderWidth: 1,
            padding: [2, 4],
            formatter: p => p.data.zh,
          },
          data: bearLabels,
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
        const pt = params.find(p => p.seriesName === 'S&P 500 price index' && Array.isArray(p.value));
        if (!pt) return '';
        const dt = pt.value[0];
        const ev = dds.find(x => x.peak_date && x.days > 0 && dt >= x.peak_date && dt <= addDays(x.peak_date, x.days)
          && (x.decline ?? 0) <= -0.10);
        let extra = '';
        if (ev) {
          const kind = ev.decline <= -0.20 ? 'Bear' : 'Correction';
          extra = `<br/>${kind}: −${Math.abs(Math.round(ev.decline * 100))}% (${ev.days} days)`;
        }
        return `${dt}<br/>S&P 500: <b>${formatNumber(pt.value[1], 2)}</b>${extra}`;
      },
    },
    dataZoom: getDataZoomSafe(grayColor),
  });
  chartHis._refreshTheme = () => {};

  function getDataZoomSafe(gc) {
    return {
      type: 'slider',
      bottom: 16,
      height: 18,
      borderColor: gc,
      fillerColor: 'rgba(37,99,235,0.08)',
      handleStyle: { color: '#2563eb' },
      textStyle: { fontSize: 10, color: gc, fontFamily: CHART_FONT },
    };
  }

  renderMetricStrip('ddSuiteSummary', [
    buildMetricCard('Average bear', `${avgDays} days / ${(avgDec * 100).toFixed(1)}%`, `${bears.length} bears since 1928 (close-to-close); original bb01/bb02 average = 340 days / −36.8% (23-bear caliber)`),
    buildMetricCard('Longest bear', `${longest.days} days`, `From ${fmtMDY(longest.peak_date)} · −${Math.abs(Math.round(longest.decline * 100))}%`),
    buildMetricCard('Deepest bear', `${(deepest.decline * 100).toFixed(1)}%`, `From ${fmtMDY(deepest.peak_date)} · ${deepest.days} days`),
    buildMetricCard('Events', `${dds.length} total`, `${bears.length} bears ≥20%, ${corrections.length} corrections 10–20% (rest are 5–10% moves)`),
    buildMetricCard('Caliber', 'Peak→trough, close-to-close', '1930s consecutive declines merged here (19 ≠ original 23); anchors 2000 = 929d/−49.1%, 2007 = 517d/−56.8% match'),
  ]);
}
