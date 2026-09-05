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

  // Frissen mentett/létrehozott buli sorát megjelöljük (a redirect #ev-<id> horgonnyal jön).
  if (location.hash.startsWith('#ev-')) {
    const row = document.getElementById(location.hash.slice(1));
    if (row) { row.classList.add('ev-hi'); setTimeout(() => row.classList.remove('ev-hi'), 2400); }
  }
})();
