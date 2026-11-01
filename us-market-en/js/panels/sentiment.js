// panels/sentiment.js · Sentiment suite (CNN Fear & Greed / AAII / NAAIM / Misery Index)
//
// Data:
//   data/cnn_fear_greed.json    CNN official 7-component z-score composite, daily since 2011 (~4,000 days)
//   data/aaii_sentiment.json    AAII weekly survey, 2,000+ weeks since 1987
//   data/naaim_exposure.json    NAAIM active managers' exposure, weekly (public feed ended 2026-08)
//   data/us_misery_index.json   FRED unemployment + CPI YoY, monthly since 1948

import {
  CHART_FONT,
  cssVar,
  formatNumber,
} from '../utils.js?v=20261101141950';

import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  buildSingleMarkPoint,
  getLineLegendConfig,
  buildRecessionOverlaySeries,
} from '../chart-helpers.js?v=20261101141950';

const BLACK = '#1a1a1a';
const GREEN = '#389e0d';
const RED = '#cf1322';
const BLUE = '#2563eb';
const ORANGE = '#f97316';
const TEAL = '#0f766e';
const GRAY = '#999999';
const LIGHT_GRAY = '#bfbfbf';

const FG_BANDS = [
  { min: 0, max: 25, color: GREEN, label: 'Extreme Fear' },
  { min: 25, max: 45, color: '#7cb305', label: 'Fear' },
  { min: 45, max: 55, color: GRAY, label: 'Neutral' },
  { min: 55, max: 75, color: ORANGE, label: 'Greed' },
  { min: 75, max: 100, color: RED, label: 'Extreme Greed' },
];

// ── Shared helpers ──────────────────────────────────────────

function axisBase(grayColor) {
  return {
    axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
    axisLine: { lineStyle: { color: cssVar('--border') || '#e8e8e8' } },
    splitLine: { lineStyle: { color: cssVar('--chart-grid') || '#f0f0f0' } },
  };
}

function timeXAxis(grayColor) {
  return {
    type: 'time',
    axisLabel: {
      fontSize: 11,
      color: grayColor,
      fontFamily: CHART_FONT,
      formatter: value => {
        const d = new Date(value);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      },
    },
    axisLine: { lineStyle: { color: cssVar('--border') || '#e8e8e8' } },
    splitLine: { show: false },
  };
}

function tooltipBase(extra = {}) {
  return {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: cssVar('--border') || '#e8e8e8',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { fontSize: 12, color: cssVar('--text') || BLACK, fontFamily: CHART_FONT },
    axisPointer: { type: 'line', lineStyle: { color: cssVar('--border') || '#e8e8e8' } },
    ...extra,
  };
}

