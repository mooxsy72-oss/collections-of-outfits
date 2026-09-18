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

// ── Пути к файлам раздевалки ──
// Все ступени раздевалки лежат в отдельном репозитории outfits-images.
// Но в старых записях undressed.json остался префикс от прежнего репо
// ("outfits/461a.png"). Нормализуем такие пути на лету, чтобы не править JSON руками.
const UNDRESS_BASE = 'https://mooxsy72-oss.github.io/outfits-images/images/';

function normalizeStagePath(path) {
  if (!path) return path;
  // Уже абсолютный (или protocol-relative) — не трогаем
  if (/^(https?:)?\/\//i.test(path)) return path;
  // Отрезаем любой ведущий относительный префикс, оставляя только имя файла
  const file = String(path).replace(/^.*\//, '');
  return UNDRESS_BASE + file;
}

async function loadOutfits() {
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

    // Группируем по id. Старый формат с повторяющимися id автоматически объединяется в stages.
    const grouped = new Map();
    undressed.forEach(item => {
      const id = String(item.id);

      // Новый формат с явным массивом stages
      if (Array.isArray(item.stages)) {
        const stages = item.stages
          .filter(s => s && s.img)
          .map(s => ({
            ...s,
            img: normalizeStagePath(s.img),
            prompt: normalizeStagePath(s.prompt)
          }));
        if (stages.length) grouped.set(id, stages);
        return;
      }

      // Старый плоский формат — собираем в массив
      if (item.img) {
        if (!grouped.has(id)) grouped.set(id, []);
        grouped.get(id).push({
          img: normalizeStagePath(item.img),
          prompt: normalizeStagePath(item.prompt)
        });
      }
    });

    undressedById = grouped;
  } catch {
    undressedById = new Map();
  }

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
  preloadStageAssets(toShow);

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (filteredOutfits.length > displayedCount) {
    loadMoreBtn.classList.remove('hidden');
  } else {
    loadMoreBtn.classList.add('hidden');
  }
}

// ── Ступени раздетости ──
// Ступень 0 — исходный наряд из outfits.json.
// Ступени 1, 2, ... — записи из массива stages в undressed.json.
function getStages(outfit) {
  return undressedById.get(String(outfit.id)) || [];
}

function stageCount(outfit) {
  return getStages(outfit).length + 1;
}

function getStageData(outfit, stage = outfit._stage || 0) {
  if (stage === 0) return outfit;
  return getStages(outfit)[stage - 1] || outfit;
}

// Заранее подгружаем картинки и промпты всех ступеней,
// чтобы переключение было мгновенным и без ожидания.
// Кэш промисов — не грузим одну и ту же картинку повторно,
// и crossfade() может дождаться реальной готовности файла.
const imgReadyCache = new Map();
function preloadImage(src) {
  if (!src) return Promise.resolve();
  if (imgReadyCache.has(src)) return imgReadyCache.get(src);

  const p = new Promise(resolve => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(resolve);
    im.onerror = resolve; // не блокируем UI, если картинка не найдена
    im.src = src;
  });
  imgReadyCache.set(src, p);
  return p;
}

function preloadStageAssets(list) {
  list.forEach(outfit => {
    getStages(outfit).forEach((s, i) => {
      if (s.img) preloadImage(s.img);
      getPromptText(outfit, i + 1);
    });
  });
}

function updateUndressBtn(btn, outfit) {
  if (!btn) return;
  const stage = outfit._stage || 0;
  const total = stageCount(outfit);
  btn.classList.toggle('active', stage > 0);

  const label = stage === 0
    ? 'Раздеть'
    : (stage === total - 1 ? 'Вернуть наряд' : 'Раздеть дальше');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', stage > 0 ? 'true' : 'false');
}

// Точки-индикаторы под кнопкой. Показываются только если ступеней больше двух.
function renderDots(dotsEl, outfit) {
  if (!dotsEl) return;
  const total = stageCount(outfit);
  const stage = outfit._stage || 0;

  dotsEl.style.display = total > 2 ? '' : 'none';
  if (dotsEl.childElementCount !== total) {
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) dotsEl.appendChild(document.createElement('span'));
  }
  Array.from(dotsEl.children).forEach((d, i) => d.classList.toggle('on', i === stage));
  dotsEl.classList.toggle('lit', stage > 0);
}

function playPulse(btn) {
  if (!btn) return;
  btn.classList.remove('pulse');
  void btn.offsetWidth;
  btn.classList.add('pulse');
}

// Настоящий кроссфейд: старая картинка живёт в слое-призраке,
// новая проявляется поверх. Чёрных вспышек нет.
// _swapToken защищает от гонки: если пользователь кликнул ещё раз
// до того, как отработал предыдущий вызов, старый callback просто
// игнорируется вместо того, чтобы дёргать картинку не в том порядке.
function crossfade(imgEl, newSrc, fitMode) {
  if (!imgEl || !newSrc) return;
  const oldSrc = imgEl.currentSrc || imgEl.src;
  if (oldSrc === newSrc) return;

  const host = imgEl.parentElement;
  if (!host) { imgEl.src = newSrc; return; }

  let ghost = host.querySelector('.img-ghost');
  if (!ghost) {
    ghost = document.createElement('div');
    ghost.className = 'img-ghost';
    host.insertBefore(ghost, imgEl);
  }
  ghost.style.backgroundImage = `url("${oldSrc}")`;
  ghost.style.backgroundSize = fitMode;
  ghost.classList.add('visible');

  const token = (imgEl._swapToken = (imgEl._swapToken || 0) + 1);
  const start = () => {
    if (imgEl._swapToken !== token) return; // это уже устаревший вызов
    imgEl.src = newSrc;
    imgEl.classList.remove('img-swap');
    void imgEl.offsetWidth;
    imgEl.classList.add('img-swap', 'loaded');
    clearTimeout(ghost._hideTimer);
    ghost._hideTimer = setTimeout(() => ghost.classList.remove('visible'), 430);
  };

  // Картинка уже была предзагружена в preloadStageAssets — просто ждём
  // готовый промис (обычно он уже resolved, тогда переход мгновенный).
  preloadImage(newSrc).then(start);
}

