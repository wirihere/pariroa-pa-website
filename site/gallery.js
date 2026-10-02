/* Pariroa Pā — gallery.js (2026-10-02).
   Loads the whānau gallery from /api/gallery into #whanau-gallery on photos.html.
   Progressive enhancement only: if the fetch fails or the gallery is empty,
   the whole "Nō ngā whānau" section hides itself quietly — the rest of the
   photos page is untouched plain HTML.

   Lightbox note: main.js binds its lightbox to .gallery-item elements ONCE at
   load (no event delegation), so figures injected here would get nothing.
   This file adds a tiny overlay fallback that reuses the exact same DOM shape
   and class names main.js builds (.lightbox / .lightbox__close), so the
   existing lightbox styles apply — no libraries, no new CSS of its own. */
(function () {
  var wrap = document.getElementById('whanau-gallery');
  var section = document.getElementById('whanau-section');
  if (!wrap || !section) { return; }

  function hideSection() {
    section.setAttribute('hidden', '');
    section.remove(); // gone for good this load — nothing to see, nothing to tab to
  }

  /* --- tiny overlay fallback (same shape main.js builds, same classes) --- */
  var overlay = null;
  var lastFocus = null;

  function closeOverlay() {
    if (!overlay) { return; }
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onOverlayKey);
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }
  function onOverlayKey(e) {
    if (e.key === 'Escape') { closeOverlay(); }
  }
  function openOverlay(fig) {
    lastFocus = fig;
    var img = fig.querySelector('img');
    if (!img) { return; }
    var full = document.createElement('img');
    full.src = img.getAttribute('data-full') || img.src;
    full.alt = img.alt || 'Photo from the whānau';

    overlay = document.createElement('figure');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', full.alt);

    var cap = document.createElement('figcaption');
    cap.textContent = (fig.querySelector('figcaption') || {}).textContent || '';

    var btn = document.createElement('button');
    btn.className = 'lightbox__close';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close photo');
    btn.innerHTML = '&#215;';
    btn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { closeOverlay(); }
    });

    overlay.appendChild(btn);
    overlay.appendChild(full);
    overlay.appendChild(cap);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onOverlayKey);
    btn.focus();
  }

  function buildFigure(p) {
    var fig = document.createElement('figure');
    fig.className = 'gallery-item';
    fig.setAttribute('tabindex', '0');
    fig.setAttribute('role', 'button');
    fig.setAttribute('aria-label', 'View larger: ' + (p.caption || 'photo from the whānau'));

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.src = '/api/photo/' + encodeURIComponent(p.id) + '?v=thumb';
    img.alt = p.caption || 'Photo shared by the whānau';
    img.setAttribute('data-full', '/api/photo/' + encodeURIComponent(p.id) + '?v=full');

    var cap = document.createElement('figcaption');
    cap.textContent = p.caption || 'From the whānau';
    if (p.name !== null && p.name !== undefined && p.name !== '') {
      cap.textContent = cap.textContent + ' — nā ' + p.name;
    }

    fig.appendChild(img);
    fig.appendChild(cap);
    fig.addEventListener('click', function () { openOverlay(fig); });
    fig.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openOverlay(fig);
      }
    });
    return fig;
  }

  fetch('/api/gallery', { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) { throw new Error('http ' + r.status); } return r.json(); })
    .then(function (manifest) {
      var photos = (manifest && manifest.photos) || [];
      if (!photos.length) { hideSection(); return; }
      var frag = document.createDocumentFragment();
      photos.forEach(function (p) {
        if (p && p.id) { frag.appendChild(buildFigure(p)); }
      });
      if (!frag.childNodes.length) { hideSection(); return; }
      wrap.appendChild(frag);
    })
    .catch(hideSection);
})();
