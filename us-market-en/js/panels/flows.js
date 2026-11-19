// ══════════════════════════════════════════════════════
// panels/flows.js · ICI Fund Flows (English mirror)
// Data:
//   data/ici_flows.json          (fetch_ici.py → fetch_ici_flows)
//   data/ici_mmf.json            (fetch_ici.py → fetch_ici_mmf)
//   data/ici_active_index.json   (fetch_ici.py → fetch_ici_active_index)
//
// Unit conventions:
//   Flows JSON values are millions USD → chart Y axis shows billions (÷ 1000)
//   MMF TNA values are millions USD    → chart Y axis shows trillions (÷ 1e6)
//   Active-Index TNA already in billions USD.
// ══════════════════════════════════════════════════════

import { cssVar, escapeHtml, formatCompactNumber, formatPercent, CHART_FONT } from '../utils.js?v=5db286216f';
import { registerChart, getDataZoom, buildMetricCard, renderMetricStrip, getLineLegendConfig } from '../chart-helpers.js?v=5a18061ed3';

const GREEN = '#389e0d';
const RED   = '#cf1322';
const BLUE  = '#2563eb';
const BLACK = '#1a1a1a';
const GRAY  = '#999';

const CAT_COLORS = {
  equity:   BLUE,
  bond:     '#d97706',
  hybrid:   '#8b5cf6',
  domestic: BLUE,
  world:    '#f59e0b',
  active:   '#dc2626',
  index:    GREEN,
  government: BLUE,
  prime:    '#f59e0b',
  taxExempt: '#8b5cf6',
};

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

// millions USD → "$X.XB" (billions)
function fmtB(millions, digits = 1) {
  if (millions == null || !Number.isFinite(millions)) return '—';
  const b = millions / 1000;
  const sign = b >= 0 ? '' : '-';
  return `${sign}$${Math.abs(b).toFixed(digits)}B`;
}
function fmtT(millions, digits = 2) {
  if (millions == null || !Number.isFinite(millions)) return '—';
  return `$${(millions / 1e6).toFixed(digits)}T`;
}

// Vertical gradient area: opaque (alpha=topAlpha) at the line edge, transparent toward the bottom
function areaGradient(color, topAlpha) {
  const h = color.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: `rgba(${r},${g},${b},${topAlpha})` },
    { offset: 1, color: 'transparent' },
  ]);
}

function shortLabel(iso, mode = 'short') {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 2) return `${parts[0].slice(2)}/${Number(parts[1])}`;
  if (parts.length === 3) return mode === 'weekly' ? `${Number(parts[1])}/${Number(parts[2])}` : `${parts[0].slice(2)}/${Number(parts[1])}`;
  return iso;
}

function wireFreqToggle(containerId, onChange) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('.btn[data-freq]').forEach(btn => {
    btn.addEventListener('click', () => {
      box.querySelectorAll('.btn[data-freq]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.freq);
    });
  });
}


