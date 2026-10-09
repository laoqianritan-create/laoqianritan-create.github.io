// panels/geo_recessions.js · 标普500与地缘政治危机·衰退视角（Yardeni geo_fig3 形式）
// 数据：站内 sp500_century.json（月频价格指数 1927-12 起）+ us_recessions.json（FRED USREC 衰退带）。
// 事件 13 条与标注高度取自规格书 01 §4.6（OCR 逐字 + 归一化坐标）；本版原图框内不带日期、以红色竖线定位。
// 口径差：本图自 1927-12 起、月末价（原图 1921 起、月均值），CAGR 也随之不同，已写进行内说明。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009142337';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261009142337';

// 规格书 01 §4.6：13 条事件（红竖线 + 无日期文本框）；日期取同名事件的 geo_fig2 清单/史实
const EVENTS = [
  { d: '1930-06-17', zh: '斯姆特-霍利关税', y: 0.40 },
  { d: '1939-09-01', zh: '德国入侵波兰', y: 0.45 },
  { d: '1941-12-07', zh: '珍珠港', y: 0.30 },
  { d: '1950-06-25', zh: '朝鲜战争爆发', y: 0.18 },
  { d: '1956-10-29', zh: '苏伊士运河危机', y: 0.45 },
  { d: '1962-10-16', zh: '古巴导弹危机', y: 0.33 },
  { d: '1967-06-05', zh: '六日战争', y: 0.52 },
  { d: '1973-10-06', zh: '赎罪日战争', y: 0.37 },
  { d: '1979-01-16', zh: '伊朗革命', y: 0.57 },
  { d: '1990-08-02', zh: '伊拉克入侵科威特', y: 0.50 },
  { d: '2001-09-11', zh: '9·11 恐袭', y: 0.84 },
  { d: '2022-02-22', zh: '俄罗斯入侵乌克兰', y: 0.79 },
  { d: '2023-10-07', zh: '哈马斯袭击以色列', y: 0.64 },
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

  // 图例内嵌 CAGR（原图 geo_fig3 亦然）：价格指数首尾年化
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
          { name: `标普500* (${cagrTxt})`, itemStyle: { color: blueColor } },
          { name: '衰退', itemStyle: { color: 'rgba(150,150,150,0.5)' } },
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
          name: '衰退',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(150,150,150,0.5)' },
          tooltip: { show: false },
          markArea: { silent: true, itemStyle: { color: 'rgba(150,150,150,0.18)' }, data: recBands },
          z: 0,
        },
        {
          name: `标普500* (${cagrTxt})`,
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
          return `${pt.value[0]}<br/>标普500: <b>${formatNumber(pt.value[1], 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderMetricStrip('geoRecessionsSummary', [
    buildMetricCard('事件标注', `${EVENTS.length} 条`, '红竖线＋文本框，框内不带日期（按原图）；日期在悬停与本卡可查'),
    buildMetricCard('衰退阴影', `${recBands.length} 段`, 'FRED USREC 衰退区间（站内 us_recessions）'),
    buildMetricCard('长期年化', `${(cagr * 100).toFixed(2)}%`, `${f.date.slice(0, 7)} → ${l.date.slice(0, 7)} 价格指数；原图 Jan1921–Apr2026 为 6.72%`),
    buildMetricCard('最新点位', formatNumber(l.value, 2), `月频至 ${l.date}`),
    buildMetricCard('口径差', '原图 1921 起、月均值', '本图 1927-12 起、月末价（免费口径）；轴 10–10000'),
  ]);
}
