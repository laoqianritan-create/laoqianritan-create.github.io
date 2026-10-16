/**
 * 面板：历年自由现金流（交互查询）
 * 输入公司名/6位代码 → /cashflow 接口 → 瀑布图
 */
(function () {
  'use strict';

  const API = 'https://ashare.laoqianriritan.com';

  const input = document.getElementById('cfQueryInput');
  const btn = document.getElementById('cfQueryBtn');
  const suggestBox = document.getElementById('cfSuggestBox');
  const loading = document.getElementById('cfLoading');
  const errBox = document.getElementById('cfError');
  const result = document.getElementById('cfResult');
  const canvas = document.getElementById('cfCanvas');

  if (!input || !btn) return;

  let _data = null;
  let _reqSeq = 0;
  let _hidden = {}; // 图例隐藏的指标

  // 8个指标的配置
  const INDICATORS = [
    { key: 'tax_operating_profit', name: '税后营业利润', color: '#23C2DB' },
    { key: 'depreciation', name: '折旧摊销', color: '#B09CDB' },
    { key: 'working_capital_change', name: '营运资本变动', color: '#5AAEF3' },
    { key: 'capex', name: '资本支出', color: '#FFB366' },
    { key: 'free_cashflow', name: '自由现金流', color: '#E65A56' },
    { key: 'dividend_paid', name: '计划股息支付', color: '#8C9BAE' },
    { key: 'new_equity', name: '新股权融资', color: '#FFDC4C' },
    { key: 'net_debt', name: '净债权融资', color: '#7CB342' },
  ];

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

  function showLoading() {
    hideAll();
    loading.hidden = false;
  }

  /** 出图请求 */
  async function requestCashflow(q) {
    const url = API + '/cashflow?q=' + encodeURIComponent(q.trim());
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 90000);
    try {
      const resp = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!resp.ok) {
        let msg = '请求失败（' + resp.status + '）';
        try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
      }
      const j = await resp.json();
      if (j && j.candidates) {
        return { candidates: j.candidates };
      }
      return { data: j };
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('计算超过 90 秒未响应，请刷新后重试');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 画瀑布图 */
  function draw(data) {
    const W = 1480, H = 680;
    const padL = 70, padR = 40, padT = 80, padB = 50;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width = '100%';
    canvas.style.maxWidth = W + 'px';
    canvas.style.height = 'auto';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const years = data.years;
    const n = years.length;
    if (n === 0) return;

    // 计算y范围
    let yMin = 0, yMax = 0;
    INDICATORS.forEach(ind => {
      if (_hidden[ind.key]) return;
      const vals = data[ind.key] || [];
      vals.forEach(v => {
        if (v === null || v === undefined) return;
        if (v > yMax) yMax = v;
        if (v < yMin) yMin = v;
      });
    });
    const yPad = (yMax - yMin) * 0.1 || 10;
    yMin -= yPad; yMax += yPad;

    const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
    const ys = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

    // 网格线
    ctx.strokeStyle = '#EDEDED';
    ctx.lineWidth = 1;
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const v = yMin + (yMax - yMin) * i / gridCount;
      const y = ys(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      // y轴标签
      ctx.fillStyle = '#999';
      ctx.font = '12px NotoSansSC, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(0), padL - 10, y);
    }

    // x轴年份
    ctx.fillStyle = '#999';
    ctx.font = '12px NotoSansSC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    years.forEach((year, i) => {
      if (i % 3 === 0 || i === n - 1) { // 每3年显示一个
        ctx.fillText(year, xs(i), H - padB + 10);
      }
    });

    // 画柱子（瀑布图样式：正方向堆叠，负方向单独）
    const barWidth = (W - padL - padR) / n * 0.6;

    years.forEach((year, i) => {
      const x = xs(i) - barWidth / 2;
      const zeroY = ys(0);

      // 正方向：税后营业利润 + 折旧摊销 + 营运资本变动（正）
      let posStack = 0;
      // 负方向：资本支出 + 营运资本变动（负） + 分红 + 净债权融资（负）
      let negStack = 0;

      INDICATORS.forEach(ind => {
        if (_hidden[ind.key]) return;
        const v = data[ind.key][i];
        if (v === null || v === undefined) return;

        if (v >= 0) {
          // 正方向堆叠
          const y1 = ys(posStack);
          const y2 = ys(posStack + v);
          ctx.fillStyle = ind.color;
          ctx.fillRect(x, y2, barWidth, y1 - y2);
          posStack += v;
        } else {
          // 负方向堆叠
          const y1 = ys(negStack);
          const y2 = ys(negStack + v);
          ctx.fillStyle = ind.color;
          ctx.fillRect(x, y1, barWidth, y2 - y1);
          negStack += v;
        }
      });
    });

    // 图例
    const legendY = 30;
    let legendX = W / 2 - INDICATORS.length * 60 / 2;
    ctx.font = '13px NotoSansSC, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    INDICATORS.forEach(ind => {
      const isHidden = _hidden[ind.key];
      ctx.fillStyle = isHidden ? '#CCC' : ind.color;
      ctx.fillRect(legendX, legendY - 6, 12, 12);
      ctx.fillStyle = isHidden ? '#CCC' : '#333';
      ctx.fillText(ind.name, legendX + 18, legendY);
      legendX += 18 + ctx.measureText(ind.name).width + 20;
    });

    // 标题
    ctx.fillStyle = '#333';
    ctx.font = 'bold 18px NotoSansSC, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(data.name + ' · 历年自由现金流（亿元）', padL, 20);

    // 保存数据用于hover
    _data = data;
    _drawHoverLine = null;
  }

  let _drawHoverLine = null;

  /** hover交互 */
  function bindHover() {
    canvas.onmousemove = function(e) {
      if (!_data) return;
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / window.devicePixelRatio / rect.width;
      const mx = (e.clientX - rect.left) * scale;

      const W = 1480, H = 680;
      const padL = 70, padR = 40, padT = 80, padB = 50;
      const years = _data.years;
      const n = years.length;

      // 找到最近的年份
      const i = Math.round((mx - padL) / ((W - padL - padR) / (n - 1)));
      if (i < 0 || i >= n) return;

      const xs = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
      const x = xs(i);

      // 重绘画布
      draw(_data);

      const ctx = canvas.getContext('2d');
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      // 画纵向参考线
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();
      ctx.setLineDash([]);

      // 显示tooltip
      let tooltip = years[i] + '年\n';
      INDICATORS.forEach(ind => {
        if (_hidden[ind.key]) return;
        const v = _data[ind.key][i];
        if (v !== null && v !== undefined) {
          tooltip += ind.name + ': ' + v.toFixed(2) + '亿\n';
        }
      });

      // 简单的tooltip（用title）
      canvas.title = tooltip;
    };
  }

  // 绑定事件
  btn.addEventListener('click', async function() {
    const q = input.value.trim();
    if (!q) return;
    _reqSeq++;
    const seq = _reqSeq;
    showLoading();
    try {
      const res = await requestCashflow(q);
      if (seq !== _reqSeq) return; // 过期请求
      if (res.candidates) {
        // 显示候选
        suggestBox.innerHTML = '';
        res.candidates.forEach(([code, name]) => {
          const div = document.createElement('div');
          div.textContent = name + ' (' + code + ')';
          div.onclick = () => {
            input.value = code;
            btn.click();
          };
          suggestBox.appendChild(div);
        });
        suggestBox.hidden = false;
        loading.hidden = true;
        return;
      }
      _hidden = {}; // 重置图例
      draw(res.data);
      bindHover();
      result.hidden = false;
      loading.hidden = true;
    } catch (e) {
      if (seq !== _reqSeq) return;
      showError(e.message);
    }
  });

  // 回车触发
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') btn.click();
  });

})();