/** Default zoom window: only the most recent n points, drag the slider to look back */
function zoomWindow(grayColor, total, visible) {
  const zoom = getDataZoom(grayColor);
  if (total > visible) {
    zoom[0].start = +(((total - visible) / total) * 100).toFixed(1);
  }
  return zoom;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ── 1. CNN Fear & Greed Index ───────────────────────────────

export function initCnnFearGreedPanel(data, sp500) {
  const dom = document.getElementById('chartCnnFg');
  if (!dom || !data?.history?.length) return;

  const chart = registerChart(echarts.init(dom));
  const gray = cssVar('--gray') || GRAY;

  const history = data.history;
  const cur = data.current || {};
  const cmp = data.compare || {};
  const components = data.components || [];

  const seriesTotal = history.map(p => [p.date, p.score]);

  // S&P 500 overlay: only closes inside this chart's range, right axis is linear
  // (15 years spans 6x; a log axis collapses the early years into the baseline)
  const spStart = history[0].date;
  const spSeries = ((sp500 && sp500.series) || [])
    .filter(r => r.date >= spStart)
    .map(r => [r.date, r.close]);
  const markAreas = FG_BANDS.map(band => [
    {
      yAxis: band.min,
      itemStyle: { color: band.color, opacity: 0.09 },
      label: { show: false },
    },
    { yAxis: band.max },
  ]);

  // CNN's component history carries raw indicator levels (index points/volume/ratios)
  // on wildly different scales, so they cannot be stacked on one 0—100 chart;
  // only the score field is the equal-weighted 0—100 value. The "components" view
  // therefore plots the current component scores as bars, not seven time series.
  const ratingColor = rating => {
    const b = FG_BANDS.find(x => x.label === rating);
    return b ? b.color : GRAY;
  };

  const componentBars = components
    .map(c => ({
      name: c.short,
      value: c.score,
      full: c.name,
      rating: c.rating,
      itemStyle: { color: ratingColor(c.rating), opacity: 0.85, borderRadius: [0, 4, 4, 0] },
    }))
    .sort((a, b) => a.value - b.value);   // ascending → horizontal bars grow bottom-up

  // View: composite / components
  let view = 'total';
  const buttons = document.querySelectorAll('[data-cnnfg-view]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      view = btn.dataset.cnnfgView;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      chart.setOption(getOption(), true);
    });
  });

  function getComponentOption() {
    return {
      animation: false,
      grid: { left: 96, right: 56, top: 24, bottom: 40 },
      legend: { show: false },
      tooltip: tooltipBase({
        trigger: 'item',
        formatter: p => {
          const row = componentBars[p.dataIndex];
          return `<div style="font-weight:600;margin-bottom:4px;">${row.name}</div>
            <div style="color:#666;margin-bottom:4px;">${row.full}</div>
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <span>${p.marker}Score</span><span style="font-weight:600;">${row.value}</span></div>
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <span>Rating</span><span>${row.rating}</span></div>`;
        },
      }),
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        ...axisBase(gray),
      },
      yAxis: {
        type: 'category',
        data: componentBars.map(c => c.name),
        axisLabel: { fontSize: 12, color: cssVar('--text') || BLACK, fontFamily: CHART_FONT },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: cssVar('--border') || '#e8e8e8' } },
      },
      series: [{
        type: 'bar',
        barWidth: 16,
        data: componentBars,
        label: {
          show: true,
          position: 'right',
          formatter: p => `${p.value}`,
          fontSize: 12,
          fontWeight: 600,
          color: cssVar('--text') || BLACK,
          fontFamily: CHART_FONT,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { type: 'dashed', color: LIGHT_GRAY, width: 1 },
          data: [25, 45, 55, 75].map(v => ({ xAxis: v })),
        },
        markArea: {
          silent: true,
          data: FG_BANDS.map(b => [
            { xAxis: b.min, itemStyle: { color: b.color, opacity: 0.07 } },
            { xAxis: b.max },
          ]),
        },
      }],
    };
  }

  function getOption() {
    if (view === 'components') return getComponentOption();
    const hasSp = spSeries.length > 20;
    return {
      animation: false,
      grid: { left: 52, right: hasSp ? 58 : 24, top: 36, bottom: 62 },
      legend: hasSp
        ? getLineLegendConfig({ data: ['Fear & Greed', 'S&P 500'] })
        : { show: false },
      tooltip: tooltipBase({
        formatter: params => {
          const list = Array.isArray(params) ? params : [params];
          if (!list.length) return '';
          let html = `<div style="font-weight:600;margin-bottom:4px;">${fmtDate(list[0].value[0])}</div>`;
          list.forEach(p => {
            const isSp = p.seriesName === 'S&P 500';
            const v = isSp
              ? formatNumber(p.value[1])
              : Number(p.value[1]).toFixed(1);
            html += `<div style="display:flex;justify-content:space-between;gap:16px;">
              <span>${p.marker}${p.seriesName}</span>
              <span style="font-weight:600;">${v}</span></div>`;
          });
          return html;
        },
      }),
      xAxis: timeXAxis(gray),
      yAxis: hasSp
        ? [
            {
              type: 'value',
              min: 0,
              max: 100,
              ...axisBase(gray),
              axisLabel: { fontSize: 11, color: gray, fontFamily: CHART_FONT, formatter: '{value}' },
            },
            {
              type: 'value',
              min: 'dataMin',
              splitNumber: 4,
              ...axisBase(gray),
              splitLine: { show: false },
              axisLabel: {
                fontSize: 11,
                color: gray,
                fontFamily: CHART_FONT,
                formatter: v => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v),
              },
            },
          ]
        : {
            type: 'value',
            min: 0,
            max: 100,
            ...axisBase(gray),
            axisLabel: { fontSize: 11, color: gray, fontFamily: CHART_FONT, formatter: '{value}' },
          },
      dataZoom: getDataZoom(gray),
      series: [
        hasSp && {
          name: 'S&P 500',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          smooth: false,
          z: 1,
          lineStyle: { width: 1.1, color: BLUE, opacity: 0.75 },
          itemStyle: { color: BLUE },
          data: spSeries,
        },
        {
          name: 'Fear & Greed',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          smooth: true,
          z: 3,
          lineStyle: { width: 2, color: BLACK },
          itemStyle: { color: BLACK },
          data: seriesTotal,
          markArea: { silent: true, data: markAreas },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: { type: 'dashed', color: LIGHT_GRAY, width: 1 },
            data: FG_BANDS.slice(1).map(b => ({ yAxis: b.min, name: b.label })),
          },
          markPoint: (() => {
            const mp = buildSingleMarkPoint(cur.timestamp?.slice(0, 10) || data.latest_date,
              cur.score, `${cur.score} · ${cur.rating}`, BLACK, 'left');
            if (!mp) return undefined;
            mp.label = { show: false };   // 4,000-day view: the label would sit on top of the S&P line
            return { silent: true, data: [mp] };
          })(),
        },
      ].filter(Boolean),
    };
  }

  chart.setOption(getOption());

  const diff = (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
    const d = a - b;
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
  };

  renderMetricStrip('cnnFgSummary', [
    buildMetricCard('Current', `${cur.score}`, `${cur.rating} · ${data.latest_date}`),
    buildMetricCard('Percentile', `${data.percentile}%`,
      data.coverage
        ? `${data.coverage.days} trading days since ${data.coverage.start}`
        : 'Full-series percentile'),
    buildMetricCard('Prev Close', `${cmp.previous_close}`,
      `vs prev ${diff(cur.score, cmp.previous_close)}`),
    buildMetricCard('1 Week Ago', `${cmp.previous_1_week}`,
      `vs 1W ${diff(cur.score, cmp.previous_1_week)}`),
    buildMetricCard('1 Month Ago', `${cmp.previous_1_month}`,
      `vs 1M ${diff(cur.score, cmp.previous_1_month)}`),
    buildMetricCard('1 Year Ago', `${cmp.previous_1_year}`,
      `vs 1Y ${diff(cur.score, cmp.previous_1_year)}`),
  ]);
}

