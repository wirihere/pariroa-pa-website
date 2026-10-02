/* Pariroa Pā — share.js
   Tukuna mai: open upload — leave your email, on-device shrink, queued sends.
   Vanilla JS, no frameworks. Progressive where sensible. */
(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };

  var emailInput = $('psg-email'),
      uploadSection = $('psg-upload'),
      thanksSection = $('psg-thanks'),
      thanksText = $('psg-thanks-text'),
      sendMoreBtn = $('psg-send-more'),
      drop = $('psg-drop'),
      pickBtn = $('psg-pick-btn'),
      fileInput = $('psg-file-input'),
      dropMsg = $('psg-drop-msg'),
      fileList = $('psg-file-list'),
      sendAllBtn = $('psg-send-all'),
      sendCount = $('psg-send-count'),
      sendPlural = $('psg-send-plural');

  function say(el, text, kind) {
    el.textContent = text || '';
    el.className = kind ? 'psg-msg psg-msg--' + kind : '';
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
  }

  function currentEmail() {
    return (emailInput.value || '').trim().toLowerCase();
  }

  /* =========================================================
     THE SHRINK — client image pipeline
     Longest edge ≤2000px (never upscale) → canvas WebP 0.82
     (JPEG 0.85 fallback if WebP unsupported). Thumb ≤480px
     WebP 0.75. Drawing to canvas redraws only pixel data, so
     EXIF — including GPS location — is stripped: the sender's
     location goes away before anything leaves their device.
     ========================================================= */
  var MAX_EDGE_FULL = 2000,
      MAX_EDGE_THUMB = 480,
      MAX_ORIGINAL_BYTES = 60 * 1024 * 1024,
      MAX_FILES = 20,
      MAX_CONCURRENT_UPLOADS = 2;

  var webpOK = (function () {
    try {
      var c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
  })();

  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return decodeImgEl(file); });
    }
    return decodeImgEl(file);
  }

  function decodeImgEl(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function fitted(w, h, maxEdge) {
    var scale = Math.min(1, maxEdge / Math.max(w, h)); // never upscale
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  }

  function drawTo(source, sw, sh, maxEdge, type, quality) {
    var size = fitted(sw, sh, maxEdge);
    var canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    canvas.getContext('2d').drawImage(source, 0, 0, size.w, size.h);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        // Canvas redraw drops EXIF (incl. GPS) — see block comment above.
        if (blob) resolve({ blob: blob, w: size.w, h: size.h });
        else reject(new Error('encode'));
      }, type, quality);
    });
  }

  function shrink(file) {
    return decode(file).then(function (src) {
      var sw = src.width, sh = src.height;
      var fullType = webpOK ? 'image/webp' : 'image/jpeg';
      var fullQ = webpOK ? 0.82 : 0.85;
      var fullP = drawTo(src, sw, sh, MAX_EDGE_FULL, fullType, fullQ);
      var thumbP = drawTo(src, sw, sh, MAX_EDGE_THUMB, webpOK ? 'image/webp' : 'image/jpeg', 0.75);
      return Promise.all([fullP, thumbP]).then(function (rs) {
        if (src.close) src.close(); // free the ImageBitmap
        return { file: rs[0].blob, thumb: rs[1].blob, w: rs[0].w, h: rs[0].h };
      });
    });
  }

  /* ---------- file cards ---------- */
  var items = [];   // {file, cardEl, state}
  var uploading = 0, nextIndex = 0, doneCount = 0, failCount = 0;

  function fmtKB(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function updateSendAll() {
    var waiting = items.filter(function (it) { return it.state === 'ready'; }).length;
    sendAllBtn.hidden = waiting === 0;
    sendCount.textContent = waiting;
    sendPlural.textContent = waiting === 1 ? '' : 's';
  }

  function addFiles(fileListRaw) {
    var fresh = Array.prototype.slice.call(fileListRaw).filter(function (f) {
      return f.type.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name);
    });
    fresh.forEach(function (f) {
      if (items.length >= MAX_FILES) {
        say(dropMsg, 'That is ' + MAX_FILES + ' photos — the most we can take in one go. Send the rest next round.', 'error');
        return;
      }
      if (f.size > MAX_ORIGINAL_BYTES) {
        say(dropMsg, f.name + ' is too big (over 60 MB) — even for us. A smaller copy would be tika.', 'error');
        return;
      }
      addItem(f);
    });
    updateSendAll();
  }

  function addItem(file) {
    var li = document.createElement('li');
    li.className = 'psg-file-card';
    li.setAttribute('role', 'group');
    li.setAttribute('aria-label', 'Photo: ' + file.name);

    var previewId = 'psg-pv-' + items.length;
    var capId = 'psg-cap-' + items.length;
    var nameId = 'psg-nm-' + items.length;
    var showId = 'psg-show-' + items.length;
    var statusId = 'psg-st-' + items.length;

    li.innerHTML =
      '<img class="psg-file-card__preview" id="' + previewId + '" alt="Preview of ' + file.name.replace(/"/g, '&quot;') + '">' +
      '<div class="psg-file-card__body">' +
        '<p class="psg-file-card__name"></p>' +
        '<p class="psg-file-card__size" data-size-line>' + fmtKB(file.size) + '</p>' +
        '<div class="psg-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Upload progress for ' + file.name.replace(/"/g, '&quot;') + '"><div class="psg-progress__bar"></div></div>' +
        '<p class="psg-file-card__status" id="' + statusId + '" role="status"></p>' +
        '<label for="' + capId + '">Caption (optional)</label>' +
        '<input type="text" id="' + capId + '" maxlength="200" placeholder="e.g. Christmas at the pā, 1998">' +
        '<label for="' + nameId + '">Your name (optional)</label>' +
        '<input type="text" id="' + nameId + '" maxlength="80" placeholder="e.g. Aunty Mere">' +
        '<label class="psg-file-card__show"><input type="checkbox" id="' + showId + '" value="1"> Show my name with this photo</label>' +
      '</div>' +
      '<button type="button" class="psg-file-card__remove" aria-label="Remove ' + file.name.replace(/"/g, '&quot;') + '">Remove</button>';

    li.querySelector('.psg-file-card__name').textContent = file.name;
    fileList.appendChild(li);

    // local preview (original object URL; small enough for a peek)
    var pv = li.querySelector('#' + previewId);
    pv.src = URL.createObjectURL(file);
    pv.onload = function () { URL.revokeObjectURL(pv.src); };

    var item = { file: file, li: li, state: 'shrinking', captionEl: li.querySelector('#' + capId),
                 nameEl: li.querySelector('#' + nameId), showEl: li.querySelector('#' + showId),
                 statusEl: li.querySelector('#' + statusId), prog: li.querySelector('.psg-progress'),
                 bar: li.querySelector('.psg-progress__bar') };
    items.push(item);

    li.querySelector('.psg-file-card__remove').addEventListener('click', function () {
      if (item.state === 'uploading') return; // never yank an in-flight card
      items.splice(items.indexOf(item), 1);
      li.remove();
      updateSendAll();
    });

    item.statusEl.textContent = 'Getting it ready…';

    // shrink now; card turns "ready" when done
    shrink(file).then(function (out) {
      if (items.indexOf(item) === -1) return; // removed meanwhile
      item.shrunk = out;
      item.state = 'ready';
      var line = li.querySelector('[data-size-line]');
      line.textContent = fmtKB(file.size) + ' → ' + fmtKB(out.file.size);
      item.statusEl.textContent = 'Ready to send.';
      updateSendAll();
    }).catch(function () {
      if (items.indexOf(item) === -1) return;
      item.state = 'failed';
      item.statusEl.textContent = 'We could not read this one — try a JPG or a normal phone photo.';
      updateSendAll();
    });
  }

  /* ---------- drag & drop + picker ---------- */
  pickBtn.addEventListener('click', function () { fileInput.click(); });
  drop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-drag'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ---------- upload queue: 2 at a time, one failure never stops the rest ---------- */
  function uploadOne(item) {
    return new Promise(function (resolve) {
      var fd = new FormData();
      var ext = item.shrunk.file.type.indexOf('jpeg') === 0 ? 'jpg' : 'webp';
      fd.append('email', currentEmail());
      fd.append('file', item.shrunk.file, 'photo.' + ext);
      fd.append('thumb', item.shrunk.thumb, 'thumb.' + ext);
      fd.append('caption', (item.captionEl.value || '').slice(0, 200));
      fd.append('name', (item.nameEl.value || '').slice(0, 80));
      fd.append('showName', item.showEl.checked ? '1' : '0');
      fd.append('width', String(item.shrunk.w));
      fd.append('height', String(item.shrunk.h));

      var xhr = new XMLHttpRequest(); // XHR for upload progress — fetch has none
      xhr.open('POST', '/api/upload');
      item.prog.setAttribute('aria-valuenow', '0');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          item.bar.style.width = pct + '%';
          item.prog.setAttribute('aria-valuenow', String(pct));
        }
      };
      xhr.onload = function () {
        if (xhr.status === 200) {
          item.bar.style.width = '100%';
          item.state = 'done';
          item.statusEl.textContent = '✓ Sent — ngā mihi!';
          item.li.classList.add('is-done');
          resolve('ok');
        } else if (xhr.status === 429) {
          try {
            var body = JSON.parse(xhr.responseText);
            if (body.retryTomorrow) {
              item.state = 'failed';
              item.statusEl.textContent = 'Daily limit reached — more tomorrow. ' + item.file.name + ' was not sent.';
              resolve('limit');
              return;
            }
          } catch (e) { /* fall through */ }
          item.state = 'failed';
          item.statusEl.textContent = 'Daily limit reached — more tomorrow.';
          resolve('limit');
        } else {
          item.state = 'failed';
          item.statusEl.textContent = 'That one did not go through (' + xhr.status + '). You can try again.';
          item.li.classList.add('is-error');
          resolve('fail');
        }
      };
      xhr.onerror = function () {
        item.state = 'failed';
        item.statusEl.textContent = 'Connection dropped — check your internet and try again.';
        item.li.classList.add('is-error');
        resolve('fail');
      };
      xhr.send(fd);
    });
  }

  function pump() {
    while (uploading < MAX_CONCURRENT_UPLOADS && nextIndex < items.length) {
      var item = items[nextIndex++];
      if (item.state !== 'ready') { continue; }
      item.state = 'uploading';
      item.statusEl.textContent = 'Sending…';
      uploading++;
      uploadOne(item).then(function (result) {
        uploading--;
        if (result === 'ok') doneCount++;
        else failCount++;
        if (nextIndex >= items.length && uploading === 0) finishBatch();
        else pump();
      });
    }
  }

  function finishBatch() {
    var sent = doneCount, failed = failCount;
    items = []; nextIndex = 0; doneCount = 0; failCount = 0;
    if (sent > 0) {
      var email = currentEmail();
      thanksText.textContent = failed > 0
        ? 'Ngā mihi — ' + sent + ' photo' + (sent === 1 ? ' is' : 's are') + ' with the administrators now. We\u2019ll be in touch at ' + email + ' when they\u2019re posted. (' + failed + ' did not send — you can try those again.)'
        : 'Ngā mihi — your photos are with the administrators now. We\u2019ll be in touch at ' + email + ' when they\u2019re posted on the site.';
      thanksSection.hidden = false;
      thanksSection.scrollIntoView({ behavior: 'smooth' });
      $('psg-send-more').focus();
    } else {
      say(dropMsg, 'None went through — please check your internet and try again.', 'error');
    }
    fileList.innerHTML = '';
    updateSendAll();
  }

  sendAllBtn.addEventListener('click', function () {
    say(dropMsg, '');
    if (!validEmail(currentEmail())) {
      say(dropMsg, 'Please leave your email above first — so we can tell you when your photos are posted.', 'error');
      emailInput.focus();
      return;
    }
    doneCount = 0; failCount = 0; nextIndex = 0;
    pump();
  });

  sendMoreBtn.addEventListener('click', function () {
    thanksSection.hidden = true;
    uploadSection.hidden = false;
    drop.focus();
  });
})();
