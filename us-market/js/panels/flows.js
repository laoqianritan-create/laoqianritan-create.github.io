// ══════════════════════════════════════════════════════
// panels/flows.js · ICI 资金流五面板
// 数据源：
//   data/ici_flows.json          (fetch_ici.py → fetch_ici_flows)
//   data/ici_mmf.json            (fetch_ici.py → fetch_ici_mmf)
//   data/ici_active_index.json   (fetch_ici.py → fetch_ici_active_index)
//
// 单位约定：
//   Flows JSON 里的数字单位是 million USD → 图内除以 100 转成 亿美元 (Y 轴)
//   MMF TNA 单位 million USD → 图内除以 10000 转成 万亿美元 (Y 轴)
//   Active-Index 的 TNA 已经是 billion USD → 用 formatCompactNumber
// ══════════════════════════════════════════════════════

import { cssVar, escapeHtml, formatCompactNumber, formatPercent, CHART_FONT } from '../utils.js';
import { registerChart, getDataZoom, buildMetricCard, renderMetricStrip, getLineLegendConfig } from '../chart-helpers.js';

// —— 项目配色（跟看板全局一致）——
const GREEN = '#389e0d';
const RED   = '#cf1322';
const BLUE  = '#2563eb';
const BLACK = '#1a1a1a';
const GRAY  = '#999';

// 类别配色（跨面板一致）
const CAT_COLORS = {
  equity:   BLUE,
  bond:     '#d97706',   // 琥珀
  hybrid:   '#8b5cf6',   // 紫
  domestic: BLUE,
  world:    '#f59e0b',   // 金橙
  active:   '#dc2626',   // 主动 = 红
  index:    GREEN,       // 指数 = 绿
  government: BLUE,
  prime:    '#f59e0b',
  taxExempt: '#8b5cf6',
};

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

// 亿美元格式化：把 million USD 数值转 "±XXX 亿"
function fmt亿(millions, digits = 0) {
  if (millions == null || !Number.isFinite(millions)) return '—';
  const yi = millions / 100;
  const sign = yi >= 0 ? '' : '-';
  return `${sign}${Math.abs(yi).toFixed(digits)} 亿`;
}
// 万亿美元格式化
function fmt万亿(millions, digits = 2) {
  if (millions == null || !Number.isFinite(millions)) return '—';
  return `${(millions / 1e6).toFixed(digits)} 万亿`;
}

// 通用日期短标签 YYYY-MM 或 YYYY-MM-DD → M/D 或 YYYY-M
function shortLabel(iso, mode = 'short') {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 2) return `${parts[0].slice(2)}/${Number(parts[1])}`;
  if (parts.length === 3) return mode === 'weekly' ? `${Number(parts[1])}/${Number(parts[2])}` : `${parts[0].slice(2)}/${Number(parts[1])}`;
  return iso;
}

// 通用切换按钮
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