// ── 2. AAII individual investor sentiment ───────────────────

export function initAaiiPanel(data) {
  const dom = document.getElementById('chartAaii');
  if (!dom || !data?.series?.length) return;

  const chart = registerChart(echarts.init(dom));
  const gray = cssVar('--gray') || GRAY;
  const series = data.series;

  const bullLine = series.map(s => [s.date, s.bull]);
  const neutralLine = series.map(s => [s.date, s.neutral]);
  const bearLine = series.map(s => [s.date, s.bear]);
  const spreadBars = series.map(s => ({
    value: [s.date, s.spread],
    itemStyle: { color: s.spread >= 0 ? RED : GREEN, opacity: 0.75 },
  }));
  const spreadMa = series.map(s => [s.date, s.spread_ma8]);

  let view = 'ratio';
  const buttons = document.querySelectorAll('[data-aaii-view]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      view = btn.dataset.aaiiView;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      chart.setOption(getOption(), true);
    });
  });

  function getOption() {
    const isRatio = view === 'ratio';
    return {
      animation: false,
      grid: { left: 46, right: 24, top: 36, bottom: 62 },
      legend: getLineLegendConfig({
        data: isRatio ? ['Bullish', 'Neutral', 'Bearish'] : ['Bull-Bear Spread', '8-Week MA'],
      }),
      tooltip: tooltipBase({
        formatter: params => {
          const list = Array.isArray(params) ? params : [params];
          if (!list.length) return '';
          const date = fmtDate(list[0].value[0] ?? list[0].data?.value?.[0]);
          let html = `<div style="font-weight:600;margin-bottom:4px;">${date}</div>`;
          list.forEach(p => {
            const v = Array.isArray(p.value) ? p.value[1] : p.value;
            html += `<div style="display:flex;justify-content:space-between;gap:16px;">
              <span>${p.marker}${p.seriesName}</span>
              <span style="font-weight:600;">${v == null ? '—' : Number(v).toFixed(1)}%</span></div>`;
          });
          return html;
        },
      }),
      xAxis: timeXAxis(gray),
      yAxis: {
        type: 'value',
        ...axisBase(gray),
        axisLabel: {
          fontSize: 11,
          color: gray,
          fontFamily: CHART_FONT,
          formatter: '{value}%',
        },
      },
      dataZoom: zoomWindow(gray, series.length, 760),
      series: isRatio
        ? [
            {
              name: 'Bullish',
              type: 'line',
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 1.2, color: RED },
              itemStyle: { color: RED },
              data: bullLine,
            },
            {
              name: 'Neutral',
              type: 'line',
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 1, color: LIGHT_GRAY, type: 'dashed', opacity: 0.8 },
              itemStyle: { color: LIGHT_GRAY },
              data: neutralLine,
            },
            {
              name: 'Bearish',
              type: 'line',
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 1.2, color: GREEN },
              itemStyle: { color: GREEN },
              data: bearLine,
            },
          ]
        : [
            {
              name: 'Bull-Bear Spread',
              type: 'bar',
              barMaxWidth: 3,
              data: spreadBars,
            },
            {
              name: '8-Week MA',
              type: 'line',
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 2, color: BLACK },
              itemStyle: { color: BLACK },
              data: spreadMa,
              markLine: {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: { type: 'dashed', color: LIGHT_GRAY, width: 1 },
                data: [{ yAxis: 0 }],
              },
            },
          ],
    };
  }

  chart.setOption(getOption());

  const latest = data.latest || {};
  const avg = data.average || {};

  renderMetricStrip('aaiiSummary', [
    buildMetricCard('Bullish', `${latest.bull}%`, `Hist. avg ${avg.bull}%`),
    buildMetricCard('Neutral', `${latest.neutral}%`, `Hist. avg ${avg.neutral}%`),
    buildMetricCard('Bearish', `${latest.bear}%`, `Hist. avg ${avg.bear}%`),
    buildMetricCard('Bull-Bear Spread', `${latest.spread > 0 ? '+' : ''}${latest.spread} pp`,
      `Hist. avg ${avg.spread > 0 ? '+' : ''}${avg.spread} pp`),
    buildMetricCard('8-Week MA', `${latest.spread_ma8 > 0 ? '+' : ''}${latest.spread_ma8} pp`,
      'Smooths weekly noise'),
    buildMetricCard('Coverage', `${series.length} weeks`, `${series[0].date.slice(0, 4)}—${latest.date.slice(0, 4)}`),
  ]);
}

