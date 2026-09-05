/* Statikus kirakat (GitHub Pages): szerver nélkül, a telefonon fut minden dinamika.
   - helyi adattár localStorage-ban (a build-be sütött demó-adatból indul)
   - a window.fetch elfogása: az /api/… hívásokat helyben válaszolja meg (kapu, stat, jegyeim, profil kódja változatlan)
   - Megyek-űrlap → önleíró, aláírt QR-token → passz-oldal (#TOKEN); a kapu másik telefonon is olvassa (a név és a buli a kódban van)
   - kapu-szkennelés, stat, chat helyben; admin-mentés csak jelzés
   - dátum-címkék (Ma/Holnap…) újraszámolása, lement bulik elrejtése, kártyák újracsoportosítása
   Ez a fájl az app.js ELŐTT fut (defer sorrend). */
(function () {
  'use strict';
  if (!window.HB_STATIC) return;
  const BASE = window.HB_BASE || '';
  const SEED = window.HB_DATA || { events: [], venues: [], passes: [], scans: [], messages: [], meta: {} };
  const SEED_ID = (SEED.meta && SEED.meta.seededAt) || 'seed';
  const KEY = 'holabuli.static.v1';
  const HBS = (window.HBS = {});

  // ---------- helyi adattár ----------
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || db.seed !== SEED_ID) db = { seed: SEED_ID, passes: [], scanned: {}, scans: [], messages: [], kiemelt: {} };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* privát mód */ } }

  const events = SEED.events || [];
  const venues = SEED.venues || [];
  const evById = (id) => events.find((e) => e.id === id) || null;
  const venueById = (id) => venues.find((v) => v.id === id) || null;
  const evByKapu = (t) => events.find((e) => e.kapuToken === t) || null;

  // ---------- magyar formázók (a lib/format.js kliens-oldali párja) ----------
  const NAPOK = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  const HONAPOK = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
  const pad = (n) => String(n).padStart(2, '0');
  const d = (x) => (x instanceof Date ? x : new Date(x));
  function dayDiff(iso) { const dt = d(iso), now = new Date(); const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); return Math.round((b - a) / 86400000); }
  const hhmm = (iso) => { const dt = d(iso); return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; };
  function dayLabel(iso) { const diff = dayDiff(iso), dt = d(iso); if (diff === 0) return 'Ma'; if (diff === 1) return 'Holnap'; if (diff > 1 && diff < 7) return NAPOK[dt.getDay()]; return `${HONAPOK[dt.getMonth()]} ${dt.getDate()}.`; }
  const when = (iso) => `${dayLabel(iso)} · ${hhmm(iso)}`;
  const longDate = (iso) => { const dt = d(iso); return `${NAPOK[dt.getDay()]}, ${HONAPOK[dt.getMonth()]} ${dt.getDate()}. · ${hhmm(iso)}`; };
  function group(iso) { const diff = dayDiff(iso); if (diff <= 0) return 'Ma'; if (diff === 1) return 'Holnap'; if (diff < 7) return 'Ezen a héten'; return 'Később'; }
  const GROUPS = ['Ma', 'Holnap', 'Ezen a héten', 'Később'];
  const huf = (n) => new Intl.NumberFormat('hu-HU').format(Math.round(n || 0)) + ' Ft';
  const price = (ev) => (!ev.ar ? (ev.ingyenEddig ? `Ingyen ${ev.ingyenEddig}-ig, utána ${huf(ev.arUtana)}` : 'Ingyenes') : huf(ev.ar));
  const isPast = (iso) => d(iso).getTime() < Date.now() - 6 * 3600 * 1000;
  const initials = (n) => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase() : '?'; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const GENRE_NEV = { techno: 'Techno', house: 'House', retro: 'Retro', hiphop: 'Hip-hop', latin: 'Latin', indie: 'Indie / rock', egyetemi: 'Egyetemi buli', dnb: 'Drum & bass' };

  // ---------- önleíró passz-token: hs.<payload>.<aláírás> ----------
  // A payload-ban a név és a buli is benne van, ezért egy MÁSIK telefon kapu-módja is tudja, kit enged be.
  function b64u(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { try { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return null; } }
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  function tokenOf(p) { const payload = b64u(JSON.stringify({ i: p.id, e: p.eventId, n: p.nev, k: p.kind || 'vendeglista', t: p.createdAt, r: p.ref || null })); return `hs.${payload}.${fnv(payload + '|holabuli-static')}`; }
  function decode(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'hs') return null;
    if (fnv(parts[1] + '|holabuli-static') !== parts[2]) return null;
    const raw = unb64u(parts[1]);
    if (!raw) return null;
    try { const o = JSON.parse(raw); return { id: o.i, eventId: o.e, nev: o.n, kind: o.k || 'vendeglista', createdAt: o.t, ref: o.r || null }; } catch { return null; }
  }
  // A sütött demó-adatban 7 passz már „bent” van: azt meg kell tartani, különben a stat nullázódik.
  function status(p) { return db.scanned[p.id] ? 'scanned' : (p.status || 'issued'); }
  function scannedAt(p) { return db.scanned[p.id] || p.scannedAt || null; }
  // Minden passz egy bulihoz: sütött demó + saját eszközön kért + a kapunál beolvasott idegen passzok.
  function passesOf(eventId) {
    const seen = new Set();
    const out = [];
    for (const p of [...(SEED.passes || []), ...db.passes]) {
      if (p.eventId !== eventId || p.status === 'void' || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ ...p, status: status(p), scannedAt: scannedAt(p) });
    }
    return out;
  }
  function allapot(eventId) { const ps = passesOf(eventId); return { megyek: ps.length, bent: ps.filter((p) => p.status === 'scanned').length }; }
  const newId = (pre) => pre + Math.random().toString(36).slice(2, 10);

  HBS.issuePass = function ({ eventId, nev, kapcsolat, ref }) {
    const p = { id: newId('p_'), eventId, nev: String(nev || '').trim().slice(0, 60), kapcsolat: String(kapcsolat || '').trim().slice(0, 80), ref: ref || null, kind: 'vendeglista', status: 'issued', createdAt: new Date().toISOString(), scannedAt: null };
    db.passes.push(p); save();
    return { pass: p, token: tokenOf(p) };
  };
  // Beolvasáskor az idegen passzt is felvesszük a helyi listába (hogy a stat és a kézi kereső lássa).
  function rememberForeign(pd) {
    if (!db.passes.some((p) => p.id === pd.id) && !(SEED.passes || []).some((p) => p.id === pd.id)) {
      db.passes.push({ id: pd.id, eventId: pd.eventId, nev: pd.nev, kapcsolat: '', ref: pd.ref, kind: pd.kind, status: 'issued', createdAt: pd.createdAt || new Date().toISOString(), scannedAt: null, foreign: true });
    }
  }
  function scan(token, eventId) {
    const pd = decode(token);
    const now = new Date().toISOString();
    if (!pd) return { ok: false, reason: 'format', nev: null, kind: null, scannedAt: null, allapot: allapot(eventId) };
    if (pd.eventId !== eventId) return { ok: false, reason: 'wrong_event', nev: pd.nev, kind: pd.kind, scannedAt: null, allapot: allapot(eventId) };
    if (db.scanned[pd.id]) return { ok: false, reason: 'duplicate', nev: pd.nev, kind: pd.kind, scannedAt: db.scanned[pd.id], allapot: allapot(eventId) };
    rememberForeign(pd);
    db.scanned[pd.id] = now;
    db.scans.push({ id: newId('s_'), eventId, passId: pd.id, result: 'ok', at: now });
    save();
    return { ok: true, reason: null, nev: pd.nev, kind: pd.kind, scannedAt: now, allapot: allapot(eventId) };
  }

  // ---------- stat (a routes/kapu.js statData párja) ----------
  const HOUR = 3600 * 1000;
  const hourStart = (x) => { const t = new Date(x); t.setMinutes(0, 0, 0); return t; };
  function buckets(ev, okScans) {
    const now = new Date(), kezdes = new Date(ev.kezdes);
    const first = okScans.length ? new Date(okScans[0].at) : null, last = okScans.length ? new Date(okScans[okScans.length - 1].at) : null;
    let from = hourStart(first && first < kezdes ? first : kezdes);
    let toCand = Math.min(now.getTime(), kezdes.getTime() + 8 * HOUR);
    if (last && last.getTime() > toCand) toCand = last.getTime();
    let to = hourStart(toCand);
    if (to < from) to = new Date(from);
    if (to - from < 5 * HOUR) to = new Date(from.getTime() + 5 * HOUR);
    if (to - from > 13 * HOUR) from = new Date(to.getTime() - 13 * HOUR);
    const nowH = hourStart(now).getTime();
    const out = [];
    for (let t = from.getTime(); t <= to.getTime(); t += HOUR) { const x = new Date(t); out.push({ start: x.toISOString(), label: pad(x.getHours()), labelNext: pad((x.getHours() + 1) % 24), db: 0, most: t === nowH }); }
    for (const s of okScans) { const t = hourStart(s.at).getTime(); const b = out.find((x) => new Date(x.start).getTime() === t); if (b) b.db++; }
    return out;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function chartSvg(bk) {
    const W = 360, H = 172, L = 28, R = 8, T = 24, B = 28, pw = W - L - R, ph = H - T - B, n = bk.length || 1, band = pw / n, bw = Math.min(24, Math.floor(band * 0.62));
    const max = Math.max(1, ...bk.map((b) => b.db)), y0 = T + ph, yOf = (v) => T + ph - (v / max) * ph, f = (x) => Number(x).toFixed(1);
    const nonzero = bk.filter((b) => b.db > 0).length, labelAll = nonzero <= 6, maxIdx = bk.reduce((m, b, i) => (b.db > bk[m].db ? i : m), 0);
    let lastIdx = -1; bk.forEach((b, i) => { if (b.db > 0) lastIdx = i; });
    const step = n > 9 ? 2 : 1, grid = [0, max]; if (max >= 4) grid.push(Math.round(max / 2));
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Belépések óránként" font-family="Inter, 'Segoe UI', system-ui, sans-serif">`;
    grid.forEach((v) => { const y = f(yOf(v)); out += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y}" dy="4" text-anchor="end" font-size="11" fill="var(--faint)" style="font-variant-numeric:tabular-nums">${v}</text>`; });
    bk.forEach((b, i) => {
      const bx = L + band * i, cx = bx + band / 2, x = cx - bw / 2, h = b.db ? Math.max(3, (b.db / max) * ph) : 0, y = y0 - h, r = Math.min(4, h / 2, bw / 2);
      out += `<g><title>${esc(`${b.label}:00–${b.labelNext}:00 · ${b.db} belépés`)}</title><rect x="${f(bx)}" y="${T}" width="${f(band)}" height="${ph}" fill="transparent"/>`;
      out += h ? `<path d="M${f(x)},${y0} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} H${f(x + bw - r)} Q${f(x + bw)},${f(y)} ${f(x + bw)},${f(y + r)} V${y0} Z" fill="var(--brand)"/>` : `<rect x="${f(x)}" y="${y0 - 2}" width="${bw}" height="2" fill="var(--surface-2)"/>`;
      if (b.db && (labelAll || i === maxIdx || i === lastIdx)) out += `<text x="${f(cx)}" y="${f(y - 7)}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">${b.db}</text>`;
      if (i % step === 0 || b.most) out += `<text x="${f(cx)}" y="${H - 9}" text-anchor="middle" font-size="11" font-weight="${b.most ? 800 : 500}" fill="${b.most ? 'var(--text)' : 'var(--muted)'}">${b.label}</text>`;
      out += '</g>';
    });
    return out + '</svg>';
  }
  function statData(ev) {
    const ps = passesOf(ev.id);
    const byId = Object.fromEntries(ps.map((p) => [p.id, p]));
    const megyek = ps.length, bent = ps.filter((p) => p.status === 'scanned').length;
    const okScans = [...(SEED.scans || []), ...db.scans].filter((s) => s.eventId === ev.id && s.result === 'ok' && s.passId && byId[s.passId]).sort((a, b) => new Date(a.at) - new Date(b.at));
    const refCount = {}; ps.forEach((p) => { if (p.ref) refCount[p.ref] = (refCount[p.ref] || 0) + 1; });
    const top = Object.entries(refCount).map(([id, n]) => ({ id, nev: byId[id] ? byId[id].nev : 'Ismeretlen meghívó', db: n, bent: ps.filter((p) => p.ref === id && p.status === 'scanned').length })).sort((a, b) => b.db - a.db || b.bent - a.bent).slice(0, 5);
    const utolso = okScans.slice(-10).reverse().map((s) => { const p = byId[s.passId]; return { nev: p ? p.nev : 'Ismeretlen', ini: initials(p ? p.nev : '?'), ido: hhmm(s.at), at: s.at, kind: p ? p.kind : 'vendeglista' }; });
    const bk = buckets(ev, okScans);
    const nw = new Date();
    return { eventId: ev.id, megyek, bent, arany: megyek ? Math.round((bent / megyek) * 100) : 0, meghivoval: ps.filter((p) => p.ref).length, buckets: bk, svg: chartSvg(bk), top, utolso, frissitve: `${pad(nw.getHours())}:${pad(nw.getMinutes())}:${pad(nw.getSeconds())}` };
  }

  // ---------- chat helyben ----------
  HBS.chat = {
    history(eventId) { return [...(SEED.messages || []), ...db.messages].filter((m) => m.eventId === eventId).slice(-60); },
    send(eventId, nev, szoveg) { const m = { id: newId('m_'), eventId, nev: String(nev || 'Vendég').slice(0, 40), szoveg: String(szoveg || '').trim().slice(0, 280), hely: false, at: new Date().toISOString() }; if (!m.szoveg) return null; db.messages.push(m); save(); return m; },
    autoReply(eventId, render) {
      if (db.messages.some((m) => m.eventId === eventId && m.hely)) return;
      const ev = evById(eventId), v = ev && venueById(ev.venueId);
      setTimeout(() => { const m = { id: newId('m_'), eventId, nev: v ? v.nev : 'Szervező', szoveg: 'Köszi, felírtuk! A QR-passzt a kapuban mutassátok, este találkozunk. 🎧', hely: true, at: new Date().toISOString() }; db.messages.push(m); save(); render(m); }, 1500);
    },
  };

  // ---------- fetch-elfogás: az /api/… hívások helyben ----------
  const realFetch = window.fetch.bind(window);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  function stripBase(p) { return BASE && p.startsWith(BASE) ? p.slice(BASE.length) : p; }
  async function local(path, params, init) {
    let m;
    if (path === '/api/verzio') return json({ build: window.HB_BUILD || 'static', name: 'Holabuli', static: true });
    if (path === '/api/events') return json(events.filter((e) => !isPast(e.kezdes)).map((e) => ({ id: e.id, cim: e.cim, kezdes: e.kezdes, mufaj: e.mufaj, stilusok: e.stilusok, ar: e.ar, kiemelt: e.kiemelt, hely: (venueById(e.venueId) || {}).nev || '', going: allapot(e.id).megyek })));
    if ((m = path.match(/^\/api\/pass\/(.+)$/))) {
      const pd = decode(decodeURIComponent(m[1]));
      if (!pd) return json({ ok: false }, 404);
      const ev = evById(pd.eventId); if (!ev) return json({ ok: false }, 404);
      const v = venueById(ev.venueId);
      const p = passesOf(ev.id).find((x) => x.id === pd.id) || { ...pd, status: status(pd), scannedAt: scannedAt(pd) };
      return json({ ok: true, pass: { id: pd.id, nev: pd.nev, status: db.scanned[pd.id] ? 'scanned' : (p.status || 'issued'), createdAt: pd.createdAt, scannedAt: db.scanned[pd.id] || null }, event: { id: ev.id, cim: ev.cim, kezdes: ev.kezdes, mufaj: ev.mufaj, ar: ev.ar, korhatar: ev.korhatar, when: when(ev.kezdes), longDate: longDate(ev.kezdes), price: price(ev), past: isPast(ev.kezdes) }, venue: v && { id: v.id, nev: v.nev, kerulet: v.kerulet }, token: decodeURIComponent(m[1]) });
    }
    if ((m = path.match(/^\/api\/kapu\/([^/]+)\/allapot$/))) { const ev = evByKapu(decodeURIComponent(m[1])); return ev ? json({ ok: true, ...allapot(ev.id) }) : json({ ok: false, reason: 'unknown_kapu' }, 404); }
    if ((m = path.match(/^\/api\/kapu\/([^/]+)\/kereses$/))) {
      const ev = evByKapu(decodeURIComponent(m[1])); if (!ev) return json({ ok: false, reason: 'unknown_kapu' }, 404);
      const q = norm(params.get('q') || '').slice(0, 60);
      let list = passesOf(ev.id);
      if (q) { list = list.filter((p) => norm(p.nev).includes(q)); list.sort((a, b) => (a.status === 'scanned') - (b.status === 'scanned') || a.nev.localeCompare(b.nev, 'hu')); }
      else list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ ok: true, q, osszes: list.length, talalatok: list.slice(0, 20).map((p) => ({ id: p.id, nev: p.nev, kind: p.kind, status: p.status, scannedAt: p.scannedAt, token: tokenOf(p) })) });
    }
    if (path === '/api/scan') {
      let body = {}; try { body = JSON.parse((init && init.body) || '{}'); } catch { /* */ }
      if (typeof body.token !== 'string' || typeof body.eventId !== 'string' || !evById(body.eventId)) return json({ ok: false, reason: 'format' }, 400);
      const mm = body.token.match(/\/p\/(?:\?[^#]*#|#|\?t=)?([A-Za-z0-9_.-]+)/);
      return json(scan(mm ? mm[1] : body.token.trim(), body.eventId));
    }
    if ((m = path.match(/^\/api\/stat\/(.+)$/))) { const ev = evById(decodeURIComponent(m[1])); return ev ? json({ ok: true, ...statData(ev) }) : json({ ok: false, reason: 'unknown_event' }, 404); }
    if (path.startsWith('/admin')) { setTimeout(() => window.HB && window.HB.toast && window.HB.toast('Bemutató: a mentés csak ezen az eszközön'), 50); return json({ ok: true, static: true }); }
    return null;
  }
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input.url;
      const u = new URL(url, location.href);
      if (u.origin === location.origin) {
        const path = stripBase(u.pathname);
        if (path.startsWith('/api/') || path.startsWith('/admin') || path === '/megyek') {
          const r = local(path, u.searchParams, init);
          if (r) return r;
        }
      }
    } catch { /* eredeti fetch */ }
    return realFetch(input, init);
  };

  // ---------- űrlapok: Megyek → passz; admin → jelzés ----------
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    const action = stripBase(new URL(f.getAttribute('action') || location.href, location.href).pathname);
    if (action === '/megyek') {
      e.preventDefault();
      const fd = new FormData(f);
      if (fd.get('weboldal')) return;
      const nev = String(fd.get('nev') || '').trim(), k = String(fd.get('kapcsolat') || '').trim();
      const okK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(k) || k.replace(/\D/g, '').length >= 7;
      if (nev.length < 2 || !okK) { window.HB && HB.toast('Név és e-mail vagy telefonszám kell.'); return; }
      const { token } = HBS.issuePass({ eventId: fd.get('eventId'), nev, kapcsolat: k, ref: fd.get('ref') || null });
      location.href = `${BASE}/p/?uj=1#${token}`;
      return;
    }
    if (action.startsWith('/admin')) {
      e.preventDefault();
      if (f.dataset.confirm && !confirm(f.dataset.confirm)) return;
      if (action.endsWith('/kiemelt')) { const b = f.querySelector('button'); if (b) { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.textContent = (on ? '★' : '☆') + ' Kiemelt'; } }
      window.HB && HB.toast('Bemutató: a mentés csak ezen az eszközön látszik');
    }
  }, true);

  // ---------- statikus passz-oldal (#TOKEN) ----------
  function fillPassPage() {
    const root = document.getElementById('pass-static');
    if (!root) return;
    const token = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const pd = decode(token);
    const $ = (id) => document.getElementById(id);
    if (!pd || !evById(pd.eventId)) { $('ps-ticket').classList.add('hidden'); document.querySelector('.invite').classList.add('hidden'); $('ps-hiba').classList.remove('hidden'); return; }
    const ev = evById(pd.eventId), v = venueById(ev.venueId);
    root.dataset.token = token; root.dataset.event = ev.id; root.dataset.nev = pd.nev; // az app.js ebből menti a Jegyeimbe
    if (new URLSearchParams(location.search).get('uj') === '1') { $('ps-hooray').textContent = `🎉 Rajta vagy a listán, ${pd.nev.split(' ')[0]}!`; $('ps-hooray').classList.remove('hidden'); }
    $('ps-genre').textContent = (GENRE_NEV[ev.mufaj] || ev.mufaj || '').toUpperCase();
    $('ps-cim').textContent = ev.cim;
    $('ps-date').textContent = longDate(ev.kezdes);
    $('ps-venue').textContent = v ? `${v.nev} · ${v.kerulet} kerület` : '';
    $('ps-nev').textContent = pd.nev;
    $('ps-kind').textContent = `${pd.kind === 'jegy' ? 'Jegy' : 'Vendéglista'} · ${price(ev)} · ${ev.korhatar}+`;
    $('ps-id').textContent = `Passz-azonosító: ${pd.id}`;
    const passUrl = `${location.origin}${BASE}/p/#${token}`;
    const invite = `${location.origin}${BASE}/e/${ev.id}/?ref=${pd.id}`;
    $('ps-invite').value = invite; $('ps-copy').dataset.copy = invite;
    $('ps-invite-share').dataset.shareTitle = `Gyere velem: ${ev.cim}`; $('ps-invite-share').dataset.shareText = `${longDate(ev.kezdes)} · ${v ? v.nev : ''} – itt a lista:`; $('ps-invite-share').dataset.shareUrl = invite;
    $('ps-share').dataset.shareText = `${ev.cim} · ${longDate(ev.kezdes)}`; $('ps-share').dataset.shareUrl = passUrl;
    $('ps-chat').href = `${BASE}/chat/${ev.id}/`; $('ps-event').href = `${BASE}/e/${ev.id}/`;
    if (db.scanned[pd.id]) { $('ps-ticket').classList.add('used'); $('ps-hint').outerHTML = `<div class="stamp">BELÉPETT · ${hhmm(db.scanned[pd.id])}</div>`; }
    try {
      const q = window.qrcode(0, 'M'); q.addData(passUrl); q.make();
      $('ps-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { $('ps-qr').textContent = 'QR nem rajzolható: ' + e.message; }
  }

  // ---------- dátum-címkék, lement bulik, újracsoportosítás ----------
  function relabel() {
    document.querySelectorAll('time[datetime][data-fmt]').forEach((t) => {
      const iso = t.getAttribute('datetime'), f = t.dataset.fmt;
      t.textContent = f === 'long' ? longDate(iso) : f === 'day' ? dayLabel(iso) : when(iso);
    });
    document.querySelectorAll('[data-kezdes]').forEach((c) => {
      const iso = c.dataset.kezdes;
      c.dataset.ma = dayDiff(iso) <= 0 ? '1' : '0';
      if (isPast(iso)) c.remove();
    });
    // Főoldali csoportok újraosztása a mai naphoz.
    const groups = Array.from(document.querySelectorAll('.list-group'));
    if (groups.length) {
      const parent = groups[0].parentNode, anchor = groups[groups.length - 1].nextSibling;
      const cards = groups.flatMap((g) => Array.from(g.querySelectorAll('.card-poster[data-kezdes]')));
      const byGroup = {};
      cards.forEach((c) => { (byGroup[group(c.dataset.kezdes)] = byGroup[group(c.dataset.kezdes)] || []).push(c); });
      groups.forEach((g) => g.remove());
      GROUPS.forEach((name) => {
        if (!byGroup[name]) return;
        const sec = document.createElement('section'); sec.className = 'section list-group'; sec.dataset.group = name;
        const h = document.createElement('h2'); h.className = 'group-title'; h.textContent = name;
        const grid = document.createElement('div'); grid.className = 'grid';
        byGroup[name].sort((a, b) => new Date(a.dataset.kezdes) - new Date(b.dataset.kezdes)).forEach((c) => grid.appendChild(c));
        sec.appendChild(h); sec.appendChild(grid); parent.insertBefore(sec, anchor);
      });
      const top = document.getElementById('heti-top-szekcio');
      if (top && !top.querySelector('.card-poster')) top.remove();
    }
    document.querySelectorAll('.top-list .top-row').forEach((r, i) => { const rank = r.querySelector('.top-rank'); if (rank) rank.textContent = i + 1; });
  }

  // ---------- admin: bemutató-nézet jelzés ----------
  function adminNote() {
    if (!location.pathname.replace(BASE, '').startsWith('/admin')) return;
    const h = document.querySelector('.topbar');
    if (!h) return;
    const n = document.createElement('div'); n.className = 'alert'; n.style.marginTop = '10px';
    n.textContent = 'Bemutató-nézet: az admin itt megtekinthető, a mentések csak ezen az eszközön látszanak (nincs szerver).';
    h.appendChild(n);
  }

  // FONTOS: azonnal futunk (defer-sorrend: static-mode.js → app.js → DOMContentLoaded), hogy a passz-oldal
  // data-nev/data-token attribútuma már kész legyen, amikor az app.js elmenti a Jegyeimbe és a becenevet.
  // (Enélkül a chat névre kérdez egy blokkoló ablakban.)
  function init() { relabel(); fillPassPage(); adminNote(); }
  if (document.readyState === 'loading' && !document.getElementById('pass-static')) document.addEventListener('DOMContentLoaded', init);
  else init();
})();
