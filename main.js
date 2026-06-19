// ── Твои темы SillyTavern (редактируй здесь) ──
const themes = [
  { title: "Тема 1", img: "themes/theme1.jpg", link: "https://ссылка-на-тему" },
  { title: "Тема 2", img: "themes/theme2.jpg", link: "https://ссылка-на-тему" }
];

let outfits = [];
let currentFilter = 'all';

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
  const filtered = currentFilter === 'all'
    ? outfits
    : outfits.filter(o => o.category === currentFilter);
  filtered.forEach((outfit, i) => createCard(outfit, i));
}

function createCard(outfit, i) {
  const gallery = document.getElementById('gallery');
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap';

  const card = document.createElement('div');
  card.className = 'card';

  const front = document.createElement('div');
  front.className = 'card-face card-front';
  const img = document.createElement('img');
  img.src = outfit.img;
  img.alt = outfit.title;
  img.loading = 'lazy';
  front.appendChild(img);

  const back = document.createElement('div');
  back.className = 'card-face card-back';

  const h3 = document.createElement('h3');
  h3.textContent = outfit.title;

  const preview = document.createElement('div');
  preview.className = 'prompt-preview';
  preview.textContent = 'Загрузка...';
  getPromptText(outfit).then(t => preview.textContent = t);

  const zoomBtn = document.createElement('button');
  zoomBtn.className = 'btn btn-ghost';
  zoomBtn.textContent = 'Увеличить фото';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-primary';
  copyBtn.textContent = 'Скопировать';

  back.appendChild(h3);
  back.appendChild(preview);
  back.appendChild(zoomBtn);
  back.appendChild(copyBtn);
  card.appendChild(front);
  card.appendChild(back);
  wrap.appendChild(card);

  // Переворот: закрываем все остальные, переворачиваем эту
  card.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const wasFlipped = wrap.classList.contains('flipped');
    document.querySelectorAll('.card-wrap.flipped').forEach(w => w.classList.remove('flipped'));
    if (!wasFlipped) wrap.classList.add('flipped');
  });

  zoomBtn.addEventListener('click', () => openLightbox(outfit.img));
  copyBtn.addEventListener('click', (e) => copyPrompt(outfit, e.currentTarget));

  gallery.appendChild(wrap);
}

async function getPromptText(outfit) {
  if (outfit._promptText) return outfit._promptText;
  try {
    const res = await fetch(outfit.prompt);
    outfit._promptText = await res.text();
  } catch {
    outfit._promptText = outfit.prompt || '(no prompt)';
  }
  return outfit._promptText;
}

// ── Лайтбокс ──
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}

async function copyPrompt(outfit, btn) {
  const text = await getPromptText(outfit);
  copyText(text, btn);
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    const original = btn.textContent;
    btn.textContent = '✓ Скопировано!';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = original; }, 1800);
  });
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
}
function closeThemes() {
  document.getElementById('themesPanel').classList.remove('open');
}

// ── Обработчики ──
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') closeLightbox();
});

document.getElementById('themesBtn').addEventListener('click', openThemes);
document.getElementById('themesClose').addEventListener('click', closeThemes);
document.getElementById('themesBackdrop').addEventListener('click', closeThemes);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeLightbox(); closeThemes(); }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderGallery();
  });
});

renderThemes();
loadOutfits();