// ── 3. NAAIM Exposure Index ─────────────────────────────────

export function initNaaimPanel(data) {
  const dom = document.getElementById('chartNaaim');
  if (!dom || !data?.series?.length) return;

  const chart = registerChart(echarts.init(dom));
  const gray = cssVar('--gray') || GRAY;
  const series = data.series;

  const meanLine = series.map(s => [s.date, s.mean]);
  const p25Line = series.map(s => [s.date, s.p25]);
  const p75Line = series.map(s => [s.date, s.p75]);
  const latest = data.latest || {};

  const zones = [
    { from: -200, to: -100, color: GREEN, opacity: 0.07 },
    { from: -100, to: -50, color: '#7cb305', opacity: 0.05 },
    { from: -50, to: 50, color: GRAY, opacity: 0.05 },
    { from: 50, to: 100, color: ORANGE, opacity: 0.05 },
    { from: 100, to: 200, color: RED, opacity: 0.07 },
  ];

  // Tighten the y-axis to the actual distribution: the official range is -200—200
  // but the series rarely passes ±130, so the full range wastes 60% of the canvas
  const means = series.map(s => s.mean);
  const lo = Math.min(...means);
  const yMin = Math.min(-50, Math.floor(lo / 50) * 50);
  const yMax = 150;

  const option = {
    animation: false,
    grid: { left: 56, right: 28, top: 36, bottom: 62 },
    legend: getLineLegendConfig({ data: ['Average Exposure', '75th Percentile', '25th Percentile'] }),
    tooltip: tooltipBase({
      formatter: params => {
        const list = Array.isArray(params) ? params : [params];
        const line = list.find(p => p.seriesName === 'Average Exposure');
        const idx = line ? line.dataIndex : list[0].dataIndex;
        const row = series[idx];
        if (!row) return '';
        return `<div style="font-weight:600;margin-bottom:4px;">${row.date}</div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>Average exposure</span><span style="font-weight:600;">${row.mean.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>Median</span><span>${row.median ?? '—'}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>Interquartile</span><span>${row.p25} — ${row.p75}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>Most long / short</span><span>${row.bull_extreme} / ${row.bear_extreme}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>Std dev</span><span>${row.std ?? '—'}</span></div>`;
      },
    }),
    xAxis: timeXAxis(gray),
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      interval: 50,
      ...axisBase(gray),
    },
    dataZoom: getDataZoom(gray),
    series: [
      {
        name: '75th Percentile',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1, color: BLUE, type: 'dashed', opacity: 0.3 },
        itemStyle: { color: BLUE },
        data: p75Line,
        silent: true,
        legendHoverLink: false,
      },
      {
        name: '25th Percentile',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1, color: BLUE, type: 'dashed', opacity: 0.3 },
        itemStyle: { color: BLUE },
        data: p25Line,
        silent: true,
        legendHoverLink: false,
      },
      {
        name: 'Average Exposure',
        type: 'line',
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.6, color: BLACK },
        itemStyle: { color: BLACK },
        data: meanLine,
        markArea: {
          silent: true,
          data: zones.map(z => [
            { yAxis: z.from, itemStyle: { color: z.color, opacity: z.opacity } },
            { yAxis: z.to },
          ]),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            formatter: '{b}',
            fontSize: 10,
            color: gray,
            fontFamily: CHART_FONT,
            position: 'insideEndTop',
          },
          lineStyle: { type: 'dashed', color: LIGHT_GRAY, width: 1 },
          data: [
            { yAxis: 0, name: 'Balanced' },
            { yAxis: 100, name: 'Fully long' },
            { yAxis: -100, name: 'Fully short' },
          ],
        },
      },
    ],
  };

  chart.setOption(option);

  const vals = series.map(s => s.mean);
  const below = vals.filter(v => v <= latest.mean).length;
  const peak = Math.max(...vals);
  const trough = Math.min(...vals);

  renderMetricStrip('naaimSummary', [
    buildMetricCard('Latest', `${latest.mean}`, `${latest.date} · ${latest.zone}`),
    buildMetricCard('Percentile', `${(below / vals.length * 100).toFixed(1)}%`, `${series.length} weeks`),
    buildMetricCard('Interquartile', `${latest.p25}—${latest.p75}`, `Median ${latest.median}`),
    buildMetricCard('Std Dev', `${latest.std}`, 'Dispersion'),
    buildMetricCard('All-Time High', `${peak}`, 'Leveraged long'),
    buildMetricCard('All-Time Low', `${trough}`, 'Net short'),
  ]);
}

