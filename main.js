let outfits = [];
let currentFilter = 'all';
let currentGender = 'all';
let currentSort = 'new';
let displayedCount = 40;
let currentModalIndex = 0;
let filteredOutfits = [];
let newThreshold = Infinity; // с какого id считать наряд новинкой
let undressedById = new Map();
let cardRefs = new Map(); // наряд -> { img, btn } для синхронизации карточки и модалки

// Иконка футболки (Font Awesome free, solid «shirt»).
// Меняешь разметку здесь — меняется сразу и на карточке, и в модалке.
const UNDRESS_ICON = `
  <svg viewBox="0 0 640 512" aria-hidden="true">
    <path d="M211.8 0c7.8 0 14.3 5.7 16.7 13.2C240.8 51.9 277.1 80 320 80s79.2-28.1 91.5-66.8C413.9 5.7 420.4 0 428.2 0c2.6 0 5.2 .5 7.6 1.5L620.5 79.4c15.9 6.8 22.4 25.8 13.6 40.7L568.5 232.5c-6.4 10.9-19.7 15.3-31.2 10.4L500 227v244c0 22.1-17.9 40-40 40H180c-22.1 0-40-17.9-40-40V227l-37.3 15.9c-11.5 4.9-24.8 .5-31.2-10.4L5.9 120.1C-2.9 105.2 3.6 86.2 19.5 79.4L204.2 1.5c2.4-1 5-1.5 7.6-1.5z"/>
  </svg>`;

