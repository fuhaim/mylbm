/*
 * Buku Kas LBM MWC NU Ngantang - fitur tambahan.
 * Dimuat sebelum app.js; app.js memanggil KasExtras.init(api) setelah DOM siap dan
 * KasExtras.refresh() setiap data dirender ulang. Semua fungsi murni (terbilang, recapText)
 * bisa diuji tanpa browser.
 */
(function (root) {
  'use strict';

  /* ===== Terbilang: angka -> kata (Bahasa Indonesia) ===== */
  var UNITS = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
    'sepuluh',
    'sebelas'
  ];
  var SCALES = [
    [1e12, 'triliun'],
    [1e9, 'miliar'],
    [1e6, 'juta'],
    [1e3, 'ribu']
  ];
  var MAX_SAFE = 9007199254740991;

  function spell(n) {
    if (n < 12) return UNITS[n];
    if (n < 20) return UNITS[n - 10] + ' belas';
    if (n < 100) return UNITS[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + UNITS[n % 10] : '');
    if (n < 200) return 'seratus' + (n % 100 ? ' ' + spell(n % 100) : '');
    if (n < 1000) return UNITS[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + spell(n % 100) : '');
    if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + spell(n % 1000) : '');
    for (var i = 0; i < SCALES.length; i++) {
      var base = SCALES[i][0];
      if (n >= base)
        return spell(Math.floor(n / base)) + ' ' + SCALES[i][1] + (n % base ? ' ' + spell(n % base) : '');
    }
    return '';
  }

  function terbilang(value) {
    var n = Math.floor(Math.abs(Number(value)));
    if (!isFinite(n) || n > MAX_SAFE) return '';
    return n === 0 ? 'nol' : spell(n);
  }

  /* ===== Util kecil ===== */
  function isIncome(row) {
    return row._in !== undefined ? row._in : row.jenis === 'pemasukan';
  }
  function amountOf(row) {
    return row._amt !== undefined ? row._amt : Number(row.jumlah) || 0;
  }
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function byDateDesc(a, b) {
    return a.tanggal !== b.tanggal
      ? a.tanggal < b.tanggal
        ? 1
        : -1
      : String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  }

  /* ===== Rekap teks WhatsApp ===== */
  function recapText(rows, from, to, deps) {
    var rp = deps.formatRupiah,
      before = [],
      inRange = [],
      i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].tanggal < from) before.push(rows[i]);
      else if (rows[i].tanggal <= to) inRange.push(rows[i]);
    }
    var opening = deps.summaryOf(before).balance,
      sum = deps.summaryOf(inRange);
    var lines = [
      '*Rekap Kas LBM MWC NU Ngantang*',
      'Periode: ' + deps.formatTanggal(from) + ' s/d ' + deps.formatTanggal(to),
      '',
      'Saldo awal: ' + rp(opening),
      'Pemasukan: ' + rp(sum.income),
      'Pengeluaran: ' + rp(sum.expense),
      '*Saldo akhir: ' + rp(opening + sum.balance) + '*'
    ];
    var recent = inRange.slice().sort(byDateDesc).slice(0, 5);
    if (recent.length) {
      lines.push('', 'Transaksi terbaru:');
      for (i = 0; i < recent.length; i++) {
        lines.push(
          '\u2022 ' +
            deps.formatTanggal(recent[i].tanggal) +
            ' \u2014 ' +
            (recent[i].keterangan || '-') +
            ' (' +
            (isIncome(recent[i]) ? '+' : '-') +
            rp(amountOf(recent[i])) +
            ')'
        );
      }
    }
    if (deps.link) lines.push('', '_Laporan lengkap: ' + deps.link + '_');
    return lines.join('\n');
  }

  /* ===== Kwitansi PDF (A5 lanskap) ===== */
  var api = null,
    ready = false;

  function receiptNumber(row) {
    return 'KW-' + String(row.tanggal).replace(/-/g, '') + '-' + String(row.id).slice(-6);
  }

  function buildReceipt(row) {
    var doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
    var W = doc.internal.pageSize.getWidth(),
      H = doc.internal.pageSize.getHeight(),
      m = 10;
    var income = isIncome(row),
      amount = amountOf(row),
      who = row.nama_pengisi || row.nama || '-';
    var logo = document.querySelector('.logo-img');

    doc.setDrawColor(13, 107, 63);
    doc.setLineWidth(0.8);
    doc.rect(m / 2, m / 2, W - m, H - m);
    doc.setDrawColor(200, 155, 60);
    doc.setLineWidth(0.3);
    doc.rect(m / 2 + 1.5, m / 2 + 1.5, W - m - 3, H - m - 3);
    try {
      if (logo) doc.addImage(logo.getAttribute('src'), 'PNG', m + 2, m + 2, 16, 16);
    } catch (e) {
      /* logo opsional */
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(13, 107, 63);
    doc.text('LBM MWC NU Kecamatan Ngantang', m + 22, m + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text('Buku Kas Digital \u2014 laporan keuangan transparan', m + 22, m + 14.5);
    doc.setDrawColor(200, 155, 60);
    doc.setLineWidth(0.5);
    doc.line(m + 2, m + 21, W - m - 2, m + 21);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30, 30, 30);
    doc.text(income ? 'KWITANSI PENERIMAAN KAS' : 'BUKTI PENGELUARAN KAS', W / 2, m + 31, {
      align: 'center'
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text('No. ' + receiptNumber(row), W / 2, m + 36.5, { align: 'center' });

    var y = m + 47,
      labelX = m + 4,
      valueX = m + 44,
      maxW = W - valueX - m - 4;
    function field(label, value, style) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text(label, labelX, y);
      doc.text(':', valueX - 4, y);
      doc.setFont('helvetica', style || 'normal');
      doc.setTextColor(30, 30, 30);
      var parts = doc.splitTextToSize(String(value), maxW);
      doc.text(parts, valueX, y);
      y += 6.2 * parts.length + 1.5;
    }
    field('Tanggal', api.formatTanggal(row.tanggal));
    field('Jenis', income ? 'Pemasukan' : 'Pengeluaran');
    field('Uang sejumlah', api.formatRupiah(amount), 'bold');
    field('Terbilang', capitalize(terbilang(amount)) + ' rupiah', 'italic');
    field('Untuk keperluan', row.keterangan || '-');
    field('Dicatat oleh', who);

    var sx = W - m - 62;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Ngantang, ' + api.formatTanggal(row.tanggal), sx, H - 41);
    doc.text('Bendahara,', sx, H - 35.5);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.line(sx, H - 17, sx + 52, H - 17);
    doc.setFont('helvetica', 'bold');
    doc.text(who, sx, H - 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      'Dokumen dibuat otomatis dari buku kas digital pada ' + new Date().toLocaleString('id-ID') + '.',
      m + 4,
      H - 9
    );
    doc.save('Kwitansi-' + row.tanggal + '-' + String(row.id).slice(-6) + '.pdf');
  }

  function receipt(row) {
    if (!ready || !row) return;
    api
      .ensurePDF()
      .then(function () {
        buildReceipt(row);
        api.toast('Kwitansi diunduh.', null);
      })
      .catch(function (err) {
        api.handleError(err);
      });
  }

  /* ===== Rekap WhatsApp (di bar Laporan PDF) ===== */
  function mountRecap() {
    var controls = document.querySelector('.pdf-bar-controls');
    if (!controls || document.getElementById('waRecapBtn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'waRecapBtn';
    btn.className = 'ghost-btn wa-btn';
    btn.textContent = 'Rekap WhatsApp';
    controls.appendChild(btn);
    btn.addEventListener('click', function () {
      var from = document.getElementById('pdfFrom').value,
        to = document.getElementById('pdfTo').value;
      if (!from || !to || from > to) {
        api.toast('Pilih rentang tanggal yang benar dulu.', 'error');
        return;
      }
      var text = recapText(api.rows(), from, to, {
        formatRupiah: api.formatRupiah,
        formatTanggal: api.formatTanggal,
        summaryOf: api.summaryOf,
        link: root.location.origin
      });
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      } catch (e) {
        /* salin opsional */
      }
      root.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
      api.toast('Rekap disalin dan WhatsApp dibuka.', null);
    });
  }

  /* ===== Rekonsiliasi kas (kartu di area bendahara) ===== */
  function mountReconcile() {
    var host = document.getElementById('loggedInArea');
    if (!host || document.getElementById('reconcileCard')) return;
    var card = document.createElement('div');
    card.className = 'reconcile';
    card.id = 'reconcileCard';
    card.innerHTML =
      '<button type="button" class="reconcile-toggle" id="reconcileToggle" aria-expanded="false" aria-controls="reconcileBody">Rekonsiliasi kas <span class="reconcile-chev" aria-hidden="true">\u25BE</span></button>' +
      '<div class="reconcile-body hidden" id="reconcileBody">' +
      '<p class="reconcile-note">Cocokkan saldo di sistem dengan uang tunai atau rekening yang sebenarnya. Selisih dapat dicatat sebagai penyesuaian.</p>' +
      '<div class="reconcile-row"><span>Saldo sistem</span><strong id="rcSystem">-</strong></div>' +
      '<div class="form-group"><label for="rcPhysical">Saldo fisik (Rp)</label><input type="text" inputmode="numeric" id="rcPhysical" placeholder="Hasil hitung kas/rekening" autocomplete="off"></div>' +
      '<div class="reconcile-row"><span>Selisih</span><strong id="rcDiff" aria-live="polite">-</strong></div>' +
      '<div class="form-group"><label for="rcNama">Nama pencatat</label><input type="text" id="rcNama" list="namaList" placeholder="Nama bendahara" autocomplete="off"></div>' +
      '<button type="button" class="btn" id="rcAdjustBtn" disabled><span class="btn-label">Catat penyesuaian</span></button>' +
      '</div>';
    host.appendChild(card);

    var toggle = card.querySelector('#reconcileToggle'),
      body = card.querySelector('#reconcileBody');
    var physical = card.querySelector('#rcPhysical'),
      nama = card.querySelector('#rcNama'),
      adjust = card.querySelector('#rcAdjustBtn');
    toggle.addEventListener('click', function () {
      var open = body.classList.toggle('hidden') === false;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) refresh();
    });
    physical.addEventListener('input', function () {
      var digits = physical.value.replace(/\D/g, '');
      physical.value = digits ? api.formatThousands(digits) : '';
      refresh();
    });
    nama.addEventListener('input', refresh);
    adjust.addEventListener('click', function () {
      var diff = diffNow();
      if (!diff || !nama.value.trim()) return;
      var over = diff > 0,
        amount = Math.abs(diff);
      api
        .confirmModal({
          title: 'Catat penyesuaian kas?',
          message:
            'Selisih ' +
            (over ? 'lebih ' : 'kurang ') +
            api.formatRupiah(amount) +
            ' akan dicatat sebagai ' +
            (over ? 'pemasukan' : 'pengeluaran') +
            ' penyesuaian dan tampil di laporan publik.',
          confirmLabel: 'Catat',
          danger: false
        })
        .then(function (yes) {
          if (!yes) return;
          api
            .withBusyButton(
              adjust,
              function () {
                return api
                  .insertTransaksi({
                    tanggal: todayISO(),
                    jenis: over ? 'pemasukan' : 'pengeluaran',
                    jumlah: amount,
                    keterangan: 'Penyesuaian rekonsiliasi kas (selisih ' + (over ? 'lebih' : 'kurang') + ')',
                    nama_pengisi: nama.value.trim()
                  })
                  .then(function () {
                    return api.reload();
                  })
                  .then(function () {
                    physical.value = '';
                    refresh();
                    api.toast('Penyesuaian tercatat. Saldo sistem kini sama dengan saldo fisik.', null);
                  });
              },
              'Mencatat\u2026'
            )
            .catch(function (err) {
              api.handleError(err);
            });
        });
    });
  }

  function diffNow() {
    var physical = document.getElementById('rcPhysical');
    if (!physical || !physical.value) return 0;
    return api.parseAmountInput(physical.value) - api.summaryOf(api.rows()).balance;
  }

  function refresh() {
    if (!ready) return;
    var system = document.getElementById('rcSystem');
    if (!system) return;
    var balance = api.summaryOf(api.rows()).balance,
      physical = document.getElementById('rcPhysical');
    system.textContent = api.formatRupiah(balance);
    var out = document.getElementById('rcDiff'),
      adjust = document.getElementById('rcAdjustBtn');
    if (!physical.value) {
      out.textContent = '-';
      out.className = '';
      adjust.disabled = true;
      return;
    }
    var diff = api.parseAmountInput(physical.value) - balance;
    if (diff === 0) {
      out.textContent = 'Sesuai';
      out.className = 'ok';
    } else {
      out.textContent =
        (diff > 0 ? '+' : '-') + api.formatRupiah(Math.abs(diff)) + (diff > 0 ? ' (lebih)' : ' (kurang)');
      out.className = diff > 0 ? 'over' : 'short';
    }
    adjust.disabled = diff === 0 || !document.getElementById('rcNama').value.trim();
  }

  function init(a) {
    if (ready) return;
    api = a;
    ready = true;
    mountRecap();
    mountReconcile();
    refresh();
  }

  /* ===== PWA: service worker (hanya HTTPS/localhost) ===== */
  function registerServiceWorker() {
    if (!root.navigator || !('serviceWorker' in root.navigator)) return;
    var host = root.location.hostname;
    if (root.location.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
    root.addEventListener('load', function () {
      root.navigator.serviceWorker.register('sw.js').catch(function () {
        /* tanpa SW tetap berfungsi */
      });
    });
  }

  var KasExtras = {
    terbilang: terbilang,
    recapText: recapText,
    receiptNumber: receiptNumber,
    init: init,
    refresh: refresh,
    receipt: receipt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = KasExtras;
  else {
    root.KasExtras = KasExtras;
    registerServiceWorker();
  }
})(typeof window !== 'undefined' ? window : globalThis);
