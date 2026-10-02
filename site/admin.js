/* Pariroa Pā — admin.js (2026-10-02).
   The photo review desk: sign in with the admin key, then a pending grid —
   every photo gets eyes, one action at a time.
   Endpoints per the build spec: /api/admin/login, /api/me, /api/auth/logout,
   /api/admin/pending, /api/admin/action. */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  var loginView = $('psg-login-view');
  var loginForm = $('psg-login-form');
  var keyInput = $('psg-key');
  var loginBtn = $('psg-login-btn');
  var loginMsg = $('psg-login-msg');
  var notAdminView = $('psg-not-admin');
  var adminView = $('psg-admin-view');
  var grid = $('psg-admin-grid');
  var adminMsg = $('psg-admin-msg');
  var hello = $('psg-admin-hello');

  var currentEmail = '';
  var busy = false; // one action at a time, across the whole grid

  function show(view) {
    [loginView, notAdminView, adminView].forEach(function (v) {
      if (v) { v.setAttribute('hidden', ''); }
    });
    if (view) { view.removeAttribute('hidden'); }
  }
  function say(el, text) { if (el) { el.textContent = text; } }
  function setBusy(b) {
    busy = b;
    if (loginBtn) { loginBtn.disabled = b; }
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }
  function friendlyDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d)) { return iso || ''; }
      return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return iso || ''; }
  }

  /* ---------- session ---------- */

  function checkSession() {
    fetch('/api/me', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { show(loginView); return null; }
        if (!r.ok) { throw new Error('http ' + r.status); }
        return r.json();
      })
      .then(function (me) {
        if (!me) { return; }
        if (me.admin) { enterAdmin(me.email); } else { show(notAdminView); }
      })
      .catch(function () {
        show(loginView);
        say(loginMsg, 'We couldn\u2019t check your sign-in just now — please try again.');
      });
  }

  function enterAdmin(email) {
    currentEmail = email || '';
    say(hello, 'Kia ora' + (email ? ', ' + email : '') + '.');
    show(adminView);
    loadPending();
  }

  /* ---------- login: the admin key ---------- */

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) { return; }
      var key = (keyInput.value || '');
      if (!key) {
        say(loginMsg, 'Please enter the admin key.');
        keyInput.focus();
        return;
      }
      setBusy(true);
      say(loginMsg, 'Checking\u2026');
      post('/api/admin/login', { key: key })
        .then(function (r) {
          if (r.status === 403 || r.status === 401) { throw new Error('wrong'); }
          if (r.status === 429) { throw new Error('rate'); }
          if (!r.ok) { throw new Error('http'); }
          return fetch('/api/me', { credentials: 'same-origin' });
        })
        .then(function (r) {
          if (!r || !r.ok) { throw new Error('http'); }
          return r.json();
        })
        .then(function (me) {
          if (me && me.admin) { enterAdmin(me.email); }
          else { show(notAdminView); }
        })
        .catch(function (err) {
          say(loginMsg, err.message === 'rate'
            ? 'That\u2019s a few tries in a short time — please wait an hour and try again.'
            : 'That key is not right — check it and try again.');
          keyInput.select();
        })
        .then(function () { setBusy(false); });
    });
  }

  function logout() {
    post('/api/auth/logout').then(function () { show(loginView); });
  }
  ['psg-logout', 'psg-notadmin-logout'].forEach(function (id) {
    var btn = $(id);
    if (btn) { btn.addEventListener('click', logout); }
  });

  /* ---------- pending grid ---------- */

  function loadPending() {
    say(adminMsg, 'Loading photos waiting for review\u2026');
    fetch('/api/admin/pending', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { show(loginView); return null; }
        if (!r.ok) { throw new Error('http ' + r.status); }
        return r.json();
      })
      .then(function (data) {
        if (!data) { return; }
        renderPending(data.items || []);
      })
      .catch(function () {
        say(adminMsg, 'We couldn\u2019t load the waiting photos just now — please refresh the page.');
      });
  }

  function renderPending(items) {
    grid.textContent = '';
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'psg-thanks';
      empty.textContent = 'Nothing waiting — ka pai! When whānau send photos, they\u2019ll appear here for your eyes.';
      grid.appendChild(empty);
      say(adminMsg, '');
      return;
    }

    items.forEach(function (item) {
      grid.appendChild(buildCard(item));
    });
    say(adminMsg, items.length === 1
      ? '1 photo waiting.'
      : items.length + ' photos waiting, oldest first.');
  }

  function buildCard(item) {
    var card = document.createElement('article');
    card.className = 'psg-file-card';

    var img = document.createElement('img');
    img.src = '/api/admin/photo/' + encodeURIComponent(item.id) + '?v=thumb';
    img.alt = item.caption || 'Photo waiting for review, from ' + (item.email || 'a whānau member');
    img.loading = 'lazy';
    card.appendChild(img);

    var capLabel = document.createElement('label');
    capLabel.setAttribute('for', 'cap-' + item.id);
    capLabel.textContent = 'Caption (you can tidy it before approving)';
    card.appendChild(capLabel);

    var capInput = document.createElement('input');
    capInput.type = 'text';
    capInput.id = 'cap-' + item.id;
    capInput.value = item.caption || '';
    capInput.maxLength = 200;
    card.appendChild(capInput);

    var meta = document.createElement('p');
    meta.className = 'psg-file-card__meta';
    meta.textContent = 'From ' + (item.email || 'unknown') + ' \u00b7 sent ' + friendlyDate(item.uploaded) +
      (item.name ? ' \u00b7 n\u0101 ' + item.name : '');
    card.appendChild(meta);

    var row = document.createElement('div');
    row.className = 'psg-file-card__actions';

    var approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn';
    approve.textContent = 'Approve';
    approve.addEventListener('click', function () { act(item.id, 'approve', capInput.value); });

    var reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'btn btn-outline';
    reject.textContent = 'Reject';
    reject.addEventListener('click', function () {
      // Deletion is forever — make sure the eyes behind the click mean it.
      var sure = window.confirm('Reject this photo? Deletion is forever — the photo and its details will be gone, and the sender isn\u2019t notified.');
      if (sure) { act(item.id, 'reject', capInput.value); }
    });

    row.appendChild(approve);
    row.appendChild(reject);
    card.appendChild(row);
    return card;
  }

  function act(id, action, caption) {
    if (busy) { return; }
    busy = true;
    say(adminMsg, action === 'approve' ? 'Approving\u2026' : 'Rejecting\u2026');
    var body = { id: id, action: action };
    if (typeof caption === 'string' && caption.length) { body.caption = caption.slice(0, 200); }

    post('/api/admin/action', body)
      .then(function (r) {
        if (r.status === 401) { show(loginView); return null; }
        if (!r.ok) { throw new Error('http ' + r.status); }
        return r.json();
      })
      .then(function (data) {
        if (!data) { return; }
        say(adminMsg, action === 'approve'
          ? 'Approved — ng\u0101 mihi! Refreshing the list\u2026'
          : 'Rejected and deleted. Refreshing the list\u2026');
        loadPending();
      })
      .catch(function () {
        say(adminMsg, 'That didn\u2019t go through — the photo is still there. Please try again.');
      })
      .then(function () { busy = false; });
  }

  checkSession();
})();
