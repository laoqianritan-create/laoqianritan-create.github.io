// site/js/data-health.js · footer 数据健康徽章
// 读 data/health.json,展示 "数据更新于 X" + 鼠标悬停看明细
(function () {
  const badge = document.getElementById('dataHealth');
  if (!badge) return;

  fetch('data/health.json?v=' + Date.now())
    .then(r => r.ok ? r.json() : null)
    .then(h => {
      if (!h) { badge.textContent = '数据状态未知'; return; }

      // 取所有 days_old 的中位数(或 max)作为整体指标
      const ages = h.sources
        .map(s => s.days_old)
        .filter(d => d != null);
      if (!ages.length) { badge.textContent = '数据状态未知'; return; }

      const maxAge = Math.max(...ages);
      const minAge = Math.min(...ages);
      const status = h.overall || 'healthy';
      const colors = {
        healthy: 'var(--green)',
        warn: '#d4af37',
        critical: 'var(--red)',
      };
      const label = status === 'healthy'
        ? `数据最新 ${minAge} 天前`
        : `${h.stale_count} 项数据 > 7 天未更新`;

      badge.textContent = label;
      badge.style.color = colors[status] || 'var(--gray)';
      badge.style.cursor = 'help';

      // tooltip 明细
      const lines = h.sources.map(s => {
        const age = s.days_old != null ? `${s.days_old}d` : '—';
        return `${s.status.padEnd(8)} ${age.padStart(4)}  ${s.label}`;
      }).join('\n');
      badge.title = `生成于 ${h.generated_at}\n────────────────\n${lines}`;
    })
    .catch(() => { badge.textContent = '数据状态未知'; });
})();
