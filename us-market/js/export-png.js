// ══════════════════════════════════════════════════════
// export-png.js · 图表 / 表格导出为高清 PNG
// 在原始内容外加上标题、日期、页面 URL 水印
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js';
import { chartInstances } from './chart-helpers.js';

const EXPORT_W = 2400;
const PAD = 60;
const TITLE_SIZE = 48;
const DATE_SIZE = 26;
const FOOTER_SIZE = 24;
const FONT = '"Inter", "PingFang SC", sans-serif';

// 把"内容图片"包上 标题/日期/Footer 框，落盘下载
function downloadFramedImage(contentImg, contentDrawW, contentDrawH, title) {
  const textH = PAD + TITLE_SIZE + 12 + DATE_SIZE + 36;
  const footerH = FOOTER_SIZE + 28;
  const exportH = textH + contentDrawH + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  const bg = cssVar('--bg') || '#fff';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXPORT_W, exportH);

  let y = PAD;
  ctx.fillStyle = cssVar('--text') || '#1a1a1a';
  let titleFontSize = TITLE_SIZE;
  ctx.font = `bold ${titleFontSize}px ${FONT}`;
  const titleText = title || '标普500看板';
  while (ctx.measureText(titleText).width > EXPORT_W - PAD * 2 && titleFontSize > 28) {
    titleFontSize -= 2;
    ctx.font = `bold ${titleFontSize}px ${FONT}`;
  }
  ctx.fillText(titleText, PAD, y + titleFontSize * 0.85);
  y += titleFontSize + 12;

  ctx.fillStyle = cssVar('--gray') || '#999';
  ctx.font = `${DATE_SIZE}px ${FONT}`;
  ctx.fillText(new Date().toISOString().substring(0, 10), PAD, y + DATE_SIZE * 0.85);
  y += DATE_SIZE + 36;

  // 居中绘制 content
  const contentX = (EXPORT_W - contentDrawW) / 2;
  ctx.drawImage(contentImg, contentX, y, contentDrawW, contentDrawH);

  ctx.textAlign = 'right';
  ctx.fillStyle = cssVar('--gray') || '#999';
  ctx.font = `${FOOTER_SIZE}px ${FONT}`;
  ctx.fillText(getCurrentPageUrl(), EXPORT_W - PAD, exportH - 18);
  ctx.textAlign = 'left';

  const link = document.createElement('a');
  link.download = (title || '美股复盘看板').replace(/[\/\\:*?"<>|]/g, '_') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function exportChartAsPng(chartInstance, title) {
  const chartDom = chartInstance.getDom();
  const chartAspect = Math.max(0.5, Math.min(0.9, chartDom.clientHeight / Math.max(chartDom.clientWidth, 1)));
  const chartImg = new Image();
  chartImg.src = chartInstance.getDataURL({
    type: 'png',
    pixelRatio: 4,
    backgroundColor: cssVar('--bg') || '#fff',
    excludeComponents: ['toolbox'],
  });
  chartImg.onload = function onLoad() {
    const drawW = EXPORT_W - PAD * 2;
    const drawH = Math.round(drawW * chartAspect);
    downloadFramedImage(chartImg, drawW, drawH, title);
  };
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

export async function exportElementAsPng(element, title) {
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
  // scale=2 给 hi-DPI 清晰度，宽度居中适配 EXPORT_W
  const sourceCanvas = await h2c(element, {
    backgroundColor: bg,
    scale: 2,
    useCORS: true,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const elemAspect = sourceCanvas.height / sourceCanvas.width;
  const drawW = Math.min(EXPORT_W - PAD * 2, sourceCanvas.width);
  const drawH = Math.round(drawW * elemAspect);

  const img = new Image();
  img.src = sourceCanvas.toDataURL('image/png');
  img.onload = () => downloadFramedImage(img, drawW, drawH, title);
}

export function initExportButtons() {
  document.querySelectorAll('.btn-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.panel');
      const title = panel ? panel.querySelector('.panel-title').textContent.trim() : '美股复盘看板';

      // 优先 data-chart（echarts）
      const chartId = btn.dataset.chart;
      if (chartId) {
        const chart = chartInstances.find(instance => instance.getDom().id === chartId);
        if (chart) {
          exportChartAsPng(chart, title);
          return;
        }
      }

      // 再 data-export-element（HTML 表格/容器）
      const elemId = btn.dataset.exportElement;
      if (elemId) {
        const el = document.getElementById(elemId);
        if (el) {
          exportElementAsPng(el, title);
          return;
        }
      }
    });
  });
}
