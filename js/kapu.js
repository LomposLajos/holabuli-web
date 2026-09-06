/* Kapu-mód: QR-olvasó (html5-qrcode), /api/scan, ÓRIÁS állapot-overlay, hang + rezgés, kézi név-kereső, élő számláló. */
(function () {
  'use strict';
  const root = document.getElementById('kapu');
  if (!root) return;
  const kapuToken = root.dataset.token;
  const eventId = root.dataset.event;
  const $ = (id) => document.getElementById(id);

  const overlay = $('overlay'), ovIkon = $('ov-ikon'), ovCim = $('ov-cim'), ovNev = $('ov-nev'), ovSub = $('ov-sub');
  const kcBent = $('kc-bent'), kcMegyek = $('kc-megyek');
  const readerIdle = $('reader-idle'), camStart = $('cam-start'), camStop = $('cam-stop'), hint = $('scan-hint');
  const kereso = $('kereso'), talalatok = $('talalatok'), tpl = $('talalat-sablon');

  const OVERLAY_MS = 1600;   // ennyi után visszaáll az olvasóra
  const DEBOUNCE_MS = 3000;  // ugyanazt a kódot ennyi ideig nem olvassuk újra
  const POLL_MS = 5000;

  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const KIND = { vendeglista: 'Vendéglista', jegy: 'Jegy' };

  // ---------- Hang (WebAudio) + rezgés ----------
  // Az AudioContext csak gesztusra indul (iOS), ezért az első érintésnél hozzuk létre.
  let actx = null;
  function audio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
    } catch { actx = null; }
    return actx;
  }
  function beep(c, freq, at, dur, type, gain) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain || 0.25, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  function soundOk() { const c = audio(); if (!c) return; const t = c.currentTime; beep(c, 1320, t, 0.09); beep(c, 1760, t + 0.1, 0.16); }
  function soundErr() { const c = audio(); if (!c) return; const t = c.currentTime; beep(c, 220, t, 0.18, 'square', 0.18); beep(c, 165, t + 0.23, 0.26, 'square', 0.18); }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* nincs */ } }
  document.addEventListener('pointerdown', () => audio(), { once: true, passive: true });

  // A képernyő ne aludjon el a kapuban (ahol a böngésző engedi).
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* nem kritikus */ }
  }

  // ---------- Élő számláló ----------
  function setAllapot(a) {
    if (!a) return;
    [[kcBent, a.bent], [kcMegyek, a.megyek]].forEach(([el, v]) => {
      if (String(el.textContent) !== String(v)) { el.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }
  async function poll() {
    if (document.hidden) return;
    try {
      const r = await fetch(`/api/kapu/${encodeURIComponent(kapuToken)}/allapot`, { cache: 'no-store' });
      if (r.ok) setAllapot(await r.json());
    } catch { /* offline: a következő körben újra */ }
  }
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); keepAwake(); } });

  // ---------- Overlay ----------
  const TEXT = {
    ok: { ikon: '✓', cim: 'BEENGEDVE', cls: 'ok' },
    duplicate: { ikon: '✕', cim: 'MÁR BENT VOLT', cls: 'err', sub: 'Ezzel a jeggyel már beléptek' },
    wrong_event: { ikon: '✕', cim: 'MÁSIK BULIRA SZÓL', cls: 'err', sub: 'Nem erre a bulira váltotta' },
    void: { ikon: '✕', cim: 'VISSZAVONT JEGY', cls: 'err', sub: 'A hely visszavonta' },
    unknown: { ikon: '✕', cim: 'ÉRVÉNYTELEN', cls: 'err', sub: 'Nem a mi jegyünk' },
    signature: { ikon: '✕', cim: 'ÉRVÉNYTELEN', cls: 'err', sub: 'Hamis vagy sérült kód' },
    format: { ikon: '✕', cim: 'ÉRVÉNYTELEN', cls: 'err', sub: 'Ez nem jegy-kód' },
    unknown_event: { ikon: '✕', cim: 'ÉRVÉNYTELEN', cls: 'err', sub: 'Ismeretlen buli' },
    network: { ikon: '!', cim: 'NINCS KAPCSOLAT', cls: 'warn', sub: 'Próbáld újra pár másodperc múlva' },
  };
  let hideTimer = null;
  let busy = false; // amíg az overlay látszik, nem olvasunk

  function showResult(r, opts) {
    opts = opts || {};
    const key = r && r.ok ? 'ok' : (r && TEXT[r.reason] ? r.reason : 'unknown');
    const t = TEXT[key];
    overlay.className = 'kapu-overlay ' + t.cls;
    ovIkon.textContent = t.ikon;
    ovCim.textContent = key === 'duplicate' && r.scannedAt ? `${t.cim} ${hhmm(r.scannedAt)}` : t.cim;
    ovNev.textContent = (r && r.nev) || '';
    // Egy jegy több emberre is szólhat — a kidobónak ezt LÁTNIA kell, mielőtt beengedi őket.
    const fo = r && r.fo > 1 ? ` · ${r.fo} fő` : '';
    ovSub.textContent = key === 'ok' ? (KIND[r.kind] || 'Vendéglista') + fo : (t.sub || '');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('show');
    if (!opts.silent) {
      if (t.cls === 'ok') { soundOk(); vibrate(90); }
      else { soundErr(); vibrate([150, 70, 150]); }
    }
    busy = true;
    clearTimeout(hideTimer);
    if (!opts.sticky) hideTimer = setTimeout(hideOverlay, OVERLAY_MS);
  }
  function hideOverlay() {
    clearTimeout(hideTimer);
    overlay.classList.remove('show');
    overlay.classList.add('hidden');
    busy = false;
  }
  overlay.addEventListener('click', hideOverlay); // koppintásra is eltűnik

  // ---------- /api/scan ----------
  // A QR tartalma a passz URL-je (…/p/TOKEN) vagy maga a token: mindkettőt kezeljük.
  // …/p/TOKEN (szerver) vagy …/p/#TOKEN, …/p/?t=TOKEN (statikus kirakat) — mindhárom.
  function tokenFrom(text) {
    const s = String(text || '').trim();
    const m = s.match(/\/p\/(?:\?[^#]*#|#|\?t=)?([A-Za-z0-9_.-]+)/);
    return m ? m[1] : s;
  }
  async function scanToken(token) {
    try {
      const r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, eventId }) });
      const d = await r.json().catch(() => ({ ok: false, reason: 'format' }));
      if (d && d.allapot) setAllapot(d.allapot);
      return d;
    } catch { return { ok: false, reason: 'network' }; }
  }

  // ---------- QR-olvasó ----------
  let qr = null, scanning = false, paused = false, lastCode = '', lastAt = 0;
  async function onDecoded(text) {
    if (busy) return;
    const token = tokenFrom(text);
    const now = Date.now();
    if (token === lastCode && now - lastAt < DEBOUNCE_MS) return;
    lastCode = token; lastAt = now;
    showResult(await scanToken(token));
  }
  async function startCam() {
    if (typeof window.Html5Qrcode !== 'function') {
      hint.textContent = 'A QR-olvasó nem töltődött be. Használd a kézi keresést.';
      return;
    }
    camStart.disabled = true;
    camStart.textContent = 'Indítás…';
    audio();
    keepAwake();
    try {
      qr = qr || new window.Html5Qrcode('reader', { verbose: false, formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE] });
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, aspectRatio: 1, qrbox: (w, h) => { const s = Math.round(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
        onDecoded,
        () => { /* nincs kód a képen: csend */ },
      );
      scanning = true; paused = false;
      readerIdle.classList.add('hidden');
      root.classList.add('scanning');
      camStop.classList.remove('hidden');
      hint.textContent = 'Tartsd a QR-t a keretbe. Zöld: mehet be. Piros: állítsd meg.';
    } catch (e) {
      camStart.disabled = false;
      camStart.textContent = 'Újra próbálom';
      hint.textContent = 'Nem indult el a kamera (nincs engedély vagy hátsó kamera). Próbáld újra, vagy keress névre.';
    }
  }
  async function stopCam() {
    if (qr && scanning) { try { await qr.stop(); qr.clear(); } catch { /* már állt */ } }
    scanning = false; paused = false;
    readerIdle.classList.remove('hidden');
    root.classList.remove('scanning');
    camStop.classList.add('hidden');
    camStart.disabled = false;
    camStart.textContent = 'Kamera indítása';
  }
  function pauseCam() { if (qr && scanning && !paused) { try { qr.pause(true); paused = true; } catch { /* */ } } }
  function resumeCam() { if (qr && scanning && paused) { try { qr.resume(); paused = false; } catch { /* */ } } }
  camStart.addEventListener('click', startCam);
  camStop.addEventListener('click', stopCam);

  // ---------- Módváltás ----------
  const modes = Array.from(document.querySelectorAll('.kapu-modes .mode'));
  function setMode(mode) {
    modes.forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('panel-scan').classList.toggle('hidden', mode !== 'scan');
    $('panel-manual').classList.toggle('hidden', mode !== 'manual');
    if (mode === 'manual') { pauseCam(); search(); setTimeout(() => kereso.focus(), 60); }
    else { resumeCam(); }
  }
  modes.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ---------- Kézi keresés ----------
  let sTimer = null, sSeq = 0;
  kereso.addEventListener('input', () => { clearTimeout(sTimer); sTimer = setTimeout(search, 220); });
  kereso.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(sTimer); search(); kereso.blur(); } });
  async function search() {
    const q = kereso.value.trim();
    const seq = ++sSeq;
    try {
      const r = await fetch(`/api/kapu/${encodeURIComponent(kapuToken)}/kereses?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const d = await r.json();
      if (seq !== sSeq) return; // közben új keresés indult
      renderTalalatok(d, q);
    } catch {
      if (seq === sSeq) talalatok.innerHTML = '<p class="kapu-empty">Nincs kapcsolat. Próbáld újra.</p>';
    }
  }
  function renderTalalatok(d, q) {
    talalatok.innerHTML = '';
    const list = (d && d.talalatok) || [];
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'kapu-empty';
      p.textContent = q ? `Nincs „${q}” a vendéglistán.` : 'Még senki nincs a listán.';
      talalatok.appendChild(p);
      return;
    }
    const head = document.createElement('p');
    head.className = 'talalat-head muted';
    // Ha a lista hosszabb, mint amennyit visszaadunk, MONDJUK KI — különben a 21. embert
    // hiába keresi a kidobó, azt hiszi, nincs a listán.
    const osszes = (d && d.osszes) || list.length;
    head.textContent = q
      ? (osszes > list.length ? `${osszes} találat · az első ${list.length} látszik, szűkíts` : `${osszes} találat`)
      : (osszes > list.length ? `Legutóbb jelentkeztek · ${list.length} / ${osszes}` : 'Legutóbb jelentkeztek');
    talalatok.appendChild(head);
    list.forEach((p) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.t-nev').textContent = p.nev;
      const st = node.querySelector('.t-status');
      const btn = node.querySelector('.t-btn');
      if (p.status === 'scanned') {
        node.classList.add('bent');
        st.textContent = `Bent · ${hhmm(p.scannedAt)}`;
        st.classList.add('ok');
        btn.textContent = 'Bent van';
        btn.disabled = true;
        btn.classList.replace('btn-primary', 'btn-ghost');
      } else {
        st.textContent = `${KIND[p.kind] || 'Vendéglista'} · érvényes`;
      }
      btn.addEventListener('click', async () => {
        if (busy) return;
        btn.disabled = true;
        btn.textContent = '…';
        const r = await scanToken(p.token);
        showResult(r);
        search();
      });
      talalatok.appendChild(node);
    });
  }

  // ---------- FEJLESZTŐI SEGÉD (szándékosan bent marad) ----------
  // ?demo=ok | hiba | masik | ervenytelen → az overlay előhívása kamera nélkül; nem tűnik el magától (koppintásra igen).
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    const minta = {
      ok: { ok: true, nev: 'Kovács Anna', kind: 'vendeglista' },
      hiba: { ok: false, reason: 'duplicate', nev: 'Nagy Bálint', scannedAt: new Date(Date.now() - 41 * 60000).toISOString() },
      masik: { ok: false, reason: 'wrong_event', nev: 'Szabó Dani' },
      ervenytelen: { ok: false, reason: 'unknown' },
    };
    setTimeout(() => showResult(minta[demo] || minta.ok, { sticky: true, silent: true }), 250);
  }
})();
