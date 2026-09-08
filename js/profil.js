/* Profil: statisztika a telefonon tárolt passzokból (+ opcionális demó-adat, jelölve). */
(async function () {
  'use strict';
  const HB = window.HB;
  const page = document.querySelector('.page-profil');
  const GENRES = JSON.parse(page.dataset.genres || '{}');
  const RANGOK = [[0, 'Újonc'], [5, 'Törzsvendég'], [12, 'Éjjeli bagoly'], [25, 'Hajnali legenda']];
  const DEMO_KEY = 'holabuli.demoProfil';

  const passes = HB.passes();
  const rows = [];
  for (const p of passes) {
    try { const r = await fetch('/api/pass/' + encodeURIComponent(p.token)); if (r.ok) rows.push(await r.json()); } catch { /* offline */ }
  }

  const demo = localStorage.getItem(DEMO_KEY) === '1';
  let bulik = rows.length, belepett = rows.filter((d) => d.pass.status === 'scanned').length;
  const helyek = new Set(rows.map((d) => d.venue && d.venue.id).filter(Boolean));
  const genreCount = {};
  rows.forEach((d) => { genreCount[d.event.mufaj] = (genreCount[d.event.mufaj] || 0) + 1; });
  if (demo) {
    // Jelölt demó-alap, hogy a bemutatón ne üres profil legyen.
    bulik += 11; belepett += 9;
    ['v_pincefeny', 'v_dobozgyar', 'v_neonkert', 'v_rakpart9'].forEach((v) => helyek.add(v));
    Object.entries({ techno: 5, house: 3, retro: 2, hiphop: 1 }).forEach(([k, n]) => { genreCount[k] = (genreCount[k] || 0) + n; });
  }

  const nev = HB.nev() || (demo ? 'Demó Tamás' : 'Vendég');
  document.getElementById('pf-nev').textContent = nev;
  document.getElementById('pf-ini').textContent = nev.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'V';

  let rang = RANGOK[0], kov = RANGOK[1];
  for (let i = 0; i < RANGOK.length; i++) if (bulik >= RANGOK[i][0]) { rang = RANGOK[i]; kov = RANGOK[i + 1] || null; }
  document.getElementById('pf-rang').textContent = rang[1];
  document.getElementById('pf-rang-kov').textContent = kov ? `Következő rang: ${kov[1]}` : 'Legmagasabb rang';
  document.getElementById('pf-rang-szam').textContent = kov ? `${bulik} / ${kov[0]}` : `${bulik} buli`;
  document.getElementById('pf-rang-bar').style.width = kov ? Math.min(100, Math.round((bulik / kov[0]) * 100)) + '%' : '100%';
  document.getElementById('pf-alcim').textContent = bulik ? (demo ? 'Demó-adatokkal feltöltött profil.' : `${bulik} buli ezen a telefonon.`) : 'Válts egy jegyet, és elindul a statisztikád.';

  document.getElementById('st-bulik').textContent = bulik;
  document.getElementById('st-helyek').textContent = helyek.size;
  document.getElementById('st-belepett').textContent = belepett;
  const top = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('st-kedvenc').textContent = top ? (GENRES[top[0]] || top[0]) : '–';

  const bars = document.getElementById('pf-stilusok');
  const total = Object.values(genreCount).reduce((a, b) => a + b, 0);
  if (total) {
    const PAL = { techno: 'linear-gradient(90deg,#7c3aed,#22d3ee)', house: 'linear-gradient(90deg,#f97316,#ec4899)', retro: 'linear-gradient(90deg,#facc15,#f472b6)', hiphop: 'linear-gradient(90deg,#ef4444,#f59e0b)', latin: 'linear-gradient(90deg,#10b981,#f59e0b)', indie: 'linear-gradient(90deg,#3b82f6,#a855f7)', egyetemi: 'linear-gradient(90deg,#06b6d4,#84cc16)', dnb: 'linear-gradient(90deg,#22c55e,#0ea5e9)' };
    bars.innerHTML = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="gb"><span>${GENRES[k] || k}</span><div class="bar"><span style="width:${Math.round((n / total) * 100)}%;--gb:${PAL[k] || ''}"></span></div><span class="gb-n">${n}</span></div>`).join('');
  }

  const meghivo = localStorage.getItem('holabuli.meghivo') === '1';
  const unlock = { elso: bulik >= 1, kapu: belepett >= 1, haver: meghivo, ejjeli: bulik >= 5 };
  document.querySelectorAll('.badge-card').forEach((b) => b.classList.toggle('locked', !unlock[b.dataset.badge]));

  // Demó-adat kapcsoló (csak a bemutatóhoz): a Beállítások alá.
  const torles = document.getElementById('pf-torles');
  const demoBtn = document.createElement('button');
  demoBtn.className = 'btn btn-ghost btn-block';
  demoBtn.type = 'button';
  demoBtn.textContent = demo ? 'Demó-adatok kikapcsolása' : 'Demó-adatok betöltése a profilba';
  demoBtn.addEventListener('click', () => { localStorage.setItem(DEMO_KEY, demo ? '0' : '1'); location.reload(); });
  torles.parentNode.insertBefore(demoBtn, torles);
  torles.addEventListener('click', () => { if (confirm('Törlöd a jegyeket erről a telefonról? A QR-kódok a linkjükön továbbra is élnek.')) { HB.savePasses([]); localStorage.removeItem('holabuli.meghivo'); location.reload(); } });

  // Minden helyi adat törlése — fiók nincs, tehát ez a „fiók törlése” megfelelője.
  const mindent = document.getElementById('pf-mindent-torol');
  if (mindent) {
    mindent.addEventListener('click', () => {
      if (!confirm('Törlöd MINDEN adatodat erről az eszközről? Jegyek, mentett bulik, chat-üzenetek és beállítások is törlődnek. Ez nem vonható vissza.')) return;
      ['holabuli.passes', 'holabuli.kedvencek', 'holabuli.nev', 'holabuli.meghivo', 'holabuli.demoProfil', 'holabuli.dizajn', 'holabuli.static.v1'].forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* privát mód */ }
      });
      try { sessionStorage.clear(); } catch { /* privát mód */ }
      location.href = (window.HB_BASE || '') + '/';
    });
  }

  // --- Mentve: a kedvencekhez tett bulik ---
  (async function mentve() {
    const szekcio = document.getElementById('mentve-szekcio');
    const lista = document.getElementById('mentve-lista');
    const szam = document.getElementById('mentve-szam');
    if (!szekcio || !lista) return;
    const ids = HB.kedvencek();
    if (!ids.length) return;
    let events = [];
    try { events = await (await fetch('/api/events', { cache: 'no-store' })).json(); } catch { return; }
    const evById = Object.fromEntries(events.map((e) => [e.id, e]));
    if (!ids.map((id) => evById[id]).filter(Boolean).length) return;
    const base = window.HB_BASE || '';
    // A listát MINDIG a tárolt állapotból rajzoljuk újra, hogy a levétel is látszódjon.
    function rajzol() {
    const talalt = HB.kedvencek().map((id) => evById[id]).filter(Boolean);
    lista.innerHTML = '';
    talalt.forEach((ev) => {
      // ⚠️ A sor DIV, benne KIFESZÍTETT link — a szív-gomb NEM kerülhet a linken belülre.
      // Az érvénytelen HTML lenne, és a gyakorlatban a szívre koppintás a linket is elsütné:
      // a vendég le akarná venni a mentésről, és közben átdobná a buli oldalára.
      // Ugyanaz a minta, mint a kártyáknál (views/partials/kartya.ejs).
      const sor = document.createElement('div');
      sor.className = 'mentve-sor';
      const link = document.createElement('a');
      link.className = 'mentve-link';
      link.href = base + '/e/' + ev.id + (window.HB_STATIC ? '/' : '');
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = ev.cim;
      link.appendChild(sr);
      const b = document.createElement('span');
      b.className = 'mentve-body';
      const cim = document.createElement('b'); cim.textContent = ev.cim;
      const meta = document.createElement('span'); meta.className = 'muted small';
      meta.textContent = `${ev.when} · ${ev.hely || ''}`;
      b.appendChild(cim); b.appendChild(meta);
      const szivGomb = document.createElement('button');
      szivGomb.type = 'button';
      szivGomb.className = 'szivgomb szivgomb-sor on';
      szivGomb.dataset.kedvenc = ev.id;
      szivGomb.setAttribute('aria-pressed', 'true');
      szivGomb.setAttribute('aria-label', ev.cim + ' levétele a mentettekről');
      szivGomb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.6-9A5.4 5.4 0 0 1 12 6.5 5.4 5.4 0 0 1 21.6 12c-2.1 4.3-9.6 9-9.6 9Z"/></svg>';
      sor.appendChild(link); sor.appendChild(b); sor.appendChild(szivGomb);
      lista.appendChild(sor);
    });
    if (szam) szam.textContent = `${talalt.length} buli`;
    // Ha az utolsó mentést is levették, a szakasz eltűnik — nem marad üres cím a profilon.
    szekcio.hidden = !talalt.length;
    }
    rajzol();
    document.addEventListener('hb:kedvenc', rajzol);
  })();
  document.getElementById('pf-rejt').addEventListener('change', (e) => HB.toast(e.target.checked ? 'Profilod rejtve' : 'Profilod látható'));
  document.getElementById('pf-push').addEventListener('change', (e) => HB.toast(e.target.checked ? 'Emlékeztető be' : 'Emlékeztető ki'));
})();
