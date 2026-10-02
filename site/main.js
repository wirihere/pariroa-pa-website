/* Pariroa Pa — main.js. Progressive enhancement only; the site works without it. */
(function () {
  // v2 behaviour: reveal-on-scroll for .reveal elements.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  // v3 (spec §1): on the mobile scroll-row nav, centre the current page's link
  // so it isn't off-screen. Pure enhancement — nothing breaks without it.
  try {
    var current = document.querySelector('.nav a[aria-current="page"]');
    if (current && current.scrollIntoView) {
      current.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  } catch (e) { /* older browsers: ignore */ }

  // Gallery page (2026-10-01): lightbox for .gallery-item figures.
  // Progressive enhancement — without JS every figure is plain HTML + caption.
  var galleryItems = document.querySelectorAll('.gallery-item');
  var lightbox = null;

  function closeLightbox() {
    if (lightbox) {
      lightbox.remove();
      lightbox = null;
      document.removeEventListener('keydown', onKey);
      if (galleryItems.length) { galleryItems[lastOpened].focus(); }
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') { closeLightbox(); }
  }
  var lastOpened = 0;

  function openLightbox(item, idx) {
    lastOpened = idx;
    var img = item.querySelector('img');
    if (!img) { return; }
    lightbox = document.createElement('figure');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', img.alt || 'Photo');
    var big = img.cloneNode(false);
    big.removeAttribute('loading');
    big.removeAttribute('width');
    big.removeAttribute('height');
    var cap = document.createElement('figcaption');
    cap.textContent = (item.querySelector('figcaption') || {}).textContent || '';
    var btn = document.createElement('button');
    btn.className = 'lightbox__close';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close photo');
    btn.innerHTML = '&#215;';
    btn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) { closeLightbox(); }
    });
    lightbox.appendChild(btn);
    lightbox.appendChild(big);
    lightbox.appendChild(cap);
    document.body.appendChild(lightbox);
    document.addEventListener('keydown', onKey);
    btn.focus();
  }

  galleryItems.forEach(function (item, idx) {
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', 'View larger: ' + ((item.querySelector('figcaption') || {}).textContent || 'photo'));
    item.addEventListener('click', function () { openLightbox(item, idx); });
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(item, idx); }
    });
  });

  // v3 (fixer pass, 2026-10-01): dismissible cultural-safety notice.
  // Without JS the notice simply stays visible — the safe default.
  document.querySelectorAll('.passing-notice__close').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var notice = btn.closest('.passing-notice');
      if (notice) { notice.remove(); }
    });
  });
})();
