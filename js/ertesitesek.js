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
  // ⚠️ A sor jobb szélén álló idő egy értesítés-listában konvenció szerint azt jelenti,
  // MENNYI IDEJE ÉRKEZETT. Nálunk viszont azt, mennyi idő MÚLVA kezdődik a buli — ezért
  // a „múlva” nem elhagyható, különben a vendég pont az ellenkezőjét olvassa ki.
  const idoCimke = (t) => (t > 0 ? `${rel(t)} múlva` : 'most');

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
      // Lemondott buli (D-027): ez a LEGFONTOSABB értesítés — a lista elejére kerül.
      if (ev.elmarad) {
        sorok.push({
          evId: ev.id,
          ikon: '⚠️',
          cim: 'Elmarad a buli',
          szoveg: `${ev.cim} · ${ev.elmarad.indok || 'a hely lemondta'}`,
          ido: idoCimke(t),
          rend: -1, // mindig legelöl
          href: utvonal('/e/' + ev.id),
        });
        return;
      }
      sorok.push({
        // A cím azt mondja meg, MIÉRT kapod; az időt a sor jobb széle viszi — ne kétszer.
        // ⚠️ Az evId KELL: ennek a sornak az href-je JEGY-URL, amiben nincs benne a buli
        // azonosítója — ezért az href-alapú duplikátum-szűrés pont ezt a sort nem látta.
        evId: ev.id,
        ikon: p.kind === 'megyek' ? '✓' : '🎟️',
        cim: p.kind === 'megyek' ? 'Ott leszel' : 'Megvan a jegyed',
        szoveg: `${ev.cim} · ${ev.hely || ''}`,
        ido: idoCimke(t),
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
      if (ev.elmarad) {
        sorok.push({
          evId: ev.id, ikon: '⚠️', cim: 'Elmarad a buli',
          szoveg: `${ev.cim} · ${ev.elmarad.indok || 'a hely lemondta'}`,
          ido: idoCimke(t), rend: -1, href: utvonal('/e/' + ev.id),
        });
        return;
      }
      sorok.push({
        evId: ev.id,
        ikon: '♥',
        cim: 'Mentett buli',
        szoveg: `${ev.cim} · ${ev.hely || ''} · még nincs jegyed`,
        ido: idoCimke(t),
        rend: Math.abs(t) + 1,
        href: utvonal('/e/' + ev.id),
      });
    });

    // 3) Ma esti bulik, amikről még nincs se jegy, se mentés
    events
      .filter((ev) => {
        const t = new Date(ev.kezdes).getTime() - most;
        return t > -2 * ORA && t < 20 * ORA
          && !ev.elmarad // lemondott bulira nem hívunk senkit
          && !jegyek.some((p) => p.eventId === ev.id)
          && kedvencek.indexOf(ev.id) === -1;
      })
      .slice(0, 3)
      .forEach((ev) => {
        sorok.push({
          evId: ev.id,
          ikon: '📍',
          cim: 'Ma este a közeledben',
          szoveg: `${ev.cim} · ${ev.hely || ''} · ${ev.ar ? new Intl.NumberFormat('hu-HU').format(ev.ar) + ' Ft' : 'ingyenes'}`,
          ido: idoCimke(new Date(ev.kezdes).getTime() - most),
          rend: 10 * ORA,
          href: utvonal('/e/' + ev.id),
        });
      });

    // 4) Kiemelt buli a héten, ha még kevés a sor
    if (sorok.length < 3) {
      events.filter((ev) => ev.kiemelt).slice(0, 2).forEach((ev) => {
        if (sorok.some((s) => s.evId === ev.id)) return;
        sorok.push({
          evId: ev.id,
          ikon: '★',
          cim: 'Heti Top ajánlat',
          szoveg: `${ev.cim} · ${ev.hely || ''}`,
          ido: idoCimke(new Date(ev.kezdes).getTime() - most),
          rend: 100 * ORA,
          href: utvonal('/e/' + ev.id),
        });
      });
    }

    sorok.sort((a, b) => a.rend - b.rend);
    // Egy buliról EGY sor szóljon. A rendezés után az elöl álló a fontosabb (saját jegy > mentett > ajánlat),
    // ezért az elsőt tartjuk meg. Enélkül ugyanaz a buli kétszer is felbukkanhat, más címmel.
    const latott = new Set();
    const egyedi = sorok.filter((s) => { if (!s.evId) return true; if (latott.has(s.evId)) return false; latott.add(s.evId); return true; });
    lista.innerHTML = '';
    if (!egyedi.length) { ures.classList.remove('hidden'); return; }
    egyedi.slice(0, 12).forEach((s) => {
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
