// site/js/hero-curve.js · Animated hero curve for the Big Picture top banner
// Renders an SVG of the S&P 500 monthly log trend from 1928 onward + 6 historical
// event markers + live data badges.
// Decorative script; if data fails to load, fail silently.
(function initHeroCurve() {
  const pathEl = document.getElementById('heroCurvePath');
  const svgEl = document.getElementById('heroCurve');
  const markerLayer = document.getElementById('heroMarkerLayer');
  const badgesEl = document.getElementById('heroBadges');
  if (!pathEl || !svgEl) return;

  // Historical event markers (left to right along the curve).
  // place: 'top'|'bottom' is the label position relative to the dot; align: 'center'|'left'|'right' is the horizontal anchor.
  const EVENTS = [
    { date: '1929-09', label: 'Great Depression', year: 1929, place: 'bottom', align: 'left'  },
    { date: '1974-10', label: 'Stagflation Low',  year: 1974, place: 'top'                    },
    { date: '1987-10', label: 'Black Monday',     year: 1987, place: 'bottom'                 },
    { date: '2000-03', label: 'Dot-Com Bubble',   year: 2000, place: 'top'                    },
    { date: '2008-09', label: 'GFC',              year: 2008, place: 'bottom'                 },
    { date: '2020-03', label: 'COVID Shock',      year: 2020, place: 'top',    align: 'right' },
  ];

  const VIEW_W = 1400;
  const VIEW_H = 200;
  const PAD_Y = 12;

  Promise.all([
    fetch('data/sp500_century.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null),
    fetch('data/sp500_pe.json',      { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])
    .then(([centuryPayload, pePayload]) => {
      const series = (centuryPayload?.series || [])
        .filter(it => it && it.value != null && it.value > 0)
        .filter(it => (it.date || '').slice(0, 4) >= '1928');
      if (series.length < 2) return;

      const logs = series.map(it => Math.log10(it.value));
      const minLog = Math.min(...logs);
      const maxLog = Math.max(...logs);
      const range = Math.max(maxLog - minLog, 0.001);
      const n = series.length;

      const points = logs.map((lg, i) => {
        const x = (i / (n - 1)) * VIEW_W;
        const y = VIEW_H - PAD_Y - ((lg - minLog) / range) * (VIEW_H - PAD_Y * 2);
        return [x, y];
      });

      // Smooth Bezier
      let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
      for (let i = 1; i < points.length; i++) {
        const [px, py] = points[i - 1];
        const [cx, cy] = points[i];
        const mx = (px + cx) / 2;
        d += ` Q ${px.toFixed(2)} ${py.toFixed(2)} ${mx.toFixed(2)} ${((py + cy) / 2).toFixed(2)}`;
      }
      const last = points[points.length - 1];
      d += ` T ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;

      pathEl.setAttribute('d', d);

      try {
        const length = pathEl.getTotalLength();
        if (length && isFinite(length)) {
          pathEl.style.setProperty('--path-length', length.toFixed(0));
          pathEl.style.animation = 'none';
          void pathEl.offsetWidth;
          pathEl.style.animation = '';
        }
      } catch (err) { /* no-op */ }

      // Event markers
      if (markerLayer) {
        markerLayer.innerHTML = '';
        EVENTS.forEach((ev, idx) => {
          const prefix = ev.date;
          let hit = -1;
          for (let i = 0; i < series.length; i++) {
            if ((series[i].date || '').slice(0, 7) >= prefix) { hit = i; break; }
          }
          if (hit < 0) return;
          const [sx, sy] = points[hit];
          const xPct = (sx / VIEW_W) * 100;
          const yPct = (sy / VIEW_H) * 100;

          const marker = document.createElement('div');
          marker.className = 'hero-event-marker';
          marker.dataset.place = ev.place || 'top';
          marker.dataset.align = ev.align || 'center';
          marker.style.left = xPct.toFixed(2) + '%';
          marker.style.top  = yPct.toFixed(2) + '%';
          marker.style.animationDelay = (idx * 0.35).toFixed(2) + 's';
          marker.setAttribute('aria-label', `${ev.year} · ${ev.label}`);

          const label = document.createElement('span');
          label.className = 'hero-event-label';
          label.textContent = `${ev.year} · ${ev.label}`;
          marker.appendChild(label);

          markerLayer.appendChild(marker);
        });
      }

      // Live data badges
      if (badgesEl) {
        const latest = series[series.length - 1];
        const latestVal = latest.value;
        const latestYear = parseInt(latest.date.slice(0, 4), 10);
        const latestMonth = latest.date.slice(5, 7);
        const target = `${latestYear - 1}-${latestMonth}`;

        let yearAgoVal = null;
        for (let i = series.length - 1; i >= 0; i--) {
          if ((series[i].date || '').slice(0, 7) <= target) {
            yearAgoVal = series[i].value;
            break;
          }
        }
        const yoy = yearAgoVal ? (latestVal - yearAgoVal) / yearAgoVal * 100 : null;

        let ath = 0;
        for (const it of series) { if (it.value > ath) ath = it.value; }
        const distPct = ath ? (latestVal - ath) / ath * 100 : null;

        const capeArr = (pePayload && Array.isArray(pePayload.cape)) ? pePayload.cape : [];
        const capeLatest = capeArr.length ? capeArr[capeArr.length - 1].value : null;

        const fmtPct = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
        const fmtNum = v => v.toFixed(v >= 10 ? 1 : 2);
        const cls = v => v > 0 ? 'hero-badge-value--green' : v < 0 ? 'hero-badge-value--red' : '';

        const items = [];
        if (capeLatest != null) items.push(`<span class="hero-badge"><span class="hero-badge-label">Shiller PE</span><span class="hero-badge-value">${fmtNum(capeLatest)}</span></span>`);
        if (yoy != null)        items.push(`<span class="hero-badge"><span class="hero-badge-label">Trailing 12M</span><span class="hero-badge-value ${cls(yoy)}">${fmtPct(yoy)}</span></span>`);
        if (distPct != null)    items.push(`<span class="hero-badge"><span class="hero-badge-label">From ATH</span><span class="hero-badge-value ${cls(distPct)}">${fmtPct(distPct)}</span></span>`);
        badgesEl.innerHTML = items.join('');
      }
    })
    .catch(() => { /* silent: the banner is decorative; failure must not block main content */ });
})();
