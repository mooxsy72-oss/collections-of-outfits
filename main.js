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

// ── Откуда берутся данные ──
// Картинки и JSON живут в отдельных репозиториях.
// Чтобы подключить ещё один репо, когда место кончится, — допишите
// сюда его адрес. Наряды из всех источников склеиваются в один список.
const DATA_SOURCES = [
  'https://mooxsy72-oss.github.io/outfits-images/',
  'https://mooxsy72-oss.github.io/outfit-again/'
];

const UNDRESS_BASE = DATA_SOURCES[0] + 'images/';

// Тянем файл из всех источников по очереди и склеиваем.
// Если удалённый недоступен — берём локальную копию рядом с index.html,
// чтобы сайт не остался пустым.
async function fetchAll(name) {
  const results = [];

  for (const base of DATA_SOURCES) {
    try {
      const res = await fetch(base + name, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) results.push({ base, data });
      }
    } catch { /* этот источник недоступен — идём дальше */ }
  }

  if (results.length) return results;

  try {
    const res = await fetch(name, { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return [{ base: DATA_SOURCES[0], data }];
    }
  } catch { /* локальной копии тоже нет */ }

  return [];
}

// В старых записях остался префикс от прежнего репо ("outfits/461a.png").
// Приводим такие пути к нужному репозиторию — подстраховка на случай,
// если где-то осталась запись в старом формате.
function normalizeStagePath(path, base) {
  if (!path) return path;
  // Уже абсолютный (или protocol-relative) — не трогаем
  if (/^(https?:)?\/\//i.test(path)) return path;
  // Отрезаем любой ведущий относительный префикс, оставляя только имя файла
  const file = String(path).replace(/^.*\//, '');
  return (base || DATA_SOURCES[0]) + 'images/' + file;
}

// ── Скрытые наряды ──
// hiddenIds: номера из deleted.txt + наряды, у которых картинка не нашлась.
// Такие карточки на сайте не показываются.
const hiddenIds = new Set();

// Разбирает deleted.txt: номера через пробел, запятую или с новой строки,
// диапазоны вида 100-120. Строки с # в начале — заметки, пропускаются.
function parseDeletedList(text) {
  const ids = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    for (const m of line.matchAll(/(\d+)\s*[-–—]\s*(\d+)|(\d+)/g)) {
      if (m[3]) { ids.add(m[3]); continue; }
      const a = Number(m[1]), b = Number(m[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      if (hi - lo > 2000) continue; // защита от опечатки вроде 1-99999
      for (let n = lo; n <= hi; n++) ids.add(String(n));
    }
  }
  return ids;
}

// deleted.txt читаем из всех репозиториев и с самого сайта:
// номер можно записать в любой из них — наряд пропадёт отовсюду.
async function fetchDeletedIds() {
  const ids = new Set();
  const urls = [...DATA_SOURCES.map(b => b + 'deleted.txt'), 'deleted.txt'];
  await Promise.all(urls.map(async url => {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) parseDeletedList(await res.text()).forEach(id => ids.add(id));
    } catch { /* файла нет — ничего страшного */ }
  }));
  return ids;
}

async function loadOutfits() {
  const [outfitSources, deletedIds] = await Promise.all([
    fetchAll('outfits.json'),
    fetchDeletedIds()
  ]);
  deletedIds.forEach(id => hiddenIds.add(id));

  // Наряды: склеиваем все источники, при совпадении id побеждает первый
  const seen = new Set();
  outfits = [];
  for (const { data } of outfitSources) {
    for (const o of data) {
      const id = String(o.id);
      if (seen.has(id) || hiddenIds.has(id)) continue;
      seen.add(id);
      outfits.push(o);
    }
  }

  try {
    const sources = await fetchAll('undressed.json');
    if (!sources.length) throw new Error('undressed.json unavailable');

    // Группируем по id. Старый формат с повторяющимися id объединяется в stages.
    const grouped = new Map();

    for (const { base, data } of sources) {
      data.forEach(item => {
        const id = String(item.id);

        // Новый формат с явным массивом stages
        if (Array.isArray(item.stages)) {
          const stages = item.stages
            .filter(s => s && s.img)
            .map(s => ({
              ...s,
              img: normalizeStagePath(s.img, base),
              prompt: normalizeStagePath(s.prompt, base)
            }));
          if (stages.length) grouped.set(id, stages);
          return;
        }

        // Старый плоский формат — собираем в массив
        if (item.img) {
          if (!grouped.has(id)) grouped.set(id, []);
          grouped.get(id).push({
            img: normalizeStagePath(item.img, base),
            prompt: normalizeStagePath(item.prompt, base)
          });
        }
      });
    }

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
    if (hiddenIds.has(String(o.id))) return false;
    const catOk = currentFilter === 'all' || o.category === currentFilter;
    const genderOk = currentGender === 'all' || (o.gender || 'female') === currentGender;
    return catOk && genderOk;
  });

  if (currentSort === 'new') {
    filteredOutfits.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }

  const toShow = filteredOutfits.slice(0, displayedCount);
  resetLoadQueue();
  toShow.forEach((outfit, i) => createCard(outfit, i));
  queueOutfitLoads(toShow);

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

// ── Загрузка картинок ──
// 1) Если файл с указанным расширением не найден, пробуем другие:
//    в JSON записано 27.jpg, а в папке лежит 27.png — всё равно покажется.
// 2) Кэш промисов: одна и та же картинка не грузится дважды,
//    а crossfade() может дождаться её реальной готовности.
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const imgReadyCache = new Map();
const brokenImages = new Set(); // адреса, для которых не нашлось ни одного файла

function extVariants(src) {
  const m = String(src).match(/^(.*)\.(png|jpe?g|webp)(\?.*)?$/i);
  if (!m) return [src];
  const [, base, ext, query = ''] = m;
  const current = ext.toLowerCase();
  return [src, ...IMG_EXTS.filter(e => e !== current).map(e => `${base}.${e}${query}`)];
}

function tryLoad(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () =>
      (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(url));
    im.onerror = reject;
    im.src = url;
  });
}

