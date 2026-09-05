/* Téma-váltó. A témák a css/temak.css-ben élnek; itt csak a lista, a váltás és a választó felület.
   A választott téma localStorage-ban marad (eszközönként). A villanás elkerüléséért a head-ben
   egy rövid script már beállította a <html data-tema>-t, mielőtt bármi kirajzolódna. */
(function () {
  'use strict';
  const KEY = 'holabuli.tema';
  const TEMAK = [
    { id: '', nev: 'Neon éjjel', leiras: 'Sötét, pink-lila fények. Ez az alap.', minta: ['#0b0b12', '#ff4fa3', '#8b5cf6'] },
    { id: 'ejfel', nev: 'Éjfél', leiras: 'Mély kék, arany kiemelés. Elegáns.', minta: ['#080e1c', '#f0b429', '#3b82f6'] },
    { id: 'rave', nev: 'Rave', leiras: 'Fekete, savzöld-cián, éles sarkok.', minta: ['#05060a', '#22d3ee', '#a3e635'] },
    { id: 'retro', nev: 'Retró', leiras: 'Meleg disco: borostyán és krém.', minta: ['#1d1206', '#f97316', '#fde047'] },
    { id: 'hajnal', nev: 'Hajnal', leiras: 'Világos, tiszta nappali nézet.', minta: ['#f7f7fb', '#e11d74', '#7c3aed'] },
    { id: 'pasztell', nev: 'Pasztell', leiras: 'Lágy világos, lila-menta. Barátságos.', minta: ['#fbf7ff', '#9b7bff', '#4fd1c5'] },
    { id: 'mono', nev: 'Mono', leiras: 'Fekete-fehér, egy piros jelzőszín.', minta: ['#0d0d0d', '#ef2b2b', '#fafafa'] },
  ];
  const HB = (window.HB = window.HB || {});
  const IDS = TEMAK.map((t) => t.id);

  function jelenlegi() { return document.documentElement.dataset.tema || ''; }
  function nevOf(id) { const t = TEMAK.find((x) => x.id === id); return t ? t.nev : 'Neon éjjel'; }

  function allit(id, mentsuk) {
    if (IDS.indexOf(id) < 0) id = '';
    if (id) document.documentElement.dataset.tema = id;
    else delete document.documentElement.dataset.tema;
    if (mentsuk !== false) { try { localStorage.setItem(KEY, id); } catch { /* privát mód */ } }
    // A böngésző-fejléc színe kövesse a témát.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (bg) meta.setAttribute('content', bg);
    }
    document.querySelectorAll('[data-tema-kartya]').forEach((k) => {
      const on = k.dataset.temaKartya === id;
      k.classList.toggle('on', on);
      k.setAttribute('aria-pressed', String(on));
    });
    const cimke = document.getElementById('tema-jelenlegi');
    if (cimke) cimke.textContent = nevOf(id);
  }
  HB.tema = { allit, lista: TEMAK, jelenlegi };

  // ?tema=rave → azonnali váltás (QC-hez és linkelhető bemutatóhoz).
  try {
    const q = new URLSearchParams(location.search).get('tema');
    if (q !== null) allit(q === 'alap' ? '' : q);
  } catch { /* */ }

  function kartya(t) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tema-kartya' + (t.id === jelenlegi() ? ' on' : '');
    b.dataset.temaKartya = t.id;
    b.setAttribute('aria-pressed', String(t.id === jelenlegi()));
    b.innerHTML = `<span class="tema-minta">${t.minta.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`
      + `<span class="tema-nev"></span><span class="tema-leiras"></span><span class="tema-pipa">✓</span>`;
    b.querySelector('.tema-nev').textContent = t.nev;
    b.querySelector('.tema-leiras').textContent = t.leiras;
    b.addEventListener('click', () => { allit(t.id); if (HB.toast) HB.toast(t.nev + ' téma bekapcsolva'); });
    return b;
  }

  function listaDoboz() {
    const d = document.createElement('div');
    d.className = 'tema-lista';
    TEMAK.forEach((t) => d.appendChild(kartya(t)));
    return d;
  }

  // 1) Profil-oldal: rendes „Téma” szakasz a beállítások fölé.
  const profil = document.querySelector('.page-profil');
  if (profil) {
    const cel = Array.from(profil.querySelectorAll('.section')).find((s) => /Beállítások/.test(s.querySelector('h2') ? s.querySelector('h2').textContent : ''));
    const sec = document.createElement('section');
    sec.className = 'section';
    sec.innerHTML = '<h2>Téma</h2><p class="muted small">Válts kedvedre: a beállítás ezen a telefonon marad. Jelenlegi: <b id="tema-jelenlegi"></b></p>';
    sec.appendChild(listaDoboz());
    if (cel) profil.insertBefore(sec, cel); else profil.appendChild(sec);
    const c = document.getElementById('tema-jelenlegi');
    if (c) c.textContent = nevOf(jelenlegi());
  }

  // 2) Lebegő gomb + alsó lap a gyors váltáshoz — a Profil kivételével (ott fent a teljes szakasz).
  if (!document.getElementById('tema-sheet') && !profil) {
    const gomb = document.createElement('button');
    gomb.type = 'button';
    gomb.className = 'tema-gomb';
    gomb.setAttribute('aria-label', 'Téma váltása');
    // Ne takarja az alsó sávot (Megyek-gomb, chat-mező); kapu-módban nincs tab-sáv.
    if (document.body.classList.contains('body-kapu')) gomb.classList.add('lent');
    else if (document.querySelector('.cta-bar, .chat-input')) gomb.classList.add('fent');
    gomb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 2.5-2.5c0-.6-.2-1.1-.6-1.5-.4-.4-.6-.9-.6-1.5A2.5 2.5 0 0 1 15.8 13H17a4 4 0 0 0 4-4c0-3.3-4-6-9-6Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';

    const sheet = document.createElement('div');
    sheet.className = 'sheet hidden';
    sheet.id = 'tema-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Téma választása');
    const bg = document.createElement('div');
    bg.className = 'sheet-backdrop';
    bg.setAttribute('data-close', '');
    const panel = document.createElement('div');
    panel.className = 'sheet-panel';
    panel.innerHTML = '<div class="sheet-grip"></div><h2>Téma</h2><p class="muted">Ugyanaz az app, más ruhában. A választás ezen a telefonon marad.</p>';
    panel.appendChild(listaDoboz());
    const megse = document.createElement('button');
    megse.className = 'btn btn-ghost btn-block';
    megse.type = 'button';
    megse.setAttribute('data-close', '');
    megse.textContent = 'Kész';
    panel.appendChild(megse);
    sheet.appendChild(bg);
    sheet.appendChild(panel);

    gomb.addEventListener('click', () => { sheet.classList.remove('hidden'); document.body.style.overflow = 'hidden'; });
    document.body.appendChild(gomb);
    document.body.appendChild(sheet);
  }
})();
