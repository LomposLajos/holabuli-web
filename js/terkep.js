/* Térkép: a helyszínek Budapesten, a hozzájuk tartozó közelgő bulikkal.
   Leaflet a projektből (public/vendor), csempék a CARTO sötét alaptérképéről.
   Ha a csempe nem tölt be, a lista alatta akkor is teljes értékű. */
(function () {
  'use strict';
  const HB = window.HB;
  const doboz = document.getElementById('terkep');
  if (!doboz) return;
  const lista = document.getElementById('hely-lista');
  const szam = document.getElementById('helyek-szam');
  const hibaDoboz = document.getElementById('terkep-hiba');
  const holGomb = document.getElementById('hol-vagyok');

  const BP = [47.4979, 19.0402];
  let terkep = null;
  let sajatJelolo = null;
  const jelolok = {};

  function hiba() {
    doboz.classList.add('hidden');
    hibaDoboz.classList.remove('hidden');
    if (holGomb) holGomb.classList.add('hidden');
  }

  // Két pont távolsága km-ben (haversine) — a „hol vagyok” rendezéshez.
  function tavolsag(a, b) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function tuIkon(db) {
    return window.L.divIcon({
      className: 'terkep-tu-tok',
      html: `<span class="terkep-tu"><b>${db || ''}</b></span>`,
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -40],
    });
  }

  function sorHtml(h) {
    const base = (window.HB_BASE || '');
    const bulik = h.bulik.map((b) => `<a class="hely-buli" href="${base}/e/${b.id}${window.HB_STATIC ? '/' : ''}"><span class="hely-buli-cim">${esc(b.cim)}</span><span class="muted small">${esc(b.when)} · ${esc(b.price)}</span></a>`).join('');
    return `
      <div class="hely-fej">
        <span class="hely-ini">${esc(ini(h.nev))}</span>
        <div class="hely-nev"><b>${esc(h.nev)}</b><span class="muted small">${esc(h.kerulet)} kerület · ${esc(h.cim)}</span></div>
        <span class="hely-tav muted small" data-tav="${h.id}"></span>
      </div>
      ${bulik || '<p class="muted small">Most nincs meghirdetett bulija.</p>'}
      ${h.osszes > h.bulik.length ? `<p class="muted small">és még ${h.osszes - h.bulik.length} buli</p>` : ''}
    `;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ini = (n) => String(n || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  (async function () {
    let helyek = [];
    try {
      const r = await fetch('/api/helyek', { cache: 'no-store' });
      helyek = await r.json();
    } catch {
      lista.innerHTML = '<p class="muted">A helyszínek most nem tölthetők be.</p>';
      hiba();
      return;
    }
    const koordinatas = helyek.filter((h) => typeof h.lat === 'number' && typeof h.lon === 'number');

    // --- lista ---
    lista.innerHTML = '';
    helyek.forEach((h) => {
      const el = document.createElement('article');
      el.className = 'hely-kartya';
      el.id = 'hely-' + h.id;
      el.innerHTML = sorHtml(h);
      el.addEventListener('click', () => {
        if (terkep && jelolok[h.id]) { terkep.setView([h.lat, h.lon], 15, { animate: true }); jelolok[h.id].openPopup(); }
      });
      lista.appendChild(el);
    });
    if (szam) szam.textContent = `${helyek.length} hely · ${helyek.reduce((s, h) => s + h.osszes, 0)} közelgő buli`;

    // --- térkép ---
    if (!window.L || !koordinatas.length) { hiba(); return; }
    try {
      terkep = window.L.map(doboz, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      terkep.setView(BP, 12.4);
      window.L.control.zoom({ position: 'bottomright' }).addTo(terkep);
      // OpenStreetMap alaptérkép, kulcs nélkül. A sötét megjelenést CSS-szűrő adja
      // (.leaflet-tile-pane), mert a kulcs nélküli sötét csempe-szolgáltatók vízjelet raknak a képre.
      // ⚠️ Éles, nagy forgalmú használathoz saját csempe-szolgáltató kell (pl. MapTiler kulccsal).
      const csempe = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      });
      let jottCsempe = false;
      csempe.on('tileload', () => { jottCsempe = true; });
      csempe.addTo(terkep);
      // Ha 6 másodperc alatt egy csempe sem jött meg, inkább a listát mutatjuk.
      setTimeout(() => { if (!jottCsempe) hiba(); }, 6000);

      koordinatas.forEach((h) => {
        const m = window.L.marker([h.lat, h.lon], { icon: tuIkon(h.osszes), title: h.nev }).addTo(terkep);
        m.bindPopup(`<b>${esc(h.nev)}</b><br>${esc(h.kerulet)} kerület · ${esc(h.cim)}<br>${h.osszes} közelgő buli`);
        m.on('click', () => {
          const el = document.getElementById('hely-' + h.id);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        jelolok[h.id] = m;
      });
    } catch {
      hiba();
      return;
    }

    // --- hol vagyok ---
    if (holGomb) {
      holGomb.addEventListener('click', () => {
        if (!navigator.geolocation) { HB.toast('Ez a böngésző nem adja meg a helyzetedet.'); return; }
        holGomb.disabled = true;
        navigator.geolocation.getCurrentPosition((pos) => {
          holGomb.disabled = false;
          const p = [pos.coords.latitude, pos.coords.longitude];
          if (sajatJelolo) terkep.removeLayer(sajatJelolo);
          sajatJelolo = window.L.circleMarker(p, { radius: 8, color: '#fff', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.9 }).addTo(terkep);
          terkep.setView(p, 13, { animate: true });
          // Távolságok kiírása és a lista rendezése közelség szerint.
          const rendezett = koordinatas.map((h) => ({ h, d: tavolsag(p, [h.lat, h.lon]) })).sort((a, b) => a.d - b.d);
          rendezett.forEach(({ h, d }) => {
            const el = document.querySelector(`[data-tav="${h.id}"]`);
            if (el) el.textContent = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
            const kartya = document.getElementById('hely-' + h.id);
            if (kartya) lista.appendChild(kartya);
          });
          HB.toast('A legközelebbi helyek kerültek előre');
        }, () => {
          holGomb.disabled = false;
          HB.toast('Nem kaptam meg a helyzetedet. Engedélyezd a böngészőben.');
        }, { timeout: 8000 });
      });
    }
  })();
})();
