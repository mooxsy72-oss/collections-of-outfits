// ── Твои темы SillyTavern (редактируй здесь) ──
const themes = [
  { title: "Лунная призма", img: "themes/theme1.jpg", link: "https://t.me/mooxsy69/3" },
  { title: "Багровая призма", img: "themes/theme2.jpg", link: "https://t.me/mooxsy69/7" },
  { title: "Розовая призма", img: "themes/theme3.jpg", link: "https://t.me/mooxsy69/14?single" },
  { title: "Обсидиановая призма", img: "themes/theme4.jpg", link: "https://t.me/mooxsy69/14?single" },
  { title: "Милитари", img: "themes/theme5.jpg", link: "https://t.me/mooxsy69/9" },
  { title: "Slavic vibe", img: "themes/theme6.jpg", link: "https://t.me/mooxsy69/16" },
  { title: "Rusreal vibe", img: "themes/theme7.jpg", link: "https://t.me/mooxsy69/17" },
  { title: "Зеленое стекло", img: "themes/theme8.jpg", link: "https://t.me/mooxsy69/22?single" },
  { title: "Оранжевое стекло", img: "themes/theme9.jpg", link: "https://t.me/mooxsy69/22?single" },
  { title: "Медузки", img: "themes/theme10.jpg", link: "https://t.me/mooxsy69/18?single" }
];

let outfits = [];
let currentFilter = 'all';
let currentGender = 'all';
let displayedCount = 40;
let currentModalIndex = 0;
let filteredOutfits = [];

async function loadOutfits() {
  try {
    const res = await fetch('outfits.json');
    outfits = await res.json();
  } catch {
    outfits = [];
  }
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

  wrap.appendChild(img);
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

// ── Модальное окно ──
async function openModal(outfit) {
  const modal = document.getElementById('modal');
  const modalImg = document.getElementById('modalImg');
  const modalPrompt = document.getElementById('modalPrompt');
  const wrapper = document.getElementById('modalImgWrapper');

  // сброс зума при открытии нового фото
  wrapper.classList.remove('zoomed');

  modalImg.src = outfit.img;
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
      showToast('Промпт скопирован в буфер обмена');
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

// ── Панель тем ──
function renderThemes() {
  const grid = document.getElementById('themesGrid');
  grid.innerHTML = '';
  themes.forEach(t => {
    const a = document.createElement('a');
    a.className = 'theme-card';
    a.href = t.link;
    a.target = '_blank';
    a.rel = 'noopener';
    const img = document.createElement('img');
    img.src = t.img;
    img.alt = t.title;
    img.loading = 'lazy';
    const span = document.createElement('span');
    span.textContent = t.title;
    a.appendChild(img);
    a.appendChild(span);
    grid.appendChild(a);
  });
}

function openThemes() {
  document.getElementById('themesPanel').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeThemes() {
  document.getElementById('themesPanel').classList.remove('open');
  document.body.style.overflow = '';
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

document.getElementById('themesBtn').addEventListener('click', openThemes);
document.getElementById('themesClose').addEventListener('click', closeThemes);
document.getElementById('themesBackdrop').addEventListener('click', closeThemes);

document.getElementById('loadMoreBtn').addEventListener('click', loadMore);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeThemes(); }
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

// Фильтр по полу
document.querySelectorAll('.filter-btn[data-gender]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-gender]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGender = btn.dataset.gender;
    displayedCount = 40;
    renderGallery();
  });
});

renderThemes();
loadOutfits();
