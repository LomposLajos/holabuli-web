/* Jegyeim: a telefonon tárolt passz-tokenekből tölti a listát + elveszett jegy visszakeresése. */

// --- Elveszett jegy (D-028): elérhetőség ÉS név kell, a találatot felvesszük a telefonra ---
(function kereso() {
  'use strict';
  const form = document.getElementById('jegy-kereso-form');
  if (!form) return;
  const doboz = document.getElementById('kereses-eredmeny');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const gomb = form.querySelector('button[type="submit"]');
    gomb.disabled = true; gomb.textContent = 'Keresés…';
    doboz.textContent = '';
    try {
      const r = await fetch('/api/jegy/kereses', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kapcsolat: fd.get('kapcsolat'), nev: fd.get('nev') }),
      });
      const d = await r.json();
      if (r.status === 429) { doboz.textContent = 'Túl sok próbálkozás, várj egy percet.'; return; }
      if (!d.ok || !d.talalatok.length) {
        doboz.textContent = 'Nincs jegy ezzel az elérhetőséggel és névvel. Ellenőrizd, pontosan azt írtad-e be, amit a vásárlásnál.';
        return;
      }
      // Megvan: felvesszük a telefonra, és újratöltjük a listát.
      d.talalatok.forEach((t) => window.HB.addPass({ token: t.token, eventId: t.eventId, nev: t.nev, kind: t.kind, at: Date.now() }));
      doboz.textContent = `${d.talalatok.length} jegy megvan — felvettük erre a telefonra.`;
      setTimeout(() => location.reload(), 900);
    } catch {
      doboz.textContent = 'Nincs kapcsolat. Próbáld újra.';
    } finally {
      gomb.disabled = false; gomb.textContent = 'Keresés';
    }
  });
})();

(async function () {
  'use strict';
  const HB = window.HB;
  const lista = document.getElementById('jegyeim-lista');
  const ures = document.getElementById('jegyeim-ures');
  const tpl = document.getElementById('jegy-sablon');
  const passes = HB.passes();
  if (!passes.length) { lista.innerHTML = ''; ures.classList.remove('hidden'); return; }

  const rows = [];
  const keep = [];
  for (const p of passes) {
    try {
      const r = await fetch('/api/pass/' + encodeURIComponent(p.token));
      if (!r.ok) continue; // elavult token → kidobjuk
      const d = await r.json();
      keep.push(p);
      rows.push(d);
    } catch { keep.push(p); }
  }
  HB.savePasses(keep);
  lista.innerHTML = '';
  if (!rows.length) { ures.classList.remove('hidden'); return; }
  rows.sort((a, b) => new Date(a.event.kezdes) - new Date(b.event.kezdes));
  for (const d of rows) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.href = HB.passUrl(d.token);
    const when = d.event.when.split(' · ');
    node.querySelector('.jw-day').textContent = when[0];
    node.querySelector('.jw-time').textContent = when[1] || '';
    node.querySelector('.jb-cim').textContent = d.event.cim;
    node.querySelector('.jb-hely').textContent = (d.venue ? d.venue.nev + ' · ' : '') + d.event.price;
    const st = node.querySelector('.jegy-status');
    const rsvp = d.pass.kind === 'megyek'; // ingyenes belépés: jelentkezés, nem jegy
    if (d.pass.status === 'scanned') { st.textContent = 'Belépett'; st.classList.add('ok'); }
    else if (d.event.past) { st.textContent = 'Lement'; node.classList.add('past'); }
    else { st.textContent = rsvp ? 'Mész' : 'Érvényes'; }
    lista.appendChild(node);
  }
})();
