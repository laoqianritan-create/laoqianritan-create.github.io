// panels/sentiment.js · 情绪四件套（CNN 恐惧贪婪 / AAII 散户情绪 / NAAIM 敞口 / 痛苦指数）
//
// 数据：
//   data/cnn_fear_greed.json    CNN 官方 7 分项 z-score 合成，2011 至今日频（近 4000 天）
//   data/aaii_sentiment.json    AAII 周度调查，1987 至今 2000+ 周
//   data/naaim_exposure.json    NAAIM 主动管理人敞口，周频（2026-08 起官方订阅化）
//   data/us_misery_index.json   FRED 失业率 + CPI 同比自算，1948 至今月频

import {
  CHART_FONT,
  cssVar,
  formatNumber,
} from '../utils.js?v=20261031205426';

import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  buildSingleMarkPoint,
  getLineLegendConfig,
  buildRecessionOverlaySeries,
} from '../chart-helpers.js?v=20261031205426';

const BLACK = '#1a1a1a';
const GREEN = '#389e0d';
const RED = '#cf1322';
const BLUE = '#2563eb';
const ORANGE = '#f97316';
const TEAL = '#0f766e';
const GRAY = '#999999';
const LIGHT_GRAY = '#bfbfbf';

const FG_BANDS = [
  { min: 0, max: 25, color: GREEN, label: '极度恐惧' },
  { min: 25, max: 45, color: '#7cb305', label: '恐惧' },
  { min: 45, max: 55, color: GRAY, label: '中性' },
  { min: 55, max: 75, color: ORANGE, label: '贪婪' },
  { min: 75, max: 100, color: RED, label: '极度贪婪' },
];

// ── 通用小工具 ──────────────────────────────────────────────

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

/** 默认视图窗口：只露出最近 n 个数据点，其余拖 slider 回看 */
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

// ── 1. CNN 恐惧贪婪指数 ─────────────────────────────────────

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

  // 叠加标普 500：只取本图区间内的收盘价，右轴对数刻度（15 年跨度 6 倍，线性轴会把前半段压平）
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

  // CNN 返回的分项 history 是原始指标值（点位/成交量/比率），尺度各异，
  // 不能叠在同一张 0—100 图上；只有 score 字段才是等权后的分数。
  // 所以「七分项」视图画当前分数横条，而不是七条时间序列。
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
    .sort((a, b) => a.value - b.value);   // 升序 → 横向条形图从下往上递增

  // 视图：综合指数 / 七分项
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
      grid: { left: 76, right: 56, top: 24, bottom: 40 },
      legend: { show: false },
      tooltip: tooltipBase({
        trigger: 'item',
        formatter: p => {
          const row = componentBars[p.dataIndex];
          return `<div style="font-weight:600;margin-bottom:4px;">${row.name}</div>
            <div style="color:#666;margin-bottom:4px;">${row.full}</div>
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <span>${p.marker}当前分数</span><span style="font-weight:600;">${row.value}</span></div>
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <span>区间</span><span>${row.rating}</span></div>`;
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
        ? getLineLegendConfig({ data: ['恐惧贪婪指数', '标普500'] })
        : { show: false },
      tooltip: tooltipBase({
        formatter: params => {
          const list = Array.isArray(params) ? params : [params];
          if (!list.length) return '';
          let html = `<div style="font-weight:600;margin-bottom:4px;">${fmtDate(list[0].value[0])}</div>`;
          list.forEach(p => {
            const isSp = p.seriesName === '标普500';
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
          name: '标普500',
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
          name: '恐惧贪婪指数',
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
            mp.label = { show: false };   // 图上是 4000 天全量，文字会压住标普线，读数看指标卡
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
    buildMetricCard('当前读数', `${cur.score}`, `${cur.rating} · ${data.latest_date}`),
    buildMetricCard('历史分位', `${data.percentile}%`,
      data.coverage
        ? `${data.coverage.start} 起 ${data.coverage.days} 个交易日`
        : '全序列分位'),
    buildMetricCard('前一交易日', `${cmp.previous_close}`,
      `较前值 ${diff(cur.score, cmp.previous_close)}`),
    buildMetricCard('一周前', `${cmp.previous_1_week}`,
      `较一周前 ${diff(cur.score, cmp.previous_1_week)}`),
    buildMetricCard('一月前', `${cmp.previous_1_month}`,
      `较一月前 ${diff(cur.score, cmp.previous_1_month)}`),
    buildMetricCard('一年前', `${cmp.previous_1_year}`,
      `较一年前 ${diff(cur.score, cmp.previous_1_year)}`),
  ]);
}

// ── 2. AAII 个人投资者情绪 ──────────────────────────────────

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
        data: isRatio ? ['看涨', '中性', '看跌'] : ['牛熊价差', '8 周均线'],
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
              name: '看涨',
              type: 'line',
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 1.2, color: RED },
              itemStyle: { color: RED },
              data: bullLine,
            },
            {
              name: '中性',
              type: 'line',
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 1, color: LIGHT_GRAY, type: 'dashed', opacity: 0.8 },
              itemStyle: { color: LIGHT_GRAY },
              data: neutralLine,
            },
            {
              name: '看跌',
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
              name: '牛熊价差',
              type: 'bar',
              barMaxWidth: 3,
              data: spreadBars,
            },
            {
              name: '8 周均线',
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
    buildMetricCard('看涨', `${latest.bull}%`, `历史均值 ${avg.bull}%`),
    buildMetricCard('中性', `${latest.neutral}%`, `历史均值 ${avg.neutral}%`),
    buildMetricCard('看跌', `${latest.bear}%`, `历史均值 ${avg.bear}%`),
    buildMetricCard('牛熊价差', `${latest.spread > 0 ? '+' : ''}${latest.spread} pp`,
      `历史均值 ${avg.spread > 0 ? '+' : ''}${avg.spread} pp`),
    buildMetricCard('8 周均线', `${latest.spread_ma8 > 0 ? '+' : ''}${latest.spread_ma8} pp`,
      '平滑周度噪声'),
    buildMetricCard('样本跨度', `${series.length} 周`, `${series[0].date.slice(0, 4)}—${latest.date.slice(0, 4)}`),
  ]);
}

