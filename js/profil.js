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
  document.getElementById('pf-rejt').addEventListener('change', (e) => HB.toast(e.target.checked ? 'Profilod rejtve' : 'Profilod látható'));
  document.getElementById('pf-push').addEventListener('change', (e) => HB.toast(e.target.checked ? 'Emlékeztető be' : 'Emlékeztető ki'));
})();
