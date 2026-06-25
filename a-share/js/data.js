/**
 * 数据加载器
 * 输入：data/sw_returns.json（顶层 years + data + updated）
 * 输出：window.SW_DATA = { years: [...22 列...], rows: [{name, rets:[...]}], updated }
 *
 * 行排序：按 2025 年涨跌幅升序（最差在顶，最好在底），与 PNG 一致
 */
(function () {
  'use strict';

  // PNG 里的行顺序（2025 列升序），保持视觉一致
  const ROW_ORDER = [
    '食品饮料', '煤炭', '美容护理', '公用事业', '交通运输',
    '房地产', '建筑装饰', '银行', '商贸零售', '家用电器',
    '社会服务', '非银金融', '石油石化', '医药生物', '纺织服饰',
    '环保', '农林牧渔', '计算机', '轻工制造', '建筑材料',
    '汽车', '钢铁', '传媒', '基础化工', '国防军工',
    '机械设备', '电力设备', '综合', '电子', '通信',
    '有色金属'
  ];

  window.SW_loadData = async function () {
    const buster = `?v=${Date.now()}`;
    const url = `data/sw_returns.json${buster}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`数据加载失败 HTTP ${resp.status}`);
    const raw = await resp.json();

    // years: 2005..2025 (21 列)，再追加 2026* (1 列) = 22 列
    const yearsBase = raw.years.map(String);
    const years = [...yearsBase, '2026*'];

    // rows: 按 ROW_ORDER 取出
    const rows = ROW_ORDER.map((name) => {
      const item = raw.data[name];
      if (!item) throw new Error(`数据缺少行业: ${name}`);
      const rets = [...item.rets];
      // 追加 2026 YTD 作为最后一列
      rets.push(item.ytd2026 !== undefined && item.ytd2026 !== null ? item.ytd2026 : null);
      return { name, rets };
    });

    return {
      years,
      rows,
      updated: raw.updated || null,
      ytdAsOf: raw.ytd_as_of || null
    };
  };
})();
