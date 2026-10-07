// panels/quotes.js · "The Long Run in Words" panel — BofA "The Longest Pictures"
//
// Interaction: large script-type English quote on top (previous/next peek through
//              translucently), Chinese translation below, author at bottom-right;
//              mouse wheel flips one quote at a time (throttled; touch swipe + arrow keys too).
// Layout: per-quote auto height — offsets measured dynamically, viewport height
//         follows the active quote, so short quotes don't sit in a tall empty box.
// Data: data/bofa_longest_pictures_quotes.json (manually maintained, cf. sp500_rules.json).

import { escapeHtml } from '../utils.js?v=20261007185131';
import { exportQuoteAsPng } from '../export-png.js?v=20261007185131';

export function initPanelQuotes(data) {
  const listEl = document.getElementById('quotesScroller');
  if (!listEl) return;

  const quotes = Array.isArray(data.quotes) ? data.quotes : [];
  if (!quotes.length) {
    listEl.innerHTML = '<div class="quotes-empty">No quotes available yet.</div>';
    return;
  }

  // Render all quotes (active one highlighted, neighbours translucent, transform-driven)
  // Each page carries its own export button (top-right) that exports **that page**;
  // styling matches the other panels' .btn-export.
  listEl.innerHTML = quotes.map((q, i) => {
    const byline = escapeHtml(q.author_en || q.author_zh || '');
    return `
      <figure class="quote-slide" data-idx="${i}">
        <button class="btn btn-export quote-export" type="button" data-quote-export="${i}"
                title="Export this page as PNG" aria-label="Export this page as PNG">&#8681;</button>
        <blockquote class="quote-en">${escapeHtml(q.en)}</blockquote>
        <figcaption class="quote-author">—— ${byline}</figcaption>
      </figure>`;
  }).join('');

  const slides = Array.from(listEl.querySelectorAll('.quote-slide'));
  const stage = listEl.closest('.quotes-stage') || listEl;
  const viewport = listEl.closest('.quotes-viewport') || listEl.parentElement;

  // State & navigation
  let current = 0;
  let animating = false;
  const ANIM_MS = 450;

  function clamp(i) { return Math.max(0, Math.min(quotes.length - 1, i)); }

  function peekPx() {
    const n = parseFloat(getComputedStyle(stage).getPropertyValue('--quote-peek'));
    return Number.isFinite(n) ? n : 40;
  }

  // Natural offsetTop of each quote inside the scroller (adaptive step)
  let offsets = [];
  function measure() {
    offsets = slides.map(el => el.offsetTop);
    // Horizontal (mobile): viewport height is set per-active-quote in applyTransform —
    // sizing it to the tallest quote here caused the big blank area (2026-10-06 fix)
    if (window.matchMedia('(max-width: 768px)').matches) return;
    const maxH = Math.max(...slides.map(el => el.offsetHeight));
    viewport.style.height = `${maxH + 2 * peekPx()}px`;
  }

  function applyTransform(animate = true) {
    if (!offsets.length) measure();
    const horizontal = window.matchMedia('(max-width: 768px)').matches;
    listEl.style.transition = animate ? `transform ${ANIM_MS}ms cubic-bezier(0.33, 0, 0.2, 1)` : 'none';
    // Vertical: translateY by quote offset; Horizontal (mobile): full-width slides, translateX by index
    listEl.style.transform = horizontal
      ? `translateX(${-current * 100}%)`
      : `translateY(${peekPx() - offsets[current]}px)`;
    // Viewport height follows the ACTIVE quote in both modes —
    // sizing it to the tallest quote left a huge blank area under short quotes (2026-10-06 fix)
    viewport.style.height = horizontal
      ? `${slides[current].offsetHeight}px`
      : `${slides[current].offsetHeight + 2 * peekPx()}px`;
    slides.forEach((el, i) => {
      el.classList.toggle('is-active', i === current);
      el.classList.toggle('is-near', Math.abs(i - current) === 1);
    });
    const counter = document.getElementById('quotesCounter');
    if (counter) counter.textContent = `${current + 1} / ${quotes.length}`;
    document.querySelectorAll('#quotesDots .quote-dot').forEach((d, di) => {
      d.classList.toggle('active', di === current);
    });
  }

  function goTo(i) {
    const next = clamp(i);
    if (next === current) return;
    current = next;
    animating = true;
    applyTransform(true);
    window.setTimeout(() => { animating = false; }, ANIM_MS);
  }

  // Wheel: throttled so one gesture flips exactly one quote
  let wheelLocked = false;
  function onWheel(e) {
    // At the very top scrolling up: let the page scroll normally
    if (e.deltaY < 0 && current === 0) return;
    e.preventDefault();
    if (wheelLocked || animating) return;
    if (Math.abs(e.deltaY) < 2) return;
    wheelLocked = true;
    goTo(current + (e.deltaY > 0 ? 1 : -1));
    window.setTimeout(() => { wheelLocked = false; }, 120);
  }

  // ── Touch swipe: horizontal on mobile (CSS switches to row layout), vertical kept on desktop ──
  let horizontal = false;

  let touchStart = null;      // {x, y}
  function onTouchStart(e) {
    horizontal = window.matchMedia('(max-width: 768px)').matches;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const dx = touchStart.x - e.changedTouches[0].clientX;
    const dy = touchStart.y - e.changedTouches[0].clientY;
    if (horizontal) {
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        goTo(current + (dx > 0 ? 1 : -1));
      }
    } else if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx)) {
      goTo(current + (dy > 0 ? 1 : -1));
    }
    touchStart = null;
  }

  // Arrow keys (only while the panel is in view)
  let inView = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => { inView = entry.isIntersecting; });
  }, { threshold: 0.35 });
  io.observe(stage);

  function onKeyDown(e) {
    if (!inView) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
  }

  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('keydown', onKeyDown);

  // Bottom progress dots (click to jump)
  const dots = document.getElementById('quotesDots');
  if (dots) {
    dots.innerHTML = quotes.map((_, i) =>
      `<button class="quote-dot" data-i="${i}" aria-label="Quote ${i + 1}"></button>`).join('');
    dots.addEventListener('click', e => {
      const btn = e.target.closest('.quote-dot');
      if (btn) goTo(+btn.dataset.i);
    });
  }

  measure();
  applyTransform(false);

  // ── Per-page export button: exports this page (the button itself never enters the image) ──
  const panelTitle = document.querySelector('#panel-quotes .panel-title')?.textContent.trim() || 'The Long Run in Words';
  listEl.querySelectorAll('.quote-export').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const slide = btn.closest('.quote-slide');
      exportQuoteAsPng(slide, slide?.closest('.panel'), {
        fileName: `${panelTitle} ${(+btn.dataset.quoteExport || 0) + 1}`,
      });
    });
  });

  // Re-measure once the script webfont loads (line heights change); and on resize
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measure(); applyTransform(false); });
  }
  window.addEventListener('resize', () => { measure(); applyTransform(false); });

}