// Возвращает адрес, который реально загрузился (с тем расширением, что нашлось)
function preloadImage(src) {
  if (!src) return Promise.resolve(src);
  if (imgReadyCache.has(src)) return imgReadyCache.get(src);

  const p = (async () => {
    for (const url of extVariants(src)) {
      try { return await tryLoad(url); } catch { /* пробуем следующее расширение */ }
    }
    brokenImages.add(src); // ни один вариант не нашёлся
    return src;
  })();
  imgReadyCache.set(src, p);
  return p;
}

// ── Очередь загрузки ──
// Картинки грузятся строго по порядку: наряд → его ступени a, b, c →
// следующий наряд. Одновременно идут несколько загрузок, чтобы не было
// медленно, но каждая новая берётся из очереди по порядку.
const LOAD_CONCURRENCY = 3;
let loadQueue = [];
let activeLoads = 0;
let queueGeneration = 0;

function enqueueLoad(task) {
  loadQueue.push({ task, gen: queueGeneration });
  pumpQueue();
}

// При смене фильтра старая очередь больше не нужна
function resetLoadQueue() {
  queueGeneration++;
  loadQueue = [];
}

function pumpQueue() {
  while (activeLoads < LOAD_CONCURRENCY && loadQueue.length) {
    const { task, gen } = loadQueue.shift();
    if (gen !== queueGeneration) continue;
    activeLoads++;
    Promise.resolve()
      .then(task)
      .catch(() => {})
      .finally(() => { activeLoads--; pumpQueue(); });
  }
}

function loadCardImage(img, outfit) {
  const src = getStageData(outfit, 0).img;
  if (!src) { hideBrokenOutfit(outfit); return Promise.resolve(); }

  return preloadImage(src).then(url => {
    if (brokenImages.has(src)) { hideBrokenOutfit(outfit); return; }
    // Если пользователь уже успел переключить ступень — не перебиваем
    if (!img.isConnected || img.getAttribute('src')) return;
    img.src = url;
    img.alt = outfit.title || 'outfit';
  });
}

// Убирает карточку, у которой нет картинки, и подставляет на её место
// следующую, чтобы на странице не было дырок и пустых карточек.
function hideBrokenOutfit(outfit) {
  hiddenIds.add(String(outfit.id));

  const ref = cardRefs.get(outfit);
  if (ref && ref.wrap) ref.wrap.remove();
  cardRefs.delete(outfit);

  const idx = filteredOutfits.indexOf(outfit);
  if (idx === -1) return;
  filteredOutfits.splice(idx, 1);

  // Сдвинулся список — последняя видимая позиция освободилась, заполняем её
  const next = filteredOutfits[displayedCount - 1];
  if (next && !cardRefs.has(next)) {
    createCard(next, displayedCount - 1);
    queueOutfitLoads([next]);
  }

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  loadMoreBtn.classList.toggle('hidden', filteredOutfits.length <= displayedCount);
}

function queueOutfitLoads(list) {
  list.forEach(outfit => {
    const ref = cardRefs.get(outfit);
    if (ref) enqueueLoad(() => loadCardImage(ref.img, outfit));

    getStages(outfit).forEach((s, i) => {
      enqueueLoad(() => Promise.all([
        s.img ? preloadImage(s.img) : null,
        getPromptText(outfit, i + 1)
      ]));
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
  imgEl._openToken = (imgEl._openToken || 0) + 1; // отменяем незавершённое открытие модалки
  const start = (url) => {
    if (imgEl._swapToken !== token) return; // это уже устаревший вызов
    imgEl.src = url || newSrc;
    imgEl.classList.remove('img-swap');
    void imgEl.offsetWidth;
    imgEl.classList.add('img-swap', 'loaded');
    clearTimeout(ghost._hideTimer);
    ghost._hideTimer = setTimeout(() => ghost.classList.remove('visible'), 430);
  };

  // Картинка обычно уже предзагружена очередью — тогда переход мгновенный.
  // Если нет, клик пользователя грузит её вне очереди, без ожидания.
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

  // src проставит очередь загрузки, когда до этой карточки дойдёт черёд
  const img = document.createElement('img');
  img.alt = '';

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

  cardRefs.set(outfit, { img, btn: undressBtn, dots, wrap });
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
    // Первая строка вида "#tags: ofis male" — служебная, в промпт не показываем
    outfit[cacheKey] = (await res.text()).replace(/^\s*#\s*(?:tags?|теги)\s*:.*(?:\r?\n)?/i, '');
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
  const openToken = (modalImg._openToken = (modalImg._openToken || 0) + 1);
  preloadImage(data.img).then(url => {
    if (modalImg._openToken !== openToken) return; // успели открыть другой наряд
    modalImg.src = url;
    if (modalImg.complete) modalImg.classList.add('loaded');
  });

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
