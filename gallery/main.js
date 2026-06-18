```js
let outfits = [];

async function loadOutfits() {
  try {
    const res = await fetch('outfits.json');
    outfits = await res.json();
  } catch {
    // Fallback: inline data if JSON fetch fails (e.g. file:// local open)
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
  wrap.innerHTML = `
    <div class="card">
      <div class="card-face card-front">
        <img src="${outfit.img}" alt="${outfit.title}" loading="lazy" />
      </div>
      <div class="card-face card-back">
        <h3>${outfit.title}</h3>
        <button class="btn btn-primary open-btn">Open Prompt</button>
        <button class="btn btn-ghost copy-card-btn">Copy Prompt</button>
      </div>
    </div>`;

  // Flip on click (mobile friendly), hover handled by CSS
  wrap.querySelector('.card').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    wrap.classList.toggle('flipped');
  });

  wrap.querySelector('.open-btn').addEventListener('click', () => openModal(outfit));
  wrap.querySelector('.copy-card-btn').addEventListener('click', (e) => copyPrompt(outfit, e.currentTarget));

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
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = original; }, 1800);
  });
}

// Modal close
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// Dev mode
const devToggle = document.getElementById('devToggle');
const devPanel = document.getElementById('devPanel');

devToggle.addEventListener('click', () => {
  devPanel.classList.toggle('hidden');
  devToggle.classList.toggle('active');
});

document.getElementById('addOutfit').addEventListener('click', () => {
  const title = document.getElementById('newTitle').value.trim();
  const img = document.getElementById('newImg').value.trim();
  const promptText = document.getElementById('newPrompt').value.trim();

  if (!title || !img || !promptText) return alert('Fill in all fields.');

  const newOutfit = { id: Date.now(), title, img, prompt: '', _promptText: promptText };
  outfits.push(newOutfit);
  createCard(newOutfit, outfits.length - 1);

  // Show JSON to copy into outfits.json
  const exportable = outfits.map(o => ({ id: o.id, title: o.title, img: o.img, prompt: o.prompt }));
  document.getElementById('jsonExport').value = JSON.stringify(exportable, null, 2);

  document.getElementById('newTitle').value = '';
  document.getElementById('newImg').value = '';
  document.getElementById('newPrompt').value = '';
});

loadOutfits();
```