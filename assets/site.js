const searchInput = document.getElementById('searchInput');
const sourceFilter = document.getElementById('sourceFilter');
const cardList = document.getElementById('cardList');

function filterCards() {
  if (!cardList) return;
  const query = (searchInput?.value || '').trim().toLowerCase();
  const source = sourceFilter?.value || 'all';
  for (const card of cardList.querySelectorAll('.card')) {
    const title = card.dataset.title || '';
    const cardSource = card.dataset.source || '';
    const matchQuery = !query || title.includes(query);
    const matchSource = source === 'all' || source === cardSource;
    card.style.display = matchQuery && matchSource ? '' : 'none';
  }
}

searchInput?.addEventListener('input', filterCards);
sourceFilter?.addEventListener('change', filterCards);
