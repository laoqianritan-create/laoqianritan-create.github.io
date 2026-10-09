// panels/geo_crises.js · 标普500与地缘政治危机·熊市视角（Yardeni geo_fig2 形式）
// 数据：站内 sp500_price.json（日频价格指数）+ sp500_drawdowns.json（熊市带）。
// 事件清单与标注高度取自规格书 01（OCR 逐字 + 归一化坐标），标注框用 markPoint 手工定位。
// 口径差：本图自 1927-12 起（原图 1921 起、1964 前月频），已写进行内说明。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009142337';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009142337';

// 规格书 01 §3.6：15 条事件（name, date, yNorm=标签在绘图区的归一化高度 0=底 1=顶）
const EVENTS = [
  { d: '1930-06-17', zh: '斯姆特-霍利关税', y: 0.40 },
  { d: '1939-09-01', zh: '德国入侵波兰', y: 0.53 },
  { d: '1941-12-07', zh: '珍珠港', y: 0.35 },
  { d: '1950-06-25', zh: '朝鲜战争爆发', y: 0.42 },
  { d: '1956-10-29', zh: '苏伊士运河危机', y: 0.56 },
  { d: '1962-10-16', zh: '古巴导弹危机', y: 0.71 },
  { d: '1967-06-05', zh: '六日战争', y: 0.55 },
  { d: '1973-10-06', zh: '赎罪日战争', y: 0.29 },
  { d: '1979-01-16', zh: '伊朗革命', y: 0.57 },
  { d: '1990-08-02', zh: '伊拉克入侵科威特', y: 0.72 },
  { d: '1991-01-17', zh: '海湾战争一', y: 0.48 },
  { d: '2001-09-11', zh: '9·11 恐袭', y: 0.84 },
  { d: '2003-03-20', zh: '海湾战争二', y: 0.60 },
  { d: '2022-02-22', zh: '俄罗斯入侵乌克兰', y: 0.66 },
  { d: '2026-02-28', zh: '海湾战争三', y: 0.76 },
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
          { name: '标普500 价格指数*', itemStyle: { color: blueColor } },
          { name: '熊市区间', itemStyle: { color: 'rgba(244,114,182,0.55)' } },
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
          name: '熊市区间',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(244,114,182,0.55)' },
          tooltip: { show: false },
          markArea: { silent: true, itemStyle: { color: pinkColor }, data: bearBands },
          z: 0,
        },
        {
          name: '标普500 价格指数*',
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
          const pt = params.find(p => p.seriesName === '标普500 价格指数*' && Array.isArray(p.value));
          if (!pt) return '';
          return `${pt.value[0]}<br/>标普500: <b>${formatNumber(pt.value[1], 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('geoCrisesSummary', [
    buildMetricCard('事件标注', `${EVENTS.length} 条`, '1930 关税战 → 2026 海湾战争三，位置按原图归一化坐标复刻'),
    buildMetricCard('熊市阴影', `${bearBands.length} 段`, '站内回撤表派生（收盘对收盘 ≥20%，峰→谷）'),
    buildMetricCard('最新点位', formatNumber(last.close, 2), `数据至 ${last.date} · 对数轴 10–10000`),
    buildMetricCard('口径差', '原图 1921 起 / 1964 前月频', '本图自 1927-12 起、全程日频（免费口径），原图 1964 前为月频'),
    buildMetricCard('事件日期口径', '按史实校正 1 处', '赎罪日战争取 1973-10-06（原图 OCR 与史实冲突）'),
  ]);
}
