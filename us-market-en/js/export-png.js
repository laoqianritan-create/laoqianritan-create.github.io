// ══════════════════════════════════════════════════════
// export-png.js · Export chart / table as high-resolution PNG
// Title + description (panel-desc) + date + centered content + footer URL watermark
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js?v=20261008110614';
import { chartInstances } from './chart-helpers.js?v=20261008110614';

const EXPORT_W = 3300;
const PAD = 80;                    // Horizontal padding
const TITLE_SIZE = 56;
const DATE_SIZE = 30;
const DESC_SIZE = 28;
const DESC_LINE_GAP = 14;          // Line gap
const FOOTER_SIZE = 28;
const FONT = '"Inter", "PingFang SC", sans-serif';

// ── Square frame ("The Long Run in Words" only) ───────────────────────
// Three requirements: the quote export must be square; copy left-aligned;
// the block centered. Canvas 3300×3300, header pinned top, footer pinned
// bottom, content block centered in the middle band. The content font size
// is binary-searched by fitSquareContent() (--q-fit) to fill 78% of that
// band — quotes range from 29 to 277 characters, so a fixed size would
// leave short quotes as a thin strip inside the square.
const SQ = { pad: 72, title: 76, date: 34, desc: 30, footer: 30, fill: 0.78 };
const QUOTE_FIT_W = 800;                     // off-screen clone width (× scale 4 = 3200px)
const QUOTE_FIT_SCALE = 4;                   // must match the html2canvas scale
const QUOTE_FIT_MIN = 0.7;
const QUOTE_FIT_MAX = 2.6;

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

// Pull the title + description from an in-panel sub-chart header (.scatter-subheader)
// When a sub-chart (e.g. the drawdown scatter) is exported as its own image,
// use the sub-title rather than the panel's main title.
function getSubHeaderMeta(subEl) {
  if (!subEl) return null;
  const title = subEl.querySelector('.scatter-subtitle')?.textContent.trim();
  if (!title) return null;
  const desc = subEl.querySelector('.scatter-subdesc')?.textContent.trim().replace(/\s+/g, ' ') || '';
  return { title, descs: desc ? [desc] : [] };
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

// Header layout (auto-shrinking title + wrapped description + tight/square row
// spacing). Extracted as a function so buildFrameAndDownload and
// fitSquareContent compute the SAME headerH — duplicated math drifts, and the
// content block's centered position depends on it.
function layoutHeader(meta, pad, titleMax, descSize, dateSize, tight) {
  const ctxMeasure = document.createElement('canvas').getContext('2d');
  const contentMaxW = EXPORT_W - pad * 2;
  let titleFontSize = titleMax;
  ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
  while (ctxMeasure.measureText(meta.title).width > contentMaxW && titleFontSize > 32) {
    titleFontSize -= 2;
    ctxMeasure.font = `bold ${titleFontSize}px ${FONT}`;
  }
  const descLines = wrapDescLines(meta.descs, contentMaxW, descSize);
  const descBlockH = descLines.length * (descSize + DESC_LINE_GAP);
  const headerH = tight
    ? pad + titleFontSize + 20 + descBlockH + 24
    : pad + titleFontSize + 18 + dateSize + 30 + descBlockH + 36;
  return { titleFontSize, descLines, headerH, contentMaxW };
}

// Geometry of the square frame: header/footer/middle-band heights plus the
// content target height (middle band × SQ.fill).
function squareFrame(meta) {
  const H = layoutHeader(meta, SQ.pad, SQ.title, SQ.desc, SQ.date, true);
  const footerH = SQ.footer + 20 + 18;      // same formula as buildFrame's tight branch
  const middleH = EXPORT_W - H.headerH - footerH;
  return { ...H, footerH, middleH, targetH: SQ.fill * middleH };
}

// Before a square export, binary-search --q-fit so the content block reaches
// 78% of the middle band. The element must be in the DOM (the off-screen
// clone passed by exportElementAsPng is).
function fitSquareContent(element, panelEl) {
  if (!element || !element.isConnected) return;
  const frame = squareFrame(getPanelMeta(panelEl));
  // middle band → target height of the clone (contentH = 4 × clone height
  // once the block is cropped to its ink)
  const targetCloneH = frame.targetH / QUOTE_FIT_SCALE;
  element.style.width = `${QUOTE_FIT_W}px`;
  const setFit = v => element.style.setProperty('--q-fit', String(v));
  let lo = QUOTE_FIT_MIN;
  let hi = QUOTE_FIT_MAX;
  let best = QUOTE_FIT_MIN;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    setFit(mid);
    if (element.offsetHeight <= targetCloneH) { best = mid; lo = mid; } else { hi = mid; }
  }
  setFit(best);
}

