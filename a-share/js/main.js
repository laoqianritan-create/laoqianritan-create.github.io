/**
 * 主控：加载数据 → 渲染屏幕版 → 绑定导图按钮
 */
(function () {
  'use strict';

  let dataPayload = null;

  async function init() {
    try {
      dataPayload = await window.SW_loadData();

      // 更新右下角提示文字
      const note = document.getElementById('updateNote');
      if (note) {
        if (dataPayload.ytdAsOf) {
          note.textContent = `2026 年为年初至今涨跌幅（截至 ${dataPayload.ytdAsOf}）`;
        } else {
          note.textContent = '2026 年为年初至今涨跌幅';
        }
      }

      // 屏幕渲染
      const canvas = document.getElementById('heatmap');
      window.SW_drawHeatmap(canvas, dataPayload, {
        exportMode: false,
        scale: window.devicePixelRatio || 1
      });

      // 监听窗口尺寸变化（rAF 节流）
      let rafId = null;
      window.addEventListener('resize', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          window.SW_drawHeatmap(canvas, dataPayload, {
            exportMode: false,
            scale: window.devicePixelRatio || 1
          });
        });
      });

      // 导图按钮
      const btn = document.getElementById('btnExport');
      btn.addEventListener('click', () => exportHighRes(btn));

    } catch (err) {
      console.error('[A股看板] 初始化失败', err);
      const wrap = document.querySelector('.heatmap-wrap');
      if (wrap) {
        wrap.innerHTML = `<div style="padding:40px;text-align:center;color:#e65a56;font-size:14px;">
          数据加载失败：${err.message}<br>
          <small style="color:#999;">请刷新重试，或联系老钱</small>
        </div>`;
      }
    }
  }

  function exportHighRes(btn) {
    if (!dataPayload) return;

    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在生成 3000px 高清图…';

    // 用一个离屏 canvas 绘制 3000px 版
    setTimeout(() => {
      try {
        const offscreen = document.createElement('canvas');
        window.SW_drawHeatmap(offscreen, dataPayload, {
          exportMode: true,
          scale: 1,
          ytdAsOf: dataPayload.ytdAsOf
        });

        // 触发下载
        offscreen.toBlob((blob) => {
          if (!blob) {
            btn.textContent = '导出失败，请重试';
            setTimeout(() => { btn.disabled = false; btn.textContent = origText; }, 2000);
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `申万一级行业年度涨跌幅_2005-2026.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);

          btn.textContent = '✓ 已下载';
          setTimeout(() => { btn.disabled = false; btn.textContent = origText; }, 1500);
        }, 'image/png');
      } catch (e) {
        console.error(e);
        btn.textContent = '导出失败';
        setTimeout(() => { btn.disabled = false; btn.textContent = origText; }, 2000);
      }
    }, 50);
  }

  // 等字体加载完再画（避免首屏文字闪烁）
  if (document.fonts && document.fonts.ready) {
    Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]).then(init);
  } else {
    init();
  }
})();
