// ══════════════════════════════════════════════════════
// export-png.js · Export chart / table as high-resolution PNG
// Title + description (panel-desc) + date + centered content + footer URL watermark
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js';
import { chartInstances } from './chart-helpers.js';

const EXPORT_W = 3300;
const PAD = 80;                    // Horizontal padding
const TITLE_SIZE = 56;
const DATE_SIZE = 30;
const DESC_SIZE = 28;
const DESC_LINE_GAP = 14;          // Line gap
const FOOTER_SIZE = 28;
const FONT = '"Inter", "PingFang SC", sans-serif';

// Wrap multiple description strings by width and return an array of lines
// (CJK breaks by character; Latin breaks by word).
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
    if (i < descs.length - 1) lines.push('');  // Blank line between paragraphs
  });
  return lines;
}

// Pull the title + all .panel-desc text from a panel
function getPanelMeta(panelEl) {
  if (!panelEl) return { title: 'Big Picture', descs: [] };
  const title = panelEl.querySelector('.panel-title')?.textContent.trim() || 'Big Picture';
  const descs = [...panelEl.querySelectorAll('.panel-desc')]
    .map(p => p.innerText.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  return { title, descs };
}

// Find extra HTML elements inside a panel that need to be rendered (metric-strip,
// VXN bucket explainer, etc.). On PNG export, html2canvas renders them at the bottom
// of the canvas as-is to keep WYSIWYG.
function getPanelExtras(panelEl) {
  if (!panelEl) return [];
  const selectors = [
    '.metric-strip',           // Metric strip (WYSIWYG; replaces legacy gray plain text)
    '.vxn-explainer',          // VXN five-bucket explainer table
    '.panel-explainer',        // Future generic explainer container
    '.drawdown-table-wrap',    // Drawdown events table (included with chart export)
  ];
  const seen = new Set();
  const extras = [];
  selectors.forEach(sel => {
    panelEl.querySelectorAll(sel).forEach(el => {
      // Skip already collected and empty placeholders (not yet populated by JS)
      if (!seen.has(el) && el.innerHTML.trim()) { seen.add(el); extras.push(el); }
    });
  });
  return extras;
}

// Render an HTML element to a canvas (unified html2canvas entry point, reused
// by both the extras and the element export paths)
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

// Assemble the final image from contentImg + meta and trigger download.
// extraImages: [{ img, naturalW, naturalH }, ...] optional; scaled proportionally and
// stacked beneath the main content image.
// opts.skipHeader: when the content image already contains the panel title/description,
// skip drawing the header on top to avoid duplication.
function buildFrameAndDownload(contentImg, contentNaturalW, contentNaturalH, meta, extraImages = [], opts = {}) {
  const bg = cssVar('--bg') || '#fff';
  const textColor = cssVar('--text') || '#1a1a1a';
  const grayColor = cssVar('--gray') || '#999';
  const skipHeader = opts.skipHeader || false;

  const contentMaxW = EXPORT_W - PAD * 2;
  // Never upscale; only downscale: when natural < max, keep original size and center it
  const contentW = Math.min(contentMaxW, contentNaturalW);
  const contentH = Math.round(contentW * (contentNaturalH / contentNaturalW));

  let headerH;
  let titleFontSize = TITLE_SIZE;
  let descLines = [];
  const descLineH = DESC_SIZE + DESC_LINE_GAP;

  if (skipHeader) {
    // Content image already contains title/description; keep only top padding
    headerH = PAD;
  } else {
    // Estimate title font size (auto-shrink if it overflows)
    const ctxMeasure = document.createElement('canvas').getContext('2d');
    ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
    while (ctxMeasure.measureText(meta.title).width > contentMaxW && titleFontSize > 32) {
      titleFontSize -= 2;
      ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
    }
    descLines = wrapDescLines(meta.descs, contentMaxW, DESC_SIZE);
    const descBlockH = descLines.length * descLineH;
    headerH = PAD + titleFontSize + 18 + DATE_SIZE + 30 + descBlockH + 36;
  }

  // Pre-compute scaled heights for extras
  const extrasLayout = extraImages.map(ex => {
    const w = Math.min(contentMaxW, ex.naturalW);
    const h = Math.round(w * (ex.naturalH / ex.naturalW));
    return { ...ex, w, h };
  });
  const extrasGap = 40;
  const extrasBlockH = extrasLayout.reduce((sum, ex) => sum + ex.h + extrasGap, 0);

  const footerH = FOOTER_SIZE + 28 + 24;
  const exportH = headerH + contentH + extrasBlockH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXPORT_W, exportH);

  let y = PAD;

  if (!skipHeader) {
    // Title
    ctx.fillStyle = textColor;
    ctx.font = `bold ${titleFontSize}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(meta.title, PAD, y + titleFontSize * 0.85);
    y += titleFontSize + 18;
    // Date
    ctx.fillStyle = grayColor;
    ctx.font = `${DATE_SIZE}px ${FONT}`;
    ctx.fillText(new Date().toISOString().substring(0, 10), PAD, y + DATE_SIZE * 0.85);
    y += DATE_SIZE + 30;
    // Description
    ctx.fillStyle = grayColor;
    ctx.font = `${DESC_SIZE}px ${FONT}`;
    for (const line of descLines) {
      if (line) ctx.fillText(line, PAD, y + DESC_SIZE * 0.85);
      y += descLineH;
    }
    y += 36;
  }

  // Draw content image, centered horizontally
  const contentX = (EXPORT_W - contentW) / 2;
  ctx.drawImage(contentImg, contentX, y, contentW, contentH);
  y += contentH;

  // Extras (metric-strip, explainer tables, etc., rendered as-is via html2canvas)
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

  // Collect bottom explainer elements (VXN explainer table, drawdown-events table,
  // etc.) and render them sequentially via html2canvas
  let extras = [];
  const extraEls = getPanelExtras(panelEl);
  for (const el of extraEls) {
    try {
      extras.push(await renderElementToImage(el));
    } catch (err) {
      console.warn('Extra element render failed; skipping', el, err);
    }
  }

  buildFrameAndDownload(chartImg, chartImg.naturalWidth, chartImg.naturalHeight, getPanelMeta(panelEl), extras);
}

// ── HTML element (table-style panels) → PNG ──
let html2canvasPromise = null;
function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = () => resolve(window.html2canvas);
      s.onerror = e => reject(new Error('html2canvas failed to load'));
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
    alert('Export tool failed to load; please check your network connection.');
    return;
  }

  // If the rendered element is the whole panel (containing panel-title):
  //  1. Hide the export button so it doesn't get captured in the screenshot
  //  2. Skip drawing the top title/description in the final composite
  //     (the content image already includes them)
  const hasHeader = !!element.querySelector('.panel-title');
  const btnsToHide = hasHeader ? [...element.querySelectorAll('.btn-export')] : [];
  btnsToHide.forEach(b => b.style.display = 'none');

  const bg = cssVar('--bg') || '#fff';
  // windowWidth=1600 forces a desktop viewport so the mobile single-column layout
  // doesn't produce an absurdly tall PNG
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: 4,
    useCORS: true,
    windowWidth: 1600,
    windowHeight: Math.max(element.scrollHeight, 900),
  });

  // Restore button visibility
  btnsToHide.forEach(b => b.style.display = '');

  // Collect extra in-panel elements (metric-strip, explainer tables, etc.) and
  // filter out anything already inside the rendered element (to avoid duplication,
  // e.g. when panel-breadth is exported whole, the metric-strip is already in the shot).
  let extras = [];
  const extraEls = getPanelExtras(panelEl).filter(el => !element.contains(el));
  for (const el of extraEls) {
    try {
      extras.push(await renderElementToImage(el));
    } catch (err) {
      console.warn('Extra element render failed; skipping', el, err);
    }
  }

  const img = new Image();
  img.src = sourceCanvas.toDataURL('image/png');
  img.onload = () => buildFrameAndDownload(
    img, sourceCanvas.width, sourceCanvas.height,
    getPanelMeta(panelEl), extras, { skipHeader: hasHeader },
  );
}

export function initExportButtons() {
  document.querySelectorAll('.btn-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.panel');

      // Prefer data-chart (echarts)
      const chartId = btn.dataset.chart;
      if (chartId) {
        const chart = chartInstances.find(instance => instance.getDom().id === chartId);
        if (chart) {
          exportChartAsPng(chart, panel);
          return;
        }
      }

      // Fall back to data-export-element (HTML table/container)
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
