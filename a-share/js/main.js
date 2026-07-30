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

      // 顶部数据新鲜度徽章
      renderFreshness(dataPayload);

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
      console.error('[A 股看板] 初始化失败', err);
      const wrap = document.querySelector('.heatmap-wrap');
      if (wrap) {
        wrap.innerHTML = `<div style="padding:40px;text-align:center;color:#e65a56;font-size:14px;">
          数据加载失败：${err.message}<br>
          <small style="color:#999;">请刷新重试，或联系老钱</small>
        </div>`;
      }
    }
  }

  /** 计算数据陈旧度并渲染顶部徽章 */
  function renderFreshness(payload) {
    const strip = document.getElementById('freshnessStrip');
    if (!strip) return;
    const asOf = payload.ytdAsOf || payload.updated;
    if (!asOf) {
      strip.querySelector('.freshness-text').textContent = '数据日期未知';
      strip.classList.add('is-old');
      return;
    }
    const asOfDate = new Date(asOf + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - asOfDate) / 86400000);

    // 计算 diff 里的交易日数（跳过周末，近似估算）
    let tdDiff = 0;
    const cur = new Date(asOfDate);
    while (cur < today) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() !== 0 && cur.getDay() !== 6) tdDiff++;
    }

    let cls = '';
    let statusText = '';
    if (tdDiff === 0) {
      statusText = '最新';
    } else if (tdDiff <= 2) {
      statusText = `${tdDiff} 个交易日前`;
    } else if (tdDiff <= 5) {
      cls = 'is-stale';
      statusText = `${tdDiff} 个交易日前`;
    } else {
      cls = 'is-old';
      statusText = `${tdDiff} 个交易日前 · 可能延迟`;
    }

    if (cls) strip.classList.add(cls);
    strip.querySelector('.freshness-text').innerHTML =
      `数据更新至 <b>${asOf}</b>` +
      `<span class="freshness-hint">· ${statusText} · 每交易日 16:00 自动刷新</span>`;
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
