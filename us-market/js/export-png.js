// ══════════════════════════════════════════════════════
// export-png.js · 图表导出为高清 PNG
// 在 echarts 画布基础上加上标题、日期、页面 URL 水印
// ══════════════════════════════════════════════════════

import { cssVar, getCurrentPageUrl } from './utils.js';
import { chartInstances } from './chart-helpers.js';

export function exportChartAsPng(chartInstance, title) {
  const EXPORT_W = 2400;
  const PAD = 60;
  const TITLE_SIZE = 48;
  const DATE_SIZE = 26;
  const FOOTER_SIZE = 24;
  const FONT = '"Inter", "PingFang SC", sans-serif';
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
    const chartDrawW = EXPORT_W - PAD * 2;
    const chartDrawH = Math.round(chartDrawW * chartAspect);
    const textH = PAD + TITLE_SIZE + 12 + DATE_SIZE + 36;
    const footerH = FOOTER_SIZE + 28;
    const exportH = textH + chartDrawH + footerH;
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

    ctx.drawImage(chartImg, PAD, y, chartDrawW, chartDrawH);

    ctx.textAlign = 'right';
    ctx.fillStyle = cssVar('--gray') || '#999';
    ctx.font = `${FOOTER_SIZE}px ${FONT}`;
    ctx.fillText(getCurrentPageUrl(), EXPORT_W - PAD, exportH - 18);
    ctx.textAlign = 'left';

    const link = document.createElement('a');
    link.download = (title || '美股复盘看板').replace(/[\/\\:*?"<>|]/g, '_') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
}

export function initExportButtons() {
  document.querySelectorAll('.btn-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const chartId = btn.dataset.chart;
      const chart = chartInstances.find(instance => instance.getDom().id === chartId);
      if (!chart) {
        return;
      }

      const panel = btn.closest('.panel');
      const title = panel ? panel.querySelector('.panel-title').textContent : '美股复盘看板';
      exportChartAsPng(chart, title);
    });
  });
}