// Scan the rendered canvas for the bounding box that actually holds ink.
// DOM line boxes can't be used here: they include full-width punctuation
// ("。" occupies 1em but only ~0.3em of ink), which would crop short quotes
// 40+ CSS px too wide and push the block off center.
function measureInkBox(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const r0 = d[0]; const g0 = d[1]; const b0 = d[2];   // corner pixel = background
  const T = 24;
  let minX = w; let maxX = -1; let minY = h; let maxY = -1;
  for (let y = 0; y < h; y += 2) {
    const row = y * w * 4;
    for (let x = 0; x < w; x += 2) {
      const i = row + x * 4;
      if (Math.abs(d[i] - r0) > T || Math.abs(d[i + 1] - g0) > T || Math.abs(d[i + 2] - b0) > T) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  const padX = 8; const padY = 10;                  // breathing room around glyphs
  const sx = Math.max(0, minX - padX);
  const sy = Math.max(0, minY - padY);
  return {
    sx, sy,
    sw: Math.min(w, maxX + 1 + padX) - sx,
    sh: Math.min(h, maxY + 1 + padY) - sy,
  };
}

// Assemble the final image from contentImg + meta and trigger download.
// extraImages: [{ img, naturalW, naturalH }, ...] optional; scaled proportionally and
// stacked beneath the main content image.
// opts.skipHeader: when the content image already contains the panel title/description,
// skip drawing the header on top to avoid duplication.
// opts.compact: tighter frame for text-only exports (quotes) — smaller title/date/padding
// so a short quote doesn't sit in a mostly empty image. **Default false: other panels unchanged.**
// opts.square: square frame (quotes) — 3300×3300 canvas, content block centered in the
// middle band. **Default false: other panels unchanged.**
// opts.crop: ink bounding box {sx,sy,sw,sh} of the content image (square mode).
// opts.fileName: override the download file name.
function buildFrameAndDownload(contentImg, contentNaturalW, contentNaturalH, meta, extraImages = [], opts = {}) {
  const bg = cssVar('--bg') || '#fff';
  const textColor = cssVar('--text') || '#1a1a1a';
  const grayColor = cssVar('--gray') || '#999';
  const skipHeader = opts.skipHeader || false;

  const compact = !!opts.compact;
  const square = !!opts.square;
  const tight = compact || square;          // date on the title line, thinner footer
  const pad = square ? SQ.pad : (compact ? 56 : PAD);
  const titleMax = square ? SQ.title : (compact ? 46 : TITLE_SIZE);
  const dateSize = square ? SQ.date : (compact ? 24 : DATE_SIZE);
  const descSize = square ? SQ.desc : (compact ? 24 : DESC_SIZE);
  const footerSize = square ? SQ.footer : (compact ? 22 : FOOTER_SIZE);
  const descLineH = descSize + DESC_LINE_GAP;

  const contentMaxW = EXPORT_W - pad * 2;
  // Square: crop to the real ink bounding box (measureInkBox) so a short
  // quote's block is centered too. Regular / no box: whole image — identical
  // to the original behaviour pixel for pixel.
  const src = (square && opts.crop && opts.crop.sw > 1 && opts.crop.sh > 1)
    ? opts.crop
    : { sx: 0, sy: 0, sw: contentNaturalW, sh: contentNaturalH };
  // Never upscale; only downscale: when natural < max, keep original size and center it
  const contentW0 = Math.min(contentMaxW, src.sw);
  const contentH0 = Math.round(contentW0 * (src.sh / src.sw));

  let headerH;
  let descLines = [];
  let titleFS = titleMax;

  if (skipHeader) {
    // Content image already contains title/description; keep only top padding
    headerH = pad;
  } else {
    const H = layoutHeader(meta, pad, titleMax, descSize, dateSize, tight);
    headerH = H.headerH;
    descLines = H.descLines;
    titleFS = H.titleFontSize;
  }

  // Pre-compute scaled heights for extras
  const extrasLayout = extraImages.map(ex => {
    const w = Math.min(contentMaxW, ex.naturalW);
    const h = Math.round(w * (ex.naturalH / ex.naturalW));
    return { ...ex, w, h };
  });
  const extrasGap = 40;
  const extrasBlockH = extrasLayout.reduce((sum, ex) => sum + ex.h + extrasGap, 0);

  const footerH = footerSize + (tight ? 20 : 28) + (tight ? 18 : 24);
  const exportH = square
    ? EXPORT_W
    : headerH + contentH0 + extrasBlockH + footerH;

  // ── Content placement ── square: centered both ways in the middle band
  // (if it is taller than the band, scale it down to fit); regular: follows
  // the header as before, horizontally centred.
  let contentW = contentW0;
  let contentH = contentH0;
  let contentY;
  if (square) {
    const middleH = exportH - headerH - footerH;
    const availH = middleH - extrasBlockH;
    if (contentH > availH && contentH > 0) {
      const k = availH / contentH;
      contentW = Math.round(contentW * k);
      contentH = availH;
    }
    contentY = headerH + Math.max(0, (availH - contentH) / 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXPORT_W, exportH);

  let y = pad;

  if (!skipHeader) {
    // Title (font size already auto-shrunk by layoutHeader)
    ctx.fillStyle = textColor;
    ctx.font = `bold ${titleFS}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(meta.title, pad, y + titleFS * 0.85);
    if (tight) {
      // Date right-aligned on the title baseline (one less row, fills top-right)
      ctx.fillStyle = grayColor;
      ctx.font = `${dateSize}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toISOString().substring(0, 10), EXPORT_W - pad, y + titleFS * 0.85);
      ctx.textAlign = 'left';
      y += titleFS + 20;
    } else {
      y += titleFS + 18;
      // Date
      ctx.fillStyle = grayColor;
      ctx.font = `${dateSize}px ${FONT}`;
      ctx.fillText(new Date().toISOString().substring(0, 10), pad, y + dateSize * 0.85);
      y += dateSize + 30;
    }
    // Description
    ctx.fillStyle = grayColor;
    ctx.font = `${descSize}px ${FONT}`;
    for (const line of descLines) {
      if (line) ctx.fillText(line, pad, y + descSize * 0.85);
      y += descLineH;
    }
    y += tight ? 24 : 36;
  }

  // Draw content (square: contentY already computed; src is the ink crop)
  const contentX = (EXPORT_W - contentW) / 2;
  if (square) y = contentY;
  ctx.drawImage(contentImg, src.sx, src.sy, src.sw, src.sh, contentX, y, contentW, contentH);
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
  ctx.font = `${footerSize}px ${FONT}`;
  ctx.fillText(getCurrentPageUrl(), EXPORT_W - pad, exportH - (tight ? 20 : 24));
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

  // Sub-chart mode (in-panel scatter exported standalone): use the sub-title,
  // and never drag along the table or other panel extras.
  const meta = opts.subHeader ? getSubHeaderMeta(opts.subHeader) || getPanelMeta(panelEl) : getPanelMeta(panelEl);
  // 2026-10-07: exports carry the chart only — drop panel-desc annotations and
  // the metric strip / explainer tables (extras).
  meta.descs = [];
  const extras = [];

  buildFrameAndDownload(chartImg, chartImg.naturalWidth, chartImg.naturalHeight, meta, extras);
}

// Collect bottom explainer elements (VXN explainer table, drawdown-events table,
// etc.) and render them sequentially via html2canvas
async function renderPanelExtras(panelEl) {
  const extras = [];
  for (const el of getPanelExtras(panelEl)) {
    try {
      extras.push(await renderElementToImage(el));
    } catch (err) {
      console.warn('Extra element render failed; skipping', el, err);
    }
  }
  return extras;
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

export async function exportElementAsPng(element, panelEl, opts = {}) {
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
  //  1. Skip drawing the top title/description in the final composite
  //     (the content image already includes them)
  //  exportElementAsPng always hides .btn-export inside the captured element,
  //  so the export icon can never appear in the image.
  const hasHeader = !!element.querySelector('.panel-title');
  const btnsToHide = [...element.querySelectorAll('.btn-export')];
  btnsToHide.forEach(b => b.style.display = 'none');

  // Square export: tune the content font size to the target height first
  // (must happen before html2canvas renders)
  if (opts.square) fitSquareContent(element, panelEl);

  const bg = cssVar('--bg') || '#fff';
  // windowWidth=1600 forces a desktop viewport so the mobile single-column layout
  // doesn't produce an absurdly tall PNG
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: QUOTE_FIT_SCALE,
    useCORS: true,
    windowWidth: 1600,
    windowHeight: Math.max(element.scrollHeight, 900),
  });

  // Restore button visibility
  btnsToHide.forEach(b => b.style.display = '');

  // Collect extra in-panel elements (metric-strip, explainer tables, etc.) and
  // filter out anything already inside the rendered element (to avoid duplication,
  // e.g. when panel-breadth is exported whole, the metric-strip is already in the shot).
  // 2026-10-07: same as above — export the selected element only, no metric strip / explainers.
  const extras = [];

  const img = new Image();
  img.src = sourceCanvas.toDataURL('image/png');
  // Square: scan the rendered canvas for the real ink box, hand it to the
  // frame for cropping + centering
  const crop = opts.square ? measureInkBox(sourceCanvas) : null;
  const elementMeta = getPanelMeta(panelEl);
  elementMeta.descs = [];
  img.onload = () => buildFrameAndDownload(
    img, sourceCanvas.width, sourceCanvas.height,
    elementMeta, extras,
    { skipHeader: hasHeader, fileName: opts.fileName, compact: opts.compact, square: opts.square, crop },
  );
}

// ── "The Long Run in Words" per-page export ───────────────────────────────
// Each page has its own export button (top-right). On export: clone that page,
// drop the buttons (the icon must never appear in the image), release the
// carousel's fixed min-height / translucency / button gutter, and render the
// clone off-screen at a fixed width hugging its content.
// Fixed width + min-height:0 is what keeps the export free of large blank areas:
// the carousel .quote-slide has min-height(--quote-step) and pins the author line
// to the bottom with margin-top:auto, so a naive capture leaves a big gap.
// Since 2026-10-07 the export uses a square frame (square:true): 3300×3300,
// copy left-aligned, content block centered.
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
    await exportElementAsPng(clone, panelEl, { fileName: opts.fileName, square: true });
  } finally {
    clone.remove();
  }
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

      // data-chart-sub: export an in-panel sub-chart as its own image
      // (title comes from the sub-header; the rest of the panel is not included)
      const subChartId = btn.dataset.chartSub;
      if (subChartId) {
        const chart = chartInstances.find(instance => instance.getDom().id === subChartId);
        if (chart) {
          exportChartAsPng(chart, panel, { subHeader: btn.closest('.scatter-subheader') });
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
