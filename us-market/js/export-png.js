// ══════════════════════════════════════════════════════
// export-png.js · 图表 / 表格导出为高清 PNG
// 标题 + 描述（panel-desc）+ 日期 + 内容居中 + footer URL 水印
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js';
import { chartInstances } from './chart-helpers.js';

const EXPORT_W = 3300;
const PAD = 80;                    // 两侧留白
const TITLE_SIZE = 56;
const DATE_SIZE = 30;
const DESC_SIZE = 28;
const DESC_LINE_GAP = 14;          // 行间距
const FOOTER_SIZE = 28;
const FONT = '"Inter", "PingFang SC", sans-serif';

// 把多段文字按宽度换行，返回行数组（中文按字符断，英文按词断）
function wrapDescLines(descs, maxWidth, fontSize) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${fontSize}px ${FONT}`;
  const lines = [];
  descs.forEach((desc, i) => {
    if (!desc) return;
    let buf = '';
    for (const ch of desc) {
      const test = buf + ch;
      if (ctx.measureText(test).width > maxWidth && buf) {
        lines.push(buf);
        buf = ch;
      } else {
        buf = test;
      }
    }
    if (buf) lines.push(buf);
    if (i < descs.length - 1) lines.push('');  // 段落空行
  });
  return lines;
}

// 从 panel 抽出标题 + 所有 .panel-desc 文本 + metric-strip 数据
function getPanelMeta(panelEl) {
  if (!panelEl) return { title: 'Big Picture', descs: [], stats: [] };
  const title = panelEl.querySelector('.panel-title')?.textContent.trim() || 'Big Picture';
  const descs = [...panelEl.querySelectorAll('.panel-desc')]
    .map(p => p.innerText.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const stats = [...panelEl.querySelectorAll('.metric-card')]
    .map(card => {
      const label = card.querySelector('.metric-label')?.textContent.trim() || '';
      const value = card.querySelector('.metric-value')?.textContent.trim() || '';
      const note  = card.querySelector('.metric-note')?.textContent.trim()  || '';
      const head  = [label, value].filter(Boolean).join('  ');
      return note ? `${head}    ${note}` : head;
    })
    .filter(Boolean);
  return { title, descs, stats };
}

// 找到底部"说明表格"类型的附加元素（VXN 五档解读表、其他未来 panel-explainer 等）
// 导出 PNG 时把这些元素也渲染进画布底部
function getPanelExtras(panelEl) {
  if (!panelEl) return [];
  const selectors = [
    '.vxn-explainer',          // VXN 五档解读表
    '.panel-explainer',        // 未来通用 explainer 容器
    '.drawdown-table-wrap',    // 回撤事件表（chart 导出时一并带上）
  ];
  const seen = new Set();
  const extras = [];
  selectors.forEach(sel => {
    panelEl.querySelectorAll(sel).forEach(el => {
      if (!seen.has(el)) { seen.add(el); extras.push(el); }
    });
  });
  return extras;
}

// 把 HTML 元素渲染成 canvas（统一 html2canvas 入口，供 extras / element 两条路径复用）
async function renderElementToImage(element) {
  const h2c = await loadHtml2Canvas();
  const bg = cssVar('--bg') || '#fff';
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: 4,
    useCORS: true,
    windowWidth: 1600,
    windowHeight: Math.max(element.scrollHeight, 900),
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.src = sourceCanvas.toDataURL('image/png');
    i.onload = () => resolve(i);
    i.onerror = reject;
  });
  return { img, naturalW: sourceCanvas.width, naturalH: sourceCanvas.height };
}

// 用 contentImg + meta 拼最终图，落盘
// extraImages: [{ img, naturalW, naturalH }, ...] 可选；会等比缩放后堆叠到 stats 之下
function buildFrameAndDownload(contentImg, contentNaturalW, contentNaturalH, meta, extraImages = []) {
  const bg = cssVar('--bg') || '#fff';
  const textColor = cssVar('--text') || '#1a1a1a';
  const grayColor = cssVar('--gray') || '#999';

  const contentMaxW = EXPORT_W - PAD * 2;
  // 不放大、只缩小：natural < max 时保持原尺寸居中
  const contentW = Math.min(contentMaxW, contentNaturalW);
  const contentH = Math.round(contentW * (contentNaturalH / contentNaturalW));

  // 估算标题字号（自适应缩小如果超宽）
  const ctxMeasure = document.createElement('canvas').getContext('2d');
  let titleFontSize = TITLE_SIZE;
  ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
  while (ctxMeasure.measureText(meta.title).width > contentMaxW && titleFontSize > 32) {
    titleFontSize -= 2;
    ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
  }

  const descLines = wrapDescLines(meta.descs, contentMaxW, DESC_SIZE);
  const descLineH = DESC_SIZE + DESC_LINE_GAP;
  const descBlockH = descLines.length * descLineH;

  // metric-strip 统计数据（图表下方）
  const statsLines = (meta.stats?.length > 0)
    ? wrapDescLines(meta.stats, contentMaxW, DESC_SIZE)
    : [];
  const statsBlockH = statsLines.length > 0 ? 32 + statsLines.length * descLineH : 0;

  // 预计算 extras 缩放后高度
  const extrasLayout = extraImages.map(ex => {
    const w = Math.min(contentMaxW, ex.naturalW);
    const h = Math.round(w * (ex.naturalH / ex.naturalW));
    return { ...ex, w, h };
  });
  const extrasGap = 40; // 每个 extra 之间 + 与 stats 之间的间距
  const extrasBlockH = extrasLayout.reduce((sum, ex) => sum + ex.h + extrasGap, 0);

  const headerH = PAD                  // 顶部留白
    + titleFontSize + 18               // 标题
    + DATE_SIZE + 30                   // 日期
    + descBlockH                       // 描述块
    + 36;                              // 描述与内容间隔
  const footerH = FOOTER_SIZE + 28 + 24; // footer
  const exportH = headerH + contentH + statsBlockH + extrasBlockH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXPORT_W, exportH);

  let y = PAD;
  // 标题
  ctx.fillStyle = textColor;
  ctx.font = `bold ${titleFontSize}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(meta.title, PAD, y + titleFontSize * 0.85);
  y += titleFontSize + 18;
  // 日期
  ctx.fillStyle = grayColor;
  ctx.font = `${DATE_SIZE}px ${FONT}`;
  ctx.fillText(new Date().toISOString().substring(0, 10), PAD, y + DATE_SIZE * 0.85);
  y += DATE_SIZE + 30;
  // 描述
  ctx.fillStyle = grayColor;
  ctx.font = `${DESC_SIZE}px ${FONT}`;
  for (const line of descLines) {
    if (line) ctx.fillText(line, PAD, y + DESC_SIZE * 0.85);
    y += descLineH;
  }
  y += 36;
  // 内容居中绘制
  const contentX = (EXPORT_W - contentW) / 2;
  ctx.drawImage(contentImg, contentX, y, contentW, contentH);
  y += contentH;

  // metric-strip 统计数据
  if (statsLines.length > 0) {
    y += 32;
    ctx.fillStyle = grayColor;
    ctx.font = `${DESC_SIZE}px ${FONT}`;
    for (const line of statsLines) {
      if (line) ctx.fillText(line, PAD, y + DESC_SIZE * 0.85);
      y += descLineH;
    }
  }

  // 附加元素（底部说明表格等）
  for (const ex of extrasLayout) {
    y += extrasGap;
    const exX = (EXPORT_W - ex.w) / 2;
    ctx.drawImage(ex.img, exX, y, ex.w, ex.h);
    y += ex.h;
  }

  // Footer
  ctx.textAlign = 'right';
  ctx.fillStyle = grayColor;
  ctx.font = `${FOOTER_SIZE}px ${FONT}`;
  ctx.fillText(getCurrentPageUrl(), EXPORT_W - PAD, exportH - 24);
  ctx.textAlign = 'left';

  const link = document.createElement('a');
  link.download = (meta.title || 'Big Picture').replace(/[\/\\:*?"<>|]/g, '_') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function exportChartAsPng(chartInstance, panelEl) {
  const chartImg = await new Promise((resolve, reject) => {
    const img = new Image();
    img.src = chartInstance.getDataURL({
      type: 'png',
      pixelRatio: 5,
      backgroundColor: cssVar('--bg') || '#fff',
      excludeComponents: ['toolbox'],
    });
    img.onload = () => resolve(img);
    img.onerror = reject;
  });

  // 收集底部附加说明元素（VXN 解读表、回撤事件表等），依次 html2canvas 渲染
  let extras = [];
  const extraEls = getPanelExtras(panelEl);
  for (const el of extraEls) {
    try {
      extras.push(await renderElementToImage(el));
    } catch (err) {
      console.warn('附加元素渲染失败，跳过', el, err);
    }
  }

  buildFrameAndDownload(chartImg, chartImg.naturalWidth, chartImg.naturalHeight, getPanelMeta(panelEl), extras);
}

// ── HTML 元素（表格类面板）→ PNG ──
let html2canvasPromise = null;
function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = () => resolve(window.html2canvas);
      s.onerror = e => reject(new Error('html2canvas 加载失败'));
      document.head.appendChild(s);
    });
  }
  return html2canvasPromise;
}

