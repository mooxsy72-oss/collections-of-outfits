let outfits = [];
let currentFilter = 'all';
let currentGender = 'all';
let currentSort = 'default';
let displayedCount = 40;
let currentModalIndex = 0;
let filteredOutfits = [];
let newThreshold = Infinity; // с какого id считать наряд новинкой

async function loadOutfits() {
  try {
    const res = await fetch('outfits.json');
    outfits = await res.json();
  } catch {
    outfits = [];
  }
  // последние 12 по id получают бейдж NEW
  const maxId = outfits.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  newThreshold = maxId > 0 ? maxId - 11 : Infinity;
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  filteredOutfits = outfits.filter(o => {
    const catOk = currentFilter === 'all' || o.category === currentFilter;
    const genderOk = currentGender === 'all' || (o.gender || 'female') === currentGender;
    return catOk && genderOk;
  });

  if (currentSort === 'new') {
    filteredOutfits.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }

  const toShow = filteredOutfits.slice(0, displayedCount);
  toShow.forEach((outfit, i) => createCard(outfit, i));

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (filteredOutfits.length > displayedCount) {
    loadMoreBtn.classList.remove('hidden');
  } else {
    loadMoreBtn.classList.add('hidden');
  }
}

function createCard(outfit, i) {
  const gallery = document.getElementById('gallery');
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap';

  const img = document.createElement('img');
  img.src = outfit.img;
  img.alt = outfit.title || 'outfit';
  img.loading = 'lazy';

  // кнопка «скопировать промпт» прямо на карточке
  const copyBtn = document.createElement('button');
  copyBtn.className = 'card-copy-btn';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Скопировать промпт';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // чтобы не открывалось большое окно
    copyPrompt(outfit);
  });

  wrap.appendChild(img);
  wrap.appendChild(copyBtn);

  if ((Number(outfit.id) || 0) >= newThreshold) {
    const badge = document.createElement('span');
    badge.className = 'card-new-badge';
    badge.textContent = 'New';
    wrap.appendChild(badge);
  }
  wrap.addEventListener('click', () => {
    currentModalIndex = filteredOutfits.indexOf(outfit);
    openModal(outfit);
  });
  gallery.appendChild(wrap);
}

async function getPromptText(outfit) {
  if (outfit._promptText) return outfit._promptText;
  try {
    const res = await fetch(outfit.prompt);
    outfit._promptText = await res.text();
  } catch {
    outfit._promptText = '(промпт недоступен)';
  }
  return outfit._promptText;
}

// копирование промпта любого наряда (с карточки)
async function copyPrompt(outfit) {
  const text = await getPromptText(outfit);
  if (!text || text === '(промпт недоступен)') {
    showToast('Промпт недоступен');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Промпт скопирован');
  } catch {
    showToast('Не удалось скопировать');
  }
}

// ── Модальное окно ──
async function openModal(outfit) {
  const modal = document.getElementById('modal');
  const modalImg = document.getElementById('modalImg');
  const modalPrompt = document.getElementById('modalPrompt');
  const wrapper = document.getElementById('modalImgWrapper');

  // сброс зума при открытии нового фото
  wrapper.classList.remove('zoomed');

  // плавное появление картинки после загрузки
  modalImg.classList.remove('loaded');
  modalImg.onload = () => modalImg.classList.add('loaded');
  modalImg.src = outfit.img;
  if (modalImg.complete) modalImg.classList.add('loaded');

  modalPrompt.textContent = 'Загрузка...';

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  const promptText = await getPromptText(outfit);
  modalPrompt.textContent = promptText;
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('modalImgWrapper').classList.remove('zoomed');
}

// ── Навигация по нарядам (вперёд/назад) ──
function showPrev() {
  if (filteredOutfits.length === 0) return;
  currentModalIndex = (currentModalIndex - 1 + filteredOutfits.length) % filteredOutfits.length;
  openModal(filteredOutfits[currentModalIndex]);
}

function showNext() {
  if (filteredOutfits.length === 0) return;
  currentModalIndex = (currentModalIndex + 1) % filteredOutfits.length;
  openModal(filteredOutfits[currentModalIndex]);
}

// ── Зум фото по клику ──
function toggleZoom(e) {
  const wrapper = document.getElementById('modalImgWrapper');
  const img = document.getElementById('modalImg');

  if (wrapper.classList.contains('zoomed')) {
    wrapper.classList.remove('zoomed');
    img.style.transformOrigin = 'center';
  } else {
    // зум к точке клика
    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${x}% ${y}%`;
    wrapper.classList.add('zoomed');
  }
}

function copyModalPrompt() {
  const text = document.getElementById('modalPrompt').textContent;
  if (text && text !== 'Загрузка...') {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Промпт скопирован');
    });
  }
}

// ── Тост-уведомление ──
let toastTimer;
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ── Load More ──
function loadMore() {
  displayedCount += 40;
  renderGallery();
}

// ── Обработчики ──
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.getElementById('btnCopyModal').addEventListener('click', copyModalPrompt);
document.getElementById('modalImgWrapper').addEventListener('click', toggleZoom);
document.getElementById('modalNavPrev').addEventListener('click', showPrev);
document.getElementById('modalNavNext').addEventListener('click', showNext);

document.getElementById('loadMoreBtn').addEventListener('click', loadMore);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); }
  if (document.getElementById('modal').classList.contains('open')) {
    if (e.key === 'ArrowLeft') showPrev();
    if (e.key === 'ArrowRight') showNext();
  }
});

// Фильтр по категориям
document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    displayedCount = 40;
    renderGallery();
  });
});

// Фильтр по полу (круглые значки в шапке)
document.querySelectorAll('.gender-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGender = btn.dataset.gender;
    displayedCount = 40;
    renderGallery();
  });
});

// ── Сортировка «Новинки» ──
const sortNewBtn = document.getElementById('sortNewBtn');
if (sortNewBtn) {
  sortNewBtn.addEventListener('click', () => {
    currentSort = currentSort === 'new' ? 'default' : 'new';
    sortNewBtn.classList.toggle('active', currentSort === 'new');
    displayedCount = 40;
    renderGallery();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ── Теги: обёртка для затемнений + доводка активного тега в центр ──
(function initFiltersScroll() {
  const filters = document.querySelector('.filters');
  if (!filters || filters.parentElement.classList.contains('filters-scroll')) return;

  const wrap = document.createElement('div');
  wrap.className = 'filters-scroll';
  filters.parentNode.insertBefore(wrap, filters);
  wrap.appendChild(filters);

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
})();

loadOutfits();
