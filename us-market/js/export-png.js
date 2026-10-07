// ══════════════════════════════════════════════════════
// export-png.js · 图表 / 表格导出为高清 PNG
// 标题 + 描述（panel-desc）+ 日期 + 内容居中 + footer URL 水印
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js?v=20261008004541';
import { chartInstances } from './chart-helpers.js?v=20261008004541';

const EXPORT_W = 3300;
const PAD = 80;                    // 两侧留白
const TITLE_SIZE = 56;
const DATE_SIZE = 30;
const DESC_SIZE = 28;
const DESC_LINE_GAP = 14;          // 行间距
const FOOTER_SIZE = 28;
const FONT = '"Inter", "PingFang SC", sans-serif';

// ── 方形导出（「百年箴言」专用）────────────────────────────────
// 老钱三条要求：箴言导出图＝正方形；文案左对齐；整块位置居中。
// 做法：画布 3300×3300，页眉钉顶、页脚钉底，正文块在中段水平＋垂直居中。
// 正文块字号由 fitSquareContent() 二分搜索（写入 --q-fit），目标＝撑到中段 78% 高——
// 箴言长短差 10 倍（29 字符 ~ 277 字符），固定字号的话短句在方图里只剩一条细线。
const SQ = { pad: 72, title: 76, date: 34, desc: 30, footer: 30, fill: 0.78 };
const QUOTE_FIT_W = 800;                     // 离屏克隆渲染宽度（× scale 4 = 3200 自然像素）
const QUOTE_FIT_SCALE = 4;                   // 必须与 exportElementAsPng 的 scale 一致
const QUOTE_FIT_MIN = 0.7;
const QUOTE_FIT_MAX = 2.6;

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

// 顶部页眉排版（标题自适应缩号 + 描述换行 + 紧凑/方形画框的行距公式）。
// 抽成函数是为了让 buildFrameAndDownload 与 fitSquareContent 算出**同一个 headerH**——
// 两处各算一遍必然漂移，正文块的居中位置就跟着错。
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

// 方形画框的几何：页眉/页脚/中段高度 + 正文块目标高度（中段 × SQ.fill）
function squareFrame(meta) {
  const H = layoutHeader(meta, SQ.pad, SQ.title, SQ.desc, SQ.date, true);
  const footerH = SQ.footer + 20 + 18;      // 与 buildFrame 的 tight 分支同一公式
  const middleH = EXPORT_W - H.headerH - footerH;
  return { ...H, footerH, middleH, targetH: SQ.fill * middleH };
}

