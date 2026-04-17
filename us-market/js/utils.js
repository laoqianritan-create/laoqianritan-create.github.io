// ══════════════════════════════════════════════════════
// utils.js · 基础工具：数据获取、格式化、HTML 转义、通用常量
// 不依赖 echarts
// ══════════════════════════════════════════════════════

export const CHART_FONT = '"Inter", -apple-system, "PingFang SC", sans-serif';
export const DATA_VERSION = Date.now();
export const AXIS_END_2028_TS = new Date('2028-12-31').getTime();

export function fetchJSON(url) {
  const sep = url.includes('?') ? '&' : '?';
  return fetch(`${url}${sep}v=${DATA_VERSION}`).then(response => {
    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status}`);
    }
    return response.json();
  });
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function getCurrentPageUrl() {
  const { origin, pathname } = window.location;
  if (!origin || origin === 'null') {
    return pathname || '/site/index.html';
  }
  return `${origin}${pathname}`;
}

export function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatCompactNumber(value) {
  return Number(value).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// 5 年滚动年化收益率：不依赖 echarts，算出来给多个面板复用
export function buildRollingAnnualizedSeries(sourceSeries, windowYears = 5) {
  const validSeries = (sourceSeries || []).filter(item => item?.value != null && item.value > 0);
  const windowSize = windowYears * 12;
  const rolling = [];

  if (validSeries.length <= windowSize) {
    return {
      updated: null,
      latest: null,
      average: null,
      negativePercent: null,
      series: rolling,
    };
  }

  for (let index = windowSize; index < validSeries.length; index += 1) {
    const start = validSeries[index - windowSize];
    const end = validSeries[index];
    if (!start?.value || !end?.value) {
      continue;
    }
    const annualized = (Math.pow(end.value / start.value, 1 / windowYears) - 1) * 100;
    rolling.push({
      date: end.date,
      value: Number(annualized.toFixed(2)),
      startDate: start.date,
      startPrice: start.value,
      endPrice: end.value,
    });
  }

  const average = rolling.reduce((sum, item) => sum + item.value, 0) / Math.max(rolling.length, 1);
  const negativePercent = rolling.filter(item => item.value < 0).length / Math.max(rolling.length, 1) * 100;

  return {
    updated: rolling.at(-1)?.date ?? null,
    latest: rolling.at(-1) ?? null,
    average: Number(average.toFixed(2)),
    negativePercent: Number(negativePercent.toFixed(1)),
    series: rolling,
  };
}

// 12 个月滚动回撤序列：(P_t − max(P_{t-12..t-1})) / max(P_{t-12..t-1})
// 2026-04-17 从同比改为"相对过去 12 月最高点的涨跌"：同比 (YoY) 对于 V 形崩盘（如 2020-03）只显示 -8.8%
// 严重低估熊市幅度；改后 2020-03 约 -20%，1932-06 仍约 -70%，与"牛熊周期"名称匹配。
// 正值 = 创过去 12 月新高（上涨周期），负值 = 回撤中（下跌周期），深度反映熊市幅度。
// 函数名保留 buildLogYoySeries 避免跨文件改导入。
export function buildLogYoySeries(rawSeries) {
  const byMonth = new Map();
  for (const item of rawSeries || []) {
    if (!item?.date || !(item.value > 0)) continue;
    byMonth.set(item.date.slice(0, 7), item);
  }
  const ordered = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
  const result = [];
  for (const item of ordered) {
    const d = new Date(item.date);
    if (isNaN(d.getTime())) continue;
    // 扫描过去 12 个月（不含当月）的最高收盘
    let peak = null;
    for (let k = 1; k <= 12; k++) {
      const pd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1));
      const pym = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, '0')}`;
      const prev = byMonth.get(pym);
      if (prev && prev.value > 0 && (peak == null || prev.value > peak)) {
        peak = prev.value;
      }
    }
    if (peak == null) continue;
    result.push({
      date: item.date,
      value: (item.value - peak) / peak,
      now: item.value,
      prev: peak,
    });
  }
  return result;
}