// Единая точка переключения ступени: обновляет карточку и открытую модалку
function setStage(outfit, stage) {
  const total = stageCount(outfit);
  outfit._stage = ((stage % total) + total) % total;
  const data = getStageData(outfit);

  const ref = cardRefs.get(outfit);
  if (ref) {
    crossfade(ref.img, data.img, 'cover');
    updateUndressBtn(ref.btn, outfit);
    renderDots(ref.dots, outfit);
    playPulse(ref.btn);
  }

  const modal = document.getElementById('modal');
  const isThisOpen = modal.classList.contains('open')
    && filteredOutfits[currentModalIndex] === outfit;
  if (!isThisOpen) return;

  const modalImg = document.getElementById('modalImg');
  const modalPrompt = document.getElementById('modalPrompt');
  const modalBtn = document.getElementById('modalUndressBtn');

  crossfade(modalImg, data.img, 'contain');
  updateUndressBtn(modalBtn, outfit);
  renderDots(document.getElementById('modalUndressDots'), outfit);
  playPulse(modalBtn);

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
  img.src = getStageData(outfit).img;
  img.alt = outfit.title || 'outfit';
  img.loading = 'lazy';

  let undressBtn = null;
  let dots = null;
  if (hasUndressed) {
    undressBtn = document.createElement('button');
    undressBtn.className = 'card-undress-btn';
    undressBtn.type = 'button';
    undressBtn.innerHTML = UNDRESS_ICON;
    updateUndressBtn(undressBtn, outfit);

    undressBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setStage(outfit, (outfit._stage || 0) + 1);
    });

    dots = document.createElement('div');
    dots.className = 'undress-dots';
    renderDots(dots, outfit);

    wrap.appendChild(undressBtn);
    wrap.appendChild(dots);
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

  cardRefs.set(outfit, { img, btn: undressBtn, dots });
  gallery.appendChild(wrap);
}

async function getPromptText(outfit, stage = outfit._stage || 0) {
  const cacheKey = '_promptText_' + stage;
  if (outfit[cacheKey]) return outfit[cacheKey];

  const data = getStageData(outfit, stage);
  if (!data.prompt) {
    outfit[cacheKey] = '(промпт недоступен)';
    return outfit[cacheKey];
  }

  try {
    const res = await fetch(data.prompt);
    if (!res.ok) throw new Error('bad response');
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

function ensureModalUndressBtn() {
  let btn = document.getElementById('modalUndressBtn');
  if (btn) return btn;

  const wrapper = document.getElementById('modalImgWrapper');

  btn = document.createElement('button');
  btn.id = 'modalUndressBtn';
  btn.className = 'card-undress-btn modal-undress-btn';
  btn.type = 'button';
  btn.innerHTML = UNDRESS_ICON;
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // чтобы не срабатывал зум
    const outfit = filteredOutfits[currentModalIndex];
    if (outfit) setStage(outfit, (outfit._stage || 0) + 1);
  });

  const dots = document.createElement('div');
  dots.id = 'modalUndressDots';
  dots.className = 'undress-dots modal-undress-dots';
  dots.addEventListener('click', (e) => e.stopPropagation());

  wrapper.appendChild(btn);
  wrapper.appendChild(dots);
  return btn;
}

async function openModal(outfit) {
  const modal = document.getElementById('modal');
  const modalImg = document.getElementById('modalImg');
  const modalPrompt = document.getElementById('modalPrompt');
  const wrapper = document.getElementById('modalImgWrapper');

  wrapper.classList.remove('zoomed');
  modalImg.style.transformOrigin = 'center';

  const data = getStageData(outfit);
  const hasUndressed = undressedById.has(String(outfit.id));

  const ghost = wrapper.querySelector('.img-ghost');
  if (ghost) ghost.classList.remove('visible');

  modalImg.classList.remove('loaded', 'img-swap');
  modalImg.onload = () => modalImg.classList.add('loaded');
  modalImg.src = data.img;
  if (modalImg.complete) modalImg.classList.add('loaded');

  const modalBtn = ensureModalUndressBtn();
  const modalDots = document.getElementById('modalUndressDots');
  modalBtn.style.display = hasUndressed ? '' : 'none';
  modalDots.style.visibility = hasUndressed ? '' : 'hidden';
  updateUndressBtn(modalBtn, outfit);
  renderDots(modalDots, outfit);

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

// ── Теги: обёртка для затемнений ──
(function initFiltersScroll() {
  const filters = document.querySelector('.filters');
  if (!filters || filters.parentElement.classList.contains('filters-scroll')) return;

  const wrap = document.createElement('div');
  wrap.className = 'filters-scroll';
  filters.parentNode.insertBefore(wrap, filters);
  wrap.appendChild(filters);
})();

loadOutfits();
