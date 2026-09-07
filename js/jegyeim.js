/* Jegyeim: a telefonon tárolt passz-tokenekből tölti a listát. */
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
