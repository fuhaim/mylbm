/*
 * Buku Kas LBM MWC NU Ngantang - aplikasi utama (satu closure DOMContentLoaded).
 * Bagian utama ditandai banner "=====". Fitur tambahan ada di kas-extras.js (kwitansi, rekap WhatsApp, rekonsiliasi).
 */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var CONFIG = {
    url: 'https://ngsscqcspbymzrjnmaso.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nc3NjcWNzcGJ5bXpyam5tYXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDAzMTQsImV4cCI6MjEwNDE3NjMxNH0.N0s7g-D9ObnPC43iE9LdM132LufJHqs8wT1rJIogmc4',
    table: 'transaksi_keuangan'
  };
  var isConfigured = CONFIG.url.indexOf('YOUR-PROJECT') === -1 && CONFIG.anonKey.indexOf('YOUR-ANON') === -1;
  var TABLE = CONFIG.table;
  var sb = null;

  var LAZY_LIBS = {
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.5.25/dist/jspdf.plugin.autotable.min.js',
    qrcode: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
  };

  var OS_REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var motionPref = null;
  var analyticsSTReady = false;
  var analyticsSTResizeTimer = null;
  try {
    motionPref = localStorage.getItem('kasMotion');
  } catch {}
  var liteMotion =
    motionPref === 'lite' ||
    (motionPref !== 'full' &&
      (function () {
        var conn = navigator.connection;
        return !!((conn && conn.saveData) || (navigator.deviceMemory && navigator.deviceMemory <= 2));
      })());
  var REDUCE_MOTION = OS_REDUCE || liteMotion;
  document.documentElement.classList.toggle('lite-motion', liteMotion);
  var HAS_FINE_HOVER = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ===== Animasi dasar (GSAP) ===== */
  function gsapOn() {
    return !REDUCE_MOTION && typeof window.gsap !== 'undefined';
  }

  function tweenFrom(target, vars) {
    if (gsapOn()) {
      return window.gsap.from(target, vars);
    }
    return null;
  }

  var allData = [];
  var pendingDelete = null;
  var hiddenIds = {};
  var sparkSig = '';
  var entranceArmed = {};
  var hasLoadedOnce = false;
  var currentType = 'pemasukan';
  var accessToken = null;
  var currentUserEmail = null;
  var manualSignOut = false;
  var editingId = null;
  var filters = { search: '', type: '', from: '', to: '' };
  var currentPage = 1;
  var PAGE_SIZE = 8;
  var importPage = 1;
  var lastSyncAt = null;
  var isFetching = false;
  var heroAnimated = false;
  var lastStatValues = { balance: null, income: null, expense: null };
  var selectedYear = 'all';
  var parsedImportRows = [];
  var parsedImportErrors = [];
  var allocationChartInstance = null;
  var monthlyChartInstance = null;
  var trendChartInstance = null;

  var dataVersion = 0;
  var memo = {};
  function bumpData() {
    dataVersion++;
    memo = {};
  }
  function cached(key, build) {
    if (memo[key] === undefined) memo[key] = build();
    return memo[key];
  }
  var idleRun = window.requestIdleCallback
    ? function (fn) {
        window.requestIdleCallback(fn, { timeout: 260 });
      }
    : function (fn) {
        setTimeout(fn, 1);
      };

  /* ===== Util antarmuka: status, toast, dialog konfirmasi, tombol sibuk ===== */
  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, type) {
    var el = $('statusMsg');
    el.textContent = msg || '';
    el.className = 'status-banner' + (type ? ' ' + type : '');
  }

  function toast(msg, type, opts) {
    opts = opts || {};
    var box = document.createElement('div');
    box.className = 'toast' + (type ? ' ' + type : '');
    box.setAttribute('role', type === 'error' ? 'alert' : 'status');
    if (opts.undo) {
      box.innerHTML =
        '<div class="toast-undo"><span></span><button type="button" class="toast-undo-btn">Batalkan</button></div>';
      box.querySelector('span').textContent = msg;
      box.querySelector('.toast-undo-btn').addEventListener('click', function () {
        opts.undo();
        removeToast(box);
      });
    } else {
      box.textContent = msg;
    }
    $('toastContainer').appendChild(box);
    var life = opts.duration || (opts.undo ? 6000 : 3200);
    setTimeout(function () {
      removeToast(box);
    }, life);
    return box;
  }
  function removeToast(box) {
    if (!box || !box.parentNode) return;
    box.classList.add('leaving');
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 320);
  }

  var modalPrevFocus = null;
  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var overlay = $('modalOverlay');
      var box = overlay.querySelector('.modal-box');
      $('modalTitle').textContent = opts.title || 'Konfirmasi';
      $('modalMessage').textContent = opts.message || '';
      var previewBox = $('modalPreview');
      if (opts.preview) {
        previewBox.innerHTML = opts.preview;
        previewBox.classList.remove('hidden');
      } else {
        previewBox.innerHTML = '';
        previewBox.classList.add('hidden');
      }
      var input = $('modalInput');
      var confirmBtn = $('modalConfirmBtn');
      var cancelBtn = $('modalCancelBtn');
      confirmBtn.querySelector('.btn-label').textContent = opts.confirmLabel || 'Konfirmasi';
      confirmBtn.className = 'btn' + (opts.danger ? '' : '');
      box.style.borderTopColor = opts.danger === false ? 'var(--primary)' : 'var(--expense)';
      if (opts.requireText) {
        input.classList.remove('hidden');
        input.value = '';
        input.placeholder = 'Ketik "' + opts.requireText + '"';
        confirmBtn.disabled = true;
      } else {
        input.classList.add('hidden');
        confirmBtn.disabled = false;
      }
      modalPrevFocus = document.activeElement;
      overlay.classList.remove('hidden');
      tweenFrom(box, { opacity: 0, scale: 0.92, y: 10, duration: 0.28, ease: 'back.out(1.4)' });
      var focusables = overlay.querySelectorAll('button, input');
      setTimeout(function () {
        (opts.requireText ? input : cancelBtn).focus();
      }, 30);

      function onInput() {
        if (opts.requireText) confirmBtn.disabled = input.value.trim() !== opts.requireText;
      }
      function cleanup() {
        overlay.classList.add('hidden');
        input.removeEventListener('input', onInput);
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('keydown', onKeydown);
        overlay.removeEventListener('mousedown', onBackdrop);
        if (modalPrevFocus && modalPrevFocus.focus) modalPrevFocus.focus();
      }
      function onConfirm() {
        if (confirmBtn.disabled) return;
        cleanup();
        resolve(true);
      }
      function onCancel() {
        cleanup();
        resolve(false);
      }
      function onBackdrop(ev) {
        if (ev.target === overlay) onCancel();
      }
      function onKeydown(e) {
        if (e.key === 'Escape') {
          onCancel();
          return;
        }
        if (e.key === 'Tab' && focusables.length) {
          var first = focusables[0],
            last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      input.addEventListener('input', onInput);
      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('keydown', onKeydown);
      overlay.addEventListener('mousedown', onBackdrop);
    });
  }

  function txPreviewHtml(record) {
    var isIn = record.jenis === 'pemasukan';
    var tone = isIn ? 'var(--primary)' : 'var(--expense)';
    return (
      '<div class="modal-preview">' +
      '<div class="modal-preview-top">' +
      '<span class="modal-preview-note">' +
      escapeHtml(record.keterangan) +
      '</span>' +
      '<span class="modal-preview-amt" style="color:' +
      tone +
      '">' +
      (isIn ? '+' : '\u2212') +
      formatRupiah(record.jumlah) +
      '</span>' +
      '</div>' +
      '<div class="modal-preview-meta">' +
      '<span class="kas-dot" style="background:' +
      tone +
      '"></span>' +
      (isIn ? 'Pemasukan' : 'Pengeluaran') +
      ' \u00B7 ' +
      formatTanggal(record.tanggal) +
      ' \u00B7 dicatat oleh ' +
      escapeHtml(record.nama_pengisi || '\u2014') +
      '</div></div>'
    );
  }

  function withBusyButton(btn, promiseFn, busyLabel) {
    var labelEl = btn.querySelector('.btn-label');
    var originalLabel = labelEl ? labelEl.textContent : btn.textContent;
    var spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.insertBefore(spinner, btn.firstChild);
    if (labelEl && busyLabel) labelEl.textContent = busyLabel;
    function restore() {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
      if (labelEl && busyLabel && labelEl.textContent === busyLabel) labelEl.textContent = originalLabel;
    }
    function setStage(txt) {
      if (labelEl) labelEl.textContent = txt;
    }
    return promiseFn(setStage)
      .then(function (r) {
        restore();
        return r;
      })
      .catch(function (err) {
        restore();
        throw err;
      });
  }

  /* ===== Status online, PWA, dan modul tambahan ===== */
  function updateOnlineStatus() {
    $('offlineBanner').classList.toggle('hidden', navigator.onLine);
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  function setupPwaExtras() {
    var logoDataUrl = document.querySelector('.logo-img').getAttribute('src');
    var icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = logoDataUrl;
    document.head.appendChild(icon);
    var appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.href = logoDataUrl;
    document.head.appendChild(appleIcon);
  }
  try {
    setupPwaExtras();
  } catch {}

  function kasApi() {
    return {
      rows: function () {
        return allData;
      },
      summaryOf: computeSummaryFrom,
      formatRupiah: formatRupiah,
      formatTanggal: formatTanggal,
      formatThousands: formatThousands,
      parseAmountInput: parseAmountInput,
      toast: toast,
      confirmModal: confirmModal,
      withBusyButton: withBusyButton,
      ensurePDF: ensurePDF,
      insertTransaksi: insertTransaksi,
      reload: function () {
        return loadAndRender(true);
      },
      handleError: handleDataError
    };
  }
  try {
    if (window.KasExtras) window.KasExtras.init(kasApi());
  } catch (err) {
    /* fitur tambahan tidak boleh mengganggu aplikasi */
  }

  /* ===== Cache lokal dan pemuat pustaka (jsPDF, QR, XLSX) ===== */
  function saveCache(rows) {
    try {
      var slim = rows.map(function (r) {
        return {
          id: r.id,
          tanggal: r.tanggal,
          tipe: r.tipe,
          jenis: r.jenis,
          jumlah: r.jumlah,
          keterangan: r.keterangan,
          nama: r.nama,
          nama_pengisi: r.nama_pengisi
        };
      });
      localStorage.setItem('kasLbmNgantangCacheV1', JSON.stringify({ rows: slim, savedAt: Date.now() }));
    } catch {}
  }
  function loadCache() {
    try {
      var raw = localStorage.getItem('kasLbmNgantangCacheV1');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  var scriptLoadPromises = {};
  function loadScript(libKey) {
    if (scriptLoadPromises[libKey]) return scriptLoadPromises[libKey];
    scriptLoadPromises[libKey] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LAZY_LIBS[libKey];
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        delete scriptLoadPromises[libKey];
        reject(new Error('Gagal memuat pustaka: ' + libKey));
      };
      document.head.appendChild(s);
    });
    return scriptLoadPromises[libKey];
  }
  function ensurePDF() {
    return loadScript('jspdf').then(function () {
      return loadScript('autotable');
    });
  }
  function ensureQRCode() {
    return loadScript('qrcode');
  }
  function ensureXLSX() {
    return loadScript('xlsx');
  }

  /* ===== Data transaksi: adapter, baca berhalaman, tulis, hapus ===== */
  function unwrap(res) {
    if (res.error) throw res.error;
    return res.data || [];
  }

  function normalizeRowJenis(row) {
    var canon = parseJenisCell(row.tipe);
    row.jenis =
      canon !== null
        ? canon
        : String(row.tipe == null ? '' : row.tipe)
            .trim()
            .toLowerCase();
    row.nama_pengisi = row.nama == null ? '' : row.nama;
    row._amt = Number(row.jumlah) || 0;
    row._in = row.jenis === 'pemasukan';
    row._ym = String(row.tanggal || '').slice(0, 7);
    row._s = ((row.keterangan || '') + ' ' + (row.nama_pengisi || '')).toLowerCase();
    return row;
  }
  function normalizeRows(rows) {
    for (var i = 0; i < rows.length; i++) normalizeRowJenis(rows[i]);
    return rows;
  }
  function setAllData(rows) {
    if (Object.keys(hiddenIds).length)
      rows = rows.filter(function (r) {
        return !hiddenIds[String(r.id)];
      });
    allData = rows;
    bumpData();
  }

  var FETCH_PAGE = 1000;
  function fetchTransaksi() {
    var all = [];
    function nextPage(from) {
      return sb
        .from(TABLE)
        .select('*')
        .order('tanggal', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + FETCH_PAGE - 1)
        .then(unwrap)
        .then(function (chunk) {
          all = all.concat(chunk);
          return chunk.length === FETCH_PAGE ? nextPage(from + FETCH_PAGE) : all;
        });
    }
    return nextPage(0).then(normalizeRows);
  }

  function withFreshSession(queryFn) {
    return sb.auth.getSession().then(function (res) {
      if (res.error || !res.data.session) {
        var e = new Error(
          res.error ? 'Sesi berakhir, silakan masuk kembali.' : 'Anda belum masuk atau sesi telah berakhir.'
        );
        e.code = 'SESSION_EXPIRED';
        throw e;
      }
      var session = res.data.session;
      var nowSec = Math.floor(Date.now() / 1000);
      var isExpiredOrNear = !session.expires_at || session.expires_at - nowSec < 60;
      if (!isExpiredOrNear) return queryFn();

      return sb.auth.refreshSession().then(function (refreshRes) {
        if (refreshRes.error || !refreshRes.data || !refreshRes.data.session) {
          var e2 = new Error('Sesi berakhir, silakan masuk kembali.');
          e2.code = 'SESSION_EXPIRED';
          throw e2;
        }
        return queryFn();
      });
    });
  }

  function toDbPayload(row) {
    var out = {};
    for (var k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
    }
    if (Object.prototype.hasOwnProperty.call(out, 'jenis')) {
      out.tipe = out.jenis;
      delete out.jenis;
    }
    if (Object.prototype.hasOwnProperty.call(out, 'nama_pengisi')) {
      out.nama = out.nama_pengisi;
      delete out.nama_pengisi;
    }
    return out;
  }
  function insertTransaksi(payload) {
    return withFreshSession(function () {
      return sb.from(TABLE).insert(toDbPayload(payload)).select().then(unwrap).then(normalizeRows);
    });
  }
  function updateTransaksi(id, payload) {
    return withFreshSession(function () {
      return sb
        .from(TABLE)
        .update(toDbPayload(payload))
        .eq('id', id)
        .select()
        .then(unwrap)
        .then(normalizeRows)
        .then(function (rows) {
          if (!rows.length) {
            var e = new Error(
              'Transaksi tidak ditemukan atau tidak boleh diubah. Kemungkinan sudah dihapus atau izin ditolak. Data dimuat ulang.'
            );
            e.code = 'NO_ROWS';
            throw e;
          }
          return rows;
        });
    });
  }
  function insertTransaksiBulk(rows) {
    return withFreshSession(function () {
      return sb.from(TABLE).insert(rows.map(toDbPayload)).select().then(unwrap).then(normalizeRows);
    });
  }
  function deleteTransaksi(id) {
    return withFreshSession(function () {
      return sb.from(TABLE).delete().eq('id', id).select('id').then(unwrap);
    });
  }
  function deleteAllTransaksi() {
    return withFreshSession(function () {
      return sb.from(TABLE).delete().not('id', 'is', null).then(unwrap);
    });
  }

  /* ===== Hapus dengan batal (undo) ===== */
  function verifyRowGone(id) {
    return sb
      .from(TABLE)
      .select('id')
      .eq('id', id)
      .then(unwrap)
      .then(function (rows) {
        return rows.length === 0;
      });
  }
  function restoreRecord(record) {
    var rows = allData.slice();
    rows.push(record);
    rows.sort(function (a, b) {
      return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    setAllData(rows);
    renderAll();
    setTimeout(function () {
      var el = document.querySelector('#txList .row[data-id="' + record.id + '"]');
      if (el && !REDUCE_MOTION) {
        el.classList.remove('row-new');
        void el.offsetWidth;
        el.classList.add('row-new');
      }
    }, 90);
  }
  function runPendingDelete(p) {
    if (p.state !== 'pending') return Promise.resolve();
    p.state = 'running';
    return deleteTransaksi(p.id)
      .then(function (deleted) {
        if (pendingDelete === p) pendingDelete = null;
        delete hiddenIds[p.id];
        if (deleted.length) return loadAndRender(true);
        return verifyRowGone(p.id).then(function (gone) {
          if (gone) toast('Transaksi ini sudah tidak ada di database.', null);
          else
            toast('Penghapusan ditolak server. Cek izin (RLS) tabel di Supabase.', 'error', {
              duration: 6500
            });
          return loadAndRender(true);
        });
      })
      .catch(function (err) {
        if (pendingDelete === p) pendingDelete = null;
        delete hiddenIds[p.id];
        restoreRecord(p.record);
        handleDataError(err);
      });
  }
  function flushPendingDelete() {
    var p = pendingDelete;
    if (!p || p.state !== 'pending') return Promise.resolve();
    clearTimeout(p.timer);
    if (p.box) removeToast(p.box);
    return runPendingDelete(p);
  }
  function undoDelete(p) {
    if (pendingDelete !== p || p.state !== 'pending') {
      toast('Transaksi sudah terhapus permanen.', 'warn');
      return;
    }
    clearTimeout(p.timer);
    pendingDelete = null;
    delete hiddenIds[p.id];
    restoreRecord(p.record);
    toast('Penghapusan dibatalkan.', null);
  }
  function beginDelete(record, rowEl) {
    flushPendingDelete();
    var p = { id: String(record.id), record: record, state: 'pending', timer: null, box: null };
    pendingDelete = p;
    hiddenIds[p.id] = true;
    if (editingId !== null && String(editingId) === p.id) exitEditMode();
    function applyLocal() {
      setAllData(allData);
      renderAll();
    }
    if (rowEl && !REDUCE_MOTION) {
      rowEl.classList.add('row-leaving');
      setTimeout(applyLocal, 240);
    } else applyLocal();
    p.box = toast('Transaksi dihapus.', null, {
      undo: function () {
        undoDelete(p);
      },
      duration: 6000
    });
    p.timer = setTimeout(function () {
      runPendingDelete(p);
    }, 6400);
  }

  /* ===== Efek visual dan tema ===== */
  function bumpElement(el) {
    if (REDUCE_MOTION || !el || !el.animate) return;
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'ease-out' }
    );
  }
  function flyAmountToBalance(rec) {
    if (REDUCE_MOTION || !document.body.animate) return;
    var from = $('txSubmitBtn').getBoundingClientRect();
    var heroEl = $('heroBalance'),
      hero = heroEl.getBoundingClientRect();
    var floatBtn = $('floatBalanceBtn');
    var targetEl = null;
    if (hero.bottom > 0 && hero.top < window.innerHeight) targetEl = heroEl;
    else if (floatBtn.classList.contains('visible')) targetEl = floatBtn;
    if (!targetEl || !from.width) return;
    var target = targetEl.getBoundingClientRect();
    var isIn = rec.jenis === 'pemasukan';
    var chip = document.createElement('div');
    chip.className = 'fly-chip' + (isIn ? '' : ' expense');
    chip.textContent = (isIn ? '+' : '\u2212') + formatRupiah(rec.jumlah);
    chip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(chip);
    var cw = chip.offsetWidth,
      ch = chip.offsetHeight;
    var x0 = from.left + from.width / 2 - cw / 2,
      y0 = from.top + from.height / 2 - ch / 2;
    var x1 = target.left + target.width / 2 - cw / 2,
      y1 = target.top + target.height / 2 - ch / 2;
    var anim = chip.animate(
      [
        { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(0.6)', opacity: 0 },
        { transform: 'translate(' + x0 + 'px,' + (y0 - 28) + 'px) scale(1)', opacity: 1, offset: 0.22 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(0.72)', opacity: 0.15 }
      ],
      { duration: 760, easing: 'cubic-bezier(0.5, 0, 0.25, 1)', fill: 'forwards' }
    );
    anim.onfinish = function () {
      if (chip.parentNode) chip.parentNode.removeChild(chip);
      bumpElement(targetEl);
    };
  }

  function switchTheme(dark, btn) {
    if (!document.startViewTransition || REDUCE_MOTION) {
      applyTheme(dark);
      return;
    }
    var root = document.documentElement;
    var b = btn.getBoundingClientRect();
    var x = b.left + b.width / 2,
      y = b.top + b.height / 2;
    var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.classList.add('vt-theme');
    var t = document.startViewTransition(function () {
      applyTheme(dark);
    });
    function done() {
      root.classList.remove('vt-theme');
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }
    t.finished.then(done, done);
    t.updateCallbackDone.catch(function () {});
    t.ready.then(
      function () {
        root.animate(
          {
            clipPath: [
              'circle(0px at ' + x + 'px ' + y + 'px)',
              'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'
            ]
          },
          {
            duration: 560,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)'
          }
        );
      },
      function () {}
    );
  }

  /* ===== Muat dan render data ===== */
  function handleDataError(err) {
    var raw = (err && (err.message || err.error_description || '')) || '';
    var hint = err && err.hint;
    var msg;

    if (err && (err.code === 'SESSION_EXPIRED' || err.code === 'NO_ROWS')) {
      msg = err.message;
    } else if (!navigator.onLine) {
      msg = 'Tidak ada koneksi internet. Menampilkan data tersimpan terakhir.';
    } else if ((err && err.status === 401) || /JWT|token|auth/i.test(raw)) {
      msg = 'Sesi berakhir, silakan masuk kembali.';
    } else if (
      (err && err.code === '42501') ||
      (err && err.status === 403) ||
      /permission|policy|RLS/i.test(raw)
    ) {
      msg =
        'Tidak punya akses untuk aksi ini' +
        (hint ? ': ' + hint : ' (cek kebijakan RLS tabel ' + TABLE + ' di dashboard Supabase).');
    } else if (/network|fetch/i.test(raw)) {
      msg = 'Koneksi ke server terputus. Coba lagi sebentar.';
    } else if (raw) {
      msg = 'Gagal: ' + raw;
    } else {
      msg = 'Terjadi kendala saat memuat data.';
    }
    setStatus(msg, 'error');
    toast(msg, 'error');
  }

  var fetchPromise = null,
    refetchQueued = false;
  function loadAndRender(silent) {
    if (!isConfigured) return Promise.resolve();
    if (isFetching) {
      refetchQueued = true;
      return fetchPromise;
    }
    isFetching = true;
    var wasLoaded = hasLoadedOnce;
    var oldCount = allData.length;
    var oldSummary = computeSummaryFrom(allData);

    fetchPromise = fetchTransaksi()
      .then(function (rows) {
        setAllData(rows);
        var newSummary = computeSummary();
        var changed =
          !wasLoaded ||
          oldCount !== allData.length ||
          oldSummary.balance !== newSummary.balance ||
          oldSummary.income !== newSummary.income ||
          oldSummary.expense !== newSummary.expense;
        hasLoadedOnce = true;
        renderAll();
        markSynced();
        saveCache(allData);
        setStatus('');
        if (wasLoaded && silent && changed) pulseStats();
      })
      .catch(function (err) {
        if (!silent) handleDataError(err);
        if (!hasLoadedOnce) {
          hasLoadedOnce = true;
          renderAll();
        }
      })
      .finally(function () {
        isFetching = false;
        if (refetchQueued) {
          refetchQueued = false;
          return loadAndRender(true);
        }
      });
    return fetchPromise;
  }

  var RP_FORMATTER = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  /* ===== Format angka dan tanggal ===== */
  function formatRupiah(n) {
    return RP_FORMATTER.format(Math.round(n || 0)).replace(/\s/g, ' ');
  }
  function formatTanggal(iso) {
    if (!iso) return '-';
    var d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function formatThousands(digitsOnly) {
    return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function parseAmountInput(str) {
    return parseInt((str || '').replace(/\D/g, ''), 10) || 0;
  }
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function isoLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* ===== Ringkasan dan seri bulanan ===== */
  function computeSummaryFrom(rows) {
    var income = 0,
      expense = 0;
    for (var i = 0; i < rows.length; i++) {
      var amt = rows[i]._amt !== undefined ? rows[i]._amt : Number(rows[i].jumlah) || 0;
      if (rows[i]._in !== undefined ? rows[i]._in : rows[i].jenis === 'pemasukan') income += amt;
      else expense += amt;
    }
    return { income: income, expense: expense, balance: income - expense };
  }
  function computeSummary() {
    return cached('summary', function () {
      return computeSummaryFrom(allData);
    });
  }

  var MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function getAvailableYears() {
    return cached('years', function () {
      var idx = getMonthIndex(),
        set = {},
        out = [];
      for (var i = 0; i < idx.keys.length; i++) {
        var y = idx.keys[i].slice(0, 4);
        if (!set[y]) {
          set[y] = true;
          out.push(y);
        }
      }
      return out.sort();
    });
  }

  function getMonthIndex() {
    return cached('monthIndex', function () {
      var map = {},
        keys = [];
      for (var i = 0; i < allData.length; i++) {
        var row = allData[i],
          key = row._ym;
        if (!key) continue;
        if (!map[key]) {
          map[key] = { income: 0, expense: 0 };
          keys.push(key);
        }
        if (row._in) map[key].income += row._amt;
        else map[key].expense += row._amt;
      }
      keys.sort();
      return { map: map, keys: keys };
    });
  }

  function labelForYm(ym, multiYear) {
    var mm = parseInt(ym.slice(5, 7), 10) - 1;
    return MONTH_LABELS[mm] + (multiYear ? " '" + ym.slice(2, 4) : '');
  }
  function computeMonthlySeriesFromRows(rows, multiYear) {
    var buckets = {},
      order = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i],
        key = row._ym || String(row.tanggal || '').slice(0, 7);
      if (!key) continue;
      if (!buckets[key]) {
        buckets[key] = { income: 0, expense: 0 };
        order.push(key);
      }
      var amt = row._amt !== undefined ? row._amt : Number(row.jumlah) || 0;
      if (row._in !== undefined ? row._in : row.jenis === 'pemasukan') buckets[key].income += amt;
      else buckets[key].expense += amt;
    }
    order.sort();
    var labels = [],
      income = [],
      expense = [];
    for (var k = 0; k < order.length; k++) {
      labels.push(labelForYm(order[k], multiYear));
      income.push(buckets[order[k]].income);
      expense.push(buckets[order[k]].expense);
    }
    return { labels: labels, income: income, expense: expense, keys: order };
  }
  function computeMonthlySeries(year) {
    var all = !year || year === 'all';
    return cached('series:' + (all ? 'all' : year), function () {
      var idx = getMonthIndex();
      var labels = [],
        income = [],
        expense = [],
        keys = [];
      for (var i = 0; i < idx.keys.length; i++) {
        var key = idx.keys[i];
        if (!all && key.slice(0, 4) !== year) continue;
        keys.push(key);
        labels.push(labelForYm(key, all));
        income.push(idx.map[key].income);
        expense.push(idx.map[key].expense);
      }
      return { labels: labels, income: income, expense: expense, keys: keys };
    });
  }
  function computeMonthOverMonth() {
    var series = computeMonthlySeries('all');
    var n = series.labels.length;
    if (n < 2) return { income: null, expense: null };
    function pctChange(cur, prev) {
      if (!prev) return cur > 0 ? 100 : 0;
      return ((cur - prev) / prev) * 100;
    }
    return {
      income: pctChange(series.income[n - 1], series.income[n - 2]),
      expense: pctChange(series.expense[n - 1], series.expense[n - 2])
    };
  }
  function trendBadge(pct) {
    if (pct === null || !isFinite(pct)) return '';
    var arrow = pct >= 0 ? '&#9650;' : '&#9660;';
    return (
      '<span class="on-screen">' +
      (pct >= 0 ? 'Naik ' : 'Turun ') +
      Math.abs(Math.round(pct)) +
      '% dibanding bulan lalu</span><span class="on-print">' +
      arrow +
      ' ' +
      Math.abs(Math.round(pct)) +
      '% vs bulan lalu</span>'
    );
  }

  /* ===== Grafik: sparkline hero, donat, Chart.js ===== */
  function renderHeroSparkline() {
    var el = $('heroSparkline');
    var series = computeMonthlySeries('all');
    if (series.labels.length < 2) {
      el.innerHTML = '';
      window.dispatchEvent(new CustomEvent('kas-series', { detail: [] }));
      return;
    }
    var running = 0,
      points = [];
    for (var i = 0; i < series.labels.length; i++) {
      running += series.income[i] - series.expense[i];
      points.push(running);
    }
    var w = 220,
      h = 40,
      pad = 4;
    var min = Math.min.apply(null, points),
      max = Math.max.apply(null, points);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var stepX = (w - pad * 2) / (points.length - 1);
    var coords = points.map(function (v, i) {
      var x = pad + i * stepX;
      var y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      return [x, y];
    });
    var pathD = coords
      .map(function (c, i) {
        return (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1);
      })
      .join(' ');
    var areaD =
      pathD +
      ' L' +
      coords[coords.length - 1][0].toFixed(1) +
      ',' +
      h +
      ' L' +
      coords[0][0].toFixed(1) +
      ',' +
      h +
      ' Z';
    var last = coords[coords.length - 1];
    var sig = w + ',' + h + ',' + pathD;
    if (sig === sparkSig && el.firstChild) return;
    sparkSig = sig;
    window.dispatchEvent(new CustomEvent('kas-series', { detail: points }));
    el.innerHTML =
      '<svg viewBox="0 0 ' +
      w +
      ' ' +
      h +
      '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fff" stop-opacity="0.45"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' +
      areaD +
      '" fill="url(#sparkFill)" stroke="none"/>' +
      '<path d="' +
      pathD +
      '" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle class="spark-ping" cx="' +
      last[0].toFixed(1) +
      '" cy="' +
      last[1].toFixed(1) +
      '" r="2.6" fill="#fff"/>' +
      '<circle cx="' +
      last[0].toFixed(1) +
      '" cy="' +
      last[1].toFixed(1) +
      '" r="2.6" fill="#fff"/>' +
      '</svg>';
    if (!REDUCE_MOTION) drawOnSparkline(el);
  }
  function drawOnSparkline(el) {
    var paths = el.querySelectorAll('svg path');
    if (paths.length < 2) return;
    if (gsapOn() && typeof window.DrawSVGPlugin !== 'undefined') {
      gsap.fromTo(
        paths[1],
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 1.1, delay: 0.25, ease: 'expo.out' }
      );
      gsap.fromTo(paths[0], { opacity: 0 }, { opacity: 1, duration: 0.7, delay: 0.7, ease: 'power1.out' });
      gsap.fromTo(el.querySelectorAll('circle'), { opacity: 0 }, { opacity: 1, duration: 0.22, delay: 1.25 });
      return;
    }
    if (!paths[1].animate || !paths[1].getTotalLength) return;
    var len = Math.ceil(paths[1].getTotalLength());
    if (!len) return;
    paths[1].animate(
      [
        { strokeDasharray: len, strokeDashoffset: len },
        { strokeDasharray: len, strokeDashoffset: 0 }
      ],
      { duration: 1100, delay: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
    );
    paths[0].animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 700,
      delay: 700,
      easing: 'ease-out',
      fill: 'backwards'
    });
    var dots = el.querySelectorAll('circle');
    for (var i = 0; i < dots.length; i++)
      dots[i].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 1250, fill: 'backwards' });
  }

  function getChartColors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      primary: dark ? '#22C17A' : '#0D6B3F',
      expense: dark ? '#E2694F' : '#A6321D',
      secondary: dark ? '#E8C97A' : '#C89B3C',
      text: dark ? '#EAF3EC' : '#1C2018',
      muted: dark ? '#9DB3A4' : '#6B7263',
      grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,22,0.06)'
    };
  }
  function buildAreaGradient(ctx, chartArea, hexColor) {
    var g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, hexColor + '55');
    g.addColorStop(1, hexColor + '02');
    return g;
  }
  function makeAreaGradientFn(colorKey) {
    return function (context) {
      var chart = context.chart,
        area = chart.chartArea;
      if (!area) return null;
      return buildAreaGradient(chart.ctx, area, getChartColors()[colorKey]);
    };
  }
  function fitDonutFont(ctx, text, weight, family, startSize, maxWidth) {
    var size = startSize;
    while (size > 7) {
      ctx.font = weight + ' ' + size + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 0.5;
    }
    return size;
  }
  var donutCenterTextPlugin = {
    id: 'donutCenterText',
    afterDraw: function (chart, args, opts) {
      if (!opts || !opts.enabled) return;
      var meta = chart.getDatasetMeta(0);
      if (!meta.data.length) return;
      var arc = meta.data[0],
        ctx = chart.ctx,
        innerR = arc.innerRadius,
        maxWidth = innerR * 1.45;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var valueSize = fitDonutFont(
        ctx,
        opts.value,
        '800',
        opts.fontFamily,
        Math.min(opts.valueSize, innerR * 0.36),
        maxWidth
      );
      ctx.fillStyle = opts.color;
      ctx.font = '800 ' + valueSize + 'px ' + opts.fontFamily;
      ctx.fillText(opts.value, arc.x, arc.y - valueSize * 0.62);
      var labelSize = fitDonutFont(
        ctx,
        opts.label,
        '600',
        opts.fontFamily,
        Math.min(opts.labelSize, innerR * 0.24),
        maxWidth
      );
      ctx.font = '600 ' + labelSize + 'px ' + opts.fontFamily;
      ctx.fillStyle = opts.mutedColor;
      ctx.fillText(opts.label, arc.x, arc.y + valueSize * 0.62);
      ctx.restore();
    }
  };
  var donutPercentLabelsPlugin = {
    id: 'donutPercentLabels',
    afterDraw: function (chart, args, opts) {
      if (!opts || !opts.enabled) return;
      var ctx = chart.ctx,
        meta = chart.getDatasetMeta(0),
        data = chart.data.datasets[0].data;
      var total = 0;
      for (var t = 0; t < data.length; t++) total += data[t];
      if (!total) return;
      for (var i = 0; i < meta.data.length; i++) {
        var val = data[i];
        if (!val) continue;
        var pct = Math.round((val / total) * 100);
        if (pct < 8) continue;
        var arc = meta.data[i];
        var mid = (arc.startAngle + arc.endAngle) / 2;
        var fit = !!opts.fit;
        var r = arc.innerRadius + (arc.outerRadius - arc.innerRadius) * (fit ? 0.5 : 0.62);
        var x = arc.x + Math.cos(mid) * r,
          y = arc.y + Math.sin(mid) * r;
        ctx.save();
        ctx.font = (fit ? '700' : '800') + ' 11px ' + (opts.fontFamily || 'sans-serif');
        var tw = ctx.measureText(pct + '%').width;
        if (!fit || tw + 4 <= (arc.outerRadius - arc.innerRadius) * 1.15) {
          if (fit) x = Math.max(tw / 2 + 1, Math.min(chart.width - tw / 2 - 1, x));
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (!fit) {
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 3;
          }
          ctx.fillText(pct + '%', x, y);
        }
        ctx.restore();
      }
    }
  };
  if (typeof Chart !== 'undefined') Chart.register(donutCenterTextPlugin, donutPercentLabelsPlugin);

  function armChartEntrance(id, getChart) {
    if (entranceArmed[id] || REDUCE_MOTION || !('IntersectionObserver' in window)) return;
    entranceArmed[id] = true;
    var io = new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        var c = getChart();
        if (c) {
          c.reset();
          c.update();
        }
      },
      { threshold: 0.3 }
    );
    io.observe($(id));
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') return;
    var summary = computeSummary();
    var colors = getChartColors();
    var hasAny = summary.income > 0 || summary.expense > 0;
    var allocData = hasAny ? [summary.income, summary.expense] : [1, 1];

    $('allocationEmpty').classList.toggle('hidden', hasAny);
    var centerOpts = {
      enabled: true,
      value: formatRupiah(summary.income + summary.expense),
      label: 'Total Arus Kas',
      color: colors.text,
      mutedColor: colors.muted,
      valueSize: 15,
      labelSize: 9.5,
      fontFamily: 'Plus Jakarta Sans, sans-serif'
    };
    if (!allocationChartInstance) {
      allocationChartInstance = new Chart($('allocationChart').getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Pemasukan', 'Pengeluaran'],
          datasets: [
            {
              data: allocData,
              backgroundColor: [colors.primary, colors.expense],
              borderWidth: 0,
              hoverOffset: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          animation: { animateRotate: true, duration: REDUCE_MOTION ? 0 : 900 },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            donutCenterText: centerOpts,
            donutPercentLabels: { enabled: hasAny, fontFamily: 'Plus Jakarta Sans, sans-serif', fit: true }
          }
        }
      });
    } else {
      allocationChartInstance.data.datasets[0].data = allocData;
      allocationChartInstance.data.datasets[0].backgroundColor = [colors.primary, colors.expense];
      allocationChartInstance.options.plugins.donutCenterText = centerOpts;
      allocationChartInstance.options.plugins.donutPercentLabels.enabled = hasAny;
      allocationChartInstance.update();
    }

    armChartEntrance('allocationChart', function () {
      return allocationChartInstance;
    });

    var series = computeMonthlySeries(selectedYear);
    var hasMonthly = series.labels.length > 0;
    $('monthlyEmpty').classList.toggle('hidden', hasMonthly);
    if (!monthlyChartInstance) {
      monthlyChartInstance = new Chart($('monthlyChart').getContext('2d'), {
        type: 'line',
        data: {
          labels: series.labels,
          datasets: [
            {
              label: 'Pemasukan',
              data: series.income,
              borderColor: colors.primary,
              backgroundColor: makeAreaGradientFn('primary'),
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              pointHoverRadius: 5,
              borderWidth: 2
            },
            {
              label: 'Pengeluaran',
              data: series.expense,
              borderColor: colors.expense,
              backgroundColor: makeAreaGradientFn('expense'),
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              pointHoverRadius: 5,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: REDUCE_MOTION ? 0 : 700 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: colors.muted } },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ctx.dataset.label + ': ' + formatRupiah(ctx.parsed.y);
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colors.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 14 }
            },
            y: {
              grid: { color: colors.grid },
              ticks: {
                color: colors.muted,
                font: { size: 10 },
                callback: function (v) {
                  return v >= 1000000 ? v / 1000000 + 'jt' : v >= 1000 ? v / 1000 + 'rb' : v;
                }
              }
            }
          }
        }
      });
    } else {
      monthlyChartInstance.data.labels = series.labels;
      monthlyChartInstance.data.datasets[0].data = series.income;
      monthlyChartInstance.data.datasets[1].data = series.expense;
      monthlyChartInstance.update();
    }
    armChartEntrance('monthlyChart', function () {
      return monthlyChartInstance;
    });
    updateChartAccessibleSummary(summary, series);
  }

  function updateChartTheme() {
    if (!allocationChartInstance || !monthlyChartInstance) return;
    var colors = getChartColors();
    allocationChartInstance.data.datasets[0].backgroundColor = [colors.primary, colors.expense];
    allocationChartInstance.options.plugins.donutCenterText.color = colors.text;
    allocationChartInstance.options.plugins.donutCenterText.mutedColor = colors.muted;
    allocationChartInstance.update();
    monthlyChartInstance.data.datasets[0].borderColor = colors.primary;
    monthlyChartInstance.data.datasets[1].borderColor = colors.expense;
    monthlyChartInstance.options.plugins.legend.labels.color = colors.muted;
    monthlyChartInstance.options.scales.x.ticks.color = colors.muted;
    monthlyChartInstance.options.scales.y.ticks.color = colors.muted;
    monthlyChartInstance.options.scales.y.grid.color = colors.grid;
    monthlyChartInstance.update();
    if (trendChartInstance) {
      trendChartInstance.destroy();
      trendChartInstance = null;
      renderAnalytics();
    }
  }

  function updateChartAccessibleSummary(summary, series) {
    $('allocationChartSrSummary').textContent =
      'Diagram proporsi kas: pemasukan ' +
      formatRupiah(summary.income) +
      ', pengeluaran ' +
      formatRupiah(summary.expense) +
      ', saldo ' +
      formatRupiah(summary.balance) +
      '.';
    var txt = 'Grafik tren bulanan: ';
    for (var i = 0; i < series.labels.length; i++) {
      txt +=
        series.labels[i] +
        ' pemasukan ' +
        formatRupiah(series.income[i]) +
        ' pengeluaran ' +
        formatRupiah(series.expense[i]) +
        '; ';
    }
    $('monthlyChartSrSummary').textContent = series.labels.length
      ? txt
      : 'Grafik tren bulanan: belum ada data.';
  }

  function renderYearChips() {
    var years = getAvailableYears();
    var row = $('yearChipRow');
    if (years.length < 2) {
      row.innerHTML = '';
      selectedYear = 'all';
      return;
    }
    var html =
      '<button type="button" class="year-chip' +
      (selectedYear === 'all' ? ' active' : '') +
      '" data-year="all">Semua Tahun</button>';
    for (var i = years.length - 1; i >= 0; i--) {
      html +=
        '<button type="button" class="year-chip' +
        (selectedYear === years[i] ? ' active' : '') +
        '" data-year="' +
        years[i] +
        '">' +
        years[i] +
        '</button>';
    }
    row.innerHTML = html;
    var chips = row.querySelectorAll('.year-chip');
    for (var c = 0; c < chips.length; c++) {
      chips[c].addEventListener('click', function () {
        selectedYear = this.getAttribute('data-year');
        renderYearChips();
        renderCharts();
      });
    }
  }

  /* ===== Statistik dan status sinkron ===== */
  function animateValueTo(el, from, to, duration, formatter) {
    if (REDUCE_MOTION || duration === 0 || from === to) {
      el.textContent = formatter(to);
      return;
    }
    var delta = Math.abs(to - from);
    var scale = delta < 100000 ? 0.55 : delta < 2000000 ? 0.8 : 1;
    var dur = Math.max(220, duration * scale);
    var isHeroBalance = el.id === 'heroBalance';
    if (isHeroBalance) el.classList.add('balance-counting');
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = formatter(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
      else if (isHeroBalance) el.classList.remove('balance-counting');
    }
    requestAnimationFrame(step);
  }

  function skeletonRows(n) {
    var html = '';
    for (var i = 0; i < n; i++) {
      html +=
        '<div class="skeleton-row"><div class="skeleton-lines"><span class="skeleton-bar" style="width:60%"></span><span class="skeleton-bar" style="width:35%"></span></div><span class="skeleton-bar" style="width:70px"></span></div>';
    }
    return html;
  }

  function renderStats() {
    var summary = computeSummary();
    var heroEl = $('heroBalance'),
      totalEl = $('totalBalance');
    var dur = heroAnimated ? 500 : 900;
    animateValueTo(heroEl, lastStatValues.balance || 0, summary.balance, dur, formatRupiah);
    animateValueTo(totalEl, lastStatValues.balance || 0, summary.balance, dur, formatRupiah);
    heroEl.classList.toggle('negative', summary.balance < 0);
    totalEl.classList.toggle('negative', summary.balance < 0);
    animateValueTo($('totalIncome'), lastStatValues.income || 0, summary.income, dur, formatRupiah);
    animateValueTo($('totalExpense'), lastStatValues.expense || 0, summary.expense, dur, formatRupiah);
    animateValueTo($('floatBalanceValue'), lastStatValues.balance || 0, summary.balance, dur, formatRupiah);

    var mom = computeMonthOverMonth();
    $('incomeTrend').innerHTML = trendBadge(mom.income);
    $('expenseTrend').innerHTML = trendBadge(mom.expense);

    lastStatValues = { balance: summary.balance, income: summary.income, expense: summary.expense };
    heroAnimated = true;
    renderHeroSparkline();
  }

  function pulseStats() {
    var card = document.querySelector('.report-card');
    card.classList.remove('stat-pulse');
    void card.offsetWidth;
    card.classList.add('stat-pulse');
    flashHeroStat();
  }

  function updateNamaList() {
    var seen = {},
      names = [];
    for (var i = allData.length - 1; i >= 0; i--) {
      var n = allData[i].nama_pengisi;
      if (n && !seen[n]) {
        seen[n] = true;
        names.push(n);
      }
    }
    $('namaList').innerHTML = names
      .map(function (n) {
        return '<option value="' + n.replace(/"/g, '&quot;') + '">';
      })
      .join('');
  }

  var syncTickInterval = null;
  function markSynced() {
    lastSyncAt = Date.now();
    updateSyncLabel();
    if (!syncTickInterval) syncTickInterval = setInterval(updateSyncLabel, 5000);
  }
  function updateSyncLabel() {
    if (!lastSyncAt) {
      $('syncStatusText').textContent = isConfigured ? 'Memuat data…' : 'Belum terhubung ke Supabase';
      return;
    }
    var sec = Math.round((Date.now() - lastSyncAt) / 1000);
    var txt = sec < 5 ? 'baru saja' : sec < 60 ? sec + ' detik lalu' : Math.round(sec / 60) + ' menit lalu';
    $('syncStatusText').textContent = 'Diperbarui ' + txt;
  }

  /* ===== Tab, kolaps Kelola Kas, sesi ===== */
  function positionTabIndicator(tabbar, indicator, activeBtn) {
    if (!activeBtn || !tabbar.offsetWidth) return;
    var pr = tabbar.getBoundingClientRect(),
      br = activeBtn.getBoundingClientRect();
    var left = br.left - pr.left - tabbar.clientLeft,
      width = br.width;
    if (!width) return;
    if (gsapOn()) {
      window.gsap.to(indicator, {
        x: left,
        width: width,
        duration: 0.38,
        ease: 'power3.out',
        overwrite: 'auto'
      });
    } else {
      indicator.style.transition = REDUCE_MOTION
        ? 'none'
        : 'transform 0.34s var(--ease-morph), width 0.34s var(--ease-morph)';
      indicator.style.transform = 'translateX(' + left + 'px)';
      indicator.style.width = width + 'px';
    }
  }
  var repositionAll = [];
  function initTabIndicator(tabbarId, indicatorId, toneClass, itemSelector) {
    var tabbar = $(tabbarId),
      indicator = $(indicatorId),
      sel = itemSelector || '.tabbar-item';
    function reposition() {
      var active = tabbar.querySelector(sel + '.active');
      indicator.classList.toggle(toneClass, !!(active && active.classList.contains(toneClass)));
      positionTabIndicator(tabbar, indicator, active);
    }
    reposition();
    repositionAll.push(reposition);
    window.addEventListener('resize', reposition);
    window.addEventListener('resize', function () {
      clearTimeout(analyticsSTResizeTimer);
      analyticsSTResizeTimer = setTimeout(function () {
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      }, 200);
    });
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(reposition).observe(tabbar);
      } catch {}
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reposition).catch(function () {});
    return reposition;
  }
  function repositionIndicators() {
    for (var i = 0; i < repositionAll.length; i++) repositionAll[i]();
  }

  var expandBtn = $('expandToggleBtn'),
    ledgerCollapseEl = $('ledgerCollapse');
  var collapseSettleTimer = null;
  function toggleLedgerCollapse(forceOpen) {
    var willOpen = typeof forceOpen === 'boolean' ? forceOpen : !expandBtn.classList.contains('open');
    expandBtn.classList.toggle('open', willOpen);
    expandBtn.classList.remove('nudge');
    expandBtn.setAttribute('aria-expanded', String(willOpen));
    $('expandToggleLabel').textContent = willOpen ? 'Tutup' : 'Kelola Kas';
    ledgerCollapseEl.classList.toggle('open', willOpen);
    ledgerCollapseEl.classList.remove('settled');
    clearTimeout(collapseSettleTimer);
    if (willOpen) {
      var shell = ledgerCollapseEl.querySelector('.ledger-shell');
      tweenFrom(shell, { opacity: 0, y: -14, scale: 0.97, duration: 0.45, ease: 'power3.out' });
      tweenFrom(shell.querySelectorAll('.form-group, .segmented, .btn, .session-bar, .tabbar'), {
        opacity: 0,
        y: 10,
        duration: 0.34,
        stagger: 0.045,
        delay: 0.08,
        ease: 'power2.out'
      });
      collapseSettleTimer = setTimeout(function () {
        ledgerCollapseEl.classList.add('settled');
        repositionIndicators();
      }, 480);
    }
    try {
      localStorage.setItem('kasLedgerOpen', willOpen ? '1' : '0');
    } catch {}
  }
  function scrollToLedger() {
    var target = document.getElementById('catat');
    var done = false;
    function go() {
      if (done) return;
      done = true;
      target.scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' });
    }
    ledgerCollapseEl.addEventListener('transitionend', function handler(ev) {
      if (ev.target !== ledgerCollapseEl || ev.propertyName === 'opacity') return;
      ledgerCollapseEl.removeEventListener('transitionend', handler);
      go();
    });
    setTimeout(go, 540);
  }
  function openLedgerAndScroll() {
    var alreadyOpen = expandBtn.classList.contains('open');
    toggleLedgerCollapse(true);
    if (alreadyOpen) {
      document
        .getElementById('catat')
        .scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' });
    } else scrollToLedger();
  }

  function updateSessionUI() {
    var loggedIn = !!accessToken;
    $('loginGate').classList.toggle('hidden', loggedIn);
    $('loggedInArea').classList.toggle('hidden', !loggedIn);
    expandBtn.classList.toggle('has-session', loggedIn);
    if (loggedIn) {
      $('sessionEmail').textContent = currentUserEmail || '';
      requestAnimationFrame(repositionIndicators);
    }
  }

  function switchLedgerTab(tab) {
    var buttons = document.querySelectorAll('#ledgerTabs .tabbar-item');
    for (var i = 0; i < buttons.length; i++)
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-tab') === tab);
    var shownPanel = $(tab === 'catat' ? 'panelCatat' : 'panelRiwayat');
    var panelWasHidden = shownPanel.classList.contains('hidden');
    $('panelCatat').classList.toggle('hidden', tab !== 'catat');
    $('panelRiwayat').classList.toggle('hidden', tab !== 'riwayat');
    if (panelWasHidden && !REDUCE_MOTION) {
      shownPanel.classList.remove('panel-in');
      void shownPanel.offsetWidth;
      shownPanel.classList.add('panel-in');
      shownPanel.addEventListener('animationend', function done(ev) {
        if (ev.target !== shownPanel) return;
        shownPanel.classList.remove('panel-in');
        shownPanel.removeEventListener('animationend', done);
      });
    }
    if (tab === 'riwayat') {
      currentPage = 1;
      renderTxList(null, true);
    }
    positionTabIndicator(
      $('ledgerTabs'),
      $('ledgerTabIndicator'),
      document.querySelector('#ledgerTabs .tabbar-item.active')
    );
    requestAnimationFrame(repositionIndicators);
  }
  function switchTxTypeTab(type) {
    currentType = type;
    var buttons = document.querySelectorAll('#txTypeTabs .segmented-item');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-type') === type;
      buttons[i].classList.toggle('active', on);
      buttons[i].setAttribute('aria-checked', String(on));
      buttons[i].setAttribute('tabindex', on ? '0' : '-1');
    }
    var indicator = $('txTypeTabIndicator');
    indicator.classList.toggle('expense-tone', type === 'pengeluaran');
    positionTabIndicator(
      $('txTypeTabs'),
      indicator,
      document.querySelector('#txTypeTabs .segmented-item.active')
    );
    $('txAmountLabel').textContent = type === 'pemasukan' ? 'Jumlah masuk (Rp)' : 'Jumlah keluar (Rp)';
    maybeShowQuickfill();
    renderPresetChips();
  }

  /* ===== Form transaksi: validasi, duplikat, preset ===== */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setFieldError(id, msg) {
    var el = $(id);
    el.classList.add('field-error');
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', id + '-err');
    var next = document.getElementById(id + '-err');
    if (!next) {
      next = document.createElement('div');
      next.className = 'field-error-msg';
      next.id = id + '-err';
      el.insertAdjacentElement('afterend', next);
    }
    next.textContent = msg;
  }
  function clearFieldError(id) {
    var el = $(id);
    el.classList.remove('field-error');
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
    var next = document.getElementById(id + '-err');
    if (next) next.parentNode.removeChild(next);
  }
  var FIELD_IDS = ['txDate', 'txAmount', 'txNote', 'txNama'];
  function clearAllFieldErrors() {
    FIELD_IDS.forEach(clearFieldError);
  }
  FIELD_IDS.forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (this.classList.contains('field-error')) clearFieldError(id);
    });
  });

  function renderPresetChips() {
    var counts = {};
    for (var i = 0; i < allData.length; i++) {
      if (allData[i].jenis !== currentType) continue;
      var k = (allData[i].keterangan || '').trim();
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
    var entries = Object.keys(counts).map(function (k) {
      return [k, counts[k]];
    });
    entries.sort(function (a, b) {
      return b[1] - a[1];
    });
    var top = entries.slice(0, 4);
    var row = $('presetChipRow');
    row.innerHTML = top
      .map(function (e) {
        return '<button type="button" class="preset-chip">' + escapeHtml(e[0]) + '</button>';
      })
      .join('');
    var chips = row.querySelectorAll('.preset-chip');
    for (var c = 0; c < chips.length; c++) {
      chips[c].addEventListener('click', function () {
        $('txNote').value = this.textContent;
        $('txNote').focus();
      });
    }
  }
  function maybeShowQuickfill() {
    var hint = $('quickfillHint');
    var name = $('txNama').value.trim().toLowerCase();
    var match = null;
    if (name) {
      for (var i = allData.length - 1; i >= 0; i--) {
        if (
          allData[i].jenis === currentType &&
          (allData[i].nama_pengisi || '').trim().toLowerCase() === name
        ) {
          match = allData[i];
          break;
        }
      }
    }
    if (!match) {
      hint.classList.add('hidden');
      hint.innerHTML = '';
      return;
    }
    hint.classList.remove('hidden');
    hint.innerHTML =
      'Terakhir dicatat: &ldquo;' +
      escapeHtml(match.keterangan) +
      '&rdquo; &mdash; <button type="button" class="quickfill-btn" id="quickfillApplyBtn">pakai lagi</button>';
    $('quickfillApplyBtn').addEventListener('click', function () {
      $('txNote').value = match.keterangan;
    });
  }

  function dupKey(row) {
    return row.tanggal + '|' + row.jenis + '|' + Math.round(Number(row.jumlah) || 0);
  }
  function getDupIndex() {
    return cached('dupIndex', function () {
      var map = {};
      for (var i = 0; i < allData.length; i++) {
        var k = dupKey(allData[i]);
        (map[k] || (map[k] = [])).push(allData[i]);
      }
      return map;
    });
  }
  function findPotentialDuplicates(candidate, excludeId) {
    var bucket = getDupIndex()[dupKey(candidate)];
    if (!bucket) return [];
    if (excludeId === undefined || excludeId === null) return bucket;
    return bucket.filter(function (row) {
      return row.id !== excludeId;
    });
  }

  function setTodayDefault() {
    $('txDate').value = isoLocal();
  }
  function populateEditForm(row) {
    editingId = row.id;
    switchTxTypeTab(row.jenis);
    $('txDate').value = row.tanggal;
    $('txAmount').value = formatThousands(String(Math.round(row.jumlah)));
    $('txNote').value = row.keterangan;
    $('txNama').value = row.nama_pengisi;
    $('txSubmitBtn').querySelector('.btn-label').textContent = 'Simpan perubahan';
    $('txCancelEditBtn').classList.remove('hidden');
    switchLedgerTab('catat');
    setTimeout(function () {
      $('txForm').scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'center' });
    }, 60);
  }
  function exitEditMode() {
    editingId = null;
    $('txForm').reset();
    setTodayDefault();
    clearAllFieldErrors();
    $('txSubmitBtn').querySelector('.btn-label').textContent = 'Simpan transaksi';
    $('txCancelEditBtn').classList.add('hidden');
    $('quickfillHint').classList.add('hidden');
  }

  /* ===== Riwayat: filter, paginasi, daftar, geser baris ===== */
  function getSortedDesc() {
    return cached('sortedDesc', function () {
      return allData.slice().sort(function (a, b) {
        return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0;
      });
    });
  }
  var filterCache = { key: null, version: -1, rows: null };
  function getFilteredData() {
    var q = filters.search.trim().toLowerCase();
    var key = q + '|' + filters.type + '|' + filters.from + '|' + filters.to;
    if (filterCache.version === dataVersion && filterCache.key === key) return filterCache.rows;
    var src = getSortedDesc(),
      out = [];
    for (var i = 0; i < src.length; i++) {
      var row = src[i];
      if (filters.type && row.jenis !== filters.type) continue;
      if (filters.from && row.tanggal < filters.from) continue;
      if (filters.to && row.tanggal > filters.to) continue;
      if (q && row._s.indexOf(q) === -1) continue;
      out.push(row);
    }
    filterCache = { key: key, version: dataVersion, rows: out };
    return out;
  }
  function renderPagination(total) {
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pages) currentPage = pages;
    $('pageIndicator').textContent = 'Hal. ' + currentPage + '/' + pages;
    $('prevPageBtn').disabled = currentPage <= 1;
    $('nextPageBtn').disabled = currentPage >= pages;
  }
  function hasActiveFilter() {
    return !!(filters.search || filters.type || filters.from || filters.to);
  }
  function emptyStateHtml() {
    if (hasActiveFilter()) {
      return (
        '<div class="empty">' +
        '<svg class="empty-art" viewBox="0 0 120 84" aria-hidden="true"><use href="#art-empty-filter"></use></svg>' +
        '<div class="empty-title">Tidak ada yang cocok</div>' +
        '<div class="empty-sub">Coba kata kunci lain, atau longgarkan rentang tanggalnya.</div>' +
        '<button type="button" class="ghost-btn" data-action="clearfilter">Hapus filter</button></div>'
      );
    }
    return (
      '<div class="empty">' +
      '<svg class="empty-art" viewBox="0 0 120 84" aria-hidden="true"><use href="#art-empty-ledger"></use></svg>' +
      '<div class="empty-title">Buku kas masih kosong</div>' +
      '<div class="empty-sub">Catatan pertama langsung tampil di laporan transparansi publik.</div>' +
      '<button type="button" class="ghost-btn" data-action="gotocatat">Catat transaksi pertama</button></div>'
    );
  }
  function renderTxList(highlightId, animate) {
    var filtered = getFilteredData();
    renderPagination(filtered.length);
    var pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    var list = $('txList');
    if (!filtered.length) {
      list.innerHTML = emptyStateHtml();
      $('swipeTip').classList.remove('show');
      return;
    }
    list.innerHTML = pageRows
      .map(function (row) {
        return (
          '<div class="row row-' +
          row.jenis +
          (row.id === highlightId ? ' row-new' : '') +
          '" data-id="' +
          row.id +
          '">' +
          '<div class="row-swipe-actions"><button type="button" class="edit" data-action="edit">Ubah</button><button type="button" class="receipt" data-action="kwitansi">Kwitansi</button><button type="button" class="del" data-action="del">Hapus</button></div>' +
          '<div class="row-inner"><div class="row-top"><span class="note">' +
          escapeHtml(row.keterangan) +
          '</span>' +
          '<span class="amount ' +
          row.jenis +
          '">' +
          (row.jenis === 'pemasukan' ? '+' : '-') +
          formatRupiah(row.jumlah) +
          '</span></div>' +
          '<div class="row-bottom"><div class="row-meta"><span class="date">' +
          formatTanggal(row.tanggal) +
          '</span><span class="nama">' +
          escapeHtml(row.nama_pengisi) +
          '</span></div>' +
          '<div class="row-actions"><button type="button" data-action="edit" class="edit">Ubah</button><button type="button" data-action="kwitansi" class="receipt">Kwitansi</button><button type="button" data-action="del" class="del">Hapus</button></div></div></div></div>'
        );
      })
      .join('');
    if (animate && !REDUCE_MOTION) {
      list.classList.remove('content-fade-in');
      var kids = list.children;
      for (var s = 0; s < kids.length; s++) {
        kids[s].style.animationDelay = s * 40 + 'ms';
        kids[s].classList.add('row-stagger');
      }
    } else {
      list.classList.remove('content-fade-in');
      void list.offsetWidth;
      list.classList.add('content-fade-in');
    }
    attachRowSwipe();
    maybeShowSwipeTip();
  }

  function maybeShowSwipeTip() {
    if (window.innerWidth > 640) return;
    try {
      if (sessionStorage.getItem('kasSwipeTip') === '1') return;
    } catch {}
    var first = document.querySelector('#txList .row .row-inner');
    if (!first) return;
    $('swipeTip').classList.add('show');
    if (!REDUCE_MOTION) {
      first.classList.add('swipe-hint');
      setTimeout(function () {
        first.classList.remove('swipe-hint');
      }, 1400);
    }
    try {
      sessionStorage.setItem('kasSwipeTip', '1');
    } catch {}
  }
  function closeSwipedRows(except) {
    var inners = document.querySelectorAll('#txList .row-inner');
    for (var i = 0; i < inners.length; i++) {
      if (inners[i] === except) continue;
      inners[i].style.transition = '';
      inners[i].style.transform = 'translateX(0)';
    }
  }
  var SWIPE_OPEN = 198;
  function attachRowSwipe() {
    var rows = document.querySelectorAll('#txList .row');
    for (var i = 0; i < rows.length; i++) {
      (function (inner) {
        var startX = 0,
          startY = 0,
          dx = 0,
          dragging = false,
          locked = false;
        inner.addEventListener(
          'touchstart',
          function (e) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            dragging = true;
            locked = false;
            inner.style.transition = 'none';
            closeSwipedRows(inner);
          },
          { passive: true }
        );
        inner.addEventListener(
          'touchmove',
          function (e) {
            if (!dragging) return;
            var mx = e.touches[0].clientX - startX,
              my = e.touches[0].clientY - startY;
            if (!locked && Math.abs(my) > Math.abs(mx)) {
              dragging = false;
              inner.style.transition = '';
              inner.style.transform = 'translateX(0)';
              return;
            }
            locked = true;
            dx = Math.max(-SWIPE_OPEN, Math.min(0, mx));
            inner.style.transform = 'translateX(' + dx + 'px)';
          },
          { passive: true }
        );
        inner.addEventListener('touchend', function () {
          if (!dragging) return;
          dragging = false;
          inner.style.transition = '';
          inner.style.transform =
            dx < -SWIPE_OPEN / 2 ? 'translateX(-' + SWIPE_OPEN + 'px)' : 'translateX(0)';
          dx = 0;
        });
      })(rows[i].querySelector('.row-inner'));
    }
  }
  function jumpToRiwayatFiltered(type) {
    openLedgerAndScroll();
    setTimeout(
      function () {
        switchLedgerTab('riwayat');
        filters.type = type;
        $('filterType').value = type;
        $('filterAdvanced').classList.remove('hidden');
        $('filterToggleBtn').classList.add('active');
        $('filterToggleBtn').setAttribute('aria-expanded', 'true');
        currentPage = 1;
        renderTxList(null, true);
      },
      REDUCE_MOTION ? 0 : 520
    );
  }

  var IMPORT_PAGE_SIZE = 8;

  /* ===== Impor Excel/CSV ===== */
  function downloadTemplate() {
    return ensureXLSX().then(function () {
      var data = [
        ['Tanggal', 'Jenis', 'Jumlah', 'Keterangan', 'Nama Pengisi'],
        ['2026-01-15', 'Pemasukan', 50000, 'Contoh: Infaq Jumat', 'Contoh: Ahmad']
      ];
      var ws = XLSX.utils.aoa_to_sheet(data);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'template-impor-kas-lbm-ngantang.xlsx');
    });
  }
  var MONTH_NAMES = {
    jan: 1,
    januari: 1,
    january: 1,
    feb: 2,
    februari: 2,
    pebruari: 2,
    february: 2,
    mar: 3,
    maret: 3,
    march: 3,
    apr: 4,
    april: 4,
    mei: 5,
    may: 5,
    jun: 6,
    juni: 6,
    june: 6,
    jul: 7,
    juli: 7,
    july: 7,
    agu: 8,
    agt: 8,
    agustus: 8,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    okt: 10,
    oktober: 10,
    oct: 10,
    october: 10,
    nov: 11,
    nop: 11,
    nopember: 11,
    november: 11,
    des: 12,
    desember: 12,
    dec: 12,
    december: 12
  };
  function monthNum(name) {
    return Object.prototype.hasOwnProperty.call(MONTH_NAMES, name) ? MONTH_NAMES[name] : 0;
  }
  function makeIso(y, m, d) {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function parseTanggalCell(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date)
      return isNaN(v.getTime()) ? null : makeIso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (!isFinite(v) || v < 36526 || v > 73415) return null;
      var u = new Date(Math.floor(v - 25569) * 86400000);
      return makeIso(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate());
    }
    var s = String(v)
      .trim()
      .toLowerCase()
      .replace(
        /^(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad|mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/,
        ''
      );
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[t\s].*)?$/);
    if (m) return makeIso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/);
    if (m) return makeIso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = s.match(/^(\d{1,2})[\s\-\/.]+([a-z]+)\.?[\s\-\/.,]+(\d{4})$/);
    if (m && monthNum(m[2])) return makeIso(+m[3], monthNum(m[2]), +m[1]);
    m = s.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m && monthNum(m[1])) return makeIso(+m[3], monthNum(m[1]), +m[2]);
    return null;
  }
  function parseJenisCell(v) {
    var s = String(v || '')
      .trim()
      .toLowerCase();
    if (/^(pemasukan|masuk|income|debit)$/.test(s)) return 'pemasukan';
    if (/^(pengeluaran|keluar|expense|kredit)$/.test(s)) return 'pengeluaran';
    return null;
  }
  var MAX_IMPORT_AMOUNT = 1e12;
  function finishAmount(n) {
    if (!isFinite(n)) return { err: 'jumlah tidak valid' };
    if (n <= 0) return { err: 'jumlah harus lebih dari 0' };
    var r = Math.round(n);
    if (Math.abs(n - r) > 0.01) return { err: 'jumlah harus bilangan bulat rupiah' };
    if (r > MAX_IMPORT_AMOUNT) return { err: 'jumlah terlalu besar' };
    return { val: r };
  }
  function parseJumlahCell(v) {
    if (typeof v === 'number') return finishAmount(v);
    var s = String(v == null ? '' : v)
      .toLowerCase()
      .replace(/[\s\u00a0]/g, '')
      .replace(/^rp\.?/, '')
      .replace(/^idr/, '')
      .replace(/[.,]-$/, '');
    if (!s) return { err: 'jumlah kosong' };
    if (s.charAt(0) === '-') return { err: 'jumlah tidak boleh negatif' };
    if (!/^[\d.,]+$/.test(s)) return { err: 'jumlah harus berupa angka' };
    var dot = s.lastIndexOf('.'),
      com = s.lastIndexOf(','),
      n;
    if (dot > -1 && com > -1) {
      var decSep = dot > com ? '.' : ',';
      n = Number(
        s
          .split(decSep === '.' ? ',' : '.')
          .join('')
          .replace(decSep, '.')
      );
    } else if (dot > -1 || com > -1) {
      var parts = s.split(dot > -1 ? '.' : ','),
        last = parts[parts.length - 1];
      n =
        parts.length > 2 || (last.length === 3 && parts[0].length <= 3)
          ? Number(parts.join(''))
          : Number(parts[0] + '.' + last);
    } else n = Number(s);
    return finishAmount(n);
  }
  function parseJenisImport(v) {
    var s = String(v == null ? '' : v)
      .trim()
      .toLowerCase();
    if (/^(pemasukan|masuk|income)$/.test(s)) return { val: 'pemasukan' };
    if (/^(pengeluaran|keluar|expense)$/.test(s)) return { val: 'pengeluaran' };
    if (/^(debit|debet|kredit|db|cr)$/.test(s))
      return { err: 'jenis "' + s + '" ambigu, tulis Pemasukan atau Pengeluaran' };
    return { err: 'jenis harus Pemasukan/Pengeluaran' };
  }
  var IMPORT_COLS = {
    tanggal: ['tanggal', 'tgl', 'date'],
    jenis: ['jenis', 'tipe', 'type'],
    jumlah: ['jumlah', 'nominal', 'amount'],
    keterangan: ['keterangan', 'uraian', 'deskripsi', 'catatan'],
    nama: ['nama pengisi', 'nama', 'pengisi', 'petugas']
  };
  var IMPORT_COL_LABEL = {
    tanggal: 'Tanggal',
    jenis: 'Jenis',
    jumlah: 'Jumlah',
    keterangan: 'Keterangan',
    nama: 'Nama Pengisi'
  };
  function mapImportColumns(rows) {
    var keys = rows.length ? Object.keys(rows[0]) : [],
      norm = [],
      map = {},
      missing = [];
    for (var i = 0; i < keys.length; i++)
      norm.push(String(keys[i]).trim().toLowerCase().replace(/\s+/g, ' '));
    Object.keys(IMPORT_COLS).forEach(function (f) {
      var idx = -1;
      for (var a = 0; a < IMPORT_COLS[f].length && idx < 0; a++) idx = norm.indexOf(IMPORT_COLS[f][a]);
      if (idx < 0) missing.push(IMPORT_COL_LABEL[f]);
      else map[f] = keys[idx];
    });
    return { map: map, missing: missing };
  }
  function validateImportRow(r, line, cols) {
    var keterangan = String(r[cols.keterangan] == null ? '' : r[cols.keterangan]).trim();
    var nama = String(r[cols.nama] == null ? '' : r[cols.nama]).trim();
    if (/^contoh\b/i.test(keterangan) && /^contoh\b/i.test(nama))
      return { error: { line: line, reason: 'baris contoh dari template, diabaikan' } };
    var tanggal = parseTanggalCell(r[cols.tanggal]);
    var jenis = parseJenisImport(r[cols.jenis]);
    var jumlah = parseJumlahCell(r[cols.jumlah]);
    var rowErrors = [];
    if (!tanggal) rowErrors.push('tanggal tidak valid');
    if (jenis.err) rowErrors.push(jenis.err);
    if (jumlah.err) rowErrors.push(jumlah.err);
    if (!keterangan) rowErrors.push('keterangan kosong');
    if (!nama) rowErrors.push('nama pengisi kosong');
    if (rowErrors.length) return { error: { line: line, reason: rowErrors.join(', ') } };
    return {
      row: {
        tanggal: tanggal,
        jenis: jenis.val,
        jumlah: jumlah.val,
        keterangan: keterangan,
        nama_pengisi: nama
      }
    };
  }
  function processImportRowsAsync(rows, cols, onProgress) {
    return new Promise(function (resolve) {
      var valid = [],
        errors = [],
        i = 0,
        CHUNK = 150;
      function step() {
        var end = Math.min(i + CHUNK, rows.length);
        for (; i < end; i++) {
          var res = validateImportRow(rows[i], i + 2, cols);
          if (res.error) errors.push(res.error);
          else valid.push(res.row);
        }
        if (onProgress) onProgress(i, rows.length);
        if (i < rows.length) requestAnimationFrame(step);
        else resolve({ valid: valid, errors: errors });
      }
      step();
    });
  }
  function setImportProgress(pct, text) {
    var box = $('importProgress');
    if (pct === null) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    $('importProgressFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('importProgressText').textContent = text || '';
  }
  function handleFileSelected(file) {
    setImportProgress(6, 'Membaca ' + file.name + '\u2026');
    $('importPreviewArea').classList.add('hidden');
    return ensureXLSX()
      .then(function () {
        setImportProgress(18, 'Membuka berkas\u2026');
        return file.arrayBuffer();
      })
      .then(function (buf) {
        var wb = XLSX.read(buf, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        var colInfo = mapImportColumns(rows);
        if (!rows.length || colInfo.missing.length) {
          var noticeErr = new Error(
            !rows.length
              ? 'Berkas tidak berisi baris data. Isi data di bawah baris judul, lalu coba lagi.'
              : 'Kolom wajib tidak ditemukan: ' + colInfo.missing.join(', ') + '. Gunakan template terbaru.'
          );
          noticeErr.importNotice = true;
          throw noticeErr;
        }
        setImportProgress(28, 'Memeriksa ' + rows.length + ' baris\u2026');
        return processImportRowsAsync(rows, colInfo.map, function (done, total) {
          setImportProgress(
            28 + (done / Math.max(1, total)) * 66,
            'Memeriksa ' + done + ' dari ' + total + ' baris\u2026'
          );
        });
      })
      .then(function (result) {
        parsedImportRows = result.valid;
        parsedImportErrors = result.errors;
        importPage = 1;
        setImportProgress(null);
        renderImportPreview();
      })
      .catch(function (err) {
        setImportProgress(null);
        if (err && err.importNotice) {
          toast(err.message, 'error', { duration: 6500 });
          resetImportUI();
          return;
        }
        throw err;
      });
  }
  function renderImportPreview() {
    var area = $('importPreviewArea');
    area.classList.toggle('hidden', !parsedImportRows.length && !parsedImportErrors.length);
    $('importSummaryText').textContent =
      parsedImportRows.length +
      ' data valid siap diimpor' +
      (parsedImportErrors.length ? ', ' + parsedImportErrors.length + ' baris dilewati.' : '.');

    var dupIndex = getDupIndex(),
      dupCount = 0;
    for (var i = 0; i < parsedImportRows.length; i++) {
      if (dupIndex[dupKey(parsedImportRows[i])]) dupCount++;
    }
    var dupBox = $('importDupWarning');
    if (dupCount) {
      dupBox.classList.remove('hidden');
      dupBox.textContent =
        dupCount +
        ' data mirip transaksi yang sudah ada (tanggal, jumlah, jenis sama) — cek dulu supaya tidak dobel.';
    } else dupBox.classList.add('hidden');

    var errBox = $('importErrorsBox');
    if (parsedImportErrors.length) {
      errBox.classList.remove('hidden');
      var shownErrors = parsedImportErrors.slice(0, 25);
      errBox.innerHTML =
        'Baris dilewati: ' +
        shownErrors
          .map(function (e) {
            return 'baris ' + e.line + ' (' + escapeHtml(e.reason) + ')';
          })
          .join('; ') +
        (parsedImportErrors.length > shownErrors.length
          ? '; dan ' + (parsedImportErrors.length - shownErrors.length) + ' baris lain'
          : '');
    } else errBox.classList.add('hidden');

    var totalPages = Math.max(1, Math.ceil(parsedImportRows.length / IMPORT_PAGE_SIZE));
    if (importPage > totalPages) importPage = totalPages;
    var pageRows = parsedImportRows.slice((importPage - 1) * IMPORT_PAGE_SIZE, importPage * IMPORT_PAGE_SIZE);
    $('importRows').innerHTML = pageRows
      .map(function (r) {
        return (
          '<div class="import-row"><div><div class="imp-note">' +
          escapeHtml(r.keterangan) +
          '</div><div class="imp-meta">' +
          formatTanggal(r.tanggal) +
          ' &middot; ' +
          escapeHtml(r.nama_pengisi) +
          '</div></div>' +
          '<span class="amount ' +
          r.jenis +
          '">' +
          (r.jenis === 'pemasukan' ? '+' : '-') +
          formatRupiah(r.jumlah) +
          '</span></div>'
        );
      })
      .join('');
    var pag = $('importPagination');
    pag.classList.toggle('hidden', parsedImportRows.length <= IMPORT_PAGE_SIZE);
    $('importPageIndicator').textContent = 'Hal. ' + importPage + '/' + totalPages;
    $('importPrevBtn').disabled = importPage <= 1;
    $('importNextBtn').disabled = importPage >= totalPages;
    $('importConfirmBtn').disabled = !parsedImportRows.length;
  }
  function resetImportUI() {
    parsedImportRows = [];
    parsedImportErrors = [];
    importPage = 1;
    $('importFileInput').value = '';
    $('importPreviewArea').classList.add('hidden');
    $('importRows').innerHTML = '';
    setImportProgress(null);
  }

  var pendingRender = null;

  /* ===== Render menyeluruh ===== */
  function renderAll() {
    try {
      if (window.KasExtras) window.KasExtras.refresh();
    } catch (e) {
      /* modul tambahan opsional */
    }
    renderStats();
    renderYearChips();
    if (pendingRender) return;
    pendingRender = requestAnimationFrame(function () {
      pendingRender = null;
      renderCharts();
      if (!$('panelRiwayat').classList.contains('hidden')) renderTxList();
      refreshPubSearch();
      idleRun(function () {
        renderAnalytics();
        updateNamaList();
        renderPresetChips();
      });
    });
  }

  /* ===== Laporan PDF ===== */
  function captureChartImage(config, width, height) {
    return new Promise(function (resolve) {
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      config.options = config.options || {};
      config.options.responsive = false;
      config.options.animation = false;
      var chart = new Chart(canvas.getContext('2d'), config);
      setTimeout(function () {
        var url = canvas.toDataURL('image/png');
        chart.destroy();
        resolve(url);
      }, 60);
    });
  }
  function buildPdfChartConfigs(summary, series) {
    var colors = getChartColors();
    var hasAny = summary.income > 0 || summary.expense > 0;
    var allocConfig = {
      type: 'doughnut',
      data: {
        labels: ['Pemasukan', 'Pengeluaran'],
        datasets: [
          {
            data: hasAny ? [summary.income, summary.expense] : [1, 1],
            backgroundColor: [colors.primary, colors.expense],
            borderWidth: 0
          }
        ]
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 13 } } },
          donutCenterText: {
            enabled: true,
            value: formatRupiah(summary.income + summary.expense),
            label: 'Total Arus Kas',
            color: colors.text,
            mutedColor: colors.muted,
            valueSize: 20,
            labelSize: 12,
            fontFamily: 'Arial'
          },
          donutPercentLabels: { enabled: hasAny, fontFamily: 'Arial' }
        }
      }
    };
    var monthlyConfig = {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Pemasukan',
            data: series.income,
            borderColor: colors.primary,
            backgroundColor: makeAreaGradientFn('primary'),
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2.5
          },
          {
            label: 'Pengeluaran',
            data: series.expense,
            borderColor: colors.expense,
            backgroundColor: makeAreaGradientFn('expense'),
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { font: { size: 13 } } } },
        scales: { x: { ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } } } }
      }
    };
    return { allocConfig: allocConfig, monthlyConfig: monthlyConfig };
  }

  function nextFrame() {
    return new Promise(function (r) {
      requestAnimationFrame(function () {
        r();
      });
    });
  }
  function generatePdfReport(setStage) {
    var stage = setStage || function () {};
    var from = $('pdfFrom').value,
      to = $('pdfTo').value;
    if (!from || !to || from > to) {
      toast('Pilih rentang tanggal yang valid dulu.', 'warn');
      return Promise.resolve();
    }
    stage('Menyiapkan\u2026');
    return ensurePDF().then(function () {
      var rangeRows = allData
        .filter(function (r) {
          return r.tanggal >= from && r.tanggal <= to;
        })
        .slice()
        .sort(function (a, b) {
          return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0;
        });
      var openingBalance = computeSummaryFrom(
        allData.filter(function (r) {
          return r.tanggal < from;
        })
      ).balance;
      var summary = computeSummaryFrom(rangeRows);
      var series = computeMonthlySeriesFromRows(rangeRows, true);
      var configs = buildPdfChartConfigs(summary, series);
      var qrPromise =
        location.protocol !== 'file:'
          ? ensureQRCode()
              .then(function () {
                return QRCode.toDataURL(window.location.href, {
                  width: 220,
                  margin: 1,
                  color: { dark: '#0D6B3F', light: '#ffffff' }
                });
              })
              .catch(function () {
                return null;
              })
          : Promise.resolve(null);
      stage('Menggambar grafik\u2026');
      return nextFrame()
        .then(function () {
          return captureChartImage(configs.allocConfig, 500, 500);
        })
        .then(function (alloc) {
          stage('Menggambar tren\u2026');
          return nextFrame()
            .then(function () {
              return captureChartImage(configs.monthlyConfig, 900, 380);
            })
            .then(function (monthly) {
              return [alloc, monthly];
            });
        })
        .then(function (imgs) {
          stage('Menyusun halaman\u2026');
          return qrPromise.then(function (qr) {
            return nextFrame().then(function () {
              return [imgs[0], imgs[1], qr];
            });
          });
        })
        .then(function (imgs) {
          buildAndSavePdf(rangeRows, openingBalance, summary, imgs[0], imgs[1], imgs[2], from, to);
          toast('Laporan PDF diunduh.', null);
        });
    });
  }

  function buildAndSavePdf(rows, openingBalance, summary, allocImg, monthlyImg, qrImg, from, to) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 14;
    var logoDataUrl = document.querySelector('.logo-img').getAttribute('src');

    function drawHeader() {
      doc.addImage(logoDataUrl, 'PNG', margin, 10, 16, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(13, 107, 63);
      doc.text('LBM MWC NU Kecamatan Ngantang', margin + 20, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(
        'Laporan Transparansi Keuangan \u2014 ' + formatTanggal(from) + ' s/d ' + formatTanggal(to),
        margin + 20,
        21
      );
      doc.setDrawColor(200, 155, 60);
      doc.setLineWidth(0.6);
      doc.line(margin, 28, pageW - margin, 28);
    }
    function drawFooter(pageNum, pageCount) {
      var h = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text(
        'Dibuat otomatis dari sistem pencatatan digital pada ' + new Date().toLocaleString('id-ID') + '.',
        margin,
        h - 8
      );
      doc.text('Hal. ' + pageNum + '/' + pageCount, pageW - margin, h - 8, { align: 'right' });
    }

    drawHeader();
    var y = 34;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text('Ringkasan Periode', margin, y);
    y += 6;
    doc.setFontSize(9.5);
    var lines = [
      ['Saldo Awal', formatRupiah(openingBalance)],
      ['Total Pemasukan', formatRupiah(summary.income)],
      ['Total Pengeluaran', formatRupiah(summary.expense)],
      ['Saldo Akhir', formatRupiah(openingBalance + summary.balance)]
    ];
    for (var i = 0; i < lines.length; i++) {
      doc.setFont('helvetica', i === lines.length - 1 ? 'bold' : 'normal');
      doc.text(lines[i][0] + ':', margin, y);
      doc.text(lines[i][1], margin + 55, y);
      y += 5.5;
    }
    if (qrImg) {
      doc.addImage(qrImg, 'PNG', pageW - margin - 24, 34, 24, 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(140, 140, 140);
      doc.text('Pindai untuk lihat laporan langsung', pageW - margin - 24, 61, { maxWidth: 24 });
    }
    y += 4;
    doc.addImage(allocImg, 'PNG', margin, y, 55, 55);
    doc.addImage(monthlyImg, 'PNG', margin + 62, y, 118, 50);
    y += 62;

    var running = openingBalance,
      body = [];
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      running += r.jenis === 'pemasukan' ? Number(r.jumlah) : -Number(r.jumlah);
      body.push([
        formatTanggal(r.tanggal),
        r.keterangan,
        r.nama_pengisi,
        r.jenis === 'pemasukan' ? formatRupiah(r.jumlah) : '',
        r.jenis === 'pengeluaran' ? formatRupiah(r.jumlah) : '',
        formatRupiah(running)
      ]);
    }
    doc.autoTable({
      startY: y,
      head: [['Tanggal', 'Keterangan', 'Nama Pengisi', 'Pemasukan', 'Pengeluaran', 'Saldo']],
      body: body,
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [13, 107, 63], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 245, 238] },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin, top: 34 },
      didDrawPage: function (data) {
        if (data.pageNumber > 1) drawHeader();
      }
    });
    var pageCount = doc.internal.getNumberOfPages();
    for (var p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      drawFooter(p, pageCount);
    }
    doc.save('laporan-kas-lbm-ngantang-' + from + '-sd-' + to + '.pdf');
  }

  /* ===== Efek hero dan interaksi ===== */
  function buildHeroParticles() {
    if (REDUCE_MOTION) return;
    var host = $('heroParticles');
    if (!host) return;
    var html = '';
    for (var i = 0; i < 7; i++) {
      var size = 4 + Math.round(Math.random() * 4);
      html +=
        '<span style="left:' +
        (7 + i * 12.5 + Math.random() * 5).toFixed(1) +
        '%;' +
        'width:' +
        size +
        'px;height:' +
        size +
        'px;' +
        'animation-duration:' +
        (7.5 + Math.random() * 6).toFixed(1) +
        's;' +
        'animation-delay:' +
        (Math.random() * 7).toFixed(1) +
        's;"></span>';
    }
    host.innerHTML = html;
  }

  function flashHeroStat() {
    if (REDUCE_MOTION) return;
    var el = document.querySelector('.hero-stat-primary');
    if (!el) return;
    el.classList.remove('flash-ring');
    void el.offsetWidth;
    el.classList.add('flash-ring');
  }

  function setupHeroTitleScroll() {
    var h2 = document.querySelector('.hero h2');
    if (!h2 || REDUCE_MOTION) return;
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        h2.classList.toggle('title-lit', window.pageYOffset > 24);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var CONFETTI_COLORS = ['#0D6B3F', '#128A52', '#C89B3C', '#E8C97A', '#FFFFFF'];
  function popConfetti(anchor) {
    if (REDUCE_MOTION || !anchor) return;
    var layer = $('confettiLayer');
    var r = anchor.getBoundingClientRect();
    if (!r.width) return;
    var cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 16; i++) {
      var p = document.createElement('i');
      var ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.35;
      var dist = 55 + Math.random() * 65;
      p.style.left = cx.toFixed(0) + 'px';
      p.style.top = cy.toFixed(0) + 'px';
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      p.style.setProperty('--cx', (Math.cos(ang) * dist).toFixed(0) + 'px');
      p.style.setProperty('--cy', (Math.sin(ang) * dist - 26).toFixed(0) + 'px');
      p.style.setProperty('--cr', (Math.random() * 520 - 260).toFixed(0) + 'deg');
      p.style.animationDelay = Math.round(Math.random() * 90) + 'ms';
      frag.appendChild(p);
    }
    layer.appendChild(frag);
    setTimeout(function () {
      layer.innerHTML = '';
    }, 1400);
  }

  function markButtonSaved(btn, label, ms) {
    var el = btn && btn.querySelector('.btn-label');
    if (!el) return;
    var prev = el.textContent,
      txt = label || 'Tersimpan';
    btn.classList.add('is-saved');
    el.textContent = txt;
    setTimeout(function () {
      btn.classList.remove('is-saved');
      if (el.textContent === txt) el.textContent = prev;
    }, ms || 1300);
  }

  var PUB_LIMIT = 6;
  var pubSearchQuery = '';

  /* ===== Pencarian publik ===== */
  function highlightMatch(text, q) {
    var t = String(text || '');
    if (!q) return escapeHtml(t);
    var i = t.toLowerCase().indexOf(q);
    if (i === -1) return escapeHtml(t);
    return (
      escapeHtml(t.slice(0, i)) +
      '<mark>' +
      escapeHtml(t.slice(i, i + q.length)) +
      '</mark>' +
      escapeHtml(t.slice(i + q.length))
    );
  }
  function renderPubSearch() {
    var q = pubSearchQuery.trim().toLowerCase();
    var box = $('pubSearchResults'),
      meta = $('pubSearchMeta');
    $('pubSearchClear').classList.toggle('show', !!q);
    if (!q) {
      box.classList.remove('show');
      box.innerHTML = '';
      meta.innerHTML = 'Telusuri seluruh catatan kas tanpa perlu masuk.';
      return;
    }
    var src = getSortedDesc(),
      hits = [],
      income = 0,
      expense = 0;
    for (var i = 0; i < src.length; i++) {
      if (src[i]._s.indexOf(q) === -1) continue;
      hits.push(src[i]);
      if (src[i]._in) income += src[i]._amt;
      else expense += src[i]._amt;
    }
    if (!hits.length) {
      box.classList.add('show');
      box.innerHTML =
        '<div class="empty" style="padding:18px 0;">' +
        '<svg class="empty-art" viewBox="0 0 120 84" aria-hidden="true"><use href="#art-empty-filter"></use></svg>' +
        '<div class="empty-title">Belum ada catatan yang cocok</div>' +
        '<div class="empty-sub">Coba kata lain, misalnya nama kegiatan atau nama pencatat.</div></div>';
      meta.innerHTML = 'Tidak ditemukan.';
      return;
    }
    meta.innerHTML =
      '<span class="pubsearch-total">' +
      hits.length +
      '</span> catatan cocok &middot; masuk ' +
      formatRupiah(income) +
      ' &middot; keluar ' +
      formatRupiah(expense);
    var shown = hits.slice(0, PUB_LIMIT);
    var html = shown
      .map(function (r) {
        return (
          '<div class="pubsearch-item ' +
          (r._in ? 'is-in' : 'is-out') +
          '">' +
          '<div><div class="ps-note">' +
          highlightMatch(r.keterangan, q) +
          '</div>' +
          '<div class="ps-meta">' +
          formatTanggal(r.tanggal) +
          ' &middot; ' +
          highlightMatch(r.nama_pengisi, q) +
          '</div></div>' +
          '<span class="ps-amt" style="color:' +
          (r._in ? 'var(--primary)' : 'var(--expense)') +
          '">' +
          (r._in ? '+' : '\u2212') +
          formatRupiah(r._amt) +
          '</span></div>'
        );
      })
      .join('');
    if (hits.length > PUB_LIMIT) {
      html +=
        '<div class="ps-meta" style="padding:9px 0 0 12px;color:var(--text-muted);font-size:var(--text-2xs);">' +
        'dan ' +
        (hits.length - PUB_LIMIT) +
        ' catatan lain. Rekap lengkapnya ada di PDF laporan di bawah.</div>';
    }
    box.classList.add('show');
    box.innerHTML = html;
  }
  function refreshPubSearch() {
    if (pubSearchQuery) renderPubSearch();
  }

  /* ===== Analitik dan tren ===== */
  function addMonths(ym, k) {
    var y = parseInt(ym.slice(0, 4), 10),
      m = parseInt(ym.slice(5, 7), 10) - 1 + k;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + ('0' + (m + 1)).slice(-2);
  }
  function movingAverage(arr, win) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (i < win - 1) {
        out.push(null);
        continue;
      }
      var s = 0;
      for (var j = i - win + 1; j <= i; j++) s += arr[j];
      out.push(s / win);
    }
    return out;
  }
  function computeAnalytics() {
    return cached('analytics', function () {
      var idx = getMonthIndex(),
        keys = idx.keys,
        n = keys.length;
      if (n < 2) return { ok: false, months: n };

      var labels = [],
        income = [],
        expense = [],
        net = [],
        running = [],
        run = 0,
        i;
      for (i = 0; i < n; i++) {
        var b = idx.map[keys[i]];
        income.push(b.income);
        expense.push(b.expense);
        net.push(b.income - b.expense);
        run += b.income - b.expense;
        running.push(run);
        labels.push(labelForYm(keys[i], true));
      }

      var totalIncome = 0,
        totalExpense = 0;
      for (i = 0; i < n; i++) {
        totalIncome += income[i];
        totalExpense += expense[i];
      }

      var win = n >= 3 ? 3 : 2;
      var maNet = movingAverage(net, win);

      var recent = Math.min(3, n),
        rIncome = 0,
        rExpense = 0;
      for (i = n - recent; i < n; i++) {
        rIncome += income[i];
        rExpense += expense[i];
      }
      rIncome /= recent;
      rExpense /= recent;

      var busiestIdx = 0,
        busiestVal = -1;
      for (i = 0; i < n; i++) {
        var flow = income[i] + expense[i];
        if (flow > busiestVal) {
          busiestVal = flow;
          busiestIdx = i;
        }
      }

      var sx = 0,
        sy = 0,
        sxx = 0,
        sxy = 0;
      for (i = 0; i < n; i++) {
        sx += i;
        sy += running[i];
        sxx += i * i;
        sxy += i * running[i];
      }
      var denom = n * sxx - sx * sx;
      var slope = denom ? (n * sxy - sx * sy) / denom : 0;
      var recentNet = rIncome - rExpense;
      var step = (slope + recentNet) / 2;

      var forecast = [];
      for (var f = 1; f <= 3; f++) {
        forecast.push({
          key: addMonths(keys[n - 1], f),
          label: labelForYm(addMonths(keys[n - 1], f), true),
          value: run + step * f
        });
      }

      var burn = rExpense - rIncome;
      var runway = burn > 0 ? run / burn : null;

      return {
        ok: true,
        months: n,
        labels: labels,
        keys: keys,
        income: income,
        expense: expense,
        net: net,
        running: running,
        maNet: maNet,
        maWindow: win,
        avgIncome: totalIncome / n,
        avgExpense: totalExpense / n,
        totalIncome: totalIncome,
        totalExpense: totalExpense,
        recentIncome: rIncome,
        recentExpense: rExpense,
        recentNet: recentNet,
        busiest: { label: labels[busiestIdx], flow: busiestVal },
        balance: run,
        step: step,
        forecast: forecast,
        runway: runway
      };
    });
  }

  function shortRupiah(v) {
    var abs = Math.abs(v);
    var sign = v < 0 ? '\u2212' : '';
    if (abs >= 1000000000) return sign + 'Rp ' + (abs / 1000000000).toFixed(1).replace('.', ',') + ' M';
    if (abs >= 1000000) return sign + 'Rp ' + (abs / 1000000).toFixed(1).replace('.', ',') + ' jt';
    if (abs >= 1000) return sign + 'Rp ' + Math.round(abs / 1000) + ' rb';
    return sign + 'Rp ' + Math.round(abs);
  }

  function initAnalyticsScrollTrigger() {
    if (analyticsSTReady || REDUCE_MOTION) return;
    if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') return;
    var card = document.querySelector('.analytics-card');
    if (!card || $('analyticsBody').classList.contains('hidden')) return;
    var tiles = card.querySelectorAll('.metric-tile');
    var meter = card.querySelector('.ratio-meter');
    var items = card.querySelectorAll('.forecast-item');
    if (!tiles.length || !meter) return;
    card.classList.add('st-armed');
    gsap.set(meter, { scaleX: 0 });
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: card,
        start: 'top 75%',
        end: 'bottom 65%',
        scrub: 0.6,
        invalidateOnRefresh: true
      }
    });
    tl.to(meter, { scaleX: 1, ease: 'power2.out', duration: 0.5 });
    window.__analyticsScrollTrigger = tl.scrollTrigger;
    analyticsSTReady = true;
  }
  function teardownAnalyticsScrollTrigger() {
    if (!analyticsSTReady) return;
    if (window.__analyticsScrollTrigger) {
      window.__analyticsScrollTrigger.kill();
      window.__analyticsScrollTrigger = null;
    }
    var card = document.querySelector('.analytics-card');
    if (card && window.gsap) {
      gsap.set(card.querySelectorAll('.metric-tile'), { clearProps: 'all' });
      gsap.set(card.querySelector('.ratio-meter'), { clearProps: 'all' });
      gsap.set(card.querySelectorAll('.forecast-item'), { clearProps: 'all' });
      card.classList.remove('st-armed');
    }
    analyticsSTReady = false;
  }

  function renderAnalytics() {
    var a = computeAnalytics();
    var body = $('analyticsBody'),
      empty = $('analyticsEmpty');
    if (!a.ok) {
      body.classList.add('hidden');
      empty.classList.remove('hidden');
      $('analyticsScope').textContent = '';
      return;
    }
    body.classList.remove('hidden');
    empty.classList.add('hidden');
    $('analyticsScope').textContent =
      a.months + ' bulan tercatat \u00B7 ' + a.labels[0] + ' s/d ' + a.labels[a.months - 1];

    $('mAvgIncome').textContent = formatRupiah(a.avgIncome);
    $('mAvgIncomeFoot').textContent = 'per bulan \u00B7 3 bulan terakhir ' + shortRupiah(a.recentIncome);
    $('mAvgExpense').textContent = formatRupiah(a.avgExpense);
    $('mAvgExpenseFoot').textContent = 'per bulan \u00B7 3 bulan terakhir ' + shortRupiah(a.recentExpense);
    $('mBusiest').textContent = a.busiest.label;
    $('mBusiestFoot').textContent = 'arus kas ' + shortRupiah(a.busiest.flow);

    var runwayEl = $('mRunway'),
      runwayFoot = $('mRunwayFoot');
    if (a.runway === null) {
      runwayEl.textContent = 'Aman';
      runwayEl.className = 'metric-value income';
      runwayFoot.textContent = 'pemasukan masih menutup pengeluaran';
    } else if (a.runway < 1) {
      runwayEl.textContent = 'Kurang 1 bulan';
      runwayEl.className = 'metric-value expense';
      runwayFoot.textContent = 'belanja melebihi pemasukan, saldo cepat menipis';
    } else {
      runwayEl.textContent = Math.floor(a.runway) + ' bulan';
      runwayEl.className = 'metric-value' + (a.runway < 4 ? ' expense' : '');
      runwayFoot.textContent = 'jika belanja bertahan di laju sekarang';
    }

    var spentPct = a.totalIncome > 0 ? (a.totalExpense / a.totalIncome) * 100 : 0;
    var shownSpent = Math.min(100, spentPct);
    $('ratioSpent').style.width = shownSpent.toFixed(1) + '%';
    $('ratioKept').style.width = (100 - shownSpent).toFixed(1) + '%';
    $('ratioSpentTxt').textContent = Math.round(spentPct) + '%';
    $('ratioKeptTxt').textContent = Math.max(0, Math.round(100 - spentPct)) + '%';
    $('ratioHeadline').textContent =
      a.totalIncome > 0
        ? 'Rp ' + Math.round(spentPct) + ' dari tiap Rp 100 terpakai'
        : 'Belum ada pemasukan tercatat';

    var fr = $('forecastRow');
    fr.innerHTML = a.forecast
      .map(function (f) {
        return (
          '<div class="forecast-item"><div class="forecast-month">Proyeksi ' +
          f.label +
          '</div>' +
          '<div class="forecast-value" style="color:' +
          (f.value < 0 ? 'var(--expense)' : 'var(--text-main)') +
          '">' +
          formatRupiah(f.value) +
          '</div></div>'
        );
      })
      .join('');

    var arah = a.step > 0 ? 'naik' : a.step < 0 ? 'turun' : 'datar';
    $('analyticsNote').textContent =
      'Proyeksi memakai garis tren saldo digabung rata-rata arus kas ' +
      Math.min(3, a.months) +
      ' bulan terakhir, ' +
      'dan menunjukkan saldo cenderung ' +
      arah +
      ' sekitar ' +
      shortRupiah(Math.abs(a.step)) +
      ' per bulan. ' +
      'Angka ini perkiraan dari pola lama, bukan janji, dan akan berubah begitu ada catatan baru.';

    renderTrendChart(a);
    initAnalyticsScrollTrigger();
  }

  function renderTrendChart(a) {
    var wrap = document.querySelector('.analytics-chart-wrap');
    if (typeof Chart === 'undefined') {
      if (wrap) wrap.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = '';
    var colors = getChartColors();
    var future = a.forecast.map(function (f) {
      return f.label;
    });
    var labels = a.labels.concat(future);
    var pad = [null, null, null];
    var netData = a.net.concat(pad);
    var maData = a.maNet.concat(pad);
    var saldoData = a.running.concat(pad);
    var proj = [];
    for (var i = 0; i < a.months - 1; i++) proj.push(null);
    proj.push(a.running[a.months - 1]);
    for (var f = 0; f < a.forecast.length; f++) proj.push(a.forecast[f].value);

    var datasets = [
      {
        type: 'bar',
        label: 'Arus bersih bulanan',
        data: netData,
        yAxisID: 'y',
        backgroundColor: netData.map(function (v) {
          return v === null ? 'transparent' : v >= 0 ? colors.primary + '66' : colors.expense + '66';
        }),
        borderColor: netData.map(function (v) {
          return v === null ? 'transparent' : v >= 0 ? colors.primary : colors.expense;
        }),
        borderWidth: 1,
        borderRadius: 4,
        order: 3
      },
      {
        type: 'line',
        label: 'Rata-rata ' + a.maWindow + ' bulan',
        data: maData,
        yAxisID: 'y',
        borderColor: colors.secondary,
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0.35,
        fill: false,
        order: 2,
        spanGaps: true
      },
      {
        type: 'line',
        label: 'Saldo berjalan',
        data: saldoData,
        yAxisID: 'y1',
        borderColor: colors.primary,
        borderWidth: 2.4,
        pointRadius: 2,
        tension: 0.3,
        fill: false,
        order: 1
      },
      {
        type: 'line',
        label: 'Proyeksi saldo',
        data: proj,
        yAxisID: 'y1',
        borderColor: colors.secondary,
        borderWidth: 2.4,
        borderDash: [3, 3],
        pointRadius: 3,
        pointStyle: 'rectRot',
        tension: 0.2,
        fill: false,
        order: 0,
        spanGaps: true
      }
    ];

    if (!trendChartInstance) {
      trendChartInstance = new Chart($('trendChart').getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: REDUCE_MOTION ? 0 : 650 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 10, font: { size: 11 }, color: colors.muted, usePointStyle: true }
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return (
                    ctx.dataset.label + ': ' + (ctx.parsed.y === null ? '-' : formatRupiah(ctx.parsed.y))
                  );
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colors.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 14 }
            },
            y: {
              position: 'left',
              grid: { color: colors.grid },
              ticks: {
                color: colors.muted,
                font: { size: 10 },
                callback: function (v) {
                  return shortRupiah(v);
                }
              }
            },
            y1: {
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: {
                color: colors.muted,
                font: { size: 10 },
                callback: function (v) {
                  return shortRupiah(v);
                }
              }
            }
          }
        }
      });
    } else {
      trendChartInstance.data.labels = labels;
      trendChartInstance.data.datasets = datasets;
      trendChartInstance.update();
    }

    armChartEntrance('trendChart', function () {
      return trendChartInstance;
    });
    var sr = 'Grafik analisis: saldo berjalan berakhir di ' + formatRupiah(a.balance) + '. ';
    for (var k = 0; k < a.forecast.length; k++)
      sr += 'Proyeksi ' + a.forecast[k].label + ' ' + formatRupiah(a.forecast[k].value) + '. ';
    $('trendChartSrSummary').textContent = sr;
  }

  var importPrevFocus = null;

  /* ===== Interaksi kartu, reveal scroll, tema, gerak ===== */
  function setImportModal(open) {
    var m = $('importModal');
    if (open) {
      importPrevFocus = document.activeElement;
      m.classList.remove('hidden');
      setTimeout(function () {
        $('templateBtn').focus();
      }, 30);
    } else {
      m.classList.add('hidden');
      setImportProgress(null);
      if (importPrevFocus && importPrevFocus.focus) importPrevFocus.focus();
    }
  }

  function setupCardInteraction(el, tilt) {
    if (!el || !HAS_FINE_HOVER || REDUCE_MOTION) return;
    var doTilt = tilt !== false;
    el.addEventListener('mousemove', function (e) {
      if (REDUCE_MOTION) return;
      var r = el.getBoundingClientRect();
      var px = ((e.clientX - r.left) / r.width) * 100,
        py = ((e.clientY - r.top) / r.height) * 100;
      el.style.setProperty('--spot-x', px + '%');
      el.style.setProperty('--spot-y', py + '%');
      el.classList.add('spot-active');
      if (!doTilt) return;
      var rotY = ((e.clientX - r.left) / r.width - 0.5) * 5;
      var rotX = -((e.clientY - r.top) / r.height - 0.5) * 5;
      el.style.transform =
        'perspective(900px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg)';
    });
    el.addEventListener('mouseleave', function () {
      el.classList.remove('spot-active');
      if (doTilt) el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
    });
  }

  function setupNavSpy() {
    var links = document.querySelectorAll('.nav-links a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    for (var i = 0; i < links.length; i++) {
      var id = links[i].getAttribute('href').slice(1);
      if (document.getElementById(id)) map[id] = links[i];
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting || !map[en.target.id]) return;
          for (var k = 0; k < links.length; k++) links[k].removeAttribute('aria-current');
          map[en.target.id].setAttribute('aria-current', 'true');
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    Object.keys(map).forEach(function (id) {
      io.observe(document.getElementById(id));
    });
  }

  function setupScrollReveal() {
    if (window.CSS && CSS.supports && CSS.supports('animation-timeline: view()')) return;
    var els = document.querySelectorAll('.scroll-reveal');
    if (!('IntersectionObserver' in window) || REDUCE_MOTION) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('revealed');
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }

  function setupFloatBalance() {
    var btn = $('floatBalanceBtn'),
      hero = document.getElementById('beranda');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(
      function (entries) {
        btn.classList.toggle('visible', !entries[0].isIntersecting);
      },
      { threshold: 0 }
    );
    io.observe(hero);
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
    });
  }

  function playHeroEntrance() {
    if (REDUCE_MOTION) return;
    if (!gsapOn()) {
      document.querySelector('.hero-content').classList.add('hero-entrance');
      return;
    }
    var h2 = document.querySelector('.hero h2');
    var split = null;
    if (
      h2 &&
      document.fonts &&
      document.fonts.status === 'loaded' &&
      typeof window.SplitText !== 'undefined'
    ) {
      try {
        split = SplitText.create(h2, { type: 'words' });
      } catch (splitErr) {
        split = null;
      }
    }
    var tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (split) tl.from(split.words, { opacity: 0, y: -14, stagger: 0.05, duration: 0.5 });
    else tl.from(h2, { opacity: 0, y: -18, duration: 0.6 });
    tl.from('.hero-stat-label', { opacity: 0, y: 10, duration: 0.4 }, '-=0.25')
      .from('.hero-stat-value', { opacity: 0, y: 14, duration: 0.5 }, '-=0.2')
      .from(
        '.hero-sparkline',
        { opacity: 0, scaleX: 0.6, transformOrigin: 'left center', duration: 0.5 },
        '-=0.2'
      )
      .from('.hero-cta', { opacity: 0, y: 12, scale: 0.9, duration: 0.4 }, '-=0.15');
    if (split)
      tl.eventCallback('onComplete', function () {
        split.revert();
      });
  }

  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var t = $('themeToggle');
    t.classList.toggle('dark-mode', dark);
    t.setAttribute('aria-checked', String(dark));
    t.setAttribute('aria-label', dark ? 'Kembali ke mode terang' : 'Aktifkan mode gelap');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0E1712' : '#0D6B3F');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
    updateChartTheme();
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');
  $('themeToggle').addEventListener('click', function () {
    switchTheme(document.documentElement.getAttribute('data-theme') !== 'dark', this);
  });

  function syncMotionToggle() {
    var b = $('motionToggle');
    b.setAttribute('aria-checked', String(REDUCE_MOTION));
    b.disabled = OS_REDUCE;
    b.title = OS_REDUCE
      ? 'Mengikuti pengaturan perangkat (kurangi gerakan)'
      : 'Kurangi animasi agar hemat baterai dan kuota';
  }
  $('motionToggle').addEventListener('click', function () {
    liteMotion = !liteMotion;
    REDUCE_MOTION = OS_REDUCE || liteMotion;
    document.documentElement.classList.toggle('lite-motion', liteMotion);
    try {
      localStorage.setItem('kasMotion', liteMotion ? 'lite' : 'full');
    } catch {}
    syncMotionToggle();
    if (!REDUCE_MOTION) buildHeroParticles();
    if (liteMotion) teardownAnalyticsScrollTrigger();
    else initAnalyticsScrollTrigger();
    toast(liteMotion ? 'Mode hemat gerak aktif.' : 'Animasi penuh aktif.', null);
  });
  syncMotionToggle();

  $('hamburgerBtn').addEventListener('click', function () {
    var isOpen = $('navLinks').classList.toggle('open');
    this.setAttribute('aria-expanded', String(isOpen));
  });
  var navAnchors = document.querySelectorAll('#navLinks a');
  for (var na = 0; na < navAnchors.length; na++) {
    navAnchors[na].addEventListener('click', function () {
      $('navLinks').classList.remove('open');
      $('hamburgerBtn').setAttribute('aria-expanded', 'false');
    });
  }

  $('heroCtaBtn').addEventListener('click', openLedgerAndScroll);

  $('navSearchBtn').addEventListener('click', function () {
    document
      .getElementById('transparansi')
      .scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' });
    setTimeout(
      function () {
        $('pubSearchInput').focus();
      },
      REDUCE_MOTION ? 0 : 420
    );
  });
  var pubDebounce;
  $('pubSearchInput').addEventListener('input', function () {
    var val = this.value;
    clearTimeout(pubDebounce);
    pubDebounce = setTimeout(function () {
      pubSearchQuery = val;
      renderPubSearch();
    }, 160);
  });
  $('pubSearchClear').addEventListener('click', function () {
    $('pubSearchInput').value = '';
    pubSearchQuery = '';
    renderPubSearch();
    $('pubSearchInput').focus();
  });
  expandBtn.addEventListener('click', function () {
    var willOpen = !expandBtn.classList.contains('open');
    toggleLedgerCollapse(willOpen);
    if (willOpen) scrollToLedger();
  });

  var ledgerTabBtns = document.querySelectorAll('#ledgerTabs .tabbar-item');
  for (var lt = 0; lt < ledgerTabBtns.length; lt++) {
    ledgerTabBtns[lt].addEventListener('click', function () {
      switchLedgerTab(this.getAttribute('data-tab'));
    });
  }
  var txTypeBtns = document.querySelectorAll('#txTypeTabs .segmented-item');
  for (var tt = 0; tt < txTypeBtns.length; tt++) {
    txTypeBtns[tt].addEventListener('click', function () {
      switchTxTypeTab(this.getAttribute('data-type'));
    });
    txTypeBtns[tt].addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      var next = currentType === 'pemasukan' ? 'pengeluaran' : 'pemasukan';
      switchTxTypeTab(next);
      document.querySelector('#txTypeTabs .segmented-item.active').focus();
    });
  }

  /* ===== Autentikasi dan pengikatan event antarmuka ===== */
  function bindAuthListener() {
    sb.auth.onAuthStateChange(function (event, session) {
      var wasSignedIn = !!accessToken;
      accessToken = session ? session.access_token : null;
      currentUserEmail = session ? session.user.email : null;
      updateSessionUI();

      if (event === 'SIGNED_IN') {
        if (!wasSignedIn) {
          toggleLedgerCollapse(true);
          switchLedgerTab('catat');
        }
      } else if (event === 'SIGNED_OUT' && !manualSignOut) {
        toast('Sesi berakhir, silakan masuk kembali untuk melanjutkan.', 'error', { duration: 5000 });
      }
      manualSignOut = false;
    });

    sb.auth.getSession().then(function (res) {
      var session = res.data.session;
      accessToken = session ? session.access_token : null;
      currentUserEmail = session ? session.user.email : null;
      updateSessionUI();
    });
  }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!isConfigured) {
      toast('Supabase belum dikonfigurasi.', 'error');
      return;
    }
    withBusyButton(
      $('loginBtn'),
      function () {
        return sb.auth
          .signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value })
          .then(function (res) {
            if (res.error) throw res.error;
            toast('Berhasil masuk.', null);
            $('loginForm').reset();
          });
      },
      'Memproses\u2026'
    ).catch(function (err) {
      toast(
        /invalid/i.test((err && err.message) || '')
          ? 'Email atau kata sandi salah.'
          : 'Gagal masuk, cek koneksi.',
        'error'
      );
    });
  });
  $('logoutBtn').addEventListener('click', function () {
    manualSignOut = true;
    flushPendingDelete()
      .then(function () {
        return sb.auth.signOut();
      })
      .then(function () {
        toast('Berhasil keluar.', null);
        exitEditMode();
      });
  });

  $('txAmount').addEventListener('input', function () {
    var raw = parseAmountInput(this.value);
    var pos = this.selectionStart,
      oldLen = this.value.length;
    this.value = raw ? formatThousands(String(raw)) : '';
    var newPos = Math.max(0, pos + (this.value.length - oldLen));
    this.setSelectionRange(newPos, newPos);
  });
  $('txNama').addEventListener('input', maybeShowQuickfill);
  $('txCancelEditBtn').addEventListener('click', exitEditMode);
  $('txForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearAllFieldErrors();
    var tanggal = $('txDate').value;
    var jumlah = parseAmountInput($('txAmount').value);
    var keterangan = $('txNote').value.trim();
    var nama = $('txNama').value.trim();
    var ok = true;
    if (!tanggal) {
      setFieldError('txDate', 'Tanggal wajib diisi.');
      ok = false;
    }
    if (!jumlah || jumlah <= 0) {
      setFieldError('txAmount', 'Jumlah harus lebih dari 0.');
      ok = false;
    }
    if (!keterangan) {
      setFieldError('txNote', 'Keterangan wajib diisi.');
      ok = false;
    }
    if (!nama) {
      setFieldError('txNama', 'Nama pengisi wajib diisi.');
      ok = false;
    }
    if (!ok) return;
    var candidate = {
      tanggal: tanggal,
      jenis: currentType,
      jumlah: jumlah,
      keterangan: keterangan,
      nama_pengisi: nama
    };

    function proceed() {
      var wasEdit = !!editingId,
        targetId = editingId;
      withBusyButton(
        $('txSubmitBtn'),
        function () {
          var op = wasEdit ? updateTransaksi(targetId, candidate) : insertTransaksi(candidate);
          return op.then(function (savedRows) {
            if (!wasEdit && !savedRows.length) {
              var insErr = new Error(
                'Transaksi gagal disimpan (server menolak tanpa keterangan). Kemungkinan izin (RLS) tabel belum mengizinkan Anda menambah data.'
              );
              insErr.code = 'NO_ROWS';
              throw insErr;
            }
            var savedId = wasEdit ? targetId : savedRows[0] && savedRows[0].id;
            exitEditMode();
            return loadAndRender(true).then(function () {
              var btn = $('txSubmitBtn');
              toast(wasEdit ? 'Perubahan tersimpan.' : 'Transaksi tersimpan.', null);
              markButtonSaved(btn, wasEdit ? 'Perubahan tersimpan' : 'Tersimpan', 1250);
              popConfetti(btn);
              flashHeroStat();
              if (!wasEdit) flyAmountToBalance(candidate);
              if (savedId) {
                setTimeout(
                  function () {
                    switchLedgerTab('riwayat');
                    currentPage = 1;
                    renderTxList(savedId, true);
                  },
                  REDUCE_MOTION ? 0 : 820
                );
              }
            });
          });
        },
        'Menyimpan\u2026'
      ).catch(function (err) {
        handleDataError(err);
        if (err && err.code === 'NO_ROWS') {
          exitEditMode();
          loadAndRender(true);
        }
      });
    }
    var dups = findPotentialDuplicates(candidate, editingId);
    if (dups.length) {
      confirmModal({
        title: 'Transaksi Serupa Ditemukan',
        message:
          'Ada ' + dups.length + ' transaksi dengan tanggal, jumlah, dan jenis yang sama. Tetap simpan?',
        confirmLabel: 'Tetap Simpan',
        danger: false
      }).then(function (yes) {
        if (yes) proceed();
      });
    } else proceed();
  });

  $('txList').addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-action');
    if (act === 'clearfilter') {
      $('filterClearBtn').click();
      return;
    }
    if (act === 'gotocatat') {
      switchLedgerTab('catat');
      $('txNote').focus();
      return;
    }
    var row = btn.closest('.row');
    var id = row.getAttribute('data-id');
    var record = null;
    for (var i = 0; i < allData.length; i++) {
      if (String(allData[i].id) === id) {
        record = allData[i];
        break;
      }
    }
    if (!record) return;
    if (act === 'edit') {
      populateEditForm(record);
      return;
    }
    if (act === 'kwitansi') {
      if (window.KasExtras) window.KasExtras.receipt(record);
      return;
    }
    confirmModal({
      title: 'Hapus transaksi ini?',
      message:
        'Catatan berikut akan hilang dari laporan publik. Setelah dihapus, Anda punya 6 detik untuk membatalkan.',
      preview: txPreviewHtml(record),
      confirmLabel: 'Hapus'
    }).then(function (yes) {
      if (yes) beginDelete(record, row);
    });
  });

  $('incomeRowBtn').addEventListener('click', function () {
    jumpToRiwayatFiltered('pemasukan');
  });
  $('expenseRowBtn').addEventListener('click', function () {
    jumpToRiwayatFiltered('pengeluaran');
  });
  $('shareWaBtn').addEventListener('click', function () {
    var s = computeSummary();
    var text =
      'Laporan Kas LBM MWC NU Ngantang\nSaldo: ' +
      formatRupiah(s.balance) +
      '\nPemasukan: ' +
      formatRupiah(s.income) +
      '\nPengeluaran: ' +
      formatRupiah(s.expense) +
      '\n' +
      window.location.href;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  });

  var searchDebounce;
  $('searchInput').addEventListener('input', function () {
    var val = this.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      filters.search = val;
      currentPage = 1;
      renderTxList();
    }, 200);
  });
  $('filterToggleBtn').addEventListener('click', function () {
    var isHidden = $('filterAdvanced').classList.toggle('hidden');
    this.classList.toggle('active', !isHidden);
    this.setAttribute('aria-expanded', String(!isHidden));
  });
  $('filterType').addEventListener('change', function () {
    filters.type = this.value;
    currentPage = 1;
    renderTxList();
  });
  $('filterFrom').addEventListener('change', function () {
    filters.from = this.value;
    currentPage = 1;
    renderTxList();
  });
  $('filterTo').addEventListener('change', function () {
    filters.to = this.value;
    currentPage = 1;
    renderTxList();
  });
  $('filterClearBtn').addEventListener('click', function () {
    filters = { search: '', type: '', from: '', to: '' };
    $('searchInput').value = '';
    $('filterType').value = '';
    $('filterFrom').value = '';
    $('filterTo').value = '';
    currentPage = 1;
    renderTxList();
  });
  $('prevPageBtn').addEventListener('click', function () {
    if (currentPage > 1) {
      currentPage--;
      renderTxList(null, true);
    }
  });
  $('nextPageBtn').addEventListener('click', function () {
    currentPage++;
    renderTxList(null, true);
  });

  $('resetAllBtn').addEventListener('click', function () {
    confirmModal({
      title: 'Hapus Semua Data?',
      message:
        'SELURUH transaksi di database bersama akan terhapus di semua perangkat. Aksi ini tidak bisa dibatalkan.',
      confirmLabel: 'Hapus Semua',
      requireText: 'HAPUS'
    }).then(function (yes) {
      if (!yes) return;
      flushPendingDelete()
        .then(function () {
          return deleteAllTransaksi();
        })
        .then(function () {
          return loadAndRender(true);
        })
        .then(function () {
          if (allData.length)
            toast('Sebagian data tidak terhapus. Cek izin (RLS) tabel di Supabase.', 'error', {
              duration: 6500
            });
          else toast('Semua data dihapus.', null);
        })
        .catch(handleDataError);
    });
  });

  $('templateBtn').addEventListener('click', function () {
    withBusyButton($('templateBtn'), downloadTemplate, 'Menyiapkan\u2026').catch(function () {
      toast('Gagal membuat template.', 'error');
    });
  });
  $('importFileInput').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    handleFileSelected(file).catch(function () {
      toast('Gagal membaca file, pastikan formatnya sesuai template.', 'error');
      resetImportUI();
    });
  });
  $('importCancelBtn').addEventListener('click', resetImportUI);
  $('openImportBtn').addEventListener('click', function () {
    setImportModal(true);
  });
  $('importCloseBtn').addEventListener('click', function () {
    setImportModal(false);
  });
  $('importModal').addEventListener('mousedown', function (ev) {
    if (ev.target === this) setImportModal(false);
  });
  $('importModal').addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') setImportModal(false);
  });
  (function () {
    var dz = $('importDropZone');
    ['dragenter', 'dragover'].forEach(function (evt) {
      dz.addEventListener(evt, function (ev) {
        ev.preventDefault();
        dz.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dz.addEventListener(evt, function (ev) {
        ev.preventDefault();
        dz.classList.remove('dragging');
      });
    });
    dz.addEventListener('drop', function (ev) {
      var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!file) return;
      handleFileSelected(file).catch(function () {
        toast('Gagal membaca berkas. Pastikan formatnya mengikuti template.', 'error');
        resetImportUI();
      });
    });
  })();
  $('importPrevBtn').addEventListener('click', function () {
    if (importPage > 1) {
      importPage--;
      renderImportPreview();
    }
  });
  $('importNextBtn').addEventListener('click', function () {
    importPage++;
    renderImportPreview();
  });
  $('importConfirmBtn').addEventListener('click', function () {
    withBusyButton(
      $('importConfirmBtn'),
      function () {
        return insertTransaksiBulk(parsedImportRows).then(function (saved) {
          var n = parsedImportRows.length,
            ok = saved.length;
          resetImportUI();
          setImportModal(false);
          return loadAndRender(true).then(function () {
            if (ok === n) toast(n + ' transaksi berhasil diimpor.', null);
            else
              toast(
                ok + ' dari ' + n + ' baris tersimpan. Periksa Riwayat sebelum mengulang impor.',
                'warn',
                { duration: 6500 }
              );
            flashHeroStat();
          });
        });
      },
      'Mengimpor\u2026'
    ).catch(handleDataError);
  });

  /* ===== Preset periode laporan ===== */
  function applyPdfPreset(preset) {
    var today = new Date(),
      to = isoLocal(today),
      from;
    if (preset === 'month') from = isoLocal(new Date(today.getFullYear(), today.getMonth(), 1));
    else if (preset === 'year') from = isoLocal(new Date(today.getFullYear(), 0, 1));
    else from = allData.length ? allData[0].tanggal : to;
    $('pdfFrom').value = from;
    $('pdfTo').value = to;
  }
  var pdfChips = document.querySelectorAll('#pdfPresetChips .chip');
  for (var pc = 0; pc < pdfChips.length; pc++) {
    pdfChips[pc].addEventListener('click', function () {
      for (var k = 0; k < pdfChips.length; k++) pdfChips[k].classList.remove('active');
      this.classList.add('active');
      applyPdfPreset(this.getAttribute('data-preset'));
    });
  }
  $('pdfGenerateBtn').addEventListener('click', function () {
    withBusyButton(
      $('pdfGenerateBtn'),
      function (stage) {
        return generatePdfReport(stage);
      },
      'Membuat PDF\u2026'
    ).catch(function () {
      toast('Gagal membuat PDF.', 'error');
    });
  });

  /* ===== Sinkron latar belakang: delta realtime, polling, onboarding ===== */
  function compareRows(a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    var x = Number(a.id),
      y = Number(b.id);
    if (isFinite(x) && isFinite(y)) return x - y;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  }
  var saveCacheTimer = null;
  function saveCacheSoon() {
    clearTimeout(saveCacheTimer);
    saveCacheTimer = setTimeout(function () {
      saveCache(allData);
    }, 1500);
  }
  function applyRealtimeChange(payload) {
    if (!payload || !hasLoadedOnce || isFetching) return false;
    var type = payload.eventType,
      rec = type === 'DELETE' ? payload.old : payload['new'];
    if ((type !== 'INSERT' && type !== 'UPDATE' && type !== 'DELETE') || !rec || rec.id == null) return false;
    if (
      type !== 'DELETE' &&
      (rec.tanggal == null || rec.jumlah == null || (rec.tipe == null && rec.jenis == null))
    )
      return false;
    var key = String(rec.id),
      next = [],
      oldCount = allData.length,
      oldSummary = computeSummaryFrom(allData),
      i;
    for (i = 0; i < allData.length; i++) {
      if (String(allData[i].id) !== key) next.push(allData[i]);
    }
    if (type !== 'DELETE') {
      next.push(normalizeRows([Object.assign({}, rec)])[0]);
      next.sort(compareRows);
    }
    setAllData(next);
    var s = computeSummary();
    renderAll();
    markSynced();
    saveCacheSoon();
    if (
      oldCount !== allData.length ||
      oldSummary.balance !== s.balance ||
      oldSummary.income !== s.income ||
      oldSummary.expense !== s.expense
    )
      pulseStats();
    return true;
  }
  function startBackgroundSync() {
    if (!isConfigured) return;
    try {
      sb.channel('transaksi-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function (payload) {
          if (applyRealtimeChange(payload)) return;
          clearTimeout(startBackgroundSync._debounce);
          startBackgroundSync._debounce = setTimeout(function () {
            loadAndRender(true);
          }, 700);
        })
        .subscribe();
    } catch {}
    setInterval(function () {
      if (!document.hidden) loadAndRender(true);
    }, 90000);
    var hiddenSince = null;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) hiddenSince = Date.now();
      else {
        if (hiddenSince && Date.now() - hiddenSince > 60000) loadAndRender(true);
        hiddenSince = null;
      }
    });
  }

  setTodayDefault();
  $('footerYear').innerHTML =
    '&copy; ' +
    new Date().getFullYear() +
    '. Laporan keuangan disusun transparan untuk warga Nahdliyin Ngantang';
  $('syncDateText').textContent = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  applyPdfPreset('month');
  renderPresetChips();
  initTabIndicator('ledgerTabs', 'ledgerTabIndicator', 'expense-tone');
  initTabIndicator('txTypeTabs', 'txTypeTabIndicator', 'expense-tone', '.segmented-item');
  setupScrollReveal();
  setupFloatBalance();
  setupNavSpy();
  buildHeroParticles();
  setupHeroTitleScroll();
  playHeroEntrance();
  switchTxTypeTab(currentType);

  try {
    if (localStorage.getItem('kasLedgerOpen') === '1') toggleLedgerCollapse(true);
  } catch {}

  function maybeOnboard() {
    var seen = true;
    try {
      seen = localStorage.getItem('kasOnboardV1') === '1';
    } catch {}
    if (seen || expandBtn.classList.contains('open')) return;
    setTimeout(function () {
      expandBtn.classList.add('nudge');
      toast('Bendahara? Buka \u201cKelola Kas\u201d di bawah untuk mulai mencatat.', 'warn', {
        duration: 5400
      });
      try {
        localStorage.setItem('kasOnboardV1', '1');
      } catch {}
    }, 2800);
  }

  var cachedPayload = loadCache();
  if (cachedPayload && cachedPayload.rows && cachedPayload.rows.length) {
    setAllData(normalizeRows(cachedPayload.rows));
    hasLoadedOnce = true;
    renderAll();
  } else {
    $('txList').innerHTML = skeletonRows(3);
  }

  if (!isConfigured) {
    setStatus(
      'Supabase belum dikonfigurasi \u2014 isi CONFIG.url dan CONFIG.anonKey di bagian atas script.',
      'warn'
    );
  } else if (typeof window.supabase === 'undefined') {
    setStatus(
      'Pustaka Supabase gagal dimuat dari CDN. Cek koneksi internet, lalu muat ulang halaman.',
      'error'
    );
  } else {
    try {
      sb = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
      bindAuthListener();
      loadAndRender(false).then(function () {
        startBackgroundSync();
        maybeOnboard();
      });
    } catch (err) {
      setStatus(
        'Gagal terhubung ke Supabase: ' + (err && err.message ? err.message : 'kesalahan tidak dikenal'),
        'error'
      );
    }
  }
});
