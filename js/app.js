/* Holabuli — közös kliens-logika: passz-tár (localStorage), toast, alsó lap, megosztás, szűrők, sztorik, PWA. */
(function () {
  'use strict';
  const KEY = 'holabuli.passes';
  const NEV_KEY = 'holabuli.nev';

  const HB = (window.HB = window.HB || {});

  // Statikus kirakat (GitHub Pages) alatt az útvonalak elé kerül a projekt-útvonal, a passz a #-ben utazik.
  HB.base = window.HB_BASE || '';
  HB.passUrl = function (token) { return window.HB_STATIC ? `${HB.base}/p/#${token}` : `/p/${token}`; };

  HB.passes = function () { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  HB.savePasses = function (arr) { try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* privát mód */ } };
  HB.addPass = function (p) {
    const arr = HB.passes().filter((x) => x.token !== p.token);
    arr.unshift(p);
    HB.savePasses(arr.slice(0, 50));
  };
  HB.nev = function () { try { return localStorage.getItem(NEV_KEY) || ''; } catch { return ''; } };
  HB.setNev = function (n) { try { localStorage.setItem(NEV_KEY, n); } catch { /* */ } };

  let toastTimer;
  HB.toast = function (msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  };

  HB.copy = async function (text) {
    try { await navigator.clipboard.writeText(text); HB.toast('Link kimásolva'); }
    catch { window.prompt('Másold ki a linket:', text); }
  };

  HB.share = async function ({ title, text, url }) {
    const data = { title, text, url: url || location.href };
    if (navigator.share) {
      try { await navigator.share(data); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    await HB.copy(data.url);
    return false;
  };

  // --- Passz-oldal: mentés a telefonra ---
  const passPage = document.querySelector('.page-pass');
  if (passPage) {
    HB.addPass({ token: passPage.dataset.token, eventId: passPage.dataset.event, nev: passPage.dataset.nev, at: Date.now() });
    if (passPage.dataset.nev) HB.setNev(passPage.dataset.nev);
  }

  // --- Esemény-oldal: van már passzom? + alsó lap ---
  const evPage = document.querySelector('.page-event');
  if (evPage) {
    const mine = HB.passes().find((p) => p.eventId === evPage.dataset.event);
    const megyek = document.getElementById('megyek-btn');
    const passzom = document.getElementById('passzom-btn');
    if (mine && megyek && passzom) {
      megyek.classList.add('hidden');
      passzom.href = HB.passUrl(mine.token);
      passzom.classList.remove('hidden');
    }
    const nevInput = document.querySelector('#megyek input[name="nev"]');
    if (nevInput && !nevInput.value && HB.nev()) nevInput.value = HB.nev();
  }

  // Alsó lapok (sheet) nyitás/zárás
  function openSheet(id) {
    const s = document.getElementById(id);
    if (!s) return;
    s.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const first = s.querySelector('input:not([type=hidden]):not(.hp)');
    if (first) setTimeout(() => first.focus(), 250);
  }
  function closeSheets() {
    document.querySelectorAll('.sheet').forEach((s) => s.classList.add('hidden'));
    document.body.style.overflow = '';
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); openSheet(o.dataset.open); return; }
    if (e.target.closest('[data-close]')) { e.preventDefault(); closeSheets(); return; }
    const sh = e.target.closest('[data-share-title]');
    if (sh) { e.preventDefault(); HB.share({ title: sh.dataset.shareTitle, text: sh.dataset.shareText, url: sh.dataset.shareUrl || location.href }).then(() => { if (sh.dataset.shareUrl && sh.dataset.shareUrl.includes('ref=')) localStorage.setItem('holabuli.meghivo', '1'); }); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { e.preventDefault(); HB.copy(cp.dataset.copy); if (cp.dataset.copy.includes('ref=')) localStorage.setItem('holabuli.meghivo', '1'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
  if (location.hash === '#megyek' || new URLSearchParams(location.search).has('hiba')) openSheet('megyek');

  // --- Főoldal: szűrők + kereső ---
  const szurok = document.getElementById('szurok');
  if (szurok) {
    const kereso = document.getElementById('kereso');
    const cards = () => Array.from(document.querySelectorAll('.card-poster[data-kereso]'));
    let aktiv = 'mind';
    function apply() {
      const q = (kereso && kereso.value || '').trim().toLowerCase();
      let visible = 0;
      cards().forEach((c) => {
        let ok = true;
        if (aktiv === 'ma') ok = c.dataset.ma === '1';
        else if (aktiv === 'ingyen') ok = c.dataset.ingyen === '1';
        else if (aktiv.startsWith('mufaj:')) ok = c.dataset.mufaj === aktiv.slice(6);
        if (ok && q) ok = c.dataset.kereso.includes(q);
        c.classList.toggle('hidden', !ok);
        if (ok) visible++;
      });
      document.querySelectorAll('.list-group').forEach((g) => g.classList.toggle('hidden', !g.querySelector('.card-poster:not(.hidden)')));
      const top = document.getElementById('heti-top-szekcio');
      if (top) top.classList.toggle('hidden', !!(q || aktiv !== 'mind'));
      const ures = document.getElementById('ures');
      if (ures) ures.classList.toggle('hidden', visible > 0);
    }
    szurok.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      szurok.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      aktiv = chip.dataset.szuro;
      apply();
    });
    if (kereso) kereso.addEventListener('input', apply);
    const torles = document.getElementById('szuro-torles');
    if (torles) torles.addEventListener('click', () => { aktiv = 'mind'; if (kereso) kereso.value = ''; szurok.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.szuro === 'mind')); apply(); });
  }

  // --- Sztorik ---
  const viewer = document.getElementById('story-viewer');
  if (viewer) {
    let timer;
    const HUES = [[310, 262], [20, 330], [190, 262], [140, 45], [262, 190], [45, 330]];
    function close() { viewer.classList.add('hidden'); clearTimeout(timer); document.body.style.overflow = ''; }
    document.querySelectorAll('.story').forEach((btn) => btn.addEventListener('click', () => {
      const i = Number(btn.dataset.story) || 0;
      const [h1, h2] = HUES[i % HUES.length];
      viewer.style.setProperty('--story-bg', `linear-gradient(160deg, hsl(${h1} 80% 55%), hsl(${h2} 70% 40%))`);
      viewer.querySelector('#sv-ini').textContent = btn.querySelector('.ring-in').textContent;
      viewer.querySelector('#sv-nev').textContent = btn.dataset.nev;
      viewer.querySelector('#sv-kerulet').textContent = btn.dataset.kerulet + ' kerület';
      viewer.querySelector('#sv-szoveg').textContent = btn.dataset.szoveg;
      const bar = viewer.querySelector('.story-progress span');
      bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
      viewer.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      clearTimeout(timer);
      timer = setTimeout(close, 5000);
    }));
    viewer.addEventListener('click', close);
  }

  // --- PWA + önfrissítés ---
  // Új deploy → új build → a /sw.js megváltozik → az új SW skipWaiting-gel átveszi az irányítást →
  // a lap EGYSZER újratölt (a sessionStorage-őr megakadályozza a hurkot). Így a telefon mindig a legújabbat futtatja.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(HB.base + '/sw.js').then((reg) => {
      const check = () => { try { reg.update(); } catch { /* */ } };
      setTimeout(check, 3000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 5 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; } // első telepítés: nincs újratöltés
      const key = 'holabuli.reloaded.' + (document.body.dataset.build || '');
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* */ }
      HB.toast('Frissült a legújabb verzióra');
      setTimeout(() => location.reload(), 600);
    });
  }
})();