// ── 4. US Misery Index ──────────────────────────────────────

export function initMiseryPanel(data, recessionData) {
  const dom = document.getElementById('chartMisery');
  if (!dom || !data?.series?.length) return;

  const chart = registerChart(echarts.init(dom));
  const gray = cssVar('--gray') || GRAY;
  const series = data.series;

  const cpiLine = series.map(s => [s.date, s.cpi_yoy]);
  const unLine = series.map(s => [s.date, s.unrate]);
  const totalLine = series.map(s => [s.date, s.misery]);
  const latest = data.latest || {};

  const baseSeries = [
    {
      name: 'Unemployment',
      type: 'line',
      stack: 'misery',
      showSymbol: false,
      lineStyle: { width: 1, color: BLUE },
      itemStyle: { color: BLUE },
      areaStyle: { color: BLUE, opacity: 0.45 },
      data: unLine,
      z: 2,
    },
    {
      name: 'CPI YoY',
      type: 'line',
      stack: 'misery',
      showSymbol: false,
      lineStyle: { width: 1, color: ORANGE },
      itemStyle: { color: ORANGE },
      areaStyle: { color: ORANGE, opacity: 0.55 },
      data: cpiLine,
      z: 2,
    },
    {
      name: 'Misery Index',
      type: 'line',
      showSymbol: false,
      smooth: true,
      lineStyle: { width: 2, color: BLACK },
      itemStyle: { color: BLACK },
      data: totalLine,
      z: 3,
      markPoint: (() => {
        const mp = buildSingleMarkPoint(data.latest_date, latest.misery,
          `${latest.misery}`, BLACK, 'right');
        return mp ? { silent: true, data: [mp] } : undefined;
      })(),
    },
  ];

  // Push the recession band to the very bottom (index 0, explicit z:0) so it
  // never covers the stacked areas
  let finalSeries = baseSeries;
  if (recessionData) {
    const overlay = buildRecessionOverlaySeries(series.map(s => ({ date: s.date })), recessionData);
    if (overlay) {
      overlay.z = 0;
      finalSeries = [overlay].concat(baseSeries);
    }
  }

  const option = {
    animation: false,
    grid: { left: 48, right: 28, top: 36, bottom: 62 },
    legend: getLineLegendConfig({ data: ['Unemployment', 'CPI YoY', 'Misery Index'] }),
    tooltip: tooltipBase({
      formatter: params => {
        const list = Array.isArray(params) ? params : [params];
        const main = list.find(p => p.seriesName === 'Misery Index') || list[0];
        if (!main) return '';
        const idx = main.dataIndex;
        const row = series[idx];
        if (!row) return '';
        return `<div style="font-weight:600;margin-bottom:4px;">${row.date.slice(0, 7)}</div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>${main.marker}Misery Index</span><span style="font-weight:600;">${row.misery}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>CPI YoY</span><span>${row.cpi_yoy}%</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>Unemployment</span><span>${row.unrate}%</span></div>`;
      },
    }),
    xAxis: timeXAxis(gray),
    yAxis: {
      type: 'value',
      min: 0,
      ...axisBase(gray),
    },
    dataZoom: zoomWindow(gray, series.length, 564),
    series: finalSeries,
  };

  chart.setOption(option);

  renderMetricStrip('miserySummary', [
    buildMetricCard('Latest', `${latest.misery}`, `${latest.date.slice(0, 7)}`),
    buildMetricCard('CPI YoY', `${latest.cpi_yoy}%`,
      'FRED CPIAUCSL, SA, computed'),
    buildMetricCard('Unemployment', `${latest.unrate}%`, 'FRED UNRATE, SA'),
    buildMetricCard('1 Year Ago', `${latest.year_ago ?? '—'}`,
      latest.year_ago != null ? `vs 1Y ${(latest.misery - latest.year_ago).toFixed(1)}` : '—'),
    buildMetricCard('Hist. Average', `${data.average}`, `${series.length} months`),
    buildMetricCard('Hist. Peak', `${latest.peak?.value}`,
      `${latest.peak?.date?.slice(0, 7) ?? ''} · pctile ${latest.percentile}%`),
  ]);
}
