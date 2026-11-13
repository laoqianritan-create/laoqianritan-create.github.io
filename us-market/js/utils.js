// ══════════════════════════════════════════════════════
// utils.js · 基础工具：数据获取、格式化、HTML 转义、通用常量
// 不依赖 echarts
// ══════════════════════════════════════════════════════

export const CHART_FONT = '"Inter", -apple-system, "PingFang SC", sans-serif';
export const DATA_VERSION = '__BUILD__';
export const AXIS_END_2028_TS = new Date('2028-12-31').getTime();

// X 轴右端＝「下一个自然年年末」（t+1 年 12 月 31 日），不写死年份：
// 2026-11 打开 → 2027-12-31；2027-01 打开 → 2028-12-31。
export function getAxisEndNextYearTS(now = new Date()) {
  return new Date(now.getFullYear() + 1, 11, 31).getTime();
}

// 自然季度刻度：每年 1/4/7/10 月 1 日里落在 (startTS, endTS] 的全部时间戳，供纵向参考线使用。
export function buildQuarterTicks(startTS, endTS) {
  const ticks = [];
  const startYear = new Date(startTS).getFullYear();
  const endYear = new Date(endTS).getFullYear();
  for (let year = startYear; year <= endYear; year++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const ts = new Date(year, quarter * 3, 1).getTime();
      if (ts > startTS && ts <= endTS) ticks.push(ts);
    }
  }
  return ticks;
}


const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRIES = 2;
const _jsonMemo = new Map(); // 规范化 URL → Promise，供 hero-curve 与 panels 共用同一次拉取

/** 已带 ?v=（部署时 stamp_cache_bust 打上的构建戳）则不再追加，避免 &v=Date.now() 双戳。 */
export function cacheBustedUrl(url) {
  if (/[?&]v=/.test(url)) return url;
  if (!DATA_VERSION || DATA_VERSION === '__BUILD__') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${DATA_VERSION}`;
}

function memoKey(url) {
  return String(url).replace(/[?&]v=[^&]*/g, '').replace(/[?&]$/, '').replace(/\?&/, '?');
}

/**
 * 拉取 JSON：默认 15s 超时（AbortController），失败后指数退避重试 2 次（1s、2s）。
 * 同一数据文件的并发请求共用一个 Promise。失败不留 memo，便于面板「点击重试」。
 * opts.cache 传给 fetch（如 freshness 调用方可继续 'no-store'）；opts.memo=false 关闭共用。
 */
export function fetchJSON(url, opts = {}) {
  const timeout = opts.timeout ?? FETCH_TIMEOUT_MS;
  const retries = opts.retries ?? FETCH_RETRIES;
  const memo = opts.memo !== false;
  const key = memoKey(url);
  if (memo && _jsonMemo.has(key)) return _jsonMemo.get(key);

  const finalUrl = cacheBustedUrl(url);

  async function attempt(remaining) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const fetchOpts = { signal: ctrl.signal };
      if (opts.cache) fetchOpts.cache = opts.cache;
      const response = await fetch(finalUrl, fetchOpts);
      if (!response.ok) {
        throw new Error(`${url} -> HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (remaining > 0) {
        const tried = retries - remaining + 1;
        const delay = 1000 * Math.pow(2, tried - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return attempt(remaining - 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const pending = attempt(retries);
  if (memo) {
    _jsonMemo.set(key, pending);
    pending.catch(() => { _jsonMemo.delete(key); });
  }
  return pending;
}

export function clearFetchJSON(url) {
  if (url) _jsonMemo.delete(memoKey(url));
  else _jsonMemo.clear();
}

export function isEnglishUI() {
  return (document.documentElement.lang || '').toLowerCase().startsWith('en');
}

export function loadUiText(kind) {
  const en = isEnglishUI();
  if (kind === 'loading') return en ? 'Loading…' : '加载中…';
  if (kind === 'data-fail') return en ? 'Failed to load data, click to retry' : '数据加载失败，点击重试';
  if (kind === 'echarts-fail') return en ? 'Chart library failed to load.' : '图表库加载失败。';
  if (kind === 'refresh') return en ? 'Refresh' : '刷新';
  return '';
}

/** 在图表容器里显示加载 / 失败 / 图表库缺失。kind: 'loading' | 'data-fail' | 'echarts-fail' */
export function fillChartMessage(el, kind, onRetry) {
  if (!el) return;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'chart-load-msg';
  wrap.setAttribute('data-kind', kind);
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:160px;color:#4A4944;font-size:14px;gap:12px;text-align:center;padding:16px;box-sizing:border-box;font-family:Inter,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';
  if (kind === 'loading') {
    const p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = loadUiText('loading');
    wrap.appendChild(p);
  } else if (kind === 'data-fail') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = loadUiText('data-fail');
    btn.style.cssText = 'cursor:pointer;background:#1C1C1A;color:#FAF9F6;border:0;border-radius:6px;padding:8px 16px;font-size:14px;font-family:inherit;';
    btn.addEventListener('click', onRetry);
    wrap.appendChild(btn);
  } else if (kind === 'echarts-fail') {
    const p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = loadUiText('echarts-fail');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = loadUiText('refresh');
    btn.style.cssText = 'cursor:pointer;background:#1C1C1A;color:#FAF9F6;border:0;border-radius:6px;padding:8px 16px;font-size:14px;font-family:inherit;';
    btn.addEventListener('click', () => location.reload());
    wrap.appendChild(p);
    wrap.appendChild(btn);
  }
  el.appendChild(wrap);
}

export function panelChartHosts(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return [];
  return Array.from(panel.querySelectorAll('.chart-container'));
}

export function waitForEcharts(timeoutMs = 15000) {
  if (typeof echarts !== 'undefined') return Promise.resolve();
  const ready = window.__echartsReady;
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('echarts timeout')), timeoutMs);
  });
  if (ready && typeof ready.then === 'function') {
    return Promise.race([ready, timeout]).then(() => {
      if (typeof echarts === 'undefined') throw new Error('echarts missing');
    });
  }
  return Promise.reject(new Error('echarts missing'));
}

export function showEchartsPageFailure() {
  document.querySelectorAll('.chart-container').forEach((el) => {
    fillChartMessage(el, 'echarts-fail');
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