export async function exportElementAsPng(element, panelEl) {
  if (!element) return;
  let h2c;
  try {
    h2c = await loadHtml2Canvas();
  } catch (e) {
    console.error(e);
    alert('导出工具加载失败，请检查网络');
    return;
  }
  const bg = cssVar('--bg') || '#fff';
  // windowWidth=1600 强制以 desktop 视口渲染，避免 mobile 单列布局产出超长 PNG
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: 4,
    useCORS: true,
    windowWidth: 1600,
    windowHeight: Math.max(element.scrollHeight, 900),
  });

  const img = new Image();
  img.src = sourceCanvas.toDataURL('image/png');
  img.onload = () => buildFrameAndDownload(img, sourceCanvas.width, sourceCanvas.height, getPanelMeta(panelEl));
}

export function initExportButtons() {
  document.querySelectorAll('.btn-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.panel');

      // 优先 data-chart（echarts）
      const chartId = btn.dataset.chart;
      if (chartId) {
        const chart = chartInstances.find(instance => instance.getDom().id === chartId);
        if (chart) {
          exportChartAsPng(chart, panel);
          return;
        }
      }

      // 再 data-export-element（HTML 表格/容器）
      const elemId = btn.dataset.exportElement;
      if (elemId) {
        const el = document.getElementById(elemId);
        if (el) {
          exportElementAsPng(el, panel);
          return;
        }
      }
    });
  });
}
