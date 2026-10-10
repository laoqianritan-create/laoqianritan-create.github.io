// panels/geo_crises.js · 地缘政治危机（熊市视角 + 衰退视角合并，图例勾选维度）
// 数据：sp500_price.json（日频价格）+ sp500_drawdowns.json（熊市带）+ sp500_century.json（月频价格，衰退视角线）
//       + us_recessions.json（FRED USREC 衰退带）。
// 合并说明（2026-10-09 老钱反馈）：原 geo_fig2 / geo_fig3 两图并为一张，图例勾选展示维度——
//   熊市带(19段)＋事件标注(15条) 默认开；衰退带(15段) 默认关。事件口径已合并（2026-10-09 老钱二轮反馈）：
//   以熊市版 15 条事件为准（位置用熊市版归一化坐标），样式取衰退版——红色竖线＋红框文本框、框内不带日期。
// 口径：价格自 1927-12 起（原图 1921 起、1964 前月频）；CAGR 图例随月频线自算。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261010100336';
import { registerChart, buildMetricCard, renderMetricStrip, getDataZoom } from '../chart-helpers.js?v=20261010100336';

// 15 条事件（规格书 01 §3.6 熊市版口径；样式取衰退版：红竖线＋红框、框内不带日期；y＝熊市版归一化高度）
const EVENTS_BEAR = [
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

  const LEG_PRICE = '标普500 价格指数';
  const LEG_BEAR = '熊市带（≥20%）';
  const LEG_REC = '衰退带（NBER）';
  const LEG_EV = '事件标注（15）';

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
          [LEG_EV]: true,
        },
        textStyle: { fontSize: 12, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT },
        data: [
          { name: LEG_PRICE, itemStyle: { color: blueColor } },
          { name: LEG_BEAR, itemStyle: { color: 'rgba(244,114,182,0.55)' } },
          { name: LEG_REC, itemStyle: { color: 'rgba(150,150,150,0.5)' } },
          { name: LEG_EV, itemStyle: { color: '#ef4444' } },
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
          name: LEG_EV,
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
            data: EVENTS_BEAR.map(e => ({ xAxis: e.d })),
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
            data: EVENTS_BEAR.map(e => ({ name: e.zh, zh: e.zh, coord: [e.d, yFromNorm(e.y)] })),
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
          return `${pt.value[0]}<br/>标普500: <b>${formatNumber(pt.value[1], 2)}</b>`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // 月频线跟随「衰退带」维度：勾选衰退带时把月频线叠加显示（与原 geo_fig3 的月均口径一致）
  chart.on('legendselectchanged', e => {
    if (e.name !== LEG_REC) return;
    const showMonthly = !!e.selected[LEG_REC];
    const opt = chart.getOption();
    const priceSeries = opt.series.find(s => s.name === LEG_PRICE);
    if (!priceSeries) return;
    chart.setOption({
      series: [{
        name: LEG_PRICE,
        data: showMonthly ? lineMonthly : lineDaily,
        lineStyle: { width: showMonthly ? 1.4 : 1.6 },
      }],
    });
  });

  renderMetricStrip('geoCrisesSummary', [
    buildMetricCard('事件标注', `${EVENTS_BEAR.length} 条`, '合并口径：以熊市版 15 条为准、样式取衰退版（红竖线＋红框、框内不带日期）'),
    buildMetricCard('阴影带', `${bearBands.length} 熊市 / ${recBands.length} 衰退`, '粉带＝熊市（默认开）、灰带＝NBER 衰退（图例勾选，勾上时价格线切月频）'),
    buildMetricCard('最新点位', formatNumber(price[price.length - 1].close, 2), `数据至 ${price[price.length - 1].date} · 对数轴 10–10000`),
    buildMetricCard('口径差', '原图 1921 起 / 1964 前月频', '本图自 1927-12 起、全程日频（免费口径）；勾选衰退带时切为月频线'),
    buildMetricCard('事件日期', '按史实校正 1 处', '赎罪日战争取 1973-10-06（原图 OCR 与史实冲突）'),
  ]);
}
