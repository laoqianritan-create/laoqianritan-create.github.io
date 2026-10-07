// ══════════════════════════════════════════════════════
// export-png.js · 图表 / 表格导出为高清 PNG
// 标题 + 描述（panel-desc）+ 日期 + 内容居中 + footer URL 水印
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js?v=20261007174619';
import { chartInstances } from './chart-helpers.js?v=20261007174619';

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

// 从 panel 抽出标题 + 所有 .panel-desc 文本
function getPanelMeta(panelEl) {
  if (!panelEl) return { title: 'Big Picture', descs: [] };
  const title = panelEl.querySelector('.panel-title')?.textContent.trim() || 'Big Picture';
  const descs = [...panelEl.querySelectorAll('.panel-desc')]
    .map(p => p.innerText.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  return { title, descs };
}

// 从面板内子图小标题（.scatter-subheader）抽标题 + 描述
// 子图（如回撤散点）单独成图时，用小标题而非面板大标题
function getSubHeaderMeta(subEl) {
  if (!subEl) return null;
  const title = subEl.querySelector('.scatter-subtitle')?.textContent.trim();
  if (!title) return null;
  const desc = subEl.querySelector('.scatter-subdesc')?.textContent.trim().replace(/\s+/g, ' ') || '';
  return { title, descs: desc ? [desc] : [] };
}

// 找到面板内需要额外渲染的 HTML 元素（metric-strip、VXN 五档解读表等）
// 导出 PNG 时用 html2canvas 将它们原样渲染进画布底部，保持所见即所得
function getPanelExtras(panelEl) {
  if (!panelEl) return [];
  const selectors = [
    '.metric-strip',           // 统计指标条（所见即所得，替代旧的灰色纯文本）
    '.vxn-explainer',          // VXN 五档解读表
    '.panel-explainer',        // 未来通用 explainer 容器
    '.drawdown-table-wrap',    // 回撤事件表（chart 导出时一并带上）
  ];
  const seen = new Set();
  const extras = [];
  selectors.forEach(sel => {
    panelEl.querySelectorAll(sel).forEach(el => {
      // 跳过已收集的和内容为空的（尚未被 JS 填充的占位容器）
      if (!seen.has(el) && el.innerHTML.trim()) { seen.add(el); extras.push(el); }
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
// extraImages: [{ img, naturalW, naturalH }, ...] 可选；会等比缩放后堆叠到内容图之下
// opts.skipHeader: 内容图已包含面板标题/描述时跳过顶部重复绘制
// opts.compact: 紧凑画框（文本类导出如箴言用）——标题/日期/页边距各收一号，
//               内容不高时整张图不至于显得空。**默认 false，其它面板行为完全不变。**
// opts.fileName: 覆盖下载文件名
function buildFrameAndDownload(contentImg, contentNaturalW, contentNaturalH, meta, extraImages = [], opts = {}) {
  const bg = cssVar('--bg') || '#fff';
  const textColor = cssVar('--text') || '#1a1a1a';
  const grayColor = cssVar('--gray') || '#999';
  const skipHeader = opts.skipHeader || false;

  const compact = !!opts.compact;
  const pad = compact ? 56 : PAD;
  const titleMax = compact ? 46 : TITLE_SIZE;
  const dateSize = compact ? 24 : DATE_SIZE;
  const descSize = compact ? 24 : DESC_SIZE;
  const footerSize = compact ? 22 : FOOTER_SIZE;
  const descLineH = descSize + DESC_LINE_GAP;

  const contentMaxW = EXPORT_W - pad * 2;
  // 不放大、只缩小：natural < max 时保持原尺寸居中
  const contentW = Math.min(contentMaxW, contentNaturalW);
  const contentH = Math.round(contentW * (contentNaturalH / contentNaturalW));

  let headerH;
  let titleFontSize = titleMax;
  let descLines = [];

  if (skipHeader) {
    // 内容图已含标题/描述，只保留顶部留白
    headerH = pad;
  } else {
    // 估算标题字号（自适应缩小如果超宽）
    const ctxMeasure = document.createElement('canvas').getContext('2d');
    ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
    while (ctxMeasure.measureText(meta.title).width > contentMaxW && titleFontSize > 32) {
      titleFontSize -= 2;
      ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
    }
    descLines = wrapDescLines(meta.descs, contentMaxW, descSize);
    const descBlockH = descLines.length * descLineH;
    // 紧凑画框：日期与标题同一行（右对齐）→ 少一行高度，右上角也不空
    headerH = compact
      ? pad + titleFontSize + 20 + descBlockH + 24
      : pad + titleFontSize + 18 + dateSize + 30 + descBlockH + 36;
  }

  // 预计算 extras 缩放后高度
  const extrasLayout = extraImages.map(ex => {
    const w = Math.min(contentMaxW, ex.naturalW);
    const h = Math.round(w * (ex.naturalH / ex.naturalW));
    return { ...ex, w, h };
  });
  const extrasGap = 40;
  const extrasBlockH = extrasLayout.reduce((sum, ex) => sum + ex.h + extrasGap, 0);

  const footerH = footerSize + (compact ? 20 : 28) + (compact ? 18 : 24);
  const exportH = headerH + contentH + extrasBlockH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXPORT_W, exportH);

  let y = pad;

  if (!skipHeader) {
    // 标题
    ctx.fillStyle = textColor;
    ctx.font = `bold ${titleFontSize}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(meta.title, pad, y + titleFontSize * 0.85);
    if (compact) {
      // 紧凑画框：日期右对齐、与标题同一基线（省一行高度并把右上角填上）
      ctx.fillStyle = grayColor;
      ctx.font = `${dateSize}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toISOString().substring(0, 10), EXPORT_W - pad, y + titleFontSize * 0.85);
      ctx.textAlign = 'left';
      y += titleFontSize + 20;
    } else {
      y += titleFontSize + 18;
      // 日期
      ctx.fillStyle = grayColor;
      ctx.font = `${dateSize}px ${FONT}`;
      ctx.fillText(new Date().toISOString().substring(0, 10), pad, y + dateSize * 0.85);
      y += dateSize + 30;
    }
    // 描述
    ctx.fillStyle = grayColor;
    ctx.font = `${descSize}px ${FONT}`;
    for (const line of descLines) {
      if (line) ctx.fillText(line, pad, y + descSize * 0.85);
      y += descLineH;
    }
    y += compact ? 24 : 36;
  }

  // 内容居中绘制
  const contentX = (EXPORT_W - contentW) / 2;
  ctx.drawImage(contentImg, contentX, y, contentW, contentH);
  y += contentH;

  // 附加元素（metric-strip、说明表格等，html2canvas 原样渲染）
  for (const ex of extrasLayout) {
    y += extrasGap;
    const exX = (EXPORT_W - ex.w) / 2;
    ctx.drawImage(ex.img, exX, y, ex.w, ex.h);
    y += ex.h;
  }

  // Footer
  ctx.textAlign = 'right';
  ctx.fillStyle = grayColor;
  ctx.font = `${footerSize}px ${FONT}`;
  ctx.fillText(getCurrentPageUrl(), EXPORT_W - pad, exportH - (compact ? 20 : 24));
  ctx.textAlign = 'left';

  const link = document.createElement('a');
  link.download = (opts.fileName || meta.title || 'Big Picture').replace(/[\/\\:*?"<>|]/g, '_') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function exportChartAsPng(chartInstance, panelEl, opts = {}) {
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

  // 子图模式（面板内散点等单独成图）：标题用子标题，不拖表格等附加元素
  const meta = opts.subHeader ? getSubHeaderMeta(opts.subHeader) || getPanelMeta(panelEl) : getPanelMeta(panelEl);
  const extras = opts.subHeader ? [] : await renderPanelExtras(panelEl);

  buildFrameAndDownload(chartImg, chartImg.naturalWidth, chartImg.naturalHeight, meta, extras);
}

// 收集底部附加说明元素（VXN 解读表、回撤事件表等），依次 html2canvas 渲染
async function renderPanelExtras(panelEl) {
  const extras = [];
  for (const el of getPanelExtras(panelEl)) {
    try {
      extras.push(await renderElementToImage(el));
    } catch (err) {
      console.warn('附加元素渲染失败，跳过', el, err);
    }
  }
  return extras;
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

export async function exportElementAsPng(element, panelEl, opts = {}) {
  if (!element) return;
  let h2c;
  try {
    h2c = await loadHtml2Canvas();
  } catch (e) {
    console.error(e);
    alert('导出工具加载失败，请检查网络');
    return;
  }

  // 如果渲染的元素就是整个面板（含 panel-title），则：
  //  1. 跳过顶部标题/描述（内容图已包含）
  //  exportElementAsPng 一律先隐藏元素内的导出按钮 → 图里永远不出现 icon
  const hasHeader = !!element.querySelector('.panel-title');
  const btnsToHide = [...element.querySelectorAll('.btn-export')];
  btnsToHide.forEach(b => b.style.display = 'none');

  const bg = cssVar('--bg') || '#fff';
  // windowWidth=1600 强制以 desktop 视口渲染，避免 mobile 单列布局产出超长 PNG
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: 4,
    useCORS: true,
    windowWidth: 1600,
    windowHeight: Math.max(element.scrollHeight, 900),
  });

  // 恢复按钮显示
  btnsToHide.forEach(b => b.style.display = '');

  // 收集面板内附加元素（metric-strip、说明表格等），
  // 过滤掉已在被渲染元素内部的（避免重复，如 panel-breadth 整体导出时 metric-strip 已在截图里）
  let extras = [];
  const extraEls = getPanelExtras(panelEl).filter(el => !element.contains(el));
  for (const el of extraEls) {
    try {
      extras.push(await renderElementToImage(el));
    } catch (err) {
      console.warn('附加元素渲染失败，跳过', el, err);
    }
  }

  const img = new Image();
  img.src = sourceCanvas.toDataURL('image/png');
  img.onload = () => buildFrameAndDownload(
    img, sourceCanvas.width, sourceCanvas.height,
    getPanelMeta(panelEl), extras,
    { skipHeader: hasHeader, fileName: opts.fileName, compact: opts.compact },
  );
}

// ── 「百年箴言」逐页导出 ──────────────────────────────────────
// 每页右上角有自己的导出按钮。导出时：克隆该页 → 摘掉按钮（图里不允许出现 icon）
// → 解除轮播的定高 / 半透明 / 右侧让位 → 离屏按固定宽度紧贴内容渲染。
// 走固定宽度 + min-height:0，是为了「不留大面积留白」：轮播版的 .quote-slide 有
// min-height(--quote-step) 且作者行用 margin-top:auto 钉底，直接截会在句与作者之间留白。
export async function exportQuoteAsPng(slideEl, panelEl, opts = {}) {
  if (!slideEl) return;
  const clone = slideEl.cloneNode(true);
  clone.querySelectorAll('.btn-export').forEach(b => b.remove());
  clone.classList.remove('is-active', 'is-near');
  clone.classList.add('quote-export-node');
  clone.removeAttribute('data-idx');
  clone.removeAttribute('aria-hidden');
  document.body.appendChild(clone);
  try {
    await exportElementAsPng(clone, panelEl, { fileName: opts.fileName, compact: true });
  } finally {
    clone.remove();
  }
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

      // data-chart-sub：面板内子图单独成图（标题用子图小标题，不带面板其它内容）
      const subChartId = btn.dataset.chartSub;
      if (subChartId) {
        const chart = chartInstances.find(instance => instance.getDom().id === subChartId);
        if (chart) {
          exportChartAsPng(chart, panel, { subHeader: btn.closest('.scatter-subheader') });
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
