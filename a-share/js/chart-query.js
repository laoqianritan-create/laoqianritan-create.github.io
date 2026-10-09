/**
 * 面板：个股走势图（交互查询）
 * 输入公司名/6位代码 → /chart 接口出图（四面板走势图 JPG）→ 展示 + 下载
 * 数据：个股走服务器本地 hithink 库（秒级），ETF/指数走 akshare 降级链
 */
(function () {
  'use strict';

  const API = 'https://ashare.laoqianriritan.com';

  const input = document.getElementById('chartQueryInput');
  const btn = document.getElementById('chartQueryBtn');
  const suggestBox = document.getElementById('chartSuggestBox');
  const loading = document.getElementById('chartLoading');
  const loadingName = document.getElementById('chartLoadingName');
  const errBox = document.getElementById('chartError');
  const result = document.getElementById('chartResult');
  const img = document.getElementById('chartResultImg');
  const dlBtn = document.getElementById('chartDownloadBtn');

  if (!input || !btn) return;

  let _dlUrl = null;
  let _reqSeq = 0;

  function hideAll() {
    suggestBox.hidden = true;
    loading.hidden = true;
    errBox.hidden = true;
    result.hidden = true;
  }

  function showError(msg) {
    hideAll();
    errBox.textContent = msg;
    errBox.hidden = false;
  }

  function showLoading(name) {
    hideAll();
    loadingName.textContent = name;
    loading.hidden = false;
  }

  function showResult(code, name, blobUrl) {
    hideAll();
    if (_dlUrl) URL.revokeObjectURL(_dlUrl);
    _dlUrl = blobUrl;
    img.src = blobUrl;
    img.alt = name + ' ' + code + ' 走势图';
    dlBtn.dataset.filename = (code ? code + '_' : '') + name + '_走势图.jpg';
    result.hidden = false;
  }

  /** 出图请求：q 命中返回 JPG；多候选返回 JSON candidates */
  async function requestChart(q) {
    const url = API + '/chart?q=' + encodeURIComponent(q.trim());
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) {
      let msg = '请求失败（' + resp.status + '）';
      try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e) { /* 非 JSON */ }
      throw new Error(msg);
    }
    const ct = resp.headers.get('content-type') || '';
    if (ct.indexOf('image') >= 0) {
      const blob = await resp.blob();
      return { image: true, blob };
    }
    const j = await resp.json();
    if (j && Array.isArray(j.candidates) && j.candidates.length) {
      return { image: false, candidates: j.candidates };
    }
    throw new Error(j && j.error ? j.error : '出图失败');
  }

  async function doChart(q) {
    if (!q.trim()) { showError('请输入公司名或 6 位代码，如：茅台 / 600519 / 510300'); return; }
    const seq = ++_reqSeq;
    const raw = q.trim();
    // 纯 6 位代码直接显示代码；中文先显示输入
    showLoading(raw.length === 6 && /^\d{6}$/.test(raw) ? raw : raw);
    try {
      const r = await requestChart(raw);
      if (seq !== _reqSeq) return; // 已被新请求取代
      if (r.image) {
        showResult('', raw, URL.createObjectURL(r.blob));
        return;
      }
      // 多候选 → 展示选择
      hideAll();
      renderCandidates(r.candidates);
    } catch (e) {
      if (seq !== _reqSeq) return;
      showError(e.message);
    }
  }

  /** 多候选下拉（联想结果也可点击） */
  function renderCandidates(cands) {
    suggestBox.innerHTML = '';
    const ul = document.createElement('div');
    ul.className = 'cq-cand-list';
    cands.forEach(function (c) {
      const code = c[0], name = c[1];
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'cq-cand';
      it.textContent = name + '  ' + code;
      it.addEventListener('click', function () {
        suggestBox.hidden = true;
        input.value = code;
        doChart(code);
      });
      ul.appendChild(it);
    });
    suggestBox.appendChild(ul);
    suggestBox.hidden = false;
  }

  /** 输入联想（debounce） */
  let _suggestTimer = null;
  input.addEventListener('input', function () {
    clearTimeout(_suggestTimer);
    const v = input.value.trim();
    if (v.length < 2 || /^\d{6}$/.test(v)) { suggestBox.hidden = true; return; }
    _suggestTimer = setTimeout(function () {
      fetch(API + '/suggest?q=' + encodeURIComponent(v), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.candidates || !j.candidates.length) { suggestBox.hidden = true; return; }
          renderCandidates(j.candidates);
        })
        .catch(function () { suggestBox.hidden = true; });
    }, 300);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doChart(input.value); }
  });
  btn.addEventListener('click', function () { doChart(input.value); });

  // 下载图片（电脑保存；手机可长按 img 保存）
  dlBtn.addEventListener('click', function () {
    if (!_dlUrl) return;
    const a = document.createElement('a');
    a.href = _dlUrl;
    a.download = dlBtn.dataset.filename || '个股走势图.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // 示例提示：回车默认出图
  hideAll();
})();