// ── 3. NAAIM 暴露指数 ───────────────────────────────────────

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

  // y 轴按实际分布收口：官方量程 -200—200 但历史极少越过 ±130，全量程会浪费六成画布
  const means = series.map(s => s.mean);
  const lo = Math.min(...means);
  const yMin = Math.min(-50, Math.floor(lo / 50) * 50);
  const yMax = 150;

  const option = {
    animation: false,
    grid: { left: 56, right: 28, top: 36, bottom: 62 },
    legend: getLineLegendConfig({ data: ['敞口均值', '四分位上沿（75%）', '四分位下沿（25%）'] }),
    tooltip: tooltipBase({
      formatter: params => {
        const list = Array.isArray(params) ? params : [params];
        const line = list.find(p => p.seriesName === '敞口均值');
        const idx = line ? line.dataIndex : list[0].dataIndex;
        const row = series[idx];
        if (!row) return '';
        return `<div style="font-weight:600;margin-bottom:4px;">${row.date}</div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>敞口均值</span><span style="font-weight:600;">${row.mean.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>中位数</span><span>${row.median ?? '—'}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>四分位区间</span><span>${row.p25} — ${row.p75}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>最多看多 / 看空</span><span>${row.bull_extreme} / ${row.bear_extreme}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>标准差</span><span>${row.std ?? '—'}</span></div>`;
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
        name: '四分位上沿（75%）',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1, color: BLUE, type: 'dashed', opacity: 0.3 },
        itemStyle: { color: BLUE },
        data: p75Line,
        silent: true,
        legendHoverLink: false,
      },
      {
        name: '四分位下沿（25%）',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1, color: BLUE, type: 'dashed', opacity: 0.3 },
        itemStyle: { color: BLUE },
        data: p25Line,
        silent: true,
        legendHoverLink: false,
      },
      {
        name: '敞口均值',
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
            { yAxis: 0, name: '多空平衡' },
            { yAxis: 100, name: '满仓做多' },
            { yAxis: -100, name: '完全做空' },
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
    buildMetricCard('最新敞口', `${latest.mean}`, `${latest.date} · ${latest.zone}`),
    buildMetricCard('历史分位', `${(below / vals.length * 100).toFixed(1)}%`, `${series.length} 周样本`),
    buildMetricCard('四分位区间', `${latest.p25}—${latest.p75}`, `中位数 ${latest.median}`),
    buildMetricCard('标准差', `${latest.std}`, '分歧度'),
    buildMetricCard('历史最高', `${peak}`, '满仓之上加杠杆'),
    buildMetricCard('历史最低', `${trough}`, '净做空'),
  ]);
}

// ── 4. 美国痛苦指数 ─────────────────────────────────────────

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
      name: '失业率',
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
      name: 'CPI 同比',
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
      name: '痛苦指数',
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

  // 衰退灰带压到最底层：先入 series 数组并显式 z:0，避免盖住面积
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
    legend: getLineLegendConfig({ data: ['失业率', 'CPI 同比', '痛苦指数'] }),
    tooltip: tooltipBase({
      formatter: params => {
        const list = Array.isArray(params) ? params : [params];
        const main = list.find(p => p.seriesName === '痛苦指数') || list[0];
        if (!main) return '';
        const idx = main.dataIndex;
        const row = series[idx];
        if (!row) return '';
        return `<div style="font-weight:600;margin-bottom:4px;">${row.date.slice(0, 7)}</div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>${main.marker}痛苦指数</span><span style="font-weight:600;">${row.misery}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>CPI 同比</span><span>${row.cpi_yoy}%</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;"><span>失业率</span><span>${row.unrate}%</span></div>`;
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
    buildMetricCard('最新读数', `${latest.misery}`, `${latest.date.slice(0, 7)}`),
    buildMetricCard('CPI 同比', `${latest.cpi_yoy}%`,
      `FRED CPIAUCSL 季调自算`),
    buildMetricCard('失业率', `${latest.unrate}%`, `FRED UNRATE 季调`),
    buildMetricCard('一年前', `${latest.year_ago ?? '—'}`,
      latest.year_ago != null ? `较一年前 ${(latest.misery - latest.year_ago).toFixed(1)}` : '—'),
    buildMetricCard('历史均值', `${data.average}`, `${series.length} 个月样本`),
    buildMetricCard('历史峰值', `${latest.peak?.value}`,
      `${latest.peak?.date?.slice(0, 7) ?? ''} · 分位 ${latest.percentile}%`),
  ]);
}
