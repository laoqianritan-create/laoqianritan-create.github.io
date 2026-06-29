// panels/hindenburg.js · Hindenburg Omen panel
//
// S&P 500 adaptation of the Hindenburg Omen; 5 conditions must trigger on the same day:
//   C1: S&P 500 > 50-day MA (market still in uptrend)
//   C2: 52-week new-highs share ≥ 2.2%
//   C3: 52-week new-lows share ≥ 2.2%
//   C4: new highs ≤ 2 × new lows (avoid one-sided rallies false-positives)
//   C5: McClellan Oscillator < 0
//
// Backtest 1963 to date: 30/60/90-day SP500 median return vs. market baseline.
// Data: data/sp500_hindenburg.json (fetch_sp500_hindenburg in fetch_data.py)

import {
  CHART_FONT,
  cssVar,
  formatNumber,
} from '../utils.js';

import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
  getLineLegendConfig,
} from '../chart-helpers.js';

const GREEN = '#389e0d';
const RED = '#cf1322';
const BLUE = '#2563eb';
const BLACK = '#1a1a1a';
const GRAY = '#999';
const LIGHT_GRAY = '#bfbfbf';

export function initPanelHindenburg(hindData, priceData) {
  const dom = document.getElementById('chartHindenburg');
  if (!dom || !hindData?.triggers || !priceData?.series?.length) return;

  const chart = registerChart(echarts.init(dom));
  const cur = hindData.current || {};

  const startDate = hindData.historyStart || '1963-01-01';
  const slicedPrice = priceData.series.filter(p => p.date >= startDate);
  const spLine = slicedPrice.map(p => [p.date, p.close]);
  const ddLine = slicedPrice.map(p => [p.date, +(p.drawdown * 100).toFixed(2)]);

  const triggers = hindData.triggers || [];
  const scatterUp = [];
  const scatterDown = [];
  const scatterPending = [];
  for (const t of triggers) {
    if (t.r30 == null) {
      scatterPending.push([t.date, t.spClose, t]);
    } else if (t.r30 >= 0) {
      scatterUp.push([t.date, t.spClose, t]);
    } else {
      scatterDown.push([t.date, t.spClose, t]);
    }
  }

  function getOption() {
    const gridColor = cssVar('--chart-grid') || '#f0f0f0';
    const textColor = cssVar('--text') || BLACK;
    const grayColor = cssVar('--gray') || GRAY;

    return {
      animation: false,
      grid: { left: 65, right: 65, top: 40, bottom: 60 },
      legend: getLineLegendConfig({
        data: ['Drawdown from peak', 'S&P 500', '30-day return: down', '30-day return: up', 'Observing (< 30 days)'],
      }),
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          position: 'left',
          axisLabel: {
            formatter: '{value}%',
            fontSize: 11,
            color: grayColor,
            fontFamily: CHART_FONT,
          },
          splitLine: { lineStyle: { color: gridColor } },
          max: 0,
          min: -60,
        },
        {
          type: 'value',
          position: 'right',
          axisLabel: {
            fontSize: 11,
            color: grayColor,
            fontFamily: CHART_FONT,
            formatter: v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Drawdown from peak',
          type: 'line',
          yAxisIndex: 0,
          data: ddLine,
          showSymbol: false,
          lineStyle: { width: 0 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(207,19,34,0.18)' },
              { offset: 1, color: 'rgba(207,19,34,0.68)' },
            ]),
          },
          large: true,
          largeThreshold: 2000,
          z: 0,
        },
        {
          name: 'S&P 500',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          data: spLine,
          color: BLACK,
          lineStyle: { width: 1, color: BLACK },
          large: true,
          largeThreshold: 2000,
          z: 1,
        },
        {
          name: '30-day return: down',
          type: 'scatter',
          yAxisIndex: 1,
          data: scatterDown,
          color: RED,
          symbolSize: 7,
          itemStyle: { color: RED, opacity: 0.75 },
          z: 3,
        },
        {
          name: '30-day return: up',
          type: 'scatter',
          yAxisIndex: 1,
          data: scatterUp,
          color: GREEN,
          symbolSize: 6,
          itemStyle: { color: GREEN, opacity: 0.55 },
          z: 2,
        },
        {
          name: 'Observing (< 30 days)',
          type: 'scatter',
          yAxisIndex: 1,
          data: scatterPending,
          color: BLUE,
          symbolSize: 9,
          itemStyle: { color: BLUE, opacity: 0.85, borderColor: '#fff', borderWidth: 1 },
          z: 4,
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
          lineStyle: { type: 'dashed', color: grayColor, width: 1 },
          label: { show: false },
        },
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          if (!params?.length) return '';
          const date = params[0].axisValueLabel || '';
          const trig = params
            .filter(p => p.seriesType === 'scatter' && p.value && p.value[2])
            .map(p => p.value[2])[0];
          if (trig) {
            const lines = [
              `<b>${trig.date} · Hindenburg Omen triggered</b>`,
              `S&P 500 close: ${formatNumber(trig.spClose, 2)}`,
              `52-week new highs: <b>${trig.newHighsPct.toFixed(2)}%</b>`,
              `52-week new lows: <b>${trig.newLowsPct.toFixed(2)}%</b>`,
              `McClellan: <b style="color:${trig.mco < 0 ? RED : GREEN}">${trig.mco.toFixed(2)}</b>`,
            ];
            const fmtRet = v => {
              if (v == null) return '<span style="color:#999">observing</span>';
              const color = v >= 0 ? GREEN : RED;
              return `<b style="color:${color}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</b>`;
            };
            lines.push(`30-day return: ${fmtRet(trig.r30)}`);
            lines.push(`60-day return: ${fmtRet(trig.r60)}`);
            lines.push(`90-day return: ${fmtRet(trig.r90)}`);
            return lines.join('<br/>');
          }
          const sp = params.find(p => p.seriesName === 'S&P 500');
          const dd = params.find(p => p.seriesName === 'Drawdown from peak');
          const out = [date.slice(0, 10)];
          if (sp?.value) out.push(`S&P 500: <b>${formatNumber(sp.value[1], 2)}</b>`);
          if (dd?.value && dd.value[1] != null) {
            out.push(`Drawdown from peak: <b style="color:${RED}">${dd.value[1].toFixed(2)}%</b>`);
          }
          return out.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  const summaryId = 'chartHindenburgSummary';
  if (!document.getElementById(summaryId)) return;

  const isCluster = cur.clusterCount30d >= 3;
  const isFresh = cur.daysSinceLastTrigger != null && cur.daysSinceLastTrigger <= 30;
  const statusValue = cur.triggered
    ? '⚠️ Triggered today'
    : isCluster
      ? `⚠️ Signal cluster (${cur.clusterCount30d} in 30 days)`
      : isFresh
        ? `🟡 30-day signal window active`
        : '✓ No active signal';

  const lampHtml = (label, ok, val) => {
    const dot = ok
      ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${RED};margin-right:6px;vertical-align:middle"></span>`
      : `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${LIGHT_GRAY};margin-right:6px;vertical-align:middle"></span>`;
    return `${dot}${label}${val != null ? ` · <b>${val}</b>` : ''}`;
  };

  const condLine = [
    lampHtml('C1 trend > 50DMA', cur.c1),
    lampHtml('C2 new highs ≥ 2.2%', cur.c2, `${cur.newHighsPct?.toFixed(2)}% · ${cur.newHighsCount}/${cur.totalConstituents}`),
    lampHtml('C3 new lows ≥ 2.2%', cur.c3, `${cur.newLowsPct?.toFixed(2)}% · ${cur.newLowsCount}/${cur.totalConstituents}`),
    lampHtml('C4 highs ≤ 2× lows', cur.c4),
    lampHtml('C5 McClellan < 0', cur.c5, `${cur.mco?.toFixed(2)}`),
  ].join(' · ');

  const lampCardHtml = `
    <div class="metric-card" style="grid-template-columns: 1fr">
      <div style="font-size:13px;line-height:1.8;color:${cssVar('--text') || BLACK}">
        <div style="font-size:12px;color:${cssVar('--text-secondary') || GRAY};margin-bottom:4px">5 conditions as of ${cur.date}</div>
        ${condLine}
      </div>
    </div>
  `;

  renderMetricStrip(summaryId, [
    buildMetricCard(
      'Current status',
      statusValue,
      cur.lastTriggerDate
        ? `Last trigger ${cur.lastTriggerDate} (${cur.daysSinceLastTrigger} trading days ago) · ${cur.clusterCount90d} triggers in last 90 days`
        : 'No historical trigger',
    ),
    lampCardHtml,
  ]);

  const strip = document.getElementById(summaryId);
  if (strip) {
    const cards = strip.querySelectorAll('.metric-card');
    if (cards.length >= 2) {
      cards[1].outerHTML = lampCardHtml;
    }
  }
}
