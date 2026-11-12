(function () {
  var root = document.documentElement,
    hero = document.getElementById('beranda'),
    cv = document.getElementById('heroGL'),
    content = hero && hero.querySelector('.hero-content');
  if (!hero || !cv || !window.Nur || !Nur.Hero) {
    root.classList.remove('gl-hero');
    return;
  }
  var STILL_T = 5.0,
    mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var fine = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var H = null,
    gen = 0,
    raf = 0,
    last = 0,
    clock = 1,
    seen = true,
    printing = false,
    q = 1,
    slow = 0,
    cool = 0,
    px = 0,
    py = 0,
    prevDay = -1,
    prevStill = null,
    parked = false,
    rt = 0,
    lvl = 2,
    bench = null,
    ring = [],
    panelEl = null,
    bt = null,
    gpuName = '';
  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }
  function dark() {
    return root.getAttribute('data-theme') === 'dark';
  }
  function still() {
    return mq.matches || root.classList.contains('lite-motion');
  }
  function fit() {
    var w = hero.clientWidth,
      h = hero.clientHeight;
    if (H && w > 1 && h > 1) H.resize(w, h, Math.min(window.devicePixelRatio || 1, H.cfg.dpr) * q);
  }
  function park() {
    if (content && parked) {
      content.style.transform = '';
      content.style.opacity = '';
      parked = false;
    }
  }
  var lastS = null,
    hb = document.getElementById('heroBalance'),
    hf = 0;
  function box(el) {
    var x = 0,
      y = 0,
      e = el;
    while (e && e !== hero && e !== document.body) {
      x += e.offsetLeft;
      y += e.offsetTop;
      e = e.offsetParent;
    }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function pushRects() {
    var c = document.getElementById('heroSparkline');
    if (H && !H.lost && hb && c) H.setRects(box(hb), box(c), hero.clientWidth, hero.clientHeight);
  }
  function pushBalance() {
    if (!H || H.lost || !hb) return;
    var cs = getComputedStyle(hb);
    H.setBalance(hb.textContent, hb.classList.contains('negative'), cs.fontWeight, cs.fontFamily);
    refresh();
  }
  function pushAll() {
    if (!H || H.lost) return;
    H.setSeries(lastS);
    pushRects();
    pushBalance();
  }
  function paintStill() {
    if (!H || H.lost || !H.w || !H.ready) return;
    H.day = dark() ? 0 : 1;
    H.scroll = H.sScroll = 0;
    H.pointer.x = H.pointer.y = H.cam.x = H.cam.y = 0;
    H.intro = 1;
    H.settle();
    H.frame(STILL_T, 0);
    park();
  }
  function tick(now) {
    raf = 0;
    if (!H || H.lost || !seen || document.hidden || printing) return;
    if (still()) {
      paintStill();
      return;
    }
    var raw = last ? now - last : 16.7,
      dt = last ? Math.min(raw / 1000, 0.1) : 1 / 60,
      sp = clamp(window.pageYOffset / (hero.offsetHeight * 0.9), 0, 1);
    last = now;
    clock += dt;
    H.intro = 1 - Math.pow(1 - clamp((clock - 1) / 3.4, 0, 1), 4);
    var dTg = dark() ? 0 : 1;
    H.day += (dTg - H.day) * Math.min(1, dt * 2.6);
    if (Math.abs(dTg - H.day) < 0.003) H.day = dTg;
    H.scroll = sp;
    H.pointer.x = px;
    H.pointer.y = py;
    H.frame(clock, dt);
    ring.push(raw);
    if (ring.length > 60) ring.shift();
    if (bench) benchStep(now, raw);
    if (++hf % 30 === 0) pushRects();
    if (content) {
      content.style.transform = 'translate3d(0,' + (-sp * 34).toFixed(1) + 'px,0)';
      content.style.opacity = (1 - clamp((sp - 0.3) / 0.7, 0, 1) * 0.9).toFixed(3);
      parked = true;
    }
    if (cool > 0) cool -= dt;
    else if (!bench && lvl < 3) {
      slow = dt > 0.028 ? slow + 1 : Math.max(0, slow - 2);
      if (slow > 40 && q > 0.56) {
        q = Math.max(0.55, q * 0.82);
        slow = 0;
        cool = 2;
        fit();
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (raf || !H || H.lost || !seen || document.hidden || printing) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function refresh() {
    if (H && !H.lost) {
      if (still()) paintStill();
      else kick();
    }
  }
  function boot() {
    var g = ++gen,
      h = null;
    if (H && H.off) H.off();
    try {
      h = Nur.Hero(cv, {
        onRestore: function () {
          if (g === gen) boot();
        },
        onReady: function () {
          if (g === gen) refresh();
        }
      });
    } catch (e) {
      h = null;
    }
    H = h;
    if (!H) {
      root.classList.remove('gl-hero');
      return;
    }
    root.classList.add('gl-hero');
    H.day = prevDay = dark() ? 0 : 1;
    prevStill = still();
    H.setLevel(lvl);
    fit();
    pushAll();
    refresh();
  }
  function sync() {
    if (!H || H.lost) return;
    var d = dark() ? 0 : 1,
      s = still();
    if (d === prevDay && s === prevStill) return;
    prevDay = d;
    prevStill = s;
    if (s) {
      H.day = d;
      paintStill();
    } else kick();
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (mq.addEventListener) mq.addEventListener('change', sync);
  if (window.IntersectionObserver)
    new IntersectionObserver(
      function (e) {
        seen = e[0].isIntersecting;
        if (seen) refresh();
      },
      { threshold: 0 }
    ).observe(hero);
  if (window.ResizeObserver)
    new ResizeObserver(function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        fit();
        pushRects();
        refresh();
      }, 60);
    }).observe(hero);
  if (fine) {
    window.addEventListener(
      'pointermove',
      function (e) {
        if (e.pointerType !== 'touch') {
          px = (e.clientX / window.innerWidth - 0.5) * 2;
          py = (0.5 - e.clientY / window.innerHeight) * 2;
        }
      },
      { passive: true }
    );
    root.addEventListener('mouseleave', function () {
      px = py = 0;
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh();
  });
  window.addEventListener('beforeprint', function () {
    printing = true;
  });
  window.addEventListener('afterprint', function () {
    printing = false;
    refresh();
  });
  cv.addEventListener('webglcontextlost', function () {
    root.classList.remove('gl-hero');
    park();
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  if (hb)
    new MutationObserver(pushBalance).observe(hb, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  window.addEventListener('kas-series', function (e) {
    lastS = e.detail;
    if (H && !H.lost) {
      H.setSeries(lastS);
      pushRects();
      refresh();
    }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pushAll);
  var LVN = ['Hemat', 'Tinggi', 'Ultra', 'Rata Kanan'];
  function f1(v) {
    return v.toFixed(1).replace('.', ',');
  }
  function applyLevel(n, qq) {
    lvl = n;
    q = qq || 1;
    slow = 0;
    cool = 2;
    if (H && !H.lost) {
      H.setLevel(n);
      fit();
    }
    if (panelEl) paint();
  }
  function live() {
    if (ring.length < 8) return null;
    var a = ring.slice(),
      s = 0,
      i;
    for (i = 0; i < a.length; i++) s += a[i];
    return { fps: 1000 / (s / a.length), ms: s / a.length };
  }
  function benchStep(now, raw) {
    var b = bench,
      st = b.st[b.i];
    if (!b.t0) {
      b.t0 = now;
      b.s = [];
      applyLevel(st.l, st.q);
    }
    var el = now - b.t0;
    if (el > 1500) b.s.push(raw);
    if (el > 5200) {
      var a = b.s.length
          ? b.s.slice().sort(function (x, y) {
              return x - y;
            })
          : [raw],
        m =
          a.reduce(function (x, y) {
            return x + y;
          }, 0) / a.length,
        inf = H.info();
      b.r.push({
        n: st.n,
        fps: 1000 / m,
        p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))],
        w: inf.w,
        h: inf.h,
        ms: inf.samples
      });
      b.i++;
      b.t0 = 0;
      if (b.i >= b.st.length) benchEnd();
    }
  }
  function benchEnd() {
    var b = bench,
      ok = 0,
      tier = ['Dasar', 'Menengah', 'Kelas atas', 'Flagship', 'Flagship+'],
      out,
      el;
    while (ok < b.r.length && b.r[ok].fps >= 30) ok++;
    out =
      b.r
        .map(function (r) {
          return (
            r.n +
            ': ' +
            f1(r.fps) +
            ' FPS, p95 ' +
            f1(r.p95) +
            ' ms, ' +
            r.w +
            '×' +
            r.h +
            ', MSAA ' +
            r.ms +
            '×'
          );
        })
        .join('\n') +
      '\nKelas perangkat: ' +
      tier[ok] +
      ' (' +
      ok +
      ' dari ' +
      b.r.length +
      ' tahap bertahan ≥ 30 FPS)\nGPU: ' +
      gpuName;
    bench = null;
    applyLevel(b.prev, 1);
    if (panelEl) {
      panelEl.dataset.res = out;
      panelEl.querySelector('.bench-out').textContent = out;
      el = panelEl.querySelector('.bench-run');
      el.disabled = false;
      el.textContent = 'Ulangi uji beban';
      paint();
    }
  }
  function paint() {
    var s = live(),
      i = H && H.info ? H.info() : null,
      $ = function (c) {
        return panelEl.querySelector(c);
      };
    $('.bn-fps').textContent = s ? Math.round(s.fps) : '–';
    $('.bn-ms').textContent = s ? f1(s.ms) : '–';
    if (i) {
      gpuName = i.gpu;
      $('.bn-res').textContent = ((i.w * i.h) / 1e6).toFixed(2) + ' MP';
      $('.bench-gpu').textContent = i.gpu + ' · MSAA ' + i.samples + '× · DPR ' + i.dpr.toFixed(2);
    }
    panelEl.querySelectorAll('.bench-seg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.l === lvl));
      b.disabled = !!bench;
    });
    $('.bench-copy').hidden = !panelEl.dataset.res;
  }
  function closePanel() {
    if (panelEl) {
      panelEl.hidden = true;
      clearInterval(panelEl._t);
    }
    bt.setAttribute('aria-expanded', 'false');
    bt.focus();
  }
  function startBench() {
    var r = panelEl.querySelector('.bench-run'),
      o = panelEl.querySelector('.bench-out');
    if (still()) {
      o.textContent =
        'Animasi sedang dimatikan (Hemat gerak / reduced-motion). Aktifkan animasi agar uji beban dapat berjalan.';
      return;
    }
    r.disabled = true;
    r.textContent = 'Menguji… (jangan pindah tab)';
    o.textContent = '';
    panelEl.dataset.res = '';
    bench = {
      i: 0,
      t0: 0,
      r: [],
      prev: lvl,
      st: [
        { n: 'Tinggi', l: 1, q: 1 },
        { n: 'Ultra', l: 2, q: 1 },
        { n: 'Rata Kanan', l: 3, q: 1 },
        { n: 'Ekstrem (1,35× piksel)', l: 3, q: 1.35 }
      ]
    };
    kick();
  }
  function openPanel() {
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.className = 'bench';
      panelEl.setAttribute('role', 'dialog');
      panelEl.setAttribute('aria-label', 'Uji performa GPU');
      panelEl.innerHTML =
        '<div class="bench-h"><b>Uji Performa GPU</b><button type="button" class="bench-x" aria-label="Tutup">×</button></div>' +
        '<div class="bench-live"><div><span class="bn-fps">–</span><small>FPS</small></div><div><span class="bn-ms">–</span><small>ms / frame</small></div><div><span class="bn-res">–</span><small>piksel render</small></div></div>' +
        '<p class="bench-gpu"></p><div class="bench-seg" role="group" aria-label="Preset grafis">' +
        LVN.map(function (n, i) {
          return '<button type="button" data-l="' + i + '">' + n + '</button>';
        }).join('') +
        '</div>' +
        '<button type="button" class="bench-run">Mulai uji beban (± 25 dtk)</button><p class="bench-note">FPS dibatasi refresh layar (60/90/120 Hz). Rata Kanan mematikan penurunan resolusi otomatis.</p><pre class="bench-out" aria-live="polite"></pre><button type="button" class="bench-copy" hidden>Salin hasil</button>';
      document.body.appendChild(panelEl);
      panelEl.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest('.bench-x')) closePanel();
        else if (t.dataset.l !== undefined && !bench) applyLevel(+t.dataset.l, 1);
        else if (t.closest('.bench-run') && !bench) startBench();
        else if (t.closest('.bench-copy') && navigator.clipboard)
          navigator.clipboard.writeText(panelEl.dataset.res || '');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panelEl && !panelEl.hidden) closePanel();
      });
    }
    panelEl.hidden = false;
    bt.setAttribute('aria-expanded', 'true');
    paint();
    clearInterval(panelEl._t);
    panelEl._t = setInterval(paint, 500);
    panelEl.querySelector('.bench-x').focus();
  }
  bt = document.createElement('button');
  bt.type = 'button';
  bt.className = 'hero-bench';
  bt.textContent = 'Uji GPU';
  bt.setAttribute('aria-haspopup', 'dialog');
  bt.setAttribute('aria-expanded', 'false');
  hero.appendChild(bt);
  bt.addEventListener('click', function () {
    if (panelEl && !panelEl.hidden) closePanel();
    else openPanel();
  });
  boot();
})();