// ─────────────────────────────────────────────────────────────
// ① 权益 vs 债券 vs 混合  分组柱状图
// ─────────────────────────────────────────────────────────────
export function initPanelIciRiskAppetite(data) {
  if (!data || !Array.isArray(data.monthly) || !data.monthly.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciRiskAppetite')));

  function getOption(freq) {
    const rows = freq === 'weekly' ? data.weekly : data.monthly;
    const dates = rows.map(r => r.date);
    const labels = rows.map(r => shortLabel(r.date, freq));

    const s = (key, name, color) => ({
      name, type: 'bar',
      data: rows.map(r => (r[key] == null ? null : r[key] / 100)),  // → 亿美元
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
            const v = p.value == null ? '—' : `${p.value >= 0 ? '+' : ''}${p.value.toFixed(0)} 亿`;
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
        name: '亿美元', nameGap: 12, nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v)}` },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
      },
      series: [
        s('equity', '权益', CAT_COLORS.equity),
        s('bond',   '债券', CAT_COLORS.bond),
        s('hybrid', '混合', CAT_COLORS.hybrid),
      ],
      dataZoom: freq === 'monthly' && rows.length > 18 ? getDataZoom(GRAY) : undefined,
    };
  }

  chart.setOption(getOption('monthly'));
  wireFreqToggle('iciRiskAppetiteFreq', freq => chart.setOption(getOption(freq), true));

  // 摘要：最新一期三类
  const latest = data.monthly[data.monthly.length - 1];
  const prev = data.monthly[data.monthly.length - 2];
  const cards = [
    buildMetricCard('权益', fmt亿(latest.equity, 0) + '美元',
      prev ? `上月 ${fmt亿(prev.equity, 0)}` : ''),
    buildMetricCard('债券', fmt亿(latest.bond, 0) + '美元',
      prev ? `上月 ${fmt亿(prev.bond, 0)}` : ''),
    buildMetricCard('混合', fmt亿(latest.hybrid, 0) + '美元',
      prev ? `上月 ${fmt亿(prev.hybrid, 0)}` : ''),
    buildMetricCard('数据截止', latest.date, '月度点'),
  ];
  renderMetricStrip('iciRiskAppetiteSummary', cards);
}


// ─────────────────────────────────────────────────────────────
// ② Domestic vs World Equity
// ─────────────────────────────────────────────────────────────
export function initPanelIciDomesticWorld(data) {
  if (!data || !Array.isArray(data.monthly) || !data.monthly.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciDomesticWorld')));

  function getOption(freq) {
    const rows = freq === 'weekly' ? data.weekly : data.monthly;
    const dates = rows.map(r => r.date);
    const labels = rows.map(r => shortLabel(r.date, freq));

    // 累计差值（Domestic - World，滚动累加）
    const diffCum = [];
    let acc = 0;
    for (const r of rows) {
      const dd = (r.equity_domestic || 0) - (r.equity_world || 0);
      acc += dd;
      diffCum.push(acc / 100);
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
          let html = `<div style="font-weight:600">${d}</div>`;
          params.forEach(p => {
            const v = p.value == null ? '—'
              : (p.seriesName === '累计差值 (Dom - World)'
                  ? `${p.value >= 0 ? '+' : ''}${p.value.toFixed(0)} 亿`
                  : `${p.value >= 0 ? '+' : ''}${p.value.toFixed(0)} 亿`);
            const color = (p.seriesName === '累计差值 (Dom - World)') ? BLACK : (p.value >= 0 ? GREEN : RED);
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
          type: 'value', name: '流量（亿美元）', nameGap: 12,
          nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
          axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v)}` },
          splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
        },
        {
          type: 'value', position: 'right', name: '累计差值（亿）', nameGap: 12,
          nameTextStyle: { color: BLACK, fontFamily: CHART_FONT, fontSize: 11 },
          axisLabel: { fontSize: 11, color: BLACK, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v)}` },
          splitLine: { show: false },
        },
      ],
      series: [
        { name: 'Domestic 美股', type: 'bar', yAxisIndex: 0,
          data: rows.map(r => r.equity_domestic == null ? null : r.equity_domestic / 100),
          itemStyle: { color: CAT_COLORS.domestic }, barMaxWidth: 20 },
        { name: 'World 海外', type: 'bar', yAxisIndex: 0,
          data: rows.map(r => r.equity_world == null ? null : r.equity_world / 100),
          itemStyle: { color: CAT_COLORS.world }, barMaxWidth: 20 },
        { name: '累计差值 (Dom - World)', type: 'line', yAxisIndex: 1, smooth: true,
          data: diffCum, showSymbol: false,
          lineStyle: { color: BLACK, width: 2 }, itemStyle: { color: BLACK }, z: 5 },
      ],
      dataZoom: freq === 'monthly' && rows.length > 18 ? getDataZoom(GRAY) : undefined,
    };
  }

  chart.setOption(getOption('monthly'));
  wireFreqToggle('iciDomesticWorldFreq', freq => chart.setOption(getOption(freq), true));

  const latest = data.monthly[data.monthly.length - 1];
  const cumMonths = data.monthly.length;
  const cumDom = data.monthly.reduce((a, r) => a + (r.equity_domestic || 0), 0);
  const cumWorld = data.monthly.reduce((a, r) => a + (r.equity_world || 0), 0);

  const cards = [
    buildMetricCard('本土（Domestic）', fmt亿(latest.equity_domestic, 0) + '美元', `最新月 ${latest.date}`),
    buildMetricCard('海外（World）', fmt亿(latest.equity_world, 0) + '美元', `最新月 ${latest.date}`),
    buildMetricCard(`本土累计（${cumMonths} 月）`, fmt亿(cumDom, 0) + '美元', '同区间总流量'),
    buildMetricCard(`海外累计（${cumMonths} 月）`, fmt亿(cumWorld, 0) + '美元', '同区间总流量'),
  ];
  renderMetricStrip('iciDomesticWorldSummary', cards);
}


// ─────────────────────────────────────────────────────────────
// ③ 货币基金 TNA · 长历史（FRED 季度）+ 近期（ICI 周度三类堆叠）
// ─────────────────────────────────────────────────────────────
export function initPanelIciMmf(data) {
  if (!data || !Array.isArray(data.weekly) || !data.weekly.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciMmf')));

  function optRecent() {
    const rows = data.weekly;
    const dates = rows.map(r => r.date);
    const series = [
      { key: 'government', name: 'Government', color: CAT_COLORS.government },
      { key: 'prime',      name: 'Prime',      color: CAT_COLORS.prime },
      { key: 'tax_exempt', name: 'Tax-Exempt', color: CAT_COLORS.taxExempt },
    ].map(cfg => ({
      name: cfg.name,
      type: 'line', stack: 'total', smooth: true, showSymbol: false,
      areaStyle: { color: cfg.color, opacity: 0.7 },
      lineStyle: { width: 0.5, color: cfg.color },
      itemStyle: { color: cfg.color },
      data: rows.map(r => r[cfg.key] == null ? null : r[cfg.key] / 1e6),
    }));
    return {
      animation: false,
      grid: { left: 64, right: 40, top: 44, bottom: 56 },
      legend: getLineLegendConfig({ top: 4, right: 8 }),
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (params) => {
          const idx = params[0].dataIndex;
          const d = dates[idx];
          const row = data.weekly[idx];
          let html = `<div style="font-weight:600">${d}</div>`;
          html += `<div style="display:flex;justify-content:space-between;gap:16px;font-weight:600">
            <span>总规模</span><span style="font-variant-numeric:tabular-nums">${fmt万亿(row.total, 2)}美元</span>
          </div>`;
          params.forEach(p => {
            if (p.value == null) return;
            html += `<div style="display:flex;justify-content:space-between;gap:16px">
              <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${p.value.toFixed(2)} 万亿</span>
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
        type: 'value', name: '万亿美元', nameGap: 12,
        nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
      },
      series,
    };
  }

  function optHistory() {
    const rows = data.quarterly || [];
    const dates = rows.map(r => r.date);
    const values = rows.map(r => r.total / 1e6);  // → 万亿美元
    // 关键节点标注
    const NOTES = [
      { date: '1980-04-01', label: '1980\n加息潮\nMMF 崛起' },
      { date: '2000-04-01', label: '2000\n互联网泡沫' },
      { date: '2008-10-01', label: '2008\n金融危机' },
      { date: '2020-04-01', label: '2020\n疫情放水' },
      { date: '2023-04-01', label: '2023\nSVB' },
    ];
    const markPoints = NOTES.map(n => {
      const i = dates.indexOf(n.date);
      if (i < 0) return null;
      return {
        coord: [n.date, values[i]], label: { formatter: n.label, fontSize: 10, color: GRAY, fontFamily: CHART_FONT, position: 'top', distance: 8 },
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: BLUE, borderColor: '#fff', borderWidth: 1.5 },
      };
    }).filter(Boolean);

    return {
      animation: false,
      grid: { left: 68, right: 40, top: 44, bottom: 56 },
      legend: { show: false },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (params) => {
          const p = params[0];
          return `<div style="font-weight:600">${p.axisValue}</div>
            <div>${p.marker} 货币基金总规模 <span style="font-variant-numeric:tabular-nums">${fmt万亿(p.value * 1e6, 3)}美元</span></div>`;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0', type: 'dashed' } },
      },
      yAxis: {
        type: 'value', name: '万亿美元', nameGap: 12,
        nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => v < 0.01 ? v.toFixed(3) : v.toFixed(1) },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
        min: 0,
      },
      series: [
        { name: '总规模', type: 'line', showSymbol: false, smooth: true,
          data: rows.map((r, i) => [r.date, values[i]]),
          areaStyle: { color: BLUE, opacity: 0.25 },
          lineStyle: { color: BLUE, width: 1.6 },
          itemStyle: { color: BLUE },
          markPoint: markPoints.length ? { data: markPoints } : undefined,
        },
      ],
      dataZoom: [{
        type: 'slider', height: 24, bottom: 8,
        borderColor: 'transparent',
        backgroundColor: cssVar('--bg-section') || '#fafafa',
        fillerColor: cssVar('--accent-light') || 'rgba(71,88,224,0.08)',
        handleStyle: { color: cssVar('--accent') || '#4758e0' },
        textStyle: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT },
      }],
    };
  }

  const hasHistory = Array.isArray(data.quarterly) && data.quarterly.length > 0;
  chart.setOption(hasHistory ? optHistory() : optRecent());

  // Range toggle
  const box = document.getElementById('iciMmfRange');
  if (box && hasHistory) {
    box.querySelectorAll('.btn[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        box.querySelectorAll('.btn[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chart.setOption(btn.dataset.range === 'recent' ? optRecent() : optHistory(), true);
      });
    });
  } else if (box && !hasHistory) {
    // 只有 recent 可用时隐藏切换按钮
    box.hidden = true;
  }

  // Summary strip
  const latest = data.weekly[data.weekly.length - 1];
  const totalNow = latest.total;
  const historyPeak = hasHistory
    ? data.quarterly.reduce((a, r) => r.total > a.total ? r : a, data.quarterly[0])
    : null;
  const earliest = hasHistory ? data.quarterly[0] : data.weekly[0];
  const spanYears = hasHistory
    ? (new Date(latest.date) - new Date(earliest.date)) / (365.25 * 86400000)
    : 0;

  const cards = [
    buildMetricCard('当前总规模', fmt万亿(totalNow, 2) + '美元', `截至 ${latest.date}`),
    buildMetricCard('Government', fmt万亿(latest.government, 2) + '美元',
      `占比 ${(latest.government / totalNow * 100).toFixed(1)}%`),
    buildMetricCard('Prime', fmt万亿(latest.prime, 2) + '美元',
      `占比 ${(latest.prime / totalNow * 100).toFixed(1)}%`),
    hasHistory
      ? buildMetricCard('史高', fmt万亿(historyPeak.total, 2) + '美元',
          `${historyPeak.date} · 起点 ${earliest.date}`)
      : buildMetricCard(`${data.weekly.length} 周变化`,
          `${(totalNow - earliest.total) >= 0 ? '+' : ''}${fmt万亿(totalNow - earliest.total, 2)}美元`,
          `起点 ${earliest.date}`),
  ];
  renderMetricStrip('iciMmfSummary', cards);
}


