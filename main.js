let outfits = [];

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
  outfits.forEach((outfit, i) => createCard(outfit, i));
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

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-primary';
  copyBtn.textContent = 'Скопировать';

  back.appendChild(h3);
  back.appendChild(preview);
  back.appendChild(copyBtn);
  card.appendChild(front);
  card.appendChild(back);
  wrap.appendChild(card);

  card.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    wrap.classList.toggle('flipped');
  });

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

async function openModal(outfit) {
  const text = await getPromptText(outfit);
  document.getElementById('modalImg').src = outfit.img;
  document.getElementById('modalImg').alt = outfit.title;
  document.getElementById('modalTitle').textContent = outfit.title;
  document.getElementById('modalPrompt').textContent = text;

  const copyBtn = document.getElementById('modalCopy');
  copyBtn.onclick = () => copyText(text, copyBtn);

  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
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

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

loadOutfits();
