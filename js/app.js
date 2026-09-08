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

  // --- Meghívó: a ref akkor is megmarad, ha a vendég a jelentkezés előtt körülnéz az appban ---
  try {
    const ref0 = new URLSearchParams(location.search).get('ref');
    if (ref0) sessionStorage.setItem('holabuli.ref', ref0.slice(0, 40));
  } catch { /* privát mód */ }
  HB.ref = function () { try { return sessionStorage.getItem('holabuli.ref') || ''; } catch { return ''; } };

  // --- Kedvencek (mentett bulik) ---
  const KED_KEY = 'holabuli.kedvencek';
  HB.kedvencek = function () { try { return JSON.parse(localStorage.getItem(KED_KEY) || '[]'); } catch { return []; } };
  HB.kedvencVan = function (id) { return HB.kedvencek().indexOf(id) !== -1; };
  HB.kedvencValt = function (id) {
    const arr = HB.kedvencek();
    const i = arr.indexOf(id);
    if (i === -1) arr.unshift(id); else arr.splice(i, 1);
    try { localStorage.setItem(KED_KEY, JSON.stringify(arr.slice(0, 200))); } catch { /* privát mód */ }
    return i === -1;
  };
  // A szív-gombok állapotának kirajzolása (a statikus mód átrendezi a kártyákat, ezért újrahívható).
  HB.szivekFrissit = function () {
    const arr = HB.kedvencek();
    document.querySelectorAll('[data-kedvenc]').forEach((b) => {
      const on = arr.indexOf(b.dataset.kedvenc) !== -1;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kedvenc]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const be = HB.kedvencValt(b.dataset.kedvenc);
    HB.szivekFrissit();
    HB.toast(be ? 'Elmentve a kedvencek közé' : 'Levéve a kedvencekről');
    // Aki LISTÁT épít a kedvencekből (profil „Mentve”), erre iratkozik fel — különben a sor
    // ott maradna a levétel után, és a vendég nem tudná, sikerült-e.
    document.dispatchEvent(new CustomEvent('hb:kedvenc', { detail: { id: b.dataset.kedvenc, be } }));
  });

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
    HB.addPass({ token: passPage.dataset.token, eventId: passPage.dataset.event, nev: passPage.dataset.nev, kind: passPage.dataset.kind || 'jegy', at: Date.now() });
    if (passPage.dataset.nev) HB.setNev(passPage.dataset.nev);
  }

  // --- Esemény-oldal: van már jegyem? + jegy-választó ---
  const evPage = document.querySelector('.page-event');
  if (evPage) {
    const mine = HB.passes().find((p) => p.eventId === evPage.dataset.event);
    const megyek = document.getElementById('megyek-btn');
    const passzom = document.getElementById('passzom-btn');
    if (mine && megyek && passzom) {
      const rsvp = mine.kind === 'megyek'; // ingyenes belépésre nincs jegy, csak jelentkezés
      megyek.classList.add('hidden');
      passzom.href = HB.passUrl(mine.token);
      passzom.textContent = rsvp ? 'Ott leszel' : 'Jegyem';
      passzom.classList.remove('hidden');
      // A gomb-felirat önmagában kevés volt: látható sáv is jelezze.
      const info = document.querySelector('.info-block');
      if (info && !document.querySelector('.van-jegyed')) {
        const b = document.createElement('div');
        b.className = 'van-jegyed';
        b.innerHTML = `<span class="van-jegyed-cim">✓ ${rsvp ? 'Jelentkeztél erre a bulira' : 'Van jegyed erre a bulira'}</span>`;
        const a = document.createElement('a');
        a.className = 'link'; a.href = HB.passUrl(mine.token); a.textContent = 'Megnézem';
        b.appendChild(a);
        // „Még jegyet” csak akkor, ha van egyáltalán megvehető jegy.
        if (document.getElementById('jegyek')) {
          const t = document.createElement('button');
          t.type = 'button'; t.className = 'link van-jegyed-tovabb'; t.dataset.open = 'jegyek'; t.textContent = rsvp ? 'Jegyet is veszek' : 'Még jegyet';
          b.appendChild(t);
        }
        info.parentNode.insertBefore(b, info);
      }
    }

    // „Megyek” lap (ingyenes belépés): dupla küldés elleni zár, ugyanaz a minta, mint a pénztárnál.
    const mform = document.getElementById('megyek-form');
    if (mform && !window.HB_STATIC) {
      const mgomb = mform.querySelector('button[type="submit"]');
      const meredeti = mgomb ? mgomb.textContent : '';
      mform.addEventListener('submit', (e) => {
        if (mform.dataset.kuldes === '1') { e.preventDefault(); return; }
        if (!mform.checkValidity()) return;
        mform.dataset.kuldes = '1';
        setTimeout(() => { if (mgomb) { mgomb.disabled = true; mgomb.setAttribute('aria-busy', 'true'); mgomb.textContent = 'Egy pillanat…'; } }, 0);
      });
      window.addEventListener('pageshow', (ev2) => {
        if (!ev2.persisted) return;
        mform.dataset.kuldes = '';
        if (mgomb) { mgomb.disabled = false; mgomb.removeAttribute('aria-busy'); mgomb.textContent = meredeti; }
      });
      const mnev = mform.querySelector('input[name="nev"]');
      if (mnev && !mnev.value && HB.nev()) mnev.value = HB.nev();
      const mref = mform.querySelector('input[name="ref"]');
      if (mref && !mref.value && HB.ref()) mref.value = HB.ref();
    }

    // Jegy-választó: darabszám-léptetők, futó összeg, és a pénztár-link összeállítása.
    const sheet = document.getElementById('jegyek');
    if (sheet) {
      const sorok = Array.from(sheet.querySelectorAll('.jegy-sor'));
      const osszegEl = document.getElementById('jegy-osszeg');
      const foEl = document.getElementById('jegy-fo');
      const tovabb = document.getElementById('jegy-tovabb');
      const huf = (n) => new Intl.NumberFormat('hu-HU').format(Math.round(n || 0)) + ' Ft';
      function frissit() {
        let osszeg = 0, fo = 0;
        const reszek = [];
        sorok.forEach((sor) => {
          const out = sor.querySelector('.stepper-db');
          const db = Math.max(0, Math.min(10, Number(out.dataset.db) || 0));
          out.dataset.db = db; out.textContent = db;
          sor.classList.toggle('valasztott', db > 0);
          const minusz = sor.querySelector('[data-lep="-1"]');
          if (minusz) minusz.disabled = db === 0;
          const plusz = sor.querySelector('[data-lep="1"]');
          if (plusz) plusz.disabled = db === 10;
          if (db > 0) { osszeg += (Number(sor.dataset.ar) || 0) * db; fo += db; reszek.push(`${sor.dataset.tipus}:${db}`); }
        });
        if (osszegEl) osszegEl.textContent = osszeg > 0 ? huf(osszeg) : (fo ? 'Ingyenes' : '—');
        if (foEl) foEl.textContent = fo ? ` · ${fo} fő` : '';
        if (tovabb) {
          const q = new URLSearchParams({ e: sheet.dataset.event, t: reszek.join(',') });
          const ref = sheet.dataset.ref || HB.ref();
          if (ref) q.set('ref', ref);
          tovabb.href = `${HB.base}/penztar${window.HB_STATIC ? '/' : ''}?${q.toString()}`;
          tovabb.classList.toggle('disabled', fo === 0);
          tovabb.setAttribute('aria-disabled', fo === 0 ? 'true' : 'false');
          tovabb.textContent = fo === 0 ? 'Válassz jegyet' : (osszeg > 0 ? `Tovább a fizetéshez · ${huf(osszeg)}` : 'Tovább · ingyenes jegy');
        }
      }
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lep]');
        if (!b) return;
        e.preventDefault();
        const out = b.closest('.jegy-sor').querySelector('.stepper-db');
        out.dataset.db = Math.max(0, Math.min(10, (Number(out.dataset.db) || 0) + Number(b.dataset.lep)));
        frissit();
      });
      if (tovabb) tovabb.addEventListener('click', (e) => { if (tovabb.classList.contains('disabled')) { e.preventDefault(); HB.toast('Válassz legalább egy jegyet.'); } });
      frissit();
    }
  }

  // --- Pénztár: dupla küldés elleni zár ---
  // A gombot CSAK a submit után tiltjuk (különben egyes böngészők el sem küldik az űrlapot),
  // és bfcache-visszalépéskor feloldjuk, hogy ne maradjon holt gomb.
  const penztarForm = document.getElementById('penztar-form');
  if (penztarForm) {
    const gomb = penztarForm.querySelector('button[type="submit"]');
    const eredeti = gomb ? gomb.textContent : '';
    penztarForm.addEventListener('submit', (e) => {
      if (penztarForm.dataset.kuldes === '1') { e.preventDefault(); return; }
      if (!penztarForm.checkValidity()) return; // natív hiba: maradjon kattintható
      penztarForm.dataset.kuldes = '1';
      setTimeout(() => { if (gomb) { gomb.disabled = true; gomb.setAttribute('aria-busy', 'true'); gomb.textContent = 'Jegy készül…'; } }, 0);
    });
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      penztarForm.dataset.kuldes = '';
      if (gomb) { gomb.disabled = false; gomb.removeAttribute('aria-busy'); gomb.textContent = eredeti; }
    });
    const nevInput = penztarForm.querySelector('input[name="nev"]');
    if (nevInput && !nevInput.value && HB.nev()) nevInput.value = HB.nev();
    const refInput = penztarForm.querySelector('input[name="ref"]');
    if (refInput && !refInput.value && HB.ref()) refInput.value = HB.ref();
  }

  // --- Naptárba mentés (.ics), kliens-oldalon — a statikus kirakaton is működik ---
  function icsLetolt(b) {
    const kezdes = new Date(b.dataset.icsKezdes);
    if (isNaN(kezdes)) return HB.toast('A dátum nem olvasható.');
    const veg = new Date(kezdes.getTime() + 5 * 3600 * 1000); // nincs vége-mező: 5 óra a becslés
    const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hola!Buli//HU',
      'BEGIN:VEVENT',
      'UID:' + Date.now() + '@holabuli',
      'DTSTAMP:' + z(new Date()),
      'DTSTART:' + z(kezdes),
      'DTEND:' + z(veg),
      'SUMMARY:' + esc(b.dataset.icsCim),
      'LOCATION:' + esc(b.dataset.icsHely),
      'DESCRIPTION:' + esc(b.dataset.icsLeiras),
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'holabuli.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      HB.toast('Naptár-fájl letöltve');
    } catch { HB.toast('A naptár-mentés ezen a böngészőn nem megy.'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ics]');
    if (b) { e.preventDefault(); icsLetolt(b); }
  });

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
    if (cp) { e.preventDefault(); HB.copy(cp.dataset.copy); if (cp.dataset.copy.includes('ref=')) localStorage.setItem('holabuli.meghivo', '1'); return; }
    // Bemutató-gomb: megmondja, mi történne élesben (halott mailto-k helyett).
    const du = e.target.closest('[data-demo-uzenet]');
    if (du) { e.preventDefault(); HB.toast(du.dataset.demoUzenet); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
  if (location.hash === '#megyek-lap' || (location.hash === '#megyek' && document.getElementById('megyek-lap'))) openSheet('megyek-lap');
  else if (location.hash === '#jegyek' || location.hash === '#megyek') openSheet('jegyek');

  // --- Főoldal: szűrők + kereső ---
  // Ékezet-független, szó-sorrendtől független: MINDEN beírt szónak szerepelnie kell valahol.
  // („durer”, „hajnal techno”, „7. kerület”, „ingyenes”, DJ-név mind találjon.)
  HB.norm = function (s) { return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim(); };

  const szurok = document.getElementById('szurok');
  if (szurok) {
    const kereso = document.getElementById('kereso');
    const cards = () => Array.from(document.querySelectorAll('.card-poster[data-kereso]'));
    let aktiv = 'mind';
    function apply() {
      const nyers = (kereso && kereso.value || '').trim();
      const szavak = HB.norm(nyers).split(/\s+/).filter(Boolean);
      let visible = 0;
      cards().forEach((c) => {
        let ok = true;
        if (aktiv === 'ma') ok = c.dataset.ma === '1';
        else if (aktiv === 'ingyen') ok = c.dataset.ingyen === '1';
        else if (aktiv.startsWith('tipus:')) ok = (c.dataset.tipus || 'buli') === aktiv.slice(6);
        else if (aktiv.startsWith('mufaj:')) ok = c.dataset.mufaj === aktiv.slice(6);
        if (ok && szavak.length) {
          // A data-kereso a szerveren már normalizált, de a régi sütött oldalak kedvéért újranormalizáljuk (egyszer, gyorsítótárba).
          if (!c._kn) c._kn = HB.norm(c.dataset.kereso);
          ok = szavak.every((sz) => c._kn.includes(sz));
        }
        c.classList.toggle('hidden', !ok);
        if (ok) visible++;
      });
      document.querySelectorAll('.list-group').forEach((g) => g.classList.toggle('hidden', !g.querySelector('.card-poster:not(.hidden)')));
      const top = document.getElementById('heti-top-szekcio');
      if (top) top.classList.toggle('hidden', !!(szavak.length || aktiv !== 'mind'));
      const ures = document.getElementById('ures');
      if (ures) ures.classList.toggle('hidden', visible > 0);
      // Az üres állapot mondja meg, MIRE nem volt találat — különben a kereső romlottnak látszik.
      const uresSzoveg = document.getElementById('ures-szoveg');
      if (uresSzoveg && !visible) {
        uresSzoveg.textContent = nyers
          ? `Erre nincs találat: „${nyers}”. Próbáld a buli, a hely, a fellépő vagy a kerület nevével.`
          : 'Erre a szűrésre most nincs buli.';
      }
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
    // Népszerű keresések: csak a kereső fókuszakor látszanak, és a chip beírja magát a mezőbe.
    const nep = document.getElementById('nepszeru');
    if (nep && kereso) {
      const mutat = (on) => nep.classList.toggle('latszik', on);
      kereso.addEventListener('focus', () => mutat(true));
      kereso.addEventListener('blur', () => setTimeout(() => mutat(false), 150));
      nep.addEventListener('mousedown', (e) => e.preventDefault()); // ne veszítse el a fókuszt a mező
      nep.addEventListener('click', (e) => {
        const b = e.target.closest('[data-keres]');
        if (!b) return;
        kereso.value = b.dataset.keres;
        apply();
        mutat(false);
        kereso.blur();
      });
    }
    // Visszalépéskor a böngésző visszaírja a keresőmezőt — a listát is szűrni kell hozzá.
    if (kereso && kereso.value.trim()) apply();
  }

  // --- „Már van jegyed” jelvény a lista-kártyákon ---
  // A statikus mód a kártyákat mozgatja (relabel), ezért a jelvényt a mozgatás UTÁN tesszük ki.
  function jegyJelvenyek() {
    const sajat = HB.passes();
    if (!sajat.length) return;
    const kindById = {};
    sajat.forEach((p) => { if (!kindById[p.eventId]) kindById[p.eventId] = p.kind || 'jegy'; });
    document.querySelectorAll('.card-poster[data-event]').forEach((c) => {
      const k = kindById[c.dataset.event];
      if (!k || c.querySelector('.jegy-jel')) return;
      const s = document.createElement('span');
      s.className = 'jegy-jel';
      s.textContent = k === 'megyek' ? '✓ Mész' : '✓ Van jegyed';
      c.appendChild(s);
    });
  }
  jegyJelvenyek();
  HB.szivekFrissit();

  // --- Harang: pötty, ha van mit mutatni (jegy vagy mentett buli) ---
  const harangPont = document.getElementById('harang-pont');
  if (harangPont && (HB.passes().length || HB.kedvencek().length)) harangPont.classList.remove('hidden');


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
