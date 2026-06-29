// panels/hindenburg.js · 兴登堡预兆指标面板
//
// SP500 适配版兴登堡预兆（Hindenburg Omen），5 条件同日触发：
//   C1: SP500 > 50 日均线（市场仍在上行）
//   C2: 52 周新高占比 ≥ 2.2%
//   C3: 52 周新低占比 ≥ 2.2%
//   C4: 新高数 ≤ 2 × 新低数（避免单边强势误报）
//   C5: McClellan Oscillator < 0
//
// 数据回测 1963 年至今：触发后 30/60/90 日 SP500 中位回报对比市场基线。
// 数据源：data/sp500_hindenburg.json（fetch_sp500_hindenburg in fetch_data.py）

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

  // SP500 价格 + 自高点回撤序列（按触发时间窗截取，1963 之后）
  const startDate = hindData.historyStart || '1963-01-01';
  const slicedPrice = priceData.series.filter(p => p.date >= startDate);
  const spLine = slicedPrice.map(p => [p.date, p.close]);
  const ddLine = slicedPrice.map(p => [p.date, +(p.drawdown * 100).toFixed(2)]);

  // 触发日 → 散点（按 30 天后回报上色）
  const triggers = hindData.triggers || [];
  const scatterUp = [];      // 触发后 30 日涨
  const scatterDown = [];    // 触发后 30 日跌
  const scatterPending = []; // 触发后不到 30 日
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
        data: ['自高点回撤', '标普500', '触发后 30 日下跌', '触发后 30 日上涨', '观察中（< 30 日）'],
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
          name: '自高点回撤',
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
          name: '标普500',
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
          name: '触发后 30 日下跌',
          type: 'scatter',
          yAxisIndex: 1,
          data: scatterDown,
          color: RED,
          symbolSize: 7,
          itemStyle: { color: RED, opacity: 0.75 },
          z: 3,
        },
        {
          name: '触发后 30 日上涨',
          type: 'scatter',
          yAxisIndex: 1,
          data: scatterUp,
          color: GREEN,
          symbolSize: 6,
          itemStyle: { color: GREEN, opacity: 0.55 },
          z: 2,
        },
        {
          name: '观察中（< 30 日）',
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
          // 当日是否有触发（散点）
          const trig = params
            .filter(p => p.seriesType === 'scatter' && p.value && p.value[2])
            .map(p => p.value[2])[0];
          if (trig) {
            const lines = [
              `<b>${trig.date} · 兴登堡预兆触发</b>`,
              `标普500 收盘: ${formatNumber(trig.spClose, 2)}`,
              `52 周新高占比: <b>${trig.newHighsPct.toFixed(2)}%</b>`,
              `52 周新低占比: <b>${trig.newLowsPct.toFixed(2)}%</b>`,
              `McClellan: <b style="color:${trig.mco < 0 ? RED : GREEN}">${trig.mco.toFixed(2)}</b>`,
            ];
            const fmtRet = v => {
              if (v == null) return '<span style="color:#999">观察中</span>';
              const color = v >= 0 ? GREEN : RED;
              return `<b style="color:${color}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</b>`;
            };
            lines.push(`触发后 30 日: ${fmtRet(trig.r30)}`);
            lines.push(`触发后 60 日: ${fmtRet(trig.r60)}`);
            lines.push(`触发后 90 日: ${fmtRet(trig.r90)}`);
            return lines.join('<br/>');
          }
          // 普通日：显示 SP500 + 回撤
          const sp = params.find(p => p.seriesName === '标普500');
          const dd = params.find(p => p.seriesName === '自高点回撤');
          const out = [date.slice(0, 10)];
          if (sp?.value) out.push(`标普500: <b>${formatNumber(sp.value[1], 2)}</b>`);
          if (dd?.value && dd.value[1] != null) {
            out.push(`自高点回撤: <b style="color:${RED}">${dd.value[1].toFixed(2)}%</b>`);
          }
          return out.join('<br/>');
        },
      },
      dataZoom: getDataZoom(grayColor),
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  // ── Metric strip ──
  const summaryId = 'chartHindenburgSummary';
  if (!document.getElementById(summaryId)) return;

  // 总状态判断
  const isCluster = cur.clusterCount30d >= 3;
  const isFresh = cur.daysSinceLastTrigger != null && cur.daysSinceLastTrigger <= 30;
  const statusValue = cur.triggered
    ? '⚠️ 当日触发'
    : isCluster
      ? `⚠️ 信号集群（30 日 ${cur.clusterCount30d} 次）`
      : isFresh
        ? `🟡 30 日激活期内`
        : '✓ 无信号';
  const statusColor = cur.triggered || isCluster ? RED : isFresh ? '#d48806' : GREEN;

  // 条件灯
  const lampHtml = (label, ok, val) => {
    const dot = ok
      ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${RED};margin-right:6px;vertical-align:middle"></span>`
      : `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${LIGHT_GRAY};margin-right:6px;vertical-align:middle"></span>`;
    return `${dot}${label}${val != null ? ` · <b>${val}</b>` : ''}`;
  };

  const condLine = [
    lampHtml('C1 趋势>50DMA', cur.c1),
    lampHtml('C2 新高 ≥ 2.2%', cur.c2, `${cur.newHighsPct?.toFixed(2)}% · ${cur.newHighsCount}/${cur.totalConstituents}`),
    lampHtml('C3 新低 ≥ 2.2%', cur.c3, `${cur.newLowsPct?.toFixed(2)}% · ${cur.newLowsCount}/${cur.totalConstituents}`),
    lampHtml('C4 新高 ≤ 2×新低', cur.c4),
    lampHtml('C5 McClellan < 0', cur.c5, `${cur.mco?.toFixed(2)}`),
  ].join(' · ');

  // metric-card 的 escapeHtml 会把 HTML 转义掉，所以条件灯单独做一个 raw HTML 行
  const lampCardHtml = `
    <div class="metric-card" style="grid-template-columns: 1fr">
      <div style="font-size:13px;line-height:1.8;color:${textColorOr(cssVar('--text'), BLACK)}">
        <div style="font-size:12px;color:${cssVar('--text-secondary') || GRAY};margin-bottom:4px">5 个条件当日状态（${cur.date}）</div>
        ${condLine}
      </div>
    </div>
  `;

  renderMetricStrip(summaryId, [
    buildMetricCard(
      '当前状态',
      statusValue,
      cur.lastTriggerDate
        ? `上次触发 ${cur.lastTriggerDate}（距今 ${cur.daysSinceLastTrigger} 个交易日）· 90 日内累计 ${cur.clusterCount90d} 次`
        : '历史无触发',
    ),
    lampCardHtml,
  ]);

  // 因为 buildMetricCard 会 escapeHtml note，导致条件灯的 HTML 被转义。
  // 用 innerHTML 替换直接拼好的卡片。
  const strip = document.getElementById(summaryId);
  if (strip) {
    const cards = strip.querySelectorAll('.metric-card');
    // 第 2 张卡（index 1）就是 lampCardHtml，渲染后被 escapeHtml 破坏，需要还原
    if (cards.length >= 2) {
      cards[1].outerHTML = lampCardHtml;
    }
  }
}

function textColorOr(val, fallback) {
  return val || fallback;
}
