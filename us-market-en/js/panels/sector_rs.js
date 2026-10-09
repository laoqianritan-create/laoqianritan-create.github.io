// panels/sector_rs.js · Sub-sectors vs S&P 500 strength (11 GICS sectors ÷ index, relative-strength index)
// Data: site sp500_sector_rs.json (11 SPDR ETFs vs SPY, cumulative total-return ratio ×100, weekly) + sp500_sectors.json (palette).
// Caliber: relative strength = sector cumulative ÷ SPY cumulative × 100, June 2018 base ≈100; 100 = in line with the index.
// Interaction (user feedback 2026-10-09): default shows one sector (Information Technology); the legend square toggles
// visibility (check = show, uncheck = hide); the last checked sector is fully opaque, other checked ones are translucent.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009145221';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261009145221';

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
    zh: s.en || s.zh,
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
    return ref ? { zh: s.en || s.zh, chg: lastV / ref - 1 } : null;
  }).filter(Boolean).sort((a, b) => b.chg - a.chg);

  const sectorColor = zh => colorMap.get(zh) || '#2563eb';

  const defaultSelected = {};
  series.forEach((s, i) => { defaultSelected[s.en || s.zh] = i === 0; });
  let focusName = series[0].en || series[0].zh;

  const opacityPatch = () => series.map(s => ({
    name: s.en || s.zh,
    lineStyle: { opacity: (s.en || s.zh) === focusName ? FOCUS_OPACITY : REST_OPACITY },
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
        data: series.map(s => ({ name: s.en || s.zh, itemStyle: { color: sectorColor(s.zh) } })),
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
          name: s.en || s.zh,
          type: 'line',
          data: s.points,
          showSymbol: false,
          lineStyle: { width: 2, color: sectorColor(s.zh), opacity: (s.en || s.zh) === focusName ? FOCUS_OPACITY : REST_OPACITY },
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
          name: 'In line',
          type: 'line',
          data: [],
          tooltip: { show: false },
          legendHoverLink: false,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: grayColor, type: 'dashed', width: 1 },
            label: { show: true, formatter: '100 = in line', position: 'insideStartTop', fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
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

  chart.on('legendselectchanged', e => {
    const checked = series.filter(s => e.selected[s.en || s.zh]).map(s => s.en || s.zh);
    if (e.selected[e.name] && checked.includes(e.name)) {
      focusName = e.name;
    } else if (checked.length) {
      focusName = checked[0];
    }
    chart.setOption({ series: opacityPatch() });
  });

  renderMetricStrip('sectorRsSummary', [
    buildMetricCard('Strongest', `${top.zh} ${formatNumber(top.v, 1)}`, `Base June 2018 = 100 · as of ${top.last}`),
    buildMetricCard('Weakest', `${bottom.zh} ${formatNumber(bottom.v, 1)}`, 'Below 100 = long-run laggard'),
    buildMetricCard('Best 1Y', yoy[0] ? `${yoy[0].zh} ${formatNumber(yoy[0].chg * 100, 1)}%` : '—', 'Change in the RS index over the last 12 months'),
    buildMetricCard('Worst 1Y', yoy[yoy.length - 1] ? `${yoy[yoy.length - 1].zh} ${formatNumber(yoy[yoy.length - 1].chg * 100, 1)}%` : '—', 'Same caliber'),
    buildMetricCard('Caliber', '11 SPDR ETFs ÷ SPY', 'Total-return cumulative ratio ×100, weekly; the original uses LSEG sector indices ÷ S&P 500 from 1990'),
  ]);
}