// 方形导出前把正文块字号调到「撑满中段 78%」：量离屏克隆高度，二分 --q-fit。
// 元素必须已挂 DOM（exportElementAsPng 的克隆件满足）。
function fitSquareContent(element, panelEl) {
  if (!element || !element.isConnected) return;
  const frame = squareFrame(getPanelMeta(panelEl));
  // 中段高度 → 克隆件的目标高度：裁剪后 contentH = 4 × 克隆高（墨迹窄于画布时）
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

// 扫渲染画布，量出真正有字的包围盒（相对画布像素）。
// 不用 DOM 行盒量宽：行盒含全角标点的空盒子（「。」占 1em 只露 ~0.3em 墨），
// 照它裁会把短句裁宽 40+ CSS px，居中就歪了（踩过）。
function measureInkBox(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const r0 = d[0]; const g0 = d[1]; const b0 = d[2];   // 角像素＝背景
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
  const padX = 8; const padY = 10;                  // 字形呼吸边
  const sx = Math.max(0, minX - padX);
  const sy = Math.max(0, minY - padY);
  return {
    sx, sy,
    sw: Math.min(w, maxX + 1 + padX) - sx,
    sh: Math.min(h, maxY + 1 + padY) - sy,
  };
}

// 用 contentImg + meta 拼最终图，落盘
// extraImages: [{ img, naturalW, naturalH }, ...] 可选；会等比缩放后堆叠到内容图之下
// opts.skipHeader: 内容图已包含面板标题/描述时跳过顶部重复绘制
// opts.compact: 紧凑画框（文本类导出如箴言用）——标题/日期/页边距各收一号，
//               内容不高时整张图不至于显得空。**默认 false，其它面板行为完全不变。**
// opts.square: 方形画框（百年箴言）——画布 3300×3300，正文块中段水平＋垂直居中。
//               **默认 false，其它面板行为完全不变。**
// opts.fileName: 覆盖下载文件名
function buildFrameAndDownload(contentImg, contentNaturalW, contentNaturalH, meta, extraImages = [], opts = {}) {
  const bg = cssVar('--bg') || '#fff';
  const textColor = cssVar('--text') || '#1a1a1a';
  const grayColor = cssVar('--gray') || '#999';
  const skipHeader = opts.skipHeader || false;

  const compact = !!opts.compact;
  const square = !!opts.square;
  const tight = compact || square;          // 日期与标题同一行、页脚更薄
  const pad = square ? SQ.pad : (compact ? 56 : PAD);
  const titleMax = square ? SQ.title : (compact ? 46 : TITLE_SIZE);
  const dateSize = square ? SQ.date : (compact ? 24 : DATE_SIZE);
  const descSize = square ? SQ.desc : (compact ? 24 : DESC_SIZE);
  const footerSize = square ? SQ.footer : (compact ? 22 : FOOTER_SIZE);
  const descLineH = descSize + DESC_LINE_GAP;

  const contentMaxW = EXPORT_W - pad * 2;
  // 方形：按真实墨迹包围盒裁（measureInkBox 扫渲染画布所得）→ 短句的墨迹块也居中。
  // 常规/没量到：整幅，与原行为逐像素一致。
  const src = (square && opts.crop && opts.crop.sw > 1 && opts.crop.sh > 1)
    ? opts.crop
    : { sx: 0, sy: 0, sw: contentNaturalW, sh: contentNaturalH };
  // 不放大、只缩小：natural < max 时保持原尺寸居中
  const contentW0 = Math.min(contentMaxW, src.sw);
  const contentH0 = Math.round(contentW0 * (src.sh / src.sw));

  let headerH;
  let descLines = [];
  let titleFS = titleMax;

  if (skipHeader) {
    // 内容图已含标题/描述，只保留顶部留白
    headerH = pad;
  } else {
    const H = layoutHeader(meta, pad, titleMax, descSize, dateSize, tight);
    headerH = H.headerH;
    descLines = H.descLines;
    titleFS = H.titleFontSize;
  }

  // 预计算 extras 缩放后高度
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

  // ── 正文块定位 ── 方形：中段内水平＋垂直居中（超高中段则整体等比缩到中段）；
  //    常规：紧跟页眉往下画，横向居中（原行为不变）。
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
    // 标题（字号已在 layoutHeader 里自适应缩号）
    ctx.fillStyle = textColor;
    ctx.font = `bold ${titleFS}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(meta.title, pad, y + titleFS * 0.85);
    if (tight) {
      // 日期右对齐、与标题同一基线（省一行高度并把右上角填上）
      ctx.fillStyle = grayColor;
      ctx.font = `${dateSize}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toISOString().substring(0, 10), EXPORT_W - pad, y + titleFS * 0.85);
      ctx.textAlign = 'left';
      y += titleFS + 20;
    } else {
      y += titleFS + 18;
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
    y += tight ? 24 : 36;
  }

  // 内容绘制（方形：contentY 已在上面算好；src 为墨迹包围盒裁剪区）
  const contentX = (EXPORT_W - contentW) / 2;
  if (square) y = contentY;
  ctx.drawImage(contentImg, src.sx, src.sy, src.sw, src.sh, contentX, y, contentW, contentH);
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

  // 子图模式（面板内散点等单独成图）：标题用子标题，不拖表格等附加元素
  const meta = opts.subHeader ? getSubHeaderMeta(opts.subHeader) || getPanelMeta(panelEl) : getPanelMeta(panelEl);
  // 老钱 2026-10-07：导出图只留图表本身——描述段落（panel-desc）与指标条/说明表一律不进图
  meta.descs = [];
  const extras = [];

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

  // 方形导出：先把正文块字号调到目标高度（必须在 html2canvas 渲染之前）
  if (opts.square) fitSquareContent(element, panelEl);

  const bg = cssVar('--bg') || '#fff';
  // windowWidth=1600 强制以 desktop 视口渲染，避免 mobile 单列布局产出超长 PNG
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: QUOTE_FIT_SCALE,
    useCORS: true,
    windowWidth: 1600,
    windowHeight: Math.max(element.scrollHeight, 900),
  });

  // 恢复按钮显示
  btnsToHide.forEach(b => b.style.display = '');

  // 收集面板内附加元素（metric-strip、说明表格等），
  // 过滤掉已在被渲染元素内部的（避免重复，如 panel-breadth 整体导出时 metric-strip 已在截图里）
  // 老钱 2026-10-07：同上——只出被选中的元素本身，不再追加指标条/说明表
  const extras = [];

  const img = new Image();
  img.src = sourceCanvas.toDataURL('image/png');
  // 方形：扫渲染画布量真实墨迹包围盒，交给画框做裁剪＋居中
  const crop = opts.square ? measureInkBox(sourceCanvas) : null;
  const elementMeta = getPanelMeta(panelEl);
  elementMeta.descs = [];
  img.onload = () => buildFrameAndDownload(
    img, sourceCanvas.width, sourceCanvas.height,
    elementMeta, extras,
    { skipHeader: hasHeader, fileName: opts.fileName, compact: opts.compact, square: opts.square, crop },
  );
}

// ── 「百年箴言」逐页导出 ──────────────────────────────────────
// 每页右上角有自己的导出按钮。导出时：克隆该页 → 摘掉按钮（图里不允许出现 icon）
// → 解除轮播的定高 / 半透明 / 右侧让位 → 离屏按固定宽度紧贴内容渲染。
// 走固定宽度 + min-height:0，是为了「不留大面积留白」：轮播版的 .quote-slide 有
// min-height(--quote-step) 且作者行用 margin-top:auto 钉底，直接截会在句与作者之间留白。
// 2026-10-07 起改为方形画框（square:true）：3300×3300、文案左对齐、正文块位置居中。
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
