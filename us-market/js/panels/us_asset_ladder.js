// panels/us_asset_ladder.js · 衰退期金融资产累计涨幅（1995-01=1 对数月表）
// 六条腿：美国二手房房价 / 标普500 / 纳指100 / 黄金 / 10Y 美债零息价格近似 / 名义 GDP
// 灰带 = NBER 衰退区间；口径与对拍见 data/us_asset_ladder.json 的 caliber 字段。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261031224854';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  buildRecessionOverlaySeries,
} from '../chart-helpers.js?v=20261031224854';

const LEGS = [
  { key: 'housing', name: '美国二手房房价', color: '#0f766e' },
  { key: 'sp500',    name: '标普500',      color: '#2563eb' },
  { key: 'ndx',      name: '纳指100',      color: '#db2777' },
  { key: 'gold',     name: '黄金',          color: '#faad14' },
  { key: 't10y',     name: '10Y 美债零息价', color: '#7c3aed' },
  { key: 'gdp',      name: '名义 GDP',      color: '#f97316' },
];

export function initUsAssetLadderPanel(assetData, recessionData) {
  const dom = document.getElementById('chartUsAssetLadder');
  if (!dom || !assetData?.series?.length) return;

  const S = assetData.series;
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  // 六条腿：月表同构，逐行取对应键
  const legData = LEGS.map(leg => ({
    ...leg,
    data: S.map(p => [p.date, p[leg.key] ?? null]),
  }));

  // 衰退灰带（复用第一条腿的横坐标）
  const recessionSeries = buildRecessionOverlaySeries(legData[0].data, recessionData);

  function getOption() {
    return {
      animation: false,
      grid: { left: 72, right: 56, top: 46, bottom: 60 },
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
          ...LEGS.map(l => ({ name: l.name, itemStyle: { color: l.color } })),
          { name: '衰退区间', itemStyle: { color: 'rgba(153,153,153,0.35)' } },
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
        max: 100,
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
        ...legData.map((leg, i) => ({
          name: leg.name,
          type: 'line',
          data: leg.data,
          showSymbol: false,
          lineStyle: { width: i === 0 ? 2.4 : 1.8, color: leg.color },
          itemStyle: { color: leg.color },
          z: 10 - i,
        })),
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          const rows = params
            .filter(p => p.seriesName !== '衰退区间' && p.value && Array.isArray(p.value) && p.value[1] != null)
            .map(p => {
              const gain = (p.value[1] - 1) * 100;
              const sign = gain >= 0 ? '+' : '';
              return `${p.marker}${p.seriesName}: <b>${sign}${formatNumber(gain, 1)}%</b>`;
            });
          if (!rows.length) return '';
          return `${params[0].axisValueLabel}<br/>${rows.join('<br/>')}`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const latest = assetData.latest || {};
  const cards = LEGS.map(leg => {
    const info = latest[leg.key];
    if (!info) return buildMetricCard(leg.name, '--', '暂无数据');
    const sign = info.gain_pct >= 0 ? '+' : '';
    return buildMetricCard(
      leg.name,
      `${sign}${formatNumber(info.gain_pct, 1)}%`,
      `1995-01 = 1 · ${info.date || '--'}`
    );
  });
  renderMetricStrip('usAssetLadderSummary', cards);
}
