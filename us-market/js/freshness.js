/**
 * 侧边栏顶部数据新鲜度徽章
 * 读 data/health.json 的 today 字段,与当前日期对比,显示"数据更新至 X · 状态"
 * 状态灯:今天/T-1=绿, T-2~T-5=黄, T-6+=红
 * 独立小脚本,先于 panels.js 渲染,避免用户等 5MB 数据加载完才看到日期
 */
(function () {
  'use strict';

  const strip = document.getElementById('headerFreshness');
  if (!strip) return;
  const textEl = strip.querySelector('.hf-text');

  // 站点根 data/ URL (兼容中/英文站,相对路径皆可)
  const dataURL = 'data/health.json?v=' + Date.now();

  fetch(dataURL, { cache: 'no-store' })
    .then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then((health) => {
      const asOf = health.today || (health.generated_at || '').slice(0, 10);
      if (!asOf) {
        textEl.textContent = '数据日期未知';
        strip.classList.add('is-old');
        return;
      }
      const asOfDate = new Date(asOf + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 交易日 gap 近似(跳过周末)
      let tdGap = 0;
      const cur = new Date(asOfDate);
      while (cur < today) {
        cur.setDate(cur.getDate() + 1);
        if (cur.getDay() !== 0 && cur.getDay() !== 6) tdGap++;
      }

      let status = '最新';
      if (tdGap === 1) status = 'T-1';
      else if (tdGap >= 2 && tdGap <= 5) {
        status = 'T-' + tdGap;
        strip.classList.add('is-stale');
      } else if (tdGap > 5) {
        status = 'T-' + tdGap + ' · 可能延迟';
        strip.classList.add('is-old');
      }

      textEl.innerHTML = '<b>' + asOf + '</b> · ' + status;
    })
    .catch((err) => {
      console.warn('[freshness] load failed', err);
      textEl.textContent = '状态未知';
      strip.classList.add('is-old');
    });
})();
