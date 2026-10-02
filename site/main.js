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
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key !== 'Tab' || !lightbox) return;
    var focusables = lightbox.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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

  // Updates sign-up: one accessible floating pill on every page.
  var subPill = document.createElement('button');
  subPill.className = 'subscribe-pill no-print';
  subPill.type = 'button';
  subPill.textContent = 'Subscribe for updates';
  subPill.setAttribute('aria-haspopup', 'dialog');

  var subDialog = document.createElement('dialog');
  subDialog.className = 'subscribe-dialog';
  subDialog.setAttribute('aria-labelledby', 'subscribe-title');
  subDialog.innerHTML = '<form method="dialog" class="subscribe-form"><button class="subscribe-close" value="cancel" aria-label="Close">×</button><p class="section-label">Stay connected</p><h2 id="subscribe-title">Stay connected with Pariroa Pā</h2><p class="subscribe-note">We are collecting sign-ups now. Email updates are not available yet. We will keep your email securely and only use it for Pariroa Pā updates when this service is ready. To see, change or remove your email, use our contact page.</p><label for="subscribe-email">Email address</label><input id="subscribe-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required><input class="subscribe-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><p class="subscribe-result" role="status" aria-live="polite"></p><button class="btn" type="submit">Save my email</button></form>';
  document.body.appendChild(subPill);
  document.body.appendChild(subDialog);
  var subForm = subDialog.querySelector('.subscribe-form');
  var subEmail = subDialog.querySelector('#subscribe-email');
  var subResult = subDialog.querySelector('.subscribe-result');
  subPill.addEventListener('click', function () { subDialog.showModal(); subEmail.focus(); });
  subDialog.addEventListener('click', function (e) { if (e.target === subDialog) subDialog.close(); });
  subDialog.addEventListener('close', function () { subPill.focus(); });
  subForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!subForm.reportValidity()) return;
    subResult.textContent = 'Saving…';
    fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: subEmail.value, website: subForm.website.value }) })
      .then(function (r) { if (!r.ok) throw new Error('save'); return r.json(); })
      .then(function () { subResult.textContent = 'Thank you — your email has been saved. We cannot send updates yet.'; subForm.querySelector('button[type="submit"]').disabled = true; })
      .catch(function () { subResult.textContent = 'We could not save your email. Please try again later.'; });
  });
})();
