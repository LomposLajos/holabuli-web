/* Stat-oldal: 10 s-onkénti frissítés a GET /api/stat/:id JSON-ból (a diagram SVG-jét is a szerver adja). */
(function () {
  'use strict';
  const root = document.getElementById('stat');
  if (!root) return;
  const eventId = root.dataset.event;
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 10000;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function setNum(el, v) {
    if (String(el.textContent) === String(v)) return;
    el.textContent = v;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  let lastUtolso = '';
  function render(d) {
    if (document.getElementById('st-hozott')) setNum($('st-hozott'), d.hozott);
    setNum($('st-megyek'), d.megyek);
    setNum($('st-bent'), d.bent);
    setNum($('st-arany'), d.arany + '%');
    setNum($('st-meghivo'), d.meghivoval);
    $('st-bar').style.width = d.arany + '%';
    $('st-bar-text').textContent = `${d.bent} / ${d.megyek} beléptetve`;
    $('chart-sum').textContent = `${d.bent} belépés`;
    $('chart').innerHTML = d.svg;

    const jut = $('juttatas-lista');
    if (jut && d.juttatasStat) {
      jut.innerHTML = d.juttatasStat.map((j) => `<div class="stat-row"><span class="juttatas-ikon" aria-hidden="true">${esc(j.ikon)}</span><span class="sr-body"><b>${esc(j.nev)}</b><span class="muted small">${j.jogosult} jogosult${j.kinek === 'jegy' ? ' (csak jeggyel)' : ''}</span></span><span class="pill">${j.bevaltva} · ${j.arany}%</span></div>`).join('');
    }

    const top = $('top-lista');
    top.innerHTML = d.top.length
      ? d.top.map((t, i) => `<div class="stat-row"><span class="top-rank ${i === 0 ? 'first' : ''}">${i + 1}</span><span class="sr-body"><b>${esc(t.nev)}</b><span class="muted small">${t.bent} már bent</span></span><span class="pill">${t.db} fő</span></div>`).join('')
      : '<p class="muted stat-ures">Még senki nem hozott vendéget meghívó-linkkel.</p>';

    const key = d.utolso.map((u) => u.at).join('|');
    if (key !== lastUtolso) {
      const first = lastUtolso && d.utolso.length && !lastUtolso.startsWith(d.utolso[0].at) ? d.utolso[0].at : null;
      lastUtolso = key;
      $('utolso-lista').innerHTML = d.utolso.length
        ? d.utolso.map((u) => `<div class="stat-row ${u.at === first ? 'uj' : ''}"><span class="sr-ini">${esc(u.ini)}</span><span class="sr-body"><b>${esc(u.nev)}</b><span class="muted small">${u.kind === 'jegy' ? 'Jegy' : 'Vendéglista'}</span></span><span class="stat-time">${esc(u.ido)}</span></div>`).join('')
        : '<p class="muted stat-ures">Még nem lépett be senki. A kapu-módban olvasott QR-ek itt jelennek meg.</p>';
    }
    $('frissitve').textContent = d.frissitve;
  }

  const live = $('live');
  async function tick() {
    if (document.hidden) return;
    try {
      const r = await fetch(`/api/stat/${encodeURIComponent(eventId)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      render(await r.json());
      live.classList.remove('off');
      live.lastChild.textContent = 'élő';
    } catch {
      live.classList.add('off');
      live.lastChild.textContent = 'offline';
    }
  }
  // Az első kör a szerver-renderelt állapot kulcsát jegyzi meg, hogy az „új sor” kiemelés csak valódi változásra menjen.
  tick();
  setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
})();
