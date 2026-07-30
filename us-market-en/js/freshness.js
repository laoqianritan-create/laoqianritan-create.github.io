/**
 * Data freshness badge (English)
 */
(function () {
  'use strict';

  const strip = document.getElementById('headerFreshness');
  if (!strip) return;
  const textEl = strip.querySelector('.hf-text');
  const dataURL = 'data/health.json?v=' + Date.now();

  fetch(dataURL, { cache: 'no-store' })
    .then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then((health) => {
      const asOf = health.today || (health.generated_at || '').slice(0, 10);
      if (!asOf) {
        textEl.textContent = 'Date unknown';
        strip.classList.add('is-old');
        return;
      }
      const asOfDate = new Date(asOf + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let tdGap = 0;
      const cur = new Date(asOfDate);
      while (cur < today) {
        cur.setDate(cur.getDate() + 1);
        if (cur.getDay() !== 0 && cur.getDay() !== 6) tdGap++;
      }

      let status = 'live';
      if (tdGap === 1) status = 'T-1';
      else if (tdGap >= 2 && tdGap <= 5) {
        status = 'T-' + tdGap;
        strip.classList.add('is-stale');
      } else if (tdGap > 5) {
        status = 'T-' + tdGap + ' · may be stale';
        strip.classList.add('is-old');
      }
      textEl.innerHTML = '<b>' + asOf + '</b> · ' + status;
    })
    .catch((err) => {
      console.warn('[freshness] load failed', err);
      textEl.textContent = 'Status unknown';
      strip.classList.add('is-old');
    });
})();
