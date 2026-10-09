// panels/sector_rs.js · 标普500子行业 / 标普500 相对强弱（11 个一级行业 ÷ 标普，相对强弱指数）
// 数据：站内 sp500_sector_rs.json（11 只 SPDR vs SPY，全收益累计比 ×100，周频）+ sp500_sectors.json（11 色色板）。
// 口径：相对强弱 = 行业累计 ÷ SPY 累计 × 100，2018-06 基期 ≈100；100 = 与标普同步。
// 交互（2026-10-09 老钱二轮反馈）：自绘图例——每项前一个方块，勾选＝✓（曲线正常展示）；未勾选的行业曲线
// 仍显示但全半透明、图例也带色半透明；可同时勾选多个；初始只有信息技术带 ✓ 全显、其余全部半透明。

import { CHART_FONT, cssVar, formatNumber } from '../utils.js?v=20261009151816';
import {
  registerChart,
  buildMetricCard,
  renderMetricStrip,
  getDataZoom,
} from '../chart-helpers.js?v=20261009151816';

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

  // 勾选状态：初始只有第一个行业（信息技术）带 ✓
  const checked = new Set([series[0].zh]);
  const opacityPatch = () => series.map(s => ({
    name: s.zh,
    lineStyle: { opacity: checked.has(s.zh) ? ON_OPACITY : OFF_OPACITY },
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
          name: s.zh,
          type: 'line',
          data: s.points,
          showSymbol: false,
          lineStyle: { width: 2, color: sectorColor(s.zh), opacity: checked.has(s.zh) ? ON_OPACITY : OFF_OPACITY },
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
          name: '同步线',
          type: 'line',
          data: [],
          tooltip: { show: false },
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

  // ── 自绘勾选图例（ECharts 图例无法画 ✓，改为前置 DOM 图例）──
  function renderLegend() {
    let box = document.getElementById('sectorRsLegend');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sectorRsLegend';
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 10px;margin:0 0 6px;align-items:center;';
      dom.parentNode.insertBefore(box, dom);
    }
    box.innerHTML = series.map(s => {
      const on = checked.has(s.zh);
      const c = sectorColor(s.zh);
      return `<button type="button" data-name="${s.zh}" style="display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;padding:2px 4px;cursor:pointer;font-size:12px;font-family:inherit;opacity:${on ? 1 : 0.55};">
        <span style="width:13px;height:13px;box-sizing:border-box;border:1.5px solid ${c};border-radius:3px;background:${on ? c : 'transparent'};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;line-height:1;">${on ? '✓' : ''}</span>
        <span style="color:${subColor};">${s.zh}</span></button>`;
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

  renderMetricStrip('sectorRsSummary', [
    buildMetricCard('累计最强', `${top.zh} ${formatNumber(top.v, 1)}`, `基期 2018-06 ＝ 100 · 截至 ${top.last}`),
    buildMetricCard('累计最弱', `${bottom.zh} ${formatNumber(bottom.v, 1)}`, '＜100 ＝ 长期跑输标普'),
    buildMetricCard('近 1 年第一', yoy[0] ? `${yoy[0].zh} ${formatNumber(yoy[0].chg * 100, 1)}%` : '—', '相对强弱指数近 12 个月变化'),
    buildMetricCard('近 1 年倒数第一', yoy[yoy.length - 1] ? `${yoy[yoy.length - 1].zh} ${formatNumber(yoy[yoy.length - 1].chg * 100, 1)}%` : '—', '同口径'),
    buildMetricCard('口径', '11 只 SPDR ETF ÷ SPY', '全收益累计比 ×100、周频；原图为 LSEG 行业指数 ÷ 标普（1990 起），免费源 ETF 起点 2018'),
  ]);
}
