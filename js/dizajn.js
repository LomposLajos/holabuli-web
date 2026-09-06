/* DIZÁJN-VÁLTÓ — bemutató-eszköz (D-013), nem termék-funkció.
   Csak demó módban kerül az oldalra. A megrendelő ezzel lépked a teljes megjelenés-változatok közt:
   mindegyik más szerkezet, más formanyelv, más paletta. A választás linkelhető is: ?dizajn=rave. */
(function () {
  'use strict';
  const KEY = 'holabuli.dizajn';
  const VALTOZATOK = [
    { id: '', nev: 'Neon', leiras: 'Alap: plakát-rács, alsó sáv, pink-lila neon.', minta: ['#0b0b12', '#ff4fa3', '#8b5cf6'] },
    { id: 'ejfel', nev: 'Éjfél', leiras: 'Magazinos lista, felső menü, mély kék és arany.', minta: ['#080e1c', '#f0b429', '#3b82f6'] },
    { id: 'rave', nev: 'Rave', leiras: 'Sűrű, technikás lista, éles sarkok, savzöld.', minta: ['#05060a', '#22d3ee', '#a3e635'] },
    { id: 'retro', nev: 'Retró', leiras: 'Nagy, teljes szélességű kártyák, meleg disco.', minta: ['#1d1206', '#f97316', '#fde047'] },
    { id: 'mono', nev: 'Mono', leiras: 'Tipográfiai, kép nélküli lista, fekete-fehér.', minta: ['#0d0d0d', '#ef2b2b', '#fafafa'] },
  ];
  const HB = (window.HB = window.HB || {});
  const IDS = VALTOZATOK.map((v) => v.id);
  const jelenlegi = () => document.documentElement.dataset.dizajn || '';
  const nevOf = (id) => (VALTOZATOK.find((v) => v.id === id) || VALTOZATOK[0]).nev;

  function allit(id, mentsuk) {
    if (IDS.indexOf(id) < 0) id = '';
    if (id) document.documentElement.dataset.dizajn = id;
    else delete document.documentElement.dataset.dizajn;
    if (mentsuk !== false) { try { localStorage.setItem(KEY, id); } catch { /* privát mód */ } }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (bg) meta.setAttribute('content', bg);
    }
    document.querySelectorAll('[data-dv]').forEach((el) => {
      const on = el.dataset.dv === id;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    });
    const cimke = document.getElementById('dv-nev');
    if (cimke) cimke.textContent = nevOf(id);
  }
  HB.dizajn = { allit, lista: VALTOZATOK, jelenlegi };

  try {
    const q = new URLSearchParams(location.search).get('dizajn');
    if (q !== null) allit(q === 'alap' ? '' : q);
  } catch { /* */ }

  function sor(v) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dv-sor' + (v.id === jelenlegi() ? ' on' : '');
    b.dataset.dv = v.id;
    b.setAttribute('aria-pressed', String(v.id === jelenlegi()));
    b.innerHTML = `<span class="dv-minta">${v.minta.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`
      + '<span class="dv-szoveg"><span class="dv-nev"></span><span class="dv-leiras"></span></span><span class="dv-jel">●</span>';
    b.querySelector('.dv-nev').textContent = v.nev;
    b.querySelector('.dv-leiras').textContent = v.leiras;
    b.addEventListener('click', () => allit(v.id));
    return b;
  }

  // Az áttekintő oldal (/dizajn) gombjai ugyanezt hívják.
  document.querySelectorAll('[data-dv-valaszt]').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); allit(el.dataset.dvValaszt === 'alap' ? '' : el.dataset.dvValaszt); window.scrollTo({ top: 0, behavior: 'smooth' }); if (HB.toast) HB.toast(nevOf(jelenlegi()) + ' változat bekapcsolva'); });
  });

  if (document.getElementById('dv-sheet')) return;

  // A váltó EGYETLEN helyen érhető el: a Profil → Beállítások szakaszában, sima beállítás-sorként (D-014).
  // Más oldalon nincs kapcsoló (nem úszik semmi a tartalom fölé), a DEMÓ-szalag megint csak jelzés.
  const beallitasok = Array.from(document.querySelectorAll('.page-profil .section'))
    .find((s) => /Beállítások/.test((s.querySelector('h2') || {}).textContent || ''));
  if (!beallitasok) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dv-sor-beallitas';
  trigger.innerHTML = '<span class="dv-szoveg"><b>Téma</b><small class="muted">Az app megjelenése. Jelenlegi: <span id="dv-nev"></span></small></span>'
    + '<span class="dv-minta" aria-hidden="true"></span><span class="dv-chev">›</span>';
  trigger.setAttribute('aria-label', 'Téma választása');
  const mintaDoboz = trigger.querySelector('.dv-minta');
  const torles = beallitasok.querySelector('#pf-torles');
  if (torles) beallitasok.insertBefore(trigger, torles); else beallitasok.appendChild(trigger);
  function mintaFrissit() {
    const v = VALTOZATOK.find((x) => x.id === jelenlegi()) || VALTOZATOK[0];
    mintaDoboz.innerHTML = v.minta.map((c) => `<i style="background:${c}"></i>`).join('');
  }

  const sheet = document.createElement('div');
  sheet.className = 'sheet hidden';
  sheet.id = 'dv-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Dizájn-változatok');
  const bg = document.createElement('div');
  bg.className = 'sheet-backdrop';
  bg.setAttribute('data-close', '');
  const panel = document.createElement('div');
  panel.className = 'sheet-panel';
  panel.innerHTML = '<div class="sheet-grip"></div><div class="dv-fej">Bemutató-eszköz</div>'
    + '<h2>Dizájn-változatok</h2><p class="muted">Ugyanaz az app, öt teljesen más megjelenésben: más szerkezet, más formanyelv, más paletta. Csak a bemutatóhoz, a kész appban nem lesz benne.</p>';
  const lista = document.createElement('div');
  lista.className = 'dv-lista';
  VALTOZATOK.forEach((v) => lista.appendChild(sor(v)));
  panel.appendChild(lista);
  const link = document.createElement('a');
  link.className = 'btn btn-ghost btn-block';
  link.href = (window.HB_BASE || '') + '/dizajn/';
  link.textContent = 'Összehasonlító oldal';
  panel.appendChild(link);
  const kesz = document.createElement('button');
  kesz.className = 'btn btn-ghost btn-block';
  kesz.type = 'button';
  kesz.setAttribute('data-close', '');
  kesz.textContent = 'Bezár';
  panel.appendChild(kesz);
  sheet.appendChild(bg);
  sheet.appendChild(panel);

  trigger.addEventListener('click', () => { sheet.classList.remove('hidden'); document.body.style.overflow = 'hidden'; });
  document.body.appendChild(sheet);
  const c = document.getElementById('dv-nev');
  if (c) c.textContent = nevOf(jelenlegi());
  mintaFrissit();
  // A választás után a beállítás-sor mintája és felirata is kövesse a témát.
  lista.addEventListener('click', () => setTimeout(mintaFrissit, 0));
})();