// ─────────────────────────────────────────────────────────────
// ④ Active vs Index 月度净流量 + 累计线
// ─────────────────────────────────────────────────────────────
export function initPanelIciActiveIndex(data) {
  if (!data || !Array.isArray(data.months) || !data.months.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciActiveIndex')));

  const months = data.months;
  const labels = months.map(m => shortLabel(m.month));

  // Total 类别的 flows；单位 million USD → 亿美元（除以 100，1 亿 = 100 M）
  const activeFlow = months.map(m => {
    const v = m.flows_millions?.Total?.active;
    return v == null ? null : v / 100;
  });
  const indexFlow = months.map(m => {
    const v = m.flows_millions?.Total?.index;
    return v == null ? null : v / 100;
  });

  // 累计（亿美元）
  let a = 0, i = 0;
  const activeCum = activeFlow.map(v => { if (v != null) a += v; return a; });
  const indexCum = indexFlow.map(v => { if (v != null) i += v; return i; });

  chart.setOption({
    animation: false,
    grid: { left: 64, right: 82, top: 44, bottom: 76 },
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
            <span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums;color:${p.value >= 0 ? GREEN : RED}">${p.value >= 0 ? '+' : ''}${p.value.toFixed(0)} 亿</span>
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
        type: 'value', name: '月度流量（亿美元）', nameGap: 12,
        nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}` },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
      },
      {
        type: 'value', position: 'right', name: '累计（亿美元）', nameGap: 12,
        nameTextStyle: { color: BLACK, fontFamily: CHART_FONT, fontSize: 11 },
        axisLabel: { fontSize: 11, color: BLACK, fontFamily: CHART_FONT, formatter: v => `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}` },
        splitLine: { show: false },
      },
    ],
    series: [
      { name: 'Active 主动', type: 'bar', yAxisIndex: 0,
        data: activeFlow, itemStyle: { color: CAT_COLORS.active }, barMaxWidth: 12 },
      { name: 'Index 指数', type: 'bar', yAxisIndex: 0,
        data: indexFlow, itemStyle: { color: CAT_COLORS.index }, barMaxWidth: 12 },
      { name: 'Active 累计', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: activeCum, lineStyle: { color: CAT_COLORS.active, width: 2 }, itemStyle: { color: CAT_COLORS.active } },
      { name: 'Index 累计', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: indexCum, lineStyle: { color: CAT_COLORS.index, width: 2 }, itemStyle: { color: CAT_COLORS.index } },
    ],
    dataZoom: months.length > 24 ? getDataZoom(GRAY) : undefined,
  });

  const latest = months[months.length - 1];
  const latestFlow = latest.flows_millions?.Total || {};
  const tna = latest.tna_billions?.Total || {};
  const cards = [
    buildMetricCard('主动最新月净流', fmt亿(latestFlow.active, 0) + '美元', `${latest.month}`),
    buildMetricCard('指数最新月净流', fmt亿(latestFlow.index, 0) + '美元', `${latest.month}`),
    buildMetricCard('主动总 TNA', tna.active != null ? `${(tna.active / 1000).toFixed(2)} 万亿美元` : '—', `占 ${(100 - (tna.index_pct || 0)).toFixed(1)}%`),
    buildMetricCard('指数总 TNA', tna.index != null ? `${(tna.index / 1000).toFixed(2)} 万亿美元` : '—', `占 ${(tna.index_pct || 0).toFixed(1)}%`),
  ];
  renderMetricStrip('iciActiveIndexSummary', cards);
}


// ─────────────────────────────────────────────────────────────
// ⑤ 被动化率  Index 占总 TNA 的百分比（分类别）
// ─────────────────────────────────────────────────────────────
export function initPanelIciPassivization(data) {
  if (!data || !Array.isArray(data.months) || !data.months.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartIciPassivization')));

  const monthsWithTna = data.months.filter(m => m.tna_billions);
  const labels = monthsWithTna.map(m => shortLabel(m.month));

  const CATS = [
    { key: 'Domestic equity', name: '美股（Domestic）', color: BLUE },
    { key: 'World equity',    name: '海外（World）',    color: '#f59e0b' },
    { key: 'Bond',            name: '债券（Bond）',     color: '#d97706' },
    { key: 'Hybrid',          name: '混合（Hybrid）',   color: '#8b5cf6' },
    { key: 'Total',           name: '合计（Total）',    color: BLACK },
  ];

  const series = CATS.map((cat, i) => ({
    name: cat.name, type: 'line', smooth: true,
    symbol: 'circle', symbolSize: monthsWithTna.length <= 3 ? 8 : (monthsWithTna.length > 40 ? 0 : 4),
    data: monthsWithTna.map(m => m.tna_billions[cat.key]?.index_pct ?? null),
    lineStyle: { color: cat.color, width: cat.key === 'Total' ? 2.5 : 1.8 },
    itemStyle: { color: cat.color },
    z: cat.key === 'Total' ? 6 : 4,
    // 50 / 60 / 70% 心理关口参考线挂在第一条 series 上（一次即可）
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
      type: 'value', name: 'Index 占比 %', nameGap: 12,
      nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
      min: 0, max: 80,
      axisLabel: { fontSize: 11, color: GRAY, fontFamily: CHART_FONT, formatter: '{value}%' },
      splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
    },
    series,
    dataZoom: monthsWithTna.length > 24 ? getDataZoom(GRAY) : undefined,
  });

  // 大数字卡片 —— 用最新一期截面
  const latest = monthsWithTna[monthsWithTna.length - 1] || {};
  const tna = latest.tna_billions || {};
  const cards = [
    buildMetricCard('美股', tna['Domestic equity']?.index_pct != null ? `${tna['Domestic equity'].index_pct.toFixed(1)}%` : '—', `Domestic equity · ${latest.month || ''}`),
    buildMetricCard('海外', tna['World equity']?.index_pct != null ? `${tna['World equity'].index_pct.toFixed(1)}%` : '—', 'World equity'),
    buildMetricCard('债券', tna['Bond']?.index_pct != null ? `${tna['Bond'].index_pct.toFixed(1)}%` : '—', 'Bond'),
    buildMetricCard('混合', tna['Hybrid']?.index_pct != null ? `${tna['Hybrid'].index_pct.toFixed(1)}%` : '—', 'Hybrid'),
    buildMetricCard('合计', tna['Total']?.index_pct != null ? `${tna['Total'].index_pct.toFixed(1)}%` : '—', 'Total'),
  ];
  renderMetricStrip('iciPassivizationSummary', cards);
}


// ─────────────────────────────────────────────────────────────
// ⑥ 美股所有权结构 · 100% 堆叠面积图 1945-2026
// 数据源：data/ownership.json (fetch_ownership.py → FRED Z.1 · 14 系列)
// ─────────────────────────────────────────────────────────────

// 7 类归并（原始 12 sector + 家庭残差 → 展示 7 类）
const OWNERSHIP_GROUPS = [
  { key: 'household',   name: '家庭直接持股',       color: BLUE,      keys: ['household'] },
  { key: 'foreign',     name: '外国投资者',         color: '#f59e0b', keys: ['foreign'] },
  { key: 'mutual_fund', name: '共同基金',           color: '#0891b2', keys: ['mutual_fund'] },
  { key: 'etf',         name: 'ETF',                color: GREEN,     keys: ['etf'] },
  { key: 'pension',     name: '养老金合计',         color: '#8b5cf6', keys: ['private_pension', 'state_pension', 'fed_pension'] },
  { key: 'insurance',   name: '保险公司',           color: '#d97706', keys: ['life_insurance', 'pc_insurance'] },
  { key: 'other',       name: '其他',               color: '#94a3b8', keys: ['closed_end', 'broker_dealer', 'bank_mmf', 'nonfin_corp'] },
];

// 里程碑标注（放在第一条 series 的 markLine）
const OWNERSHIP_MILESTONES = [
  { xAxis: '1980-01-01', label: '1980\nMMF+机构崛起' },
  { xAxis: '2000-01-01', label: '2000\nETF 起飞前夜' },
  { xAxis: '2010-01-01', label: '2010\n外资突破 15%' },
  { xAxis: '2020-01-01', label: '2020\n疫情放水' },
];

export function initPanelOwnership(data) {
  if (!data || !Array.isArray(data.ownership_pct) || !data.ownership_pct.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartOwnership')));

  const rows = data.ownership_pct;
  const dates = rows.map(r => r.date);

  // 合并成 7 组
  const groupedData = rows.map(r => {
    const merged = { date: r.date };
    OWNERSHIP_GROUPS.forEach(g => {
      merged[g.key] = g.keys.reduce((acc, k) => acc + (r[k] || 0), 0);
    });
    return merged;
  });

  const series = OWNERSHIP_GROUPS.map((g, i) => ({
    name: g.name,
    type: 'line',
    stack: 'total',
    smooth: true,
    showSymbol: false,
    areaStyle: { color: g.color, opacity: 0.85 },
    lineStyle: { width: 0.3, color: g.color },
    itemStyle: { color: g.color },
    data: groupedData.map(r => [r.date, r[g.key]]),
    z: OWNERSHIP_GROUPS.length - i,
    // 里程碑挂在第一条 series
    markLine: i === 0 ? {
      symbol: 'none',
      silent: true,
      lineStyle: { color: BLACK, type: 'dashed', width: 0.8, opacity: 0.35 },
      label: { formatter: (p) => p.data.label, color: BLACK, fontSize: 10,
               fontFamily: CHART_FONT, position: 'insideEndTop', distance: 6 },
      data: OWNERSHIP_MILESTONES,
    } : undefined,
  }));

  chart.setOption({
    animation: false,
    grid: { left: 50, right: 30, top: 46, bottom: 66 },
    legend: getLineLegendConfig({ top: 4, right: 8 }),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
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
      name: '占美股总市值 %', nameGap: 12,
      nameTextStyle: { color: GRAY, fontFamily: CHART_FONT, fontSize: 11 },
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

  // Summary strip：4 张卡片（家庭/外国/基金合计/养老金合计）+ 总市值
  const latest = groupedData[groupedData.length - 1];
  const totalLatest = data.total_liability[data.total_liability.length - 1];
  const totalT = totalLatest.value_millions / 1e6;
  const fund_total = (latest.mutual_fund || 0) + (latest.etf || 0);

  const cards = [
    buildMetricCard('总市值', `${totalT.toFixed(1)} 万亿美元`, `Fed Z.1 · ${latest.date}`),
    buildMetricCard('家庭直接持股', `${latest.household.toFixed(1)}%`, `1945 年约 90%`),
    buildMetricCard('外国投资者', `${latest.foreign.toFixed(1)}%`, `1970 年 < 5%`),
    buildMetricCard('共同基金 + ETF', `${fund_total.toFixed(1)}%`, `MF ${latest.mutual_fund.toFixed(1)}% + ETF ${latest.etf.toFixed(1)}%`),
  ];
  renderMetricStrip('ownershipSummary', cards);
}
