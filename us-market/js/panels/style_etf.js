// ══════════════════════════════════════════════════════
// panels/style_etf.js · 美股主流风格 ETF 全景
// 数据源：data/style_etf.json（fetch_data.py → fetch_style_etf）
// 展示：近 10 年基期 100 归一（对数轴）+ 6 列指标表
// ══════════════════════════════════════════════════════

import { cssVar, escapeHtml, formatCompactNumber, formatPercent, CHART_FONT, AXIS_END_2028_TS } from '../utils.js';
import { registerChart, getDataZoom, buildSingleMarkPoint, resolveMarkPointOverlaps, getLineLegendConfig } from '../chart-helpers.js';

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

export function initPanelStyleEtf(data) {
  if (!data || !Array.isArray(data.tickers) || !data.tickers.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartStyleEtf')));

  function getOption() {
    const grayColor  = cssVar('--gray')  || '#999';
    const gridColor  = cssVar('--chart-grid') || '#f0f0f0';
    const mobile     = isMobile();

    const series = data.tickers.map((t, index) => {
      const seriesData = t.series.map(pt => [pt.date, pt.value]);
      const latest     = seriesData[seriesData.length - 1];
      const labelText  = `${t.name_zh} ${Math.round(latest[1])}`;

      return {
        name: `${t.name_zh}（${t.symbol}）`,
        type: 'line',
        showSymbol: false,
        clip: false,
        data: seriesData,
        color: t.color,
        itemStyle: { color: t.color },
        lineStyle: {
          width: t.dashed ? 1.6 : 1.6,
          color: t.color,
          type: t.dashed ? 'dashed' : 'solid',
        },
        markPoint: (!mobile && latest) ? {
          data: [buildSingleMarkPoint(latest[0], latest[1], labelText, t.color, 'right')],
        } : undefined,
        z: t.dashed ? 3 : 4,   // 让 SPY 参考线略靠后
      };
    });

    return {
      animation: false,
      grid: mobile
        ? { left: 52, right: 12, top: 20, bottom: 60 }
        : { left: 68, right: 92, top: 20, bottom: 60 },
      legend: getLineLegendConfig({
        type: 'scroll',
        top: 0,
      }),
      xAxis: {
        type: 'time',
        max: AXIS_END_2028_TS,
        axisLabel: { fontSize: mobile ? 10 : 11, color: grayColor, fontFamily: CHART_FONT, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'log',
        min: 80,
        axisLine: {
          show: true,
          lineStyle: { color: cssVar('--border') || '#d9d9d9', width: 1 },
        },
        axisLabel: {
          formatter: value => formatCompactNumber(value),
          fontSize: 11,
          color: grayColor,
          fontFamily: CHART_FONT,
        },
        splitLine: { lineStyle: { color: gridColor } },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: cssVar('--text') || '#1a1a1a', fontFamily: CHART_FONT },
        formatter: params => {
          const first = params[0];
          if (!first) return '';
          let html = escapeHtml(first.axisValueLabel);
          // 按当前净值从高到低排（便于扫读）
          const sorted = params.slice().sort((a, b) => b.value[1] - a.value[1]);
          sorted.forEach(item => {
            const val = item.value[1];
            const pct = ((val / (data.base || 100)) - 1) * 100;
            html += `<br/><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.color};margin-right:6px"></span>`
                 +  `${escapeHtml(item.seriesName)}: <b>${val.toFixed(1)}</b> `
                 +  `<span style="color:${cssVar('--text-secondary') || '#666'}">(${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)</span>`;
          });
          return html;
        },
      },
      dataZoom: getDataZoom(grayColor),
      series,
    };
  }

  const overlapOpts = { yAxis: 'log', chartHeight: 420, minGapPx: 18 };
  chart.setOption(resolveMarkPointOverlaps(getOption(), overlapOpts));
  chart._refreshTheme = () => chart.setOption(resolveMarkPointOverlaps(getOption(), overlapOpts), true);

  // ── 6 列指标表 ──
  renderStyleEtfTable(data);
  renderStyleEtfSummary(data);
}


function renderStyleEtfTable(data) {
  const tbody = document.getElementById('styleEtfTbody');
  if (!tbody) return;
  const greenColor = cssVar('--green') || '#389e0d';
  const redColor   = cssVar('--red')   || '#cf1322';

  // 按 CAGR 从高到低排（跟用户原表一致）
  const rows = data.tickers.slice().sort((a, b) => b.metrics.cagr_pct - a.metrics.cagr_pct);

  tbody.innerHTML = rows.map(t => {
    const m = t.metrics;
    const cagrColor = m.cagr_pct >= 0 ? greenColor : redColor;
    return `
      <tr>
        <td class="style-etf-name">
          <span class="style-etf-swatch" style="background:${t.color}${t.dashed ? ';border:1.5px dashed ' + t.color + ';background:transparent' : ''}"></span>
          <span class="style-etf-symbol">${escapeHtml(t.symbol)}</span>
          <span class="style-etf-cn">${escapeHtml(t.name_zh)}</span>
        </td>
        <td style="text-align:right;color:${cagrColor};font-weight:600">${m.cagr_pct.toFixed(1)}%</td>
        <td style="text-align:right;color:${redColor}">${m.max_dd_pct.toFixed(1)}%</td>
        <td style="text-align:right">${m.vol_pct.toFixed(1)}%</td>
        <td style="text-align:right;font-weight:600">${m.sharpe != null ? m.sharpe.toFixed(2) : '—'}</td>
        <td style="text-align:right;font-weight:600">${m.calmar != null ? m.calmar.toFixed(2) : '—'}</td>
      </tr>
    `;
  }).join('');
}


function renderStyleEtfSummary(data) {
  const el = document.getElementById('styleEtfSummary');
  if (!el) return;
  const sorted = data.tickers.slice().sort((a, b) => b.metrics.cagr_pct - a.metrics.cagr_pct);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spy   = data.tickers.find(t => t.symbol === 'SPY');
  const years = data.window_years || 10;

  const cell = (label, value, note) => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-note">${escapeHtml(note || '')}</div>
    </div>`;

  el.innerHTML = [
    cell('时间窗口', `${years} 年`, `${data.period_start} → ${data.period_end}`),
    cell('最强', `${escapeHtml(best.name_zh)} ${best.metrics.cagr_pct.toFixed(1)}%`, `${best.symbol} · 年化 · 全收益`),
    cell('最弱', `${escapeHtml(worst.name_zh)} ${worst.metrics.cagr_pct.toFixed(1)}%`, `${worst.symbol} · 年化 · 全收益`),
    cell('大盘参照', spy ? `SPY ${spy.metrics.cagr_pct.toFixed(1)}%` : '—', spy ? `MaxDD ${spy.metrics.max_dd_pct.toFixed(1)}% · 波动 ${spy.metrics.vol_pct.toFixed(1)}%` : ''),
  ].join('');
}


// ══════════════════════════════════════════════════════
// 面板 2：风险收益平面（散点 + 夏普等值线）
// X = 年化波动率(%) · Y = 年化收益率(%) · 灰色虚线 = 等 Sharpe 射线（斜率 = Sharpe）
// ══════════════════════════════════════════════════════

const ISO_SHARPE_LEVELS = [0.5, 0.75, 1.0, 1.25];

export function initPanelStyleEtfScatter(data) {
  if (!data || !Array.isArray(data.tickers) || !data.tickers.length) return;
  const chart = registerChart(echarts.init(document.getElementById('chartStyleEtfScatter')));

  // 计算坐标轴范围（留 20% 冗余）
  const maxVol  = Math.max(...data.tickers.map(t => t.metrics.vol_pct));
  const maxCagr = Math.max(...data.tickers.map(t => t.metrics.cagr_pct));
  const xMax    = Math.ceil(maxVol * 1.15 / 5) * 5;   // 圆到最近的 5
  const yMax    = Math.ceil(maxCagr * 1.15 / 5) * 5;

  function getOption() {
    const grayColor  = cssVar('--gray')       || '#999';
    const gridColor  = cssVar('--chart-grid') || '#f0f0f0';
    const textColor  = cssVar('--text')       || '#1a1a1a';
    const isoColor   = cssVar('--text-secondary') || '#999';

    // 等 Sharpe 射线：从 (0,0) 到 (x_end, x_end * sharpe)
    // 但如果 x_end * sharpe > yMax，就截断到 (yMax/sharpe, yMax)
    const isoSeries = ISO_SHARPE_LEVELS.map(sharpe => {
      const xEndRaw = xMax;
      const yAtXend = xEndRaw * sharpe;
      const [xEnd, yEnd] = yAtXend <= yMax
        ? [xEndRaw, yAtXend]
        : [yMax / sharpe, yMax];
      return {
        name: `Sharpe ${sharpe.toFixed(2)}`,
        type: 'line',
        showSymbol: false,
        silent: true,
        z: 1,
        data: [[0, 0], [xEnd, yEnd]],
        lineStyle: { color: isoColor, type: 'dashed', width: 1 },
        markPoint: {
          symbol: 'rect',
          symbolSize: [64, 20],
          itemStyle: { color: 'transparent' },
          data: [{
            coord: [xEnd, yEnd],
            label: {
              formatter: `Sharpe ${sharpe.toFixed(2)}`,
              color: isoColor,
              fontSize: 11,
              fontFamily: CHART_FONT,
              backgroundColor: cssVar('--bg') || '#fff',
              padding: [3, 5],
              borderRadius: 3,
            },
          }],
        },
      };
    });

    // 散点：每只 ETF 一个点，颜色沿用走势图
    // 左下密集区手动 offset：SCHD/VTV 波动率+CAGR 几乎相同，标签必须错开
    // 用 label.position + label.offset[dx,dy] 精调
    const LABEL_OVERRIDES = {
      SMH:  { position: 'right', offset: [0,  0] },
      XLK:  { position: 'right', offset: [0,  0] },
      QQQ:  { position: 'right', offset: [0, -2] },
      SPMO: { position: 'left',  offset: [-4, 8] },   // 左下避开 QQQ 标签
      SPY:  { position: 'top',   offset: [8, -4] },   // 顶部
      QUAL: { position: 'right', offset: [4,  4] },   // 右下避开 SPY
      VTV:  { position: 'left',  offset: [-4, 0] },   // 左侧（跟 SCHD 错开）
      SCHD: { position: 'right', offset: [4,  0] },   // 右侧
      USMV: { position: 'bottom', offset: [0, 4] },
    };
    const scatterData = data.tickers.map(t => {
      const lbl = LABEL_OVERRIDES[t.symbol] || { position: 'right', offset: [0, 0] };
      return {
        value: [t.metrics.vol_pct, t.metrics.cagr_pct],
        itemStyle: { color: t.color, borderColor: '#fff', borderWidth: 2 },
        label: { position: lbl.position, offset: lbl.offset },
        meta: t,
      };
    });

    return {
      animation: false,
      grid: { left: 60, right: 40, top: 30, bottom: 60 },
      tooltip: {
        trigger: 'item',
        backgroundColor: cssVar('--card-bg') || '#fff',
        borderColor: cssVar('--border') || '#e8e8e8',
        textStyle: { fontSize: 13, color: textColor, fontFamily: CHART_FONT },
        formatter: params => {
          if (params.seriesType !== 'scatter') return '';
          const t = params.data.meta;
          const m = t.metrics;
          return [
            `<b>${escapeHtml(t.name_zh)}（${escapeHtml(t.symbol)}）</b>`,
            `年化收益: <b>${m.cagr_pct.toFixed(1)}%</b>`,
            `波动率: <b>${m.vol_pct.toFixed(1)}%</b>`,
            `夏普比: <b>${m.sharpe != null ? m.sharpe.toFixed(2) : '—'}</b>`,
            `最大回撤: <b>${m.max_dd_pct.toFixed(1)}%</b>`,
            `卡玛比: <b>${m.calmar != null ? m.calmar.toFixed(2) : '—'}</b>`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        name: '年化波动率 (%)',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { color: textColor, fontSize: 12, fontFamily: CHART_FONT, fontWeight: 600 },
        min: 0,
        max: xMax,
        axisLine: { show: true, lineStyle: { color: cssVar('--border') || '#d9d9d9' } },
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, formatter: v => `${v}%` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: '年化收益率 (%)',
        nameLocation: 'middle',
        nameGap: 42,
        nameTextStyle: { color: textColor, fontSize: 12, fontFamily: CHART_FONT, fontWeight: 600 },
        min: 0,
        max: yMax,
        axisLine: { show: true, lineStyle: { color: cssVar('--border') || '#d9d9d9' } },
        axisLabel: { fontSize: 11, color: grayColor, fontFamily: CHART_FONT, formatter: v => `${v}%` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        // 等 Sharpe 射线（灰虚线）
        ...isoSeries,
        // 9 个 ETF 散点
        {
          name: 'ETF',
          type: 'scatter',
          symbolSize: 22,
          z: 5,
          data: scatterData,
          label: {
            show: true,
            position: 'right',
            distance: 8,
            formatter: params => {
              const t = params.data.meta;
              return `${t.symbol} ${t.metrics.cagr_pct.toFixed(1)}%`;
            },
            color: textColor,
            fontSize: 12,
            fontFamily: CHART_FONT,
            fontWeight: 600,
          },
          emphasis: {
            focus: 'self',
            scale: 1.2,
          },
        },
      ],
    };
  }

  chart.setOption(getOption());
  chart._refreshTheme = () => chart.setOption(getOption(), true);

  renderStyleEtfScatterSummary(data);
}


function renderStyleEtfScatterSummary(data) {
  const el = document.getElementById('styleEtfScatterSummary');
  if (!el) return;

  const withSharpe = data.tickers.filter(t => t.metrics.sharpe != null);
  const bestSharpe = withSharpe.slice().sort((a, b) => b.metrics.sharpe - a.metrics.sharpe)[0];
  const worstSharpe = withSharpe.slice().sort((a, b) => a.metrics.sharpe - b.metrics.sharpe)[0];
  const highVol = data.tickers.slice().sort((a, b) => b.metrics.vol_pct - a.metrics.vol_pct)[0];
  const lowVol  = data.tickers.slice().sort((a, b) => a.metrics.vol_pct - b.metrics.vol_pct)[0];

  const cell = (label, value, note) => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-note">${escapeHtml(note || '')}</div>
    </div>`;

  el.innerHTML = [
    cell('最高夏普', `${escapeHtml(bestSharpe.name_zh)} ${bestSharpe.metrics.sharpe.toFixed(2)}`, `${bestSharpe.symbol} · 年化 ${bestSharpe.metrics.cagr_pct.toFixed(1)}% / 波动 ${bestSharpe.metrics.vol_pct.toFixed(1)}%`),
    cell('最低夏普', `${escapeHtml(worstSharpe.name_zh)} ${worstSharpe.metrics.sharpe.toFixed(2)}`, `${worstSharpe.symbol} · 年化 ${worstSharpe.metrics.cagr_pct.toFixed(1)}% / 波动 ${worstSharpe.metrics.vol_pct.toFixed(1)}%`),
    cell('波动最大', `${escapeHtml(highVol.name_zh)} ${highVol.metrics.vol_pct.toFixed(1)}%`, `${highVol.symbol} · 年化 ${highVol.metrics.cagr_pct.toFixed(1)}%`),
    cell('波动最小', `${escapeHtml(lowVol.name_zh)} ${lowVol.metrics.vol_pct.toFixed(1)}%`, `${lowVol.symbol} · 年化 ${lowVol.metrics.cagr_pct.toFixed(1)}%`),
  ].join('');
}
