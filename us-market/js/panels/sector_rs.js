// panels/sector_rs.js · 子行业 / 标普500的强弱（11 个一级行业 ÷ 标普，相对强弱指数）
// 数据：站内 sp500_sector_rs.json（11 只 SPDR vs SPY，全收益累计比 ×100，周频）+ sp500_sectors.json（11 色色板）。
// 口径：相对强弱 = 行业累计 ÷ SPY 累计 × 100，2018-06 基期 ≈100（11 只 ETF 对齐起点）；100 = 与标普同步。
// 交互（2026-10-09 老钱反馈）：默认只展示一个行业（信息技术）；图例前小方块＝勾选开关（勾上显示、取消隐藏）；
// 当前勾选的行业 100% 不透明，其余已勾选的行业半透明（焦点切换＝点它的方块）。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009150347';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261009150347';

const FOCUS_OPACITY = 1;
const REST_OPACITY = 0.3;

export function initSectorRsPanel(rsData, sectorsData) {
  const dom = document.getElementById('chartSectorRS');
  const series = rsData?.series;
  if (!dom || !series?.length) return;

  const colorMap = new Map((sectorsData?.sectors || []).map(s => [s.name, s.color]));
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';

  const latestRows = series.map(s => ({
    zh: s.zh,
    v: s.points[s.points.length - 1]?.[1],
    last: s.points[s.points.length - 1]?.[0],
  })).filter(r => typeof r.v === 'number');
  const sorted = [...latestRows].sort((a, b) => b.v - a.v);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  const yoy = series.map(s => {
    const pts = s.points;
    const lastV = pts[pts.length - 1][1];
    let ref = null;
    for (const p of pts) {
      const d = (new Date(latestRows[0].last) - new Date(p[0])) / 86400000;
      if (d <= 400 && d >= 320) { ref = p[1]; break; }
    }
    return ref ? { zh: s.zh, chg: lastV / ref - 1 } : null;
  }).filter(Boolean).sort((a, b) => b.chg - a.chg);

  const sectorColor = zh => colorMap.get(zh) || '#2563eb';

  // 默认只勾选第一个行业（信息技术）；焦点＝最后勾选的行业，其余已勾选的半透明
  const defaultSelected = {};
  series.forEach((s, i) => { defaultSelected[s.zh] = i === 0; });
  let focusName = series[0].zh;

  const opacityPatch = () => series.map(s => ({
    name: s.zh,
    lineStyle: { opacity: s.zh === focusName ? FOCUS_OPACITY : REST_OPACITY },
  }));

  function getOption() {
    return {
      animation: false,
      grid: { left: 64, right: 30, top: 52, bottom: 64 },
      legend: {
        type: 'scroll',
        top: 0,
        left: 'center',
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 14,
        selected: defaultSelected,
        textStyle: { fontSize: 12, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT },
        data: series.map(s => ({ name: s.zh, itemStyle: { color: sectorColor(s.zh) } })),
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 20,
        max: 200,
        interval: 30,
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        ...series.map(s => ({
          name: s.zh,
          type: 'line',
          data: s.points,
          showSymbol: false,
          lineStyle: { width: 2, color: sectorColor(s.zh), opacity: s.zh === focusName ? FOCUS_OPACITY : REST_OPACITY },
          itemStyle: { color: sectorColor(s.zh) },
          emphasis: { focus: 'series' },
          z: 3,
        })),
        {
          name: 'Recession',
          type: 'line',
          data: [],
          itemStyle: { color: 'rgba(150,150,150,0.35)' },
          tooltip: { show: false },
          legendHoverLink: false,
          markArea: {
            silent: true,
            itemStyle: { color: 'rgba(150,150,150,0.18)' },
            data: [
              [{ xAxis: '2020-02-01' }, { xAxis: '2020-04-30' }],
            ],
          },
          z: 0,
        },
        {
          name: '同步线',
          type: 'line',
          data: [],
          tooltip: { show: false },
          legendHoverLink: false,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            label: { show: true, formatter: '100 ＝ 跑平标普', position: 'insideStartTop', fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
            data: [{ yAxis: 100 }],
          },
          z: 1,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        order: 'valueDesc',
        formatter: params => {
          const rows = params
            .filter(p => p.value && Array.isArray(p.value) && typeof p.value[1] === 'number')
            .sort((a, b) => b.value[1] - a.value[1])
            .map(p => `${p.marker}${p.seriesName}: <b>${formatNumber(p.value[1], 1)}</b>`);
          if (!rows.length) return '';
          return `${params[0].value[0]}<br/>${rows.join('<br/>')}`;
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // 勾选方块＝显示/隐藏；最后勾选的行业 100% 显示，其余已勾选的半透明
  chart.on('legendselectchanged', e => {
    const checked = series.filter(s => e.selected[s.zh]).map(s => s.zh);
    if (e.selected[e.name] && checked.includes(e.name)) {
      focusName = e.name;
    } else if (checked.length) {
      focusName = checked[0];
    }
    chart.setOption({ series: opacityPatch() });
  });

  renderMetricStrip('sectorRsSummary', [
    buildMetricCard('累计最强', `${top.zh} ${formatNumber(top.v, 1)}`, `基期 2018-06 ＝ 100 · 截至 ${top.last}`),
    buildMetricCard('累计最弱', `${bottom.zh} ${formatNumber(bottom.v, 1)}`, '＜100 ＝ 长期跑输标普'),
    buildMetricCard('近 1 年第一', yoy[0] ? `${yoy[0].zh} ${formatNumber(yoy[0].chg * 100, 1)}%` : '—', '相对强弱指数近 12 个月变化'),
    buildMetricCard('近 1 年倒数第一', yoy[yoy.length - 1] ? `${yoy[yoy.length - 1].zh} ${formatNumber(yoy[yoy.length - 1].chg * 100, 1)}%` : '—', '同口径'),
    buildMetricCard('口径', '11 只 SPDR ETF ÷ SPY', '全收益累计比 ×100、周频；原图为 LSEG 行业指数 ÷ 标普（1990 起），免费源 ETF 起点 2018'),
  ]);
}
