// echarts-loader.js · 本地 ECharts 失败时按序回退到国内镜像与 jsDelivr
// 不使用 defer：与 onerror 回退配合，由后续模块通过 window.__echartsReady 等待。
(function (g) {
  var resolve, reject;
  var settled = false;
  g.__echartsReady = new Promise(function (ok, fail) {
    resolve = ok;
    reject = fail;
  });
  function done() {
    if (settled) return;
    settled = true;
    if (typeof g.echarts !== 'undefined') resolve();
    else reject(new Error('echarts missing after load'));
  }
  function failAll(err) {
    if (settled) return;
    settled = true;
    reject(err || new Error('echarts failed to load'));
  }
  g.__echartsOnLoad = function () { done(); };
  g.__echartsOnError = function (el) {
    var raw = (el && el.getAttribute('data-fallbacks')) || '';
    var urls = String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    function tryAt(i) {
      if (i >= urls.length) {
        failAll(new Error('echarts failed all sources'));
        return;
      }
      var s = document.createElement('script');
      s.src = urls[i];
      s.onload = function () {
        if (typeof g.echarts !== 'undefined') done();
        else tryAt(i + 1);
      };
      s.onerror = function () { tryAt(i + 1); };
      (document.head || document.documentElement).appendChild(s);
    }
    tryAt(0);
  };
  if (typeof g.echarts !== 'undefined') done();
})(window);
