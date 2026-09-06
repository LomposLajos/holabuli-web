/* Buli-chat kliens: Socket.io szoba az eseményhez, becenév a passzból vagy kérdésre. */
(function () {
  'use strict';
  const HB = window.HB;
  const page = document.querySelector('.page-chat');
  const eventId = page.dataset.event;
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-text');
  const tpl = document.getElementById('msg-sablon');
  const online = document.getElementById('online');
  const nickBox = document.getElementById('chat-nick');
  const nickLabel = document.getElementById('nick-label');

  let nick = HB.nev();
  function showNick() { if (nick) { nickLabel.textContent = nick; nickBox.classList.remove('hidden'); } }
  showNick();

  // Becenév-kérés a lapon belül (nem natív prompt): ígéretet ad vissza, hogy a küldés megvárhassa.
  const nevKero = document.getElementById('nev-kero');
  const nevMezo = document.getElementById('nev-kero-mezo');
  let nevFeloldo = null;
  function kerdNev(alap) {
    nevMezo.value = alap || nick || '';
    nevKero.classList.remove('hidden');
    setTimeout(() => { nevKero.scrollIntoView({ block: 'end', behavior: 'smooth' }); nevMezo.focus(); }, 50);
    return new Promise((resolve) => { nevFeloldo = resolve; });
  }
  function zarNev(ertek) {
    nevKero.classList.add('hidden');
    const f = nevFeloldo; nevFeloldo = null;
    if (f) f(ertek);
  }
  nevKero.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nevMezo.value.trim().slice(0, 40);
    if (!n) return;
    nick = n; HB.setNev(nick); showNick();
    zarNev(nick);
  });
  document.getElementById('nev-kero-megse').addEventListener('click', () => zarNev(null));
  document.getElementById('nick-edit').addEventListener('click', () => kerdNev(nick));

  const hhmm = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const ini = (n) => n.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  function render(m) {
    if (log.querySelector(`[data-id="${m.id}"]`)) return;
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = m.id;
    if (m.hely) node.classList.add('hely');
    if (nick && m.nev === nick && !m.hely) node.classList.add('own');
    node.querySelector('.msg-avatar').textContent = ini(m.nev);
    node.querySelector('.msg-meta b').textContent = m.nev;
    if (m.hely) { const t = document.createElement('span'); t.className = 'tag-hely'; t.textContent = 'Szervező'; node.querySelector('.msg-meta b').after(t); }
    node.querySelector('.msg-meta .muted').textContent = hhmm(m.at);
    node.querySelector('.msg-text').textContent = m.szoveg;
    log.appendChild(node);
    scrollDown();
  }
  function scrollDown() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  // Saját, szerver-renderelt üzenetek jelölése
  if (nick) log.querySelectorAll('.msg').forEach((el) => { const b = el.querySelector('.msg-meta b'); if (b && b.textContent === nick && !el.classList.contains('hely')) el.classList.add('own'); });
  scrollDown();

  // Statikus kirakat: nincs szerver, az üzenetek ezen az eszközön maradnak (static-mode.js adja a helyi chatet).
  if (window.HB_STATIC && window.HBS && window.HBS.chat) {
    const S = window.HBS.chat;
    S.history(eventId).forEach(render);
    online.textContent = '1';
    const note = document.createElement('p');
    note.className = 'muted small center';
    note.style.paddingBottom = '10px';
    note.textContent = 'Bemutató: az üzenetek csak ezen az eszközön látszanak.';
    form.after(note);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const szoveg = input.value.trim();
      if (!szoveg) return;
      if (!nick && !(await kerdNev(''))) return;
      const msg = S.send(eventId, nick, szoveg);
      if (msg) render(msg);
      input.value = '';
      input.focus();
      S.autoReply(eventId, render);
    });
    return;
  }

  if (typeof io !== 'function') { HB.toast('A chat kapcsolat nem elérhető'); return; }
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => socket.emit('join', { eventId }));
  socket.on('history', (arr) => arr.forEach(render));
  socket.on('message', render);
  socket.on('presence', ({ online: n }) => { online.textContent = n; });
  socket.on('disconnect', () => { online.textContent = '–'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const szoveg = input.value.trim();
    if (!szoveg) return;
    if (!nick && !(await kerdNev(''))) return;
    socket.emit('message', { eventId, nev: nick, szoveg });
    input.value = '';
    input.focus();
  });
})();
