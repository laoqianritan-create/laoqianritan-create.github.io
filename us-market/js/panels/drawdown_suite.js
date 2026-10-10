// panels/drawdown_suite.js · 回撤与牛熊专题三件套（Yardeni bb01 / bb02 / bb03–bb15 合并版）
// 数据：站内 sp500_drawdowns.json（82 段回撤，峰谷/天数/跌幅）+ sp500_price.json（日频价格指数）。
// 三图：① 熊市持续天数横条（含平均）② 熊市跌幅横条（含平均）③ 全史价格对数轴＋红熊蓝回调带＋熊市段标注。
// 口径：本站回撤＝收盘对收盘、峰→谷；19 段 ≥20% 熊市（1928 起）。Yardeni bb01 为 23 段——1930 年代连续下跌
// 被本站合并计段（如 1929-09→1932-06 一段），差异已写进行内说明。数值锚点：2000 段 929 天/−49.1%、2007 段 517 天/−56.8% 等三方互证一致。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261010094028';
import { registerChart, buildMetricCard, renderMetricStrip } from '../chart-helpers.js?v=20261010094028';

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

  // ── 图① 熊市持续天数（新→旧倒序给类目，最旧行落在最上；Average 置底）──
  const lenList = [...bears].reverse().map(b => fmtMDY(b.peak_date));
  const lenValues = [...bears].reverse().map(b => b.days);
  const lenCats2 = [...lenList, '平均'];
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
      formatter: p => `${p.name}<br/>持续: <b>${p.value}</b> 天`,
    },
  });
  chartLen._refreshTheme = () => {};

  // ── 图② 熊市跌幅（负值向左；Average 绿色置底）──
  const decList = [...bears].reverse().map(b => fmtMDY(b.peak_date));
  const decValues = [...bears].reverse().map(b => +(b.decline * 100).toFixed(1));
  const decCats = [...decList, '平均'];
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
      formatter: p => `${p.name}<br/>跌幅: <b>${p.value}%</b>`,
    },
  });
  chartDec._refreshTheme = () => {};

  // ── 图③ 全史价格 + 红熊/蓝回调带 + 熊市段标注 ──
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
        { name: '标普500 价格指数', itemStyle: { color: blueColor } },
        { name: '熊市（≥20%）', itemStyle: { color: 'rgba(207,19,34,0.45)' } },
        { name: '回调（10–20%）', itemStyle: { color: 'rgba(37,99,235,0.30)' } },
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
        name: '熊市（≥20%）', type: 'line', data: [],
        itemStyle: { color: 'rgba(207,19,34,0.45)' }, tooltip: { show: false },
        markArea: { silent: true, itemStyle: { color: 'rgba(207,19,34,0.13)' }, data: bearBands },
        z: 0,
      },
      {
        name: '回调（10–20%）', type: 'line', data: [],
        itemStyle: { color: 'rgba(37,99,235,0.30)' }, tooltip: { show: false },
        markArea: { silent: true, itemStyle: { color: 'rgba(37,99,235,0.08)' }, data: corrBands },
        z: 0,
      },
      {
        name: '标普500 价格指数', type: 'line', data: line, showSymbol: false,
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
        const pt = params.find(p => p.seriesName === '标普500 价格指数' && Array.isArray(p.value));
        if (!pt) return '';
        const dt = pt.value[0];
        const ev = dds.find(x => x.peak_date && x.days > 0 && dt >= x.peak_date && dt <= addDays(x.peak_date, x.days)
          && (x.decline ?? 0) <= -0.10);
        let extra = '';
        if (ev) {
          const kind = ev.decline <= -0.20 ? '熊市' : '回调';
          extra = `<br/>${kind}: −${Math.abs(Math.round(ev.decline * 100))}% (${ev.days} 天)`;
        }
        return `${dt}<br/>标普500: <b>${formatNumber(pt.value[1], 2)}</b>${extra}`;
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
    buildMetricCard('熊市均值', `${avgDays} 天 / ${(avgDec * 100).toFixed(1)}%`, `${bears.length} 段（1928 起，收盘对收盘）；原图 bb01/bb02 均值 340 天 / −36.8%（23 段口径）`),
    buildMetricCard('最长熊市', `${longest.days} 天`, `${fmtMDY(longest.peak_date)} 起 · −${Math.abs(Math.round(longest.decline * 100))}%`),
    buildMetricCard('最深熊市', `${(deepest.decline * 100).toFixed(1)}%`, `${fmtMDY(deepest.peak_date)} 起 · ${deepest.days} 天`),
    buildMetricCard('事件总数', `${dds.length} 段`, `其中 ≥20% 熊市 ${bears.length} 段、10–20% 回调 ${corrections.length} 段（其余为 5–10% 级）`),
    buildMetricCard('口径', '峰→谷、收盘对收盘', '1930 年代连续下跌在本站合并计段（故 19 段 ≠ 原图 23 段）；2000 段 929 天/−49.1%、2007 段 517 天/−56.8% 与原图一致'),
  ]);
}
