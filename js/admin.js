// Holabuli ADMIN: confirm az űrlapokon, kiemelés-kapcsoló újratöltés nélkül, űrlap-kényelem.
// A közös app.js már fut (HB.toast, HB.copy, megosztás, [data-copy]); minden űrlap JS nélkül is működik.
(function () {
  'use strict';
  const HB = window.HB || {};
  const toast = (m) => { if (HB.toast) HB.toast(m); };

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;

    // Megerősítés a veszélyes műveleteknél (törlés, reset, új token).
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) { e.preventDefault(); return; }

    // Kiemelés-kapcsoló: fetch-csel, az oldal marad; hibánál visszaesik a sima POST-ra.
    if (form.classList.contains('kiemelt-form')) {
      e.preventDefault();
      const btn = form.querySelector('button');
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      fetch(form.action, { method: 'POST', headers: { accept: 'application/json' }, credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((j) => {
          const on = !!j.kiemelt;
          btn.classList.toggle('on', on);
          btn.setAttribute('aria-pressed', String(on));
          btn.textContent = (on ? '★' : '☆') + ' Kiemelt';
          const row = form.closest('.ev-row');
          const star = row && row.querySelector('.ev-star');
          if (star) star.classList.toggle('hidden', !on);
          toast(on ? 'Kiemelés bekapcsolva' : 'Kiemelés kikapcsolva');
        })
        .catch(() => { form.submit(); })
        .finally(() => { btn.disabled = false; });
    }
  });

  // A visszajelző üzenet kódját levesszük az URL-ből, hogy frissítésnél ne jöjjön újra.
  if (history.replaceState && (document.querySelector('.flash') || location.search.includes('hiba='))) {
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('ok') || u.searchParams.has('hiba')) {
        u.searchParams.delete('ok');
        u.searchParams.delete('hiba');
        history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
      }
    } catch { /* régi böngésző */ }
  }

  // Buli-űrlap: az „ingyen eddig” / „ár utána” mezők csak 0 Ft-nál számítanak.
  const ar = document.getElementById('f-ar');
  if (ar) {
    const dep = document.querySelectorAll('[data-ingyen]');
    const upd = () => { const fizetos = Number(String(ar.value).replace(/\D/g, '')) > 0; dep.forEach((d) => d.classList.toggle('dim', fizetos)); };
    ar.addEventListener('input', upd);
    upd();
  }

  // Buli-űrlap: a hely kapacitása a kapacitás-mező placeholder-e.
  const hely = document.getElementById('f-hely');
  const kap = document.getElementById('f-kapacitas');
  if (hely && kap) {
    const upd = () => { const o = hely.selectedOptions && hely.selectedOptions[0]; if (o && o.dataset.kapacitas) kap.placeholder = o.dataset.kapacitas + ' (a hely kapacitása)'; };
    hely.addEventListener('change', upd);
    upd();
  }

  // ---------- Kitöltés linkből (D-016) ----------
  // A szerver kiolvassa a link adatait, mi beírjuk az űrlapba, és MEGJELÖLJÜK, mi jött a linkből.
  // Semmi nem mentődik automatikusan: a felhasználó átnézi és javítja, aztán ment.
  const linkGomb = document.getElementById('link-gomb');
  if (linkGomb) {
    const mezoInput = document.getElementById('link-url');
    const uzenet = document.getElementById('link-uzenet');
    const form = document.querySelector('.admin-form');
    const CIMKE = { cim: 'Cím', kezdes: 'Kezdés', helyNev: 'Hely', ar: 'Ár', korhatar: 'Korhatár', mufaj: 'Műfaj', stilusok: 'Stílusok', leiras: 'Leírás', lineup: 'Fellépők', kepUrl: 'Plakát' };

    function jelol(mezo, honnan) {
      const cella = mezo.closest('.field') || mezo.parentElement;
      if (!cella) return;
      cella.classList.add('linkbol');
      let jel = cella.querySelector('.linkbol-jel');
      if (!jel) { jel = document.createElement('span'); jel.className = 'linkbol-jel'; (cella.querySelector('span') || cella).appendChild(jel); }
      jel.textContent = 'linkből';
      jel.title = 'Forrás: ' + honnan + ' — nézd át, és javítsd, ha kell.';
    }

    function beir(nev, ertek, honnan) {
      const el = form.querySelector(`[name="${nev}"]`);
      if (!el || ertek === undefined || ertek === null || ertek === '') return false;
      el.value = ertek;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      jelol(el, honnan);
      return true;
    }

    async function beolvas() {
      const url = mezoInput.value.trim();
      if (!url) { mezoInput.focus(); return; }
      linkGomb.disabled = true;
      const eredetiFelirat = linkGomb.textContent;
      linkGomb.textContent = 'Olvasom…';
      uzenet.className = 'link-uzenet';
      uzenet.textContent = '';
      try {
        const r = await fetch('/admin/esemeny/beolvas', {
          method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ url }),
        });
        const d = await r.json();
        if (!d.ok) {
          uzenet.className = 'link-uzenet hiba';
          uzenet.textContent = d.hiba || 'Nem sikerült beolvasni.';
          return;
        }
        const m = d.mezok || {};
        const kitoltott = [];
        [['cim', 'cim'], ['kezdes', 'kezdes'], ['ar', 'ar'], ['korhatar', 'korhatar'], ['mufaj', 'mufaj'], ['stilusok', 'stilusok'], ['leiras', 'leiras'], ['lineup', 'lineup']]
          .forEach(([forras, mezoNev]) => { if (beir(mezoNev, m[forras], d.forras[forras] || 'link')) kitoltott.push(CIMKE[forras] || mezoNev); });

        // Hely: ha felismertük, kiválasztjuk; ha nem, megmondjuk, mit kell felvenni.
        let helySor = '';
        if (d.hely && d.hely.allapot === 'megvan') {
          const sel = form.querySelector('[name="venueId"]');
          if (sel) { sel.value = d.hely.id; sel.dispatchEvent(new Event('change', { bubbles: true })); jelol(sel, 'a link helyszíne'); }
          kitoltott.push('Hely');
        } else if (d.hely && d.hely.allapot === 'nincs') {
          helySor = `A hely („${d.hely.nev}”${d.hely.cim ? ', ' + d.hely.cim : ''}) még nincs a listádban — vedd fel a Helyek oldalon, vagy válassz mást.`;
        }

        const hianyzik = (d.hianyzo || []).map((k) => CIMKE[k] || k);
        uzenet.className = 'link-uzenet ok';
        uzenet.innerHTML = '';
        const cim = document.createElement('b');
        cim.textContent = kitoltott.length ? `Kitöltve: ${kitoltott.join(', ')}.` : 'Ebből a linkből nem sikerült adatot kiolvasni.';
        uzenet.appendChild(cim);
        const reszek = [];
        if (hianyzik.length) reszek.push(`Nem találtam: ${hianyzik.join(', ')} — írd be kézzel.`);
        if (helySor) reszek.push(helySor);
        if (d.figyelmeztetes) reszek.push(d.figyelmeztetes);
        if (m.kepUrl) reszek.push('Találtam plakátot is; a demó saját plakátot rajzol, ezért ezt most nem használjuk fel.');
        reszek.push('Mindent átírhatsz mentés előtt.');
        reszek.forEach((t) => { const p = document.createElement('p'); p.textContent = t; uzenet.appendChild(p); });
        const elso = form.querySelector('[name="cim"]');
        if (elso) elso.focus({ preventScroll: true });
      } catch {
        uzenet.className = 'link-uzenet hiba';
        uzenet.textContent = 'Nem sikerült elérni a beolvasót. Próbáld újra.';
      } finally {
        linkGomb.disabled = false;
        linkGomb.textContent = eredetiFelirat;
      }
    }

    linkGomb.addEventListener('click', beolvas);
    mezoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); beolvas(); } });
  }

  // Frissen mentett/létrehozott buli sorát megjelöljük (a redirect #ev-<id> horgonnyal jön).
  if (location.hash.startsWith('#ev-')) {
    const row = document.getElementById(location.hash.slice(1));
    if (row) { row.classList.add('ev-hi'); setTimeout(() => row.classList.remove('ev-hi'), 2400); }
  }
})();
