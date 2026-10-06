// panels/quotes.js · 「百年箴言」面板 —— BofA《The Longest Pictures》The long run in words
//
// 交互：页面顶部大字英文原句（下方半透明露出上一句/下一句），中部中文对照，
//       右下角作者；鼠标滚轮逐句切换（带节流 + 触摸滑动 + 键盘方向键）。
// 数据：data/bofa_longest_pictures_quotes.json（手工维护，参考 sp500_rules.json 模式）。

import { escapeHtml } from '../utils.js?v=20261006150807';

export function initPanelQuotes(data) {
  const listEl = document.getElementById('quotesScroller');
  if (!listEl) return;

  const quotes = Array.isArray(data.quotes) ? data.quotes : [];
  if (!quotes.length) {
    listEl.innerHTML = '<div class="quotes-empty">暂无箴言数据。</div>';
    return;
  }

  // ── 渲染所有句子（当前句高亮，相邻句半透明，由 transform 驱动）──
  listEl.innerHTML = quotes.map((q, i) => {
    const authorZh = q.author_zh || '';
    const authorEn = q.author_en || '';
    const byline = escapeHtml(authorZh || authorEn);
    return `
      <figure class="quote-slide" data-idx="${i}">
        <blockquote class="quote-en">${escapeHtml(q.en)}</blockquote>
        <div class="quote-zh">${escapeHtml(q.zh)}</div>
        <figcaption class="quote-author">—— ${byline}</figcaption>
      </figure>`;
  }).join('');

  const slides = Array.from(listEl.querySelectorAll('.quote-slide'));

  // ── 状态与切换 ──
  let current = 0;
  let animating = false;
  const ANIM_MS = 450;

  function clamp(i) { return Math.max(0, Math.min(quotes.length - 1, i)); }

  function applyTransform(animate = true) {
    listEl.style.transition = animate ? `transform ${ANIM_MS}ms cubic-bezier(0.33, 0, 0.2, 1)` : 'none';
    listEl.style.transform = `translateY(calc(var(--quote-peek) - ${current} * var(--quote-step)))`;
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

  // ── 滚轮：带节流（一次手势只翻一句）──
  let wheelLocked = false;
  function onWheel(e) {
    // 面板滚到头/到底时不拦页面滚动，只在句间切换时吃掉事件
    const atEdge = (e.deltaY < 0 && current === 0) || (e.deltaY > 0 && current === quotes.length - 1);
    if (atEdge && !wheelLocked && current === 0 && e.deltaY < 0) {
      // 顶部向上滚：放行给页面
      return;
    }
    e.preventDefault();
    if (wheelLocked || animating) return;
    if (Math.abs(e.deltaY) < 2) return;
    wheelLocked = true;
    goTo(current + (e.deltaY > 0 ? 1 : -1));
    window.setTimeout(() => { wheelLocked = false; }, 120);
  }

  // ── 触摸滑动 ──
  let touchStartY = null;
  function onTouchStart(e) { touchStartY = e.touches[0].clientY; }
  function onTouchEnd(e) {
    if (touchStartY === null) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 36) goTo(current + (dy > 0 ? 1 : -1));
    touchStartY = null;
  }

  // ── 键盘方向键（仅面板在视口内时）──
  let inView = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => { inView = entry.isIntersecting; });
  }, { threshold: 0.35 });
  io.observe(listEl.closest('.quotes-stage') || listEl);

  function onKeyDown(e) {
    if (!inView) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
  }

  const stage = listEl.closest('.quotes-stage') || listEl;
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('keydown', onKeyDown);

  // 底部进度点（可点击直达）
  const dots = document.getElementById('quotesDots');
  if (dots) {
    dots.innerHTML = quotes.map((_, i) =>
      `<button class="quote-dot" data-i="${i}" aria-label="第 ${i + 1} 句"></button>`).join('');
    dots.addEventListener('click', e => {
      const btn = e.target.closest('.quote-dot');
      if (btn) goTo(+btn.dataset.i);
    });
  }

  applyTransform(false);

  // 来源：整个面板只显示一次（不进轮播）
  if (data.source && data.source.name && stage) {
    const srcEl = document.createElement('div');
    srcEl.className = 'quote-source';
    srcEl.textContent = `来源：${data.source.name}`;
    stage.appendChild(srcEl);
  }
}
