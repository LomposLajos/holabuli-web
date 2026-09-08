/* Értesítések: a lista a telefonon áll össze VALÓDI állapotból — a saját jegyekből,
   a mentett bulikból és a közelgő estékből. Nincs kitalált sor.
   Valódi push a platform-döntés (Q-01) után jöhet. */
(function () {
  'use strict';
  const HB = window.HB;
  const lista = document.getElementById('ert-lista');
  const ures = document.getElementById('ert-ures');
  const tpl = document.getElementById('ert-sablon');
  if (!lista) return;
  const BASE = window.HB_BASE || '';
  const utvonal = (p) => BASE + p + (window.HB_STATIC && !p.endsWith('/') ? '/' : '');

  const ORA = 3600 * 1000;
  const rel = (ms) => {
    const perc = Math.round(Math.abs(ms) / 60000);
    if (perc < 60) return `${perc} perc`;
    const ora = Math.round(perc / 60);
    if (ora < 24) return `${ora} óra`;
    return `${Math.round(ora / 24)} nap`;
  };

  (async function () {
    let events = [];
    try {
      const r = await fetch('/api/events', { cache: 'no-store' });
      events = await r.json();
    } catch { /* offline: csak a helyi adatból dolgozunk */ }

    const most = Date.now();
    const evById = Object.fromEntries(events.map((e) => [e.id, e]));
    const jegyek = HB.passes();
    const kedvencek = HB.kedvencek();
    const sorok = [];

    // 1) Emlékeztető a saját jegyekre / jelentkezésekre
    jegyek.forEach((p) => {
      const ev = evById[p.eventId];
      if (!ev) return;
      const t = new Date(ev.kezdes).getTime() - most;
      if (t < -6 * ORA) return;
      sorok.push({
        ikon: p.kind === 'megyek' ? '✓' : '🎟️',
        cim: t > 0 ? `${rel(t)} múlva kezdődik` : 'Most kezdődik',
        szoveg: `${ev.cim} · ${ev.hely || ''}`,
        ido: t > 0 ? rel(t) : 'most',
        rend: Math.abs(t),
        href: HB.passUrl(p.token),
      });
    });

    // 2) Mentett bulik, amik közelednek
    kedvencek.forEach((id) => {
      const ev = evById[id];
      if (!ev) return;
      if (jegyek.some((p) => p.eventId === id)) return; // erről már szóltunk fent
      const t = new Date(ev.kezdes).getTime() - most;
      if (t < 0) return;
      sorok.push({
        ikon: '♥',
        cim: 'Mentett buli közeledik',
        szoveg: `${ev.cim} · ${ev.hely || ''} · még nincs jegyed`,
        ido: rel(t),
        rend: Math.abs(t) + 1,
        href: utvonal('/e/' + ev.id),
      });
    });

    // 3) Ma esti bulik, amikről még nincs se jegy, se mentés
    events
      .filter((ev) => {
        const t = new Date(ev.kezdes).getTime() - most;
        return t > -2 * ORA && t < 20 * ORA
          && !jegyek.some((p) => p.eventId === ev.id)
          && kedvencek.indexOf(ev.id) === -1;
      })
      .slice(0, 3)
      .forEach((ev) => {
        sorok.push({
          ikon: '📍',
          cim: 'Ma este a közeledben',
          szoveg: `${ev.cim} · ${ev.hely || ''} · ${ev.ar ? new Intl.NumberFormat('hu-HU').format(ev.ar) + ' Ft' : 'ingyenes'}`,
          ido: rel(new Date(ev.kezdes).getTime() - most),
          rend: 10 * ORA,
          href: utvonal('/e/' + ev.id),
        });
      });

    // 4) Kiemelt buli a héten, ha még kevés a sor
    if (sorok.length < 3) {
      events.filter((ev) => ev.kiemelt).slice(0, 2).forEach((ev) => {
        if (sorok.some((s) => s.href.indexOf(ev.id) !== -1)) return;
        sorok.push({
          ikon: '★',
          cim: 'Heti Top ajánlat',
          szoveg: `${ev.cim} · ${ev.hely || ''}`,
          ido: rel(new Date(ev.kezdes).getTime() - most),
          rend: 100 * ORA,
          href: utvonal('/e/' + ev.id),
        });
      });
    }

    sorok.sort((a, b) => a.rend - b.rend);
    lista.innerHTML = '';
    if (!sorok.length) { ures.classList.remove('hidden'); return; }
    sorok.slice(0, 12).forEach((s) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.href = s.href;
      node.querySelector('.ert-ikon').textContent = s.ikon;
      node.querySelector('.ert-cim').textContent = s.cim;
      node.querySelector('.ert-szoveg').textContent = s.szoveg;
      node.querySelector('.ert-ido').textContent = s.ido;
      lista.appendChild(node);
    });
  })();
})();