async function loadOutfits() {
  // Основная база и дополнительные версии загружаются независимо.
  // Если undressed.json отсутствует, обычная галерея всё равно работает.
  try {
    const res = await fetch('outfits.json');
    outfits = await res.json();
  } catch {
    outfits = [];
  }

  try {
    const res = await fetch('undressed.json');
    if (!res.ok) throw new Error('undressed.json unavailable');
    const undressed = await res.json();
    undressedById = new Map(undressed.map(item => [String(item.id), item]));
  } catch {
    undressedById = new Map();
  }

  // последние 12 по id получают бейдж NEW
  const maxId = outfits.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  newThreshold = maxId > 0 ? maxId - 11 : Infinity;
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  cardRefs.clear();

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

function getDisplayData(outfit) {
  const alternate = undressedById.get(String(outfit.id));
  return outfit._undressed && alternate ? alternate : outfit;
}

// Обновляет вид кнопки (подсветка + подсказка)
function updateUndressBtn(btn, isUndressed) {
  if (!btn) return;
  btn.classList.toggle('active', isUndressed);
  const label = isUndressed ? 'Вернуть наряд' : 'Раздеть';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', isUndressed ? 'true' : 'false');
}

// Короткий «пшик» самой кнопки при нажатии
function playPulse(btn) {
  if (!btn) return;
  btn.classList.remove('pulse');
  void btn.offsetWidth;
  btn.classList.add('pulse');
}

// Плавная подмена картинки: сначала догружаем новую, потом проявляем.
// Так нет мигания белым и переход хорошо заметен.
function swapImage(imgEl, src, onShown) {
  if (!imgEl) return;

  const show = () => {
    imgEl.classList.remove('img-swap');
    void imgEl.offsetWidth;
    imgEl.src = src;
    imgEl.classList.add('img-swap');
    if (onShown) onShown();
  };

  imgEl.classList.add('img-fading');
  const pre = new Image();
  pre.onload = pre.onerror = () => {
    imgEl.classList.remove('img-fading');
    show();
  };
  pre.src = src;
}

// Единая точка переключения: обновляет и карточку, и открытую модалку
function setUndressed(outfit, value) {
  outfit._undressed = value;
  const data = getDisplayData(outfit);

  const ref = cardRefs.get(outfit);
  if (ref) {
    swapImage(ref.img, data.img);
    updateUndressBtn(ref.btn, value);
    playPulse(ref.btn);
  }

  const modal = document.getElementById('modal');
  const isThisOpen = modal.classList.contains('open')
    && filteredOutfits[currentModalIndex] === outfit;
  if (!isThisOpen) return;

  const modalImg = document.getElementById('modalImg');
  const modalPrompt = document.getElementById('modalPrompt');
  const modalBtn = document.getElementById('modalUndressBtn');

  swapImage(modalImg, data.img, () => modalImg.classList.add('loaded'));
  updateUndressBtn(modalBtn, value);
  playPulse(modalBtn);

  modalPrompt.textContent = 'Загрузка...';
  getPromptText(outfit).then(text => {
    if (filteredOutfits[currentModalIndex] === outfit) modalPrompt.textContent = text;
  });
}

function createCard(outfit, i) {
  const gallery = document.getElementById('gallery');
  const wrap = document.createElement('div');
  const hasUndressed = undressedById.has(String(outfit.id));
  wrap.className = 'card-wrap' + (hasUndressed ? ' has-undressed' : '');

  const img = document.createElement('img');
  img.src = getDisplayData(outfit).img;
  img.alt = outfit.title || 'outfit';
  img.loading = 'lazy';

  // Кнопка создаётся только для нарядов, которые есть в undressed.json
  let undressBtn = null;
  if (hasUndressed) {
    undressBtn = document.createElement('button');
    undressBtn.className = 'card-undress-btn';
    undressBtn.type = 'button';
    undressBtn.innerHTML = UNDRESS_ICON;
    updateUndressBtn(undressBtn, !!outfit._undressed);

    undressBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setUndressed(outfit, !outfit._undressed);
    });

    wrap.appendChild(undressBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.className = 'card-copy-btn';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Скопировать промпт';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
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

  cardRefs.set(outfit, { img, btn: undressBtn });
  gallery.appendChild(wrap);
}

async function getPromptText(outfit) {
  const data = getDisplayData(outfit);
  const cacheKey = outfit._undressed && undressedById.has(String(outfit.id))
    ? '_undressedPromptText'
    : '_promptText';

  if (outfit[cacheKey]) return outfit[cacheKey];

  try {
    const res = await fetch(data.prompt);
    outfit[cacheKey] = await res.text();
  } catch {
    outfit[cacheKey] = '(промпт недоступен)';
  }
  return outfit[cacheKey];
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
// Кнопка «раздеть» внутри модалки создаётся один раз и переиспользуется
function ensureModalUndressBtn() {
  let btn = document.getElementById('modalUndressBtn');
  if (btn) return btn;

  btn = document.createElement('button');
  btn.id = 'modalUndressBtn';
  btn.className = 'card-undress-btn modal-undress-btn';
  btn.type = 'button';
  btn.innerHTML = UNDRESS_ICON;
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // чтобы не срабатывал зум
    const outfit = filteredOutfits[currentModalIndex];
    if (outfit) setUndressed(outfit, !outfit._undressed);
  });

  document.getElementById('modalImgWrapper').appendChild(btn);
  return btn;
}

async function openModal(outfit) {
  const modal = document.getElementById('modal');
  const modalImg = document.getElementById('modalImg');
  const modalPrompt = document.getElementById('modalPrompt');
  const wrapper = document.getElementById('modalImgWrapper');

  // сброс зума при открытии нового фото
  wrapper.classList.remove('zoomed');
  modalImg.style.transformOrigin = 'center';

  const data = getDisplayData(outfit);
  const hasUndressed = undressedById.has(String(outfit.id));

  // плавное появление картинки после загрузки
  modalImg.classList.remove('loaded', 'img-swap', 'img-fading');
  modalImg.onload = () => modalImg.classList.add('loaded');
  modalImg.src = data.img;
  if (modalImg.complete) modalImg.classList.add('loaded');

  const modalBtn = ensureModalUndressBtn();
  modalBtn.style.display = hasUndressed ? '' : 'none';
  updateUndressBtn(modalBtn, !!outfit._undressed);

  modalPrompt.textContent = 'Загрузка...';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  const promptText = await getPromptText(outfit);
  if (filteredOutfits[currentModalIndex] === outfit) {
    modalPrompt.textContent = promptText;
  }
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
  // подсветка кнопки при загрузке страницы — сортировка включена по умолчанию
  sortNewBtn.classList.toggle('active', currentSort === 'new');

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