// ①
export function initPanelIciRiskAppetite(data) {
  if (!data || !Array.isArray(data.monthly) || !data.monthly.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciRiskAppetite')));

  function getOption(freq) {
    const rows = freq === 'weekly' ? data.weekly : data.monthly;
    const dates = rows.map(r => r.date);
    const labels = rows.map(r => shortLabel(r.date, freq));

    const s = (key, name, color) => ({
      name, type: 'bar',
      data: rows.map(r => (r[key] == null ? null : r[key] / 1000)),  // → billions
      itemStyle: { color },
      barMaxWidth: freq === 'weekly' ? 24 : 18,
    });

    return {
      animation: false,
      grid: { left: 64, right: 32, top: 44, bottom: 56 },
      legend: getLineLegendConfig({ top: 4, right: 8 }),
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const idx = params[0].dataIndex;
          const d = dates[idx];
          let html = `<div style="font-weight:600">${d}</div>`;
          params.forEach(p => {
            const v = p.value == null ? '—' : `${p.value >= 0 ? '+' : ''}$${p.value.toFixed(1)}B`;
            html += `<div style="display:flex;justify-content:space-between;gap:16px">
              <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums;color:${p.value >= 0 ? GREEN : RED}">${v}</span>
            </div>`;
          });
          return html;
        },
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, interval: freq === 'monthly' ? 1 : 0 },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
      },
      yAxis: {
        type: 'value',
        name: '$ Billions', nameGap: 12, nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v)}` },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
      },
      series: [
        s('equity', 'Equity', CAT_COLORS.equity),
        s('bond',   'Bond',   CAT_COLORS.bond),
        s('hybrid', 'Hybrid', CAT_COLORS.hybrid),
      ],
      dataZoom: freq === 'monthly' && rows.length > 18 ? getDataZoom(GRAY) : undefined,
    };
  }

  chart.setOption(getOption('monthly'));
  wireFreqToggle('iciRiskAppetiteFreq', freq => chart.setOption(getOption(freq), true));

  const latest = data.monthly[data.monthly.length - 1];
  const prev = data.monthly[data.monthly.length - 2];
  const cards = [
    buildMetricCard('Equity', fmtB(latest.equity, 1),
      prev ? `Prev ${fmtB(prev.equity, 1)}` : ''),
    buildMetricCard('Bond', fmtB(latest.bond, 1),
      prev ? `Prev ${fmtB(prev.bond, 1)}` : ''),
    buildMetricCard('Hybrid', fmtB(latest.hybrid, 1),
      prev ? `Prev ${fmtB(prev.hybrid, 1)}` : ''),
    buildMetricCard('As of', latest.date, 'monthly'),
  ];
  renderMetricStrip('iciRiskAppetiteSummary', cards);
}


// ②
export function initPanelIciDomesticWorld(data) {
  if (!data || !Array.isArray(data.monthly) || !data.monthly.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciDomesticWorld')));

  function getOption(freq) {
    const rows = Array.isArray(data[freq]) ? data[freq] : [];
    const dates = rows.map(r => r.date);
    const labels = rows.map(r => shortLabel(r.date, freq));

    const diffCum = [];
    let acc = 0;
    for (const r of rows) {
      const dd = (r.equity_domestic || 0) - (r.equity_world || 0);
      acc += dd;
      diffCum.push(acc / 1000);
    }

    return {
      animation: false,
      grid: { left: 64, right: 72, top: 44, bottom: 56 },
      legend: getLineLegendConfig({ top: 4, right: 8 }),
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const idx = params[0].dataIndex;
          const d = dates[idx];
          let html = `<div style="font-weight:600">${freq === 'weekly' ? 'Week ended ' : 'Month ended '}${d}</div>`;
          params.forEach(p => {
            const v = p.value == null ? '—' : `${p.value >= 0 ? '+' : ''}$${p.value.toFixed(3)}B`;
            const color = (p.seriesName === 'Cumulative (Dom - World)') ? BLACK : (p.value >= 0 ? GREEN : RED);
            html += `<div style="display:flex;justify-content:space-between;gap:16px">
              <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums;color:${color}">${v}</span>
            </div>`;
          });
          return html;
        },
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, interval: freq === 'monthly' ? 1 : 0 },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
      },
      yAxis: [
        {
          type: 'value', name: 'Flows ($B)', nameGap: 12,
          nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
          axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v)}` },
          splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
        },
        {
          type: 'value', position: 'right', name: 'Cum. Diff ($B)', nameGap: 12,
          nameTextStyle: { color: BLACK, fontFamily: CHART_FONT, fontSize: 11 },
          axisLabel: { fontSize: 11, color: BLACK, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v)}` },
          splitLine: { show: false },
        },
      ],
      series: [
        { name: 'Domestic', type: 'bar', yAxisIndex: 0,
          data: rows.map(r => r.equity_domestic == null ? null : r.equity_domestic / 1000),
          itemStyle: { color: CAT_COLORS.domestic }, barMaxWidth: 20 },
        { name: 'World', type: 'bar', yAxisIndex: 0,
          data: rows.map(r => r.equity_world == null ? null : r.equity_world / 1000),
          itemStyle: { color: CAT_COLORS.world }, barMaxWidth: 20 },
        { name: 'Cumulative (Dom - World)', type: 'line', yAxisIndex: 1, smooth: false,
          data: diffCum, showSymbol: false,
          lineStyle: { color: BLACK, width: 2 }, itemStyle: { color: BLACK }, z: 5 },
      ],
      dataZoom: freq === 'monthly' && rows.length > 18 ? getDataZoom(GRAY) : undefined,
    };
  }

  function renderFrequency(freq) {
    const rows = Array.isArray(data[freq]) ? data[freq] : [];
    chart.setOption(getOption(freq), true);
    if (!rows.length) {
      renderMetricStrip('iciDomesticWorldSummary', [buildMetricCard('No data', '—', freq)]);
      return;
    }
    const latest = rows[rows.length - 1];
    const cumDom = rows.reduce((a, r) => a + r.equity_domestic, 0);
    const cumWorld = rows.reduce((a, r) => a + r.equity_world, 0);
    const period = freq === 'weekly' ? 'wk' : 'mo';
    const endpoint = `${freq === 'weekly' ? 'Week ended' : 'Month ended'} ${latest.date}`;
    const window = `Since ${rows[0].date} · ${rows.length} ${period}`;
    renderMetricStrip('iciDomesticWorldSummary', [
      buildMetricCard('Domestic', fmtB(latest.equity_domestic, 3), endpoint),
      buildMetricCard('World (global/international)', fmtB(latest.equity_world, 3), endpoint),
      buildMetricCard(`Dom. cum. (${rows.length} ${period})`, fmtB(cumDom, 3), window),
      buildMetricCard(`World cum. (${rows.length} ${period})`, fmtB(cumWorld, 3), window),
    ]);
  }
  renderFrequency('monthly');
  wireFreqToggle('iciDomesticWorldFreq', renderFrequency);
}


// ③
export function initPanelIciMmf(data) {
  if (!data || !Array.isArray(data.weekly) || !data.weekly.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciMmf')));

  const rows = data.weekly;
  const dates = rows.map(r => r.date);

  const series = [
    { key: 'government', name: 'Government', color: CAT_COLORS.government },
    { key: 'prime',      name: 'Prime',      color: CAT_COLORS.prime },
    { key: 'tax_exempt', name: 'Tax-Exempt', color: CAT_COLORS.taxExempt },
  ].map(cfg => ({
    name: cfg.name,
    type: 'line', stack: 'total', smooth: true, showSymbol: false,
    areaStyle: { color: areaGradient(cfg.color, 0.7) },
    lineStyle: { width: 0.5, color: cfg.color },
    itemStyle: { color: cfg.color },
    data: rows.map(r => r[cfg.key] == null ? null : r[cfg.key] / 1e6),
  }));

  chart.setOption({
    animation: false,
    grid: { left: 64, right: 40, top: 44, bottom: 56 },
    legend: getLineLegendConfig({ top: 4, right: 8 }),
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      formatter: (params) => {
        const idx = params[0].dataIndex;
        const d = dates[idx];
        const row = rows[idx];
        let html = `<div style="font-weight:600">${d}</div>`;
        const total = row.total;
        html += `<div style="display:flex;justify-content:space-between;gap:16px;font-weight:600">
          <span>Total TNA</span><span style="font-variant-numeric:tabular-nums">${fmtT(total, 2)}</span>
        </div>`;
        params.forEach(p => {
          if (p.value == null) return;
          html += `<div style="display:flex;justify-content:space-between;gap:16px">
            <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">$${p.value.toFixed(2)}T</span>
          </div>`;
        });
        return html;
      },
    },
    xAxis: {
      type: 'category', data: dates.map(d => shortLabel(d, 'weekly')),
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, hideOverlap: true },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
    },
    yAxis: {
      type: 'value', name: '$ Trillions', nameGap: 12,
      nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT },
      splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
    },
    series,
  });

  const latest = rows[rows.length - 1];
  const earliest = rows[0];
  const totalNow = latest.total;
  const totalStart = earliest.total;
  const chg = totalNow - totalStart;
  const chgPct = totalStart > 0 ? (chg / totalStart * 100) : 0;

  const cards = [
    buildMetricCard('Total TNA', fmtT(totalNow, 2), `As of ${latest.date}`),
    buildMetricCard('Government', fmtT(latest.government, 2),
      `${(latest.government / totalNow * 100).toFixed(1)}% share`),
    buildMetricCard('Prime', fmtT(latest.prime, 2),
      `${(latest.prime / totalNow * 100).toFixed(1)}% share`),
    buildMetricCard(`${rows.length}-week change`, `${chg >= 0 ? '+' : ''}${fmtT(chg, 2)}`,
      `${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(1)}%`),
  ];
  renderMetricStrip('iciMmfSummary', cards);
}


// ④
export function initPanelIciActiveIndex(data) {
  if (!data || !Array.isArray(data.months) || !data.months.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciActiveIndex')));

  const months = data.months;
  const labels = months.map(m => shortLabel(m.month));

  const activeFlow = months.map(m => {
    const v = m.flows_millions?.Total?.active;
    return v == null ? null : v / 1000;
  });
  const indexFlow = months.map(m => {
    const v = m.flows_millions?.Total?.index;
    return v == null ? null : v / 1000;
  });

  let a = 0, i = 0;
  const activeCum = activeFlow.map(v => { if (v != null) a += v; return a; });
  const indexCum = indexFlow.map(v => { if (v != null) i += v; return i; });

  chart.setOption({
    animation: false,
    grid: { left: 60, right: 78, top: 44, bottom: 76 },
    legend: getLineLegendConfig({ top: 4, right: 8 }),
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = params[0].dataIndex;
        const m = months[idx];
        let html = `<div style="font-weight:600">${m.month}</div>`;
        params.forEach(p => {
          if (p.value == null) return;
          html += `<div style="display:flex;justify-content:space-between;gap:16px">
            <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums;color:${p.value >= 0 ? GREEN : RED}">${p.value >= 0 ? '+' : ''}$${p.value.toFixed(1)}B</span>
          </div>`;
        });
        return html;
      },
    },
    xAxis: {
      type: 'category', data: labels,
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, interval: months.length > 24 ? 5 : 0 },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
    },
    yAxis: [
      {
        type: 'value', name: 'Monthly flow ($B)', nameGap: 12,
        nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}` },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
      },
      {
        type: 'value', position: 'right', name: 'Cumulative ($B)', nameGap: 12,
        nameTextStyle: { color: BLACK, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: BLACK, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}` },
        splitLine: { show: false },
      },
    ],
    series: [
      { name: 'Active', type: 'bar', yAxisIndex: 0,
        data: activeFlow, itemStyle: { color: CAT_COLORS.active }, barMaxWidth: 12 },
      { name: 'Index', type: 'bar', yAxisIndex: 0,
        data: indexFlow, itemStyle: { color: CAT_COLORS.index }, barMaxWidth: 12 },
      { name: 'Active cum.', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: activeCum, lineStyle: { color: CAT_COLORS.active, width: 2 }, itemStyle: { color: CAT_COLORS.active } },
      { name: 'Index cum.', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: indexCum, lineStyle: { color: CAT_COLORS.index, width: 2 }, itemStyle: { color: CAT_COLORS.index } },
    ],
    dataZoom: months.length > 24 ? getDataZoom(GRAY) : undefined,
  });

  const latest = months[months.length - 1];
  const latestFlow = latest.flows_millions?.Total || {};
  const tna = latest.tna_billions?.Total || {};
  const cards = [
    buildMetricCard('Active · latest month', fmtB(latestFlow.active, 1), `${latest.month}`),
    buildMetricCard('Index · latest month', fmtB(latestFlow.index, 1), `${latest.month}`),
    buildMetricCard('Active TNA', tna.active != null ? `$${(tna.active / 1000).toFixed(2)}T` : '—', `${(100 - (tna.index_pct || 0)).toFixed(1)}% share`),
    buildMetricCard('Index TNA', tna.index != null ? `$${(tna.index / 1000).toFixed(2)}T` : '—', `${(tna.index_pct || 0).toFixed(1)}% share`),
  ];
  renderMetricStrip('iciActiveIndexSummary', cards);
}


// ⑤
export function initPanelIciPassivization(data) {
  if (!data || !Array.isArray(data.months) || !data.months.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciPassivization')));

  const monthsWithTna = data.months.filter(m => m.tna_billions);
  const labels = monthsWithTna.map(m => shortLabel(m.month));

  const CATS = [
    { key: 'Domestic equity', name: 'Domestic', color: BLUE },
    { key: 'World equity',    name: 'World',    color: '#f59e0b' },
    { key: 'Bond',            name: 'Bond',     color: '#d97706' },
    { key: 'Hybrid',          name: 'Hybrid',   color: '#8b5cf6' },
    { key: 'Total',           name: 'Total',    color: BLACK },
  ];

  const series = CATS.map((cat, i) => ({
    name: cat.name, type: 'line', smooth: true,
    symbol: 'circle', symbolSize: monthsWithTna.length <= 3 ? 8 : (monthsWithTna.length > 40 ? 0 : 4),
    data: monthsWithTna.map(m => m.tna_billions[cat.key]?.index_pct ?? null),
    lineStyle: { color: cat.color, width: cat.key === 'Total' ? 2.5 : 1.8 },
    itemStyle: { color: cat.color },
    z: cat.key === 'Total' ? 6 : 4,
    markLine: i === 0 ? {
      symbol: 'none', silent: true,
      lineStyle: { color: GRAY, type: 'dashed', width: 0.8, opacity: 0.55 },
      label: { position: 'insideEndTop', color: GRAY, fontSize: 10, fontFamily: CHART_FONT },
      data: [{ yAxis: 50 }, { yAxis: 60 }, { yAxis: 70 }],
    } : undefined,
  }));

  chart.setOption({
    animation: false,
    grid: { left: 60, right: 40, top: 44, bottom: monthsWithTna.length > 24 ? 76 : 56 },
    legend: getLineLegendConfig({ top: 4, right: 8 }),
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const idx = params[0].dataIndex;
        const m = monthsWithTna[idx];
        let html = `<div style="font-weight:600">${m.month}</div>`;
        params.forEach(p => {
          if (p.value == null) return;
          html += `<div style="display:flex;justify-content:space-between;gap:16px">
            <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${p.value.toFixed(1)}%</span>
          </div>`;
        });
        return html;
      },
    },
    xAxis: {
      type: 'category', data: labels,
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, interval: monthsWithTna.length > 24 ? 11 : 0 },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
    },
    yAxis: {
      type: 'value', name: 'Index share %', nameGap: 12,
      nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
      min: 0, max: 80,
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: '{value}%' },
      splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
    },
    series,
    dataZoom: monthsWithTna.length > 24 ? getDataZoom(GRAY) : undefined,
  });

  const latest = monthsWithTna[monthsWithTna.length - 1] || {};
  const tna = latest.tna_billions || {};
  const cards = [
    buildMetricCard('Domestic', tna['Domestic equity']?.index_pct != null ? `${tna['Domestic equity'].index_pct.toFixed(1)}%` : '—', `Domestic equity · ${latest.month || ''}`),
    buildMetricCard('World', tna['World equity']?.index_pct != null ? `${tna['World equity'].index_pct.toFixed(1)}%` : '—', 'World equity'),
    buildMetricCard('Bond', tna['Bond']?.index_pct != null ? `${tna['Bond'].index_pct.toFixed(1)}%` : '—', 'Bond'),
    buildMetricCard('Hybrid', tna['Hybrid']?.index_pct != null ? `${tna['Hybrid'].index_pct.toFixed(1)}%` : '—', 'Hybrid'),
    buildMetricCard('Total', tna['Total']?.index_pct != null ? `${tna['Total'].index_pct.toFixed(1)}%` : '—', 'Total'),
  ];
  renderMetricStrip('iciPassivizationSummary', cards);
}


// ⑥ US Equity Ownership Structure · 100% stacked area 1945-2026
// Source: data/ownership.json (fetch_ownership.py → FRED Z.1 · 14 series)

const OWNERSHIP_GROUPS = [
  { key: 'household',   name: 'Households (Residual)', color: BLUE,    keys: ['household'] },
  { key: 'foreign',     name: 'Foreign Investors',   color: '#f59e0b', keys: ['foreign'] },
  { key: 'mutual_fund', name: 'Mutual Funds',        color: '#0891b2', keys: ['mutual_fund'] },
  { key: 'etf',         name: 'ETFs',                color: GREEN,     keys: ['etf'] },
  { key: 'pension',     name: 'Pension Funds',       color: '#8b5cf6', keys: ['private_pension', 'state_pension', 'fed_pension'] },
  { key: 'insurance',   name: 'Insurance Companies', color: '#d97706', keys: ['life_insurance', 'pc_insurance'] },
  { key: 'other',       name: 'Other (Corporates/Govt/Hedge Funds etc.)', color: '#94a3b8', keys: ['closed_end', 'broker_dealer', 'bank_mmf', 'nonfin_corp', 'other_holders'] },
];

const OWNERSHIP_MILESTONES = [
  { xAxis: '1980-01-01', label: '1980\nMMF + institutional rise' },
  { xAxis: '2000-01-01', label: '2000\nETF era begins' },
  { xAxis: '2010-01-01', label: '2010\nForeign > 15%' },
  { xAxis: '2020-01-01', label: '2020\nPandemic liquidity' },
];

function ownershipQuarterLabel(q, isoDate) {
  if (q && /^\d{4}Q[1-4]$/.test(q)) return `${q.slice(0, 4)} ${q.slice(4)}`;
  const m = /^(\d{4})-(\d{2})/.exec(isoDate || '');
  return m ? `${m[1]} Q${Math.floor((Number(m[2]) - 1) / 3) + 1}` : (isoDate || '');
}

export function initPanelOwnership(data) {
  if (!data || !Array.isArray(data.ownership_pct) || !data.ownership_pct.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartOwnership')));
  const rows = data.ownership_pct;

  const groupedData = rows.map(r => {
    const merged = { date: r.date };
    OWNERSHIP_GROUPS.forEach(g => {
      merged[g.key] = g.keys.reduce((acc, k) => acc + (r[k] || 0), 0);
    });
    return merged;
  });

  const series = OWNERSHIP_GROUPS.map((g, i) => ({
    name: g.name,
    type: 'line', stack: 'total', smooth: true, showSymbol: false,
    areaStyle: { color: g.color, opacity: 0.85 },
    lineStyle: { width: 0.3, color: g.color },
    itemStyle: { color: g.color },
    data: groupedData.map(r => [r.date, r[g.key]]),
    z: OWNERSHIP_GROUPS.length - i,
    markLine: i === 0 ? {
      symbol: 'none', silent: true,
      lineStyle: { color: BLACK, type: 'dashed', width: 0.8, opacity: 0.35 },
      label: { formatter: (p) => p.data.label, color: BLACK, fontSize: 10, fontFamily: CHART_FONT, position: 'insideEndTop', distance: 6 },
      data: OWNERSHIP_MILESTONES,
    } : undefined,
  }));

  chart.setOption({
    animation: false,
    // 2026-11-19 视觉修正：图例单行 scroll（中英/手机都不换行），grid 顶部留出 y 轴标题位，
    // y 轴标题左对齐到轴线，避免居中时左侧被容器裁掉。
    grid: { left: 50, right: 30, top: 64, bottom: 66 },
    legend: getLineLegendConfig({ type: 'scroll', top: 4, left: 8, right: 8 }),
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      formatter: (params) => {
        if (!params.length) return '';
        const d = params[0].axisValueLabel || params[0].axisValue;
        let html = `<div style="font-weight:600">${d}</div>`;
        params.forEach(p => {
          html += `<div style="display:flex;justify-content:space-between;gap:16px">
            <span>${p.marker} ${p.seriesName}</span>
            <span style="font-variant-numeric:tabular-nums">${(p.value[1] ?? p.value).toFixed(1)}%</span>
          </div>`;
        });
        return html;
      },
    },
    xAxis: {
      type: 'time',
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: '% of US-Issued Equity', nameGap: 14,
      nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11, align: 'left' },
      min: 0, max: 100,
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: '{value}%' },
      splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
    },
    series,
    dataZoom: [{
      type: 'slider', height: 24, bottom: 8,
      borderColor: 'transparent',
      backgroundColor: cssVar('--bg-section') || '#fafafa',
      fillerColor: cssVar('--accent-light') || 'rgba(71,88,224,0.08)',
      handleStyle: { color: cssVar('--accent') || '#4758e0' },
      textStyle: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT },
    }],
  });

  const latest = groupedData[groupedData.length - 1];
  const first = groupedData[0];
  const totalLatest = data.total_liability[data.total_liability.length - 1];
  const totalT = totalLatest.value_millions / 1e6;
  const fund_total = (latest.mutual_fund || 0) + (latest.etf || 0);
  const quarter = ownershipQuarterLabel(data.latest_quarter, latest.date);

  const cards = [
    buildMetricCard('US-Issued Equity', `$${totalT.toFixed(1)}T`, `Fed Z.1 · ${quarter}`),
    buildMetricCard('Households (Residual)', `${latest.household.toFixed(1)}%`, `${first.household.toFixed(1)}% in 1945 Q4`),
    buildMetricCard('Foreign', `${latest.foreign.toFixed(1)}%`, `<5% in 1970`),
    buildMetricCard('Mutual Funds + ETFs', `${fund_total.toFixed(1)}%`, `MF ${latest.mutual_fund.toFixed(1)}% + ETF ${latest.etf.toFixed(1)}%`),
  ];
  const asOf = document.getElementById('ownershipAsOf');
  if (asOf) {
    const parts = [`Data through ${quarter}${data.quarter_end ? ` (quarter end ${data.quarter_end})` : ''}`];
    if (data.source_release_date) parts.push(`Fed release ${data.source_release_date}`);
    if (data.next_release_date) parts.push(`next release expected ${data.next_release_date}`);
    asOf.textContent = parts.join(' · ');
  }
  renderMetricStrip('ownershipSummary', cards);
}
