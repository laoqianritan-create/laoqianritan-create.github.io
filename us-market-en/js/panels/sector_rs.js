// panels/sector_rs.js · S&P 500 Sub-industries / S&P 500 Relative Strength (11 GICS sectors ÷ index, RS index)
// Data: site sp500_sector_rs.json (11 SPDR ETFs vs SPY, cumulative total-return ratio ×100, weekly) + sp500_sectors.json (palette).
// Caliber: relative strength = sector cumulative ÷ SPY cumulative × 100, June 2018 base ≈100; 100 = in line with the index.
// Interaction (user feedback round 2, 2026-10-09): custom legend — a square per sector with a ✓ when checked (curve shown
// normally); unchecked sectors stay visible but fully translucent (legend item also translucent); multiple can be checked;
// initially only Information Technology has a ✓ and is fully shown, everything else translucent.

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261010100336';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261010100336';

const ON_OPACITY = 1;
const OFF_OPACITY = 0.3;

export function initSectorRsPanel(rsData, sectorsData) {
  const dom = document.getElementById('chartSectorRS');
  const series = rsData?.series;
  if (!dom || !series?.length) return;

  const colorMap = new Map((sectorsData?.sectors || []).map(s => [s.name, s.color]));
  const grayColor = cssVar('--gray') || '#999';
  const gridColor = cssVar('--chart-grid') || '#f0f0f0';
  const textColor = cssVar('--text') || '#1a1a1a';
  const subColor = cssVar('--text-secondary') || '#666';
  const border = cssVar('--border') || '#e8e8e8';
  const sectorColor = zh => colorMap.get(zh) || '#2563eb';

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

  const checked = new Set([series[0].en || series[0].zh]);
  const opacityPatch = () => series.map(s => ({
    name: s.en || s.zh,
    lineStyle: { opacity: checked.has(s.en || s.zh) ? ON_OPACITY : OFF_OPACITY },
  }));

  function getOption() {
    return {
      animation: false,
      grid: { left: 64, right: 30, top: 36, bottom: 64 },
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
          lineStyle: { width: 2, color: sectorColor(s.zh), opacity: checked.has(s.en || s.zh) ? ON_OPACITY : OFF_OPACITY },
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
        borderColor: border,
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

  function renderLegend() {
    let box = document.getElementById('sectorRsLegend');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sectorRsLegend';
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 10px;margin:0 0 6px;align-items:center;';
      dom.parentNode.insertBefore(box, dom);
    }
    box.innerHTML = series.map(s => {
      const nm = s.en || s.zh;
      const on = checked.has(nm);
      const c = sectorColor(s.zh);
      return `<button type="button" data-name="${nm}" style="display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;padding:2px 4px;cursor:pointer;font-size:12px;font-family:inherit;opacity:${on ? 1 : 0.55};">
        <span style="width:13px;height:13px;box-sizing:border-box;border:1.5px solid ${c};border-radius:3px;background:${on ? c : 'transparent'};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;line-height:1;">${on ? '✓' : ''}</span>
        <span style="color:${subColor};">${nm}</span></button>`;
    }).join('');
    box.querySelectorAll('button[data-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = btn.dataset.name;
        if (checked.has(n)) checked.delete(n); else checked.add(n);
        chart.setOption({ series: opacityPatch() });
        renderLegend();
      });
    });
  }

  const chart = registerChart(echarts.init(dom));
  chart.setOption(getOption());
  chart._refreshTheme = () => { chart.setOption(getOption(), true); renderLegend(); };
  renderLegend();

  // 导出时临时补一层原生图例：DOM 勾选图例不在 canvas 里，不补的话导出图没有图例（ch.110）
  chart._exportPatch = () => {
    chart.setOption({
      legend: {
        show: true,
        type: 'plain',
        top: 2,
        left: 'center',
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 12,
        textStyle: { fontSize: 12, color: cssVar('--text-secondary') || '#666', fontFamily: CHART_FONT },
        data: series.map(s => ({ name: s.en || s.zh, itemStyle: { color: sectorColor(s.zh) } })),
      },
    });
    return () => chart.setOption({ legend: { show: false } });
  };

  renderMetricStrip('sectorRsSummary', [
    buildMetricCard('Strongest', `${top.zh} ${formatNumber(top.v, 1)}`, `Base June 2018 = 100 · as of ${top.last}`),
    buildMetricCard('Weakest', `${bottom.zh} ${formatNumber(bottom.v, 1)}`, 'Below 100 = long-run laggard'),
    buildMetricCard('Best 1Y', yoy[0] ? `${yoy[0].zh} ${formatNumber(yoy[0].chg * 100, 1)}%` : '—', 'Change in the RS index over the last 12 months'),
    buildMetricCard('Worst 1Y', yoy[yoy.length - 1] ? `${yoy[yoy.length - 1].zh} ${formatNumber(yoy[yoy.length - 1].chg * 100, 1)}%` : '—', 'Same caliber'),
    buildMetricCard('Caliber', '11 SPDR ETFs ÷ SPY', 'Total-return cumulative ratio ×100, weekly; the original uses LSEG sector indices ÷ S&P 500 from 1990'),
  ]);
}
