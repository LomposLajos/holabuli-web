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

  // ---------- Tiszta lap a bemutató előtt ----------
  // A statikus kirakat minden adata a LÁTOGATÓ böngészőjében él (jegyek, beolvasások, chat,
  // választott megjelenés). A `?reset=1` ezt törli, és visszavisz a friss főoldalra.
  try {
    if (/[?&]reset=1(&|$)/.test(location.search)) {
      ['holabuli.static.v1', 'holabuli.passes', 'holabuli.nev', 'holabuli.meghivo', 'holabuli.demoProfil', 'holabuli.dizajn'].forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* privát mód */ }
      });
      try { sessionStorage.clear(); } catch { /* privát mód */ }
      location.replace(BASE + '/');
      return;
    }
  } catch { /* privát mód: nincs mit törölni */ }
  const SEED = window.HB_DATA || { events: [], venues: [], passes: [], scans: [], messages: [], meta: {} };
  const SEED_ID = (SEED.meta && SEED.meta.seededAt) || 'seed';
  const KEY = 'holabuli.static.v1';
  const HBS = (window.HBS = {});

  // ---------- helyi adattár ----------
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  // ⚠️ Új build NEM dobja el a látogató saját jegyeit: a buli-azonosítók (e_<slug>) buildek közt
  // állandók, tehát a helyi adat érvényes marad. Korábban minden publikálás némán kiürítette.
  if (!db) db = { seed: SEED_ID, passes: [], scanned: {}, scans: [], messages: [], kiemelt: {} };
  else { db.seed = SEED_ID; db.passes = db.passes || []; db.scanned = db.scanned || {}; db.scans = db.scans || []; db.messages = db.messages || []; db.kiemelt = db.kiemelt || {}; }
  db.bevaltva = db.bevaltva || {}; // passzId → { juttatasId: időpont } — a helyi beváltások
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
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const keresztnev = (n) => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length ? p[p.length - 1] : ''; };
  // A jegytípusok a buli adatába vannak sütve (lib/jegy.js), így itt csak olvasni kell őket.
  const tipusokOf = (ev) => (Array.isArray(ev.jegytipusok) && ev.jegytipusok.length ? ev.jegytipusok : [{ id: 'vendeglista', nev: 'Vendéglista', ar: ev.ar || 0, leiras: '' }]);
  function rendelesBol(ev, s) {
    const out = [];
    String(s || '').split(',').slice(0, 6).forEach((resz) => {
      const [id, dbs] = String(resz).split(':');
      const t = tipusokOf(ev).find((x) => x.id === String(id || '').trim());
      const n = Math.min(10, Math.max(0, parseInt(dbs, 10) || 0));
      if (t && n > 0 && !out.some((x) => x.tipusId === t.id)) out.push({ tipusId: t.id, nev: t.nev, ar: t.ar || 0, db: n });
    });
    return out;
  }
  const osszegOf = (t) => (t || []).reduce((s, x) => s + (x.ar || 0) * (x.db || 0), 0);
  const darabOf = (t) => (t || []).reduce((s, x) => s + (x.db || 0), 0);
  const tetelSor = (t) => (t || []).map((x) => `${x.db}× ${x.nev}`).join(', ');

  // ---------- juttatások (a lib/juttatas.js kliens-oldali párja) ----------
  const juttatasaiEv = (ev) => (ev && Array.isArray(ev.juttatasok) ? ev.juttatasok : []);
  const vanJuttatas = (ev) => juttatasaiEv(ev).length > 0;
  function juttatasAllapot(ev, p) {
    const jegyes = p && p.kind === 'jegy';
    const helyi = (p && db.bevaltva[p.id]) || {};
    const sutott = (p && p.bevaltva) || {};
    return juttatasaiEv(ev)
      .filter((j) => j.kinek !== 'jegy' || jegyes)
      .map((j) => ({ ...j, bevaltva: helyi[j.id] || sutott[j.id] || null }));
  }
  function bevalt(passId, eventId, juttatasId) {
    const ev = evById(eventId);
    const p = passesOf(eventId).find((x) => x.id === passId);
    if (!ev || !p) return { ok: false, reason: 'unknown', juttatasok: [] };
    const jaro = juttatasAllapot(ev, p).find((j) => j.id === juttatasId);
    if (!jaro) return { ok: false, reason: 'nem_jar', juttatasok: juttatasAllapot(ev, p) };
    if (jaro.bevaltva) return { ok: false, reason: 'mar_bevaltva', at: jaro.bevaltva, juttatasok: juttatasAllapot(ev, p) };
    db.bevaltva[passId] = db.bevaltva[passId] || {};
    db.bevaltva[passId][juttatasId] = new Date().toISOString();
    save();
    return { ok: true, at: db.bevaltva[passId][juttatasId], juttatasok: juttatasAllapot(ev, p) };
  }
  const GENRE_NEV = { techno: 'Techno', house: 'House', retro: 'Retro', hiphop: 'Hip-hop', latin: 'Latin', indie: 'Indie / rock', egyetemi: 'Egyetemi buli', dnb: 'Drum & bass' };

  // ---------- önleíró passz-token: hs.<payload>.<aláírás> ----------
  // A payload-ban a név és a buli is benne van, ezért egy MÁSIK telefon kapu-módja is tudja, kit enged be.
  function b64u(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { try { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return null; } }
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  // A payloadban a fő-szám (f) és a sorszám (s) is utazik, hogy a MÁSIK telefon kapu-módja
  // ki tudja írni, hány embert enged be ez az egy jegy.
  function tokenOf(p) { const payload = b64u(JSON.stringify({ i: p.id, e: p.eventId, n: p.nev, k: p.kind || 'vendeglista', t: p.createdAt, r: p.ref || null, f: p.fo || 1, s: p.sorszam || '' })); return `hs.${payload}.${fnv(payload + '|holabuli-static')}`; }
  function decode(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'hs') return null;
    if (fnv(parts[1] + '|holabuli-static') !== parts[2]) return null;
    const raw = unb64u(parts[1]);
    if (!raw) return null;
    try { const o = JSON.parse(raw); return { id: o.i, eventId: o.e, nev: o.n, kind: o.k || 'vendeglista', createdAt: o.t, ref: o.r || null, fo: o.f || 1, sorszam: o.s || '' }; } catch { return null; }
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

  HBS.issuePass = function ({ eventId, nev, kapcsolat, ref, tetelek, kind }) {
    const items = (tetelek || []).filter((t) => t && t.db > 0);
    const amountHuf = osszegOf(items);
    const id = newId('p_');
    const rsvp = kind === 'megyek';
    const p = {
      id, eventId,
      nev: String(nev || '').trim().slice(0, 60),
      kapcsolat: String(kapcsolat || '').trim().slice(0, 80),
      ref: ref || null,
      kind: rsvp ? 'megyek' : 'jegy',
      tetelek: items, fo: darabOf(items) || 1,
      sorszam: rsvp ? null : 'HB-' + id.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-4),
      amountHuf, bevaltva: {},
      status: 'issued', createdAt: new Date().toISOString(), scannedAt: null,
    };
    db.passes.push(p); save();
    return { pass: p, token: tokenOf(p) };
  };
  // Beolvasáskor az idegen passzt is felvesszük a helyi listába (hogy a stat és a kézi kereső lássa).
  function rememberForeign(pd) {
    if (!db.passes.some((p) => p.id === pd.id) && !(SEED.passes || []).some((p) => p.id === pd.id)) {
      db.passes.push({ id: pd.id, eventId: pd.eventId, nev: pd.nev, kapcsolat: '', ref: pd.ref, kind: pd.kind, fo: pd.fo || 1, sorszam: pd.sorszam || '', tetelek: [], amountHuf: 0, status: 'issued', createdAt: pd.createdAt || new Date().toISOString(), scannedAt: null, foreign: true });
    }
  }
  function scan(token, eventId) {
    const pd = decode(token);
    const now = new Date().toISOString();
    if (!pd) return { ok: false, reason: 'format', nev: null, kind: null, fo: null, scannedAt: null, allapot: allapot(eventId) };
    if (pd.eventId !== eventId) return { ok: false, reason: 'wrong_event', nev: pd.nev, kind: pd.kind, fo: pd.fo || 1, scannedAt: null, allapot: allapot(eventId) };
    const ev = evById(eventId);
    // „Megyek” nem jegy — de ha van juttatás, a beolvasásnak VAN értelme (beváltás).
    if (pd.kind === 'megyek' && !vanJuttatas(ev)) return { ok: false, reason: 'nem_jegy', nev: pd.nev, kind: pd.kind, fo: 1, scannedAt: null, allapot: allapot(eventId) };
    const jut = () => juttatasAllapot(ev, passesOf(eventId).find((x) => x.id === pd.id) || pd);
    if (db.scanned[pd.id]) return { ok: false, reason: 'duplicate', nev: pd.nev, kind: pd.kind, fo: pd.fo || 1, scannedAt: db.scanned[pd.id], passId: pd.id, juttatasok: jut(), allapot: allapot(eventId) };
    rememberForeign(pd);
    db.scanned[pd.id] = now;
    db.scans.push({ id: newId('s_'), eventId, passId: pd.id, result: 'ok', at: now });
    save();
    return { ok: true, reason: null, nev: pd.nev, kind: pd.kind, fo: pd.fo || 1, sorszam: pd.sorszam || null, scannedAt: now, passId: pd.id, juttatasok: jut(), allapot: allapot(eventId) };
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
    // Juttatás-beváltás (a routes/kapu.js statData párja)
    const juttatasStat = juttatasaiEv(ev).map((j) => {
      const jogosult = ps.filter((p) => j.kinek !== 'jegy' || p.kind === 'jegy');
      const bev = jogosult.filter((p) => juttatasAllapot(ev, p).some((x) => x.id === j.id && x.bevaltva)).length;
      return { ...j, jogosult: jogosult.length, bevaltva: bev, arany: jogosult.length ? Math.round((bev / jogosult.length) * 100) : 0 };
    });
    return { eventId: ev.id, megyek, bent, arany: megyek ? Math.round((bent / megyek) * 100) : 0, meghivoval: ps.filter((p) => p.ref).length, buckets: bk, svg: chartSvg(bk), top, utolso, juttatasStat, frissitve: `${pad(nw.getHours())}:${pad(nw.getMinutes())}:${pad(nw.getSeconds())}` };
  }

  // ---------- chat helyben ----------
  HBS.chat = {
    history(eventId) { return [...(SEED.messages || []), ...db.messages].filter((m) => m.eventId === eventId).slice(-60); },
    send(eventId, nev, szoveg) { const m = { id: newId('m_'), eventId, nev: String(nev || 'Vendég').slice(0, 40), szoveg: String(szoveg || '').trim().slice(0, 280), hely: false, at: new Date().toISOString() }; if (!m.szoveg) return null; db.messages.push(m); save(); return m; },
    autoReply(eventId, render) {
      if (db.messages.some((m) => m.eventId === eventId && m.hely)) return;
      const ev = evById(eventId), v = ev && venueById(ev.venueId);
      setTimeout(() => { const m = { id: newId('m_'), eventId, nev: v ? v.nev : 'Szervező', szoveg: 'Köszi, felírtuk! A jegyet a bejáratnál mutassátok, este találkozunk. 🎧', hely: true, at: new Date().toISOString() }; db.messages.push(m); save(); render(m); }, 1500);
    },
  };

  // ---------- link-beolvasás példák (valódi oldalakról kiolvasva, a szerver nélküli bemutatóhoz) ----------
  const LINK_PELDAK = {
    'tixa.hu/jhz260907': {
      url: 'https://www.tixa.hu/jhz260907', talaltEsemeny: true,
      mezok: { cim: 'Hétfői társasozás a Dürer Kertben // Játszóház Projekt', kezdes: '2026-09-07T17:00', helyNev: 'Dürer Kert', helyCim: '1117 Budapest Öböl utca 1.', ar: '1000', korhatar: '16', kepUrl: 'https://www.tixa.hu/kepek/0045/45057-1_20260831223227.jpg' },
      forras: { cim: 'JSON-LD', kezdes: 'az oldalon kiírt időpont', helyNev: 'JSON-LD', helyCim: 'JSON-LD', ar: 'JSON-LD (2 jegytípus, a legolcsóbb)', korhatar: 'JSON-LD', kepUrl: 'JSON-LD' },
      hianyzo: ['mufaj', 'leiras'], hely: { allapot: 'nincs', nev: 'Dürer Kert', cim: '1117 Budapest Öböl utca 1.' },
    },
    'cooltix.hu/event/6957970ee341f7d6129ff8bb': {
      url: 'https://cooltix.hu/event/6957970ee341f7d6129ff8bb', talaltEsemeny: true,
      mezok: { cim: 'NECC PARTY @ NagyHall 2026.01.31.', kezdes: '2026-01-31T23:30', helyNev: 'Akvárium Klub', helyCim: '1051 Budapest Erzsébet tér 12', kepUrl: 'https://images.cdn.cooltix.com/4c86c621bc684d77a4f9f7ed8827b63c.png' },
      forras: { cim: 'JSON-LD', kezdes: 'az oldalon kiírt időpont', helyNev: 'JSON-LD', helyCim: 'JSON-LD', kepUrl: 'JSON-LD' },
      hianyzo: ['ar', 'mufaj', 'leiras'], hely: { allapot: 'nincs', nev: 'Akvárium Klub', cim: '1051 Budapest Erzsébet tér 12' },
    },
  };

  // ---------- fetch-elfogás: az /api/… hívások helyben ----------
  const realFetch = window.fetch.bind(window);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  function stripBase(p) { return BASE && p.startsWith(BASE) ? p.slice(BASE.length) : p; }
  async function local(path, params, init) {
    let m;
    if (path === '/api/verzio') return json({ build: window.HB_BUILD || 'static', name: 'Holabuli', static: true });
    if (path === '/api/events') return json(events.filter((e) => !isPast(e.kezdes)).sort((a, b) => new Date(a.kezdes) - new Date(b.kezdes)).map((e) => ({ id: e.id, cim: e.cim, kezdes: e.kezdes, mufaj: e.mufaj, tipus: e.tipus || 'buli', stilusok: e.stilusok, ar: e.ar, kiemelt: e.kiemelt, hely: (venueById(e.venueId) || {}).nev || '', when: when(e.kezdes), price: !e.ar ? (e.ingyenEddig ? `Ingyen ${e.ingyenEddig}-ig` : 'Ingyen') : huf(e.ar), going: allapot(e.id).megyek })));
    if (path === '/api/helyek') {
      const jovo = events.filter((e) => !isPast(e.kezdes)).sort((a, b) => new Date(a.kezdes) - new Date(b.kezdes));
      return json(venues.map((v) => {
        const sajat = jovo.filter((e) => e.venueId === v.id);
        return {
          id: v.id, nev: v.nev, kerulet: v.kerulet, cim: v.cim, tipus: v.tipus, lat: v.lat, lon: v.lon,
          bulik: sajat.slice(0, 3).map((e) => ({ id: e.id, cim: e.cim, kezdes: e.kezdes, when: when(e.kezdes), price: !e.ar ? (e.ingyenEddig ? `Ingyen ${e.ingyenEddig}-ig` : 'Ingyen') : huf(e.ar), mufaj: e.mufaj })),
          osszes: sajat.length,
        };
      }));
    }
    if ((m = path.match(/^\/api\/pass\/(.+)$/))) {
      const pd = decode(decodeURIComponent(m[1]));
      if (!pd) return json({ ok: false }, 404);
      const ev = evById(pd.eventId); if (!ev) return json({ ok: false }, 404);
      const v = venueById(ev.venueId);
      const p = passesOf(ev.id).find((x) => x.id === pd.id) || { ...pd, status: status(pd), scannedAt: scannedAt(pd) };
      const sajat = db.passes.find((x) => x.id === pd.id) || null;
      return json({ ok: true, pass: { id: pd.id, nev: pd.nev, status: db.scanned[pd.id] ? 'scanned' : (p.status || 'issued'), createdAt: pd.createdAt, scannedAt: db.scanned[pd.id] || null, kind: pd.kind, tetelek: (sajat && sajat.tetelek) || [], fo: (sajat && sajat.fo) || pd.fo || 1, sorszam: pd.sorszam || (sajat && sajat.sorszam) || '', amountHuf: (sajat && sajat.amountHuf) || 0 }, event: { id: ev.id, cim: ev.cim, kezdes: ev.kezdes, mufaj: ev.mufaj, ar: ev.ar, korhatar: ev.korhatar, when: when(ev.kezdes), longDate: longDate(ev.kezdes), price: price(ev), past: isPast(ev.kezdes) }, venue: v && { id: v.id, nev: v.nev, kerulet: v.kerulet, cim: v.cim }, token: decodeURIComponent(m[1]) });
    }
    if ((m = path.match(/^\/api\/kapu\/([^/]+)\/allapot$/))) { const ev = evByKapu(decodeURIComponent(m[1])); return ev ? json({ ok: true, ...allapot(ev.id) }) : json({ ok: false, reason: 'unknown_kapu' }, 404); }
    if ((m = path.match(/^\/api\/kapu\/([^/]+)\/kereses$/))) {
      const ev = evByKapu(decodeURIComponent(m[1])); if (!ev) return json({ ok: false, reason: 'unknown_kapu' }, 404);
      const q = norm(params.get('q') || '').slice(0, 60);
      // „Megyek” jelentkezők csak juttatás esetén kerülnek a kapu-listába (akkor van mit beváltani).
      const juttVan = vanJuttatas(ev);
      let list = passesOf(ev.id).filter((p) => juttVan || p.kind !== 'megyek');
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
    if (path === '/api/bevaltas') {
      let body = {}; try { body = JSON.parse((init && init.body) || '{}'); } catch { /* */ }
      if (typeof body.passId !== 'string' || typeof body.eventId !== 'string' || typeof body.juttatasId !== 'string') return json({ ok: false, reason: 'format' }, 400);
      return json(bevalt(body.passId, body.eventId, body.juttatasId));
    }
    if ((m = path.match(/^\/api\/stat\/(.+)$/))) { const ev = evById(decodeURIComponent(m[1])); return ev ? json({ ok: true, ...statData(ev) }) : json({ ok: false, reason: 'unknown_event' }, 404); }
    // Link-beolvasás: a valódi olvasás szervert igényel (idegen oldalt kell letölteni).
    // A bemutatóhoz két VALÓDI oldalról előre kiolvasott példa van beépítve, jelölve.
    if (path === '/admin/esemeny/beolvas') {
      let url = '';
      try { url = String(JSON.parse((init && init.body) || '{}').url || '').trim(); } catch { /* */ }
      const kulcs = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').toLowerCase();
      const p = Object.keys(LINK_PELDAK).find((k) => kulcs.startsWith(k));
      if (p) return json({ ...LINK_PELDAK[p], ok: true, figyelmeztetes: 'Bemutató: ez a válasz egy valódi oldalról előre kiolvasott példa. Élesben a szerver olvassa be a linket.' });
      return json({ ok: false, hiba: 'A link-beolvasás szervert igényel, a bemutató-oldal viszont szerver nélkül fut. Próbáld a beépített példákkal: tixa.hu/jhz260907 vagy cooltix.hu/event/6957970ee341f7d6129ff8bb — élesben bármilyen link megy.' });
    }
    if (path.startsWith('/admin')) { setTimeout(() => window.HB && window.HB.toast && window.HB.toast('Bemutató: a mentés csak ezen az eszközön'), 50); return json({ ok: true, static: true }); }
    return null;
  }
  window.fetch = function (input, init) {
    let path = null, params = null;
    try {
      const url = typeof input === 'string' ? input : input.url;
      const u = new URL(url, location.href);
      if (u.origin === location.origin) {
        const p = stripBase(u.pathname);
        if (p.startsWith('/api/') || p.startsWith('/admin')) { path = p; params = u.searchParams; }
      }
    } catch { /* eredeti fetch */ }
    if (path === null) return realFetch(input, init);
    // A local() async, ezért a „nem kezeltem” jelzést AWAIT UTÁN kell megnézni — különben
    // egy le nem fedett hívás null-lal térne vissza a Response helyett (néma hiba).
    return local(path, params, init).then((r) => r || realFetch(input, init));
  };

  // ---------- űrlapok: Megyek → passz; admin → jelzés ----------
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    const action = stripBase(new URL(f.getAttribute('action') || location.href, location.href).pathname);
    if (action === '/megyek') {
      e.preventDefault();
      if (f.dataset.kuldes === '1') return; // dupla koppintás: egy jegy, nem kettő
      const fd = new FormData(f);
      if (fd.get('weboldal')) { window.HB && HB.toast('Az űrlapot nem sikerült elküldeni. Ha automatikus kitöltőt használsz, kapcsold ki.'); return; }
      const nev = String(fd.get('nev') || '').trim(), k = String(fd.get('kapcsolat') || '').trim();
      if (nev.length < 2) { window.HB && HB.toast('Add meg a neved (legalább 2 betű).'); return; }
      const ev = evById(fd.get('eventId'));
      if (!ev) { window.HB && HB.toast('Ez a buli nem található.'); return; }
      const zar = (szoveg) => { f.dataset.kuldes = '1'; const g = f.querySelector('button[type="submit"]'); if (g) { g.disabled = true; g.setAttribute('aria-busy', 'true'); g.textContent = szoveg; } };

      // „Megyek”: ingyenes belépés → nincs jegy, nincs QR, elérhetőség sem kell.
      if (fd.get('mod') === 'megyek') {
        zar('Egy pillanat…');
        const r = HBS.issuePass({ eventId: ev.id, nev, kapcsolat: '', ref: fd.get('ref') || null, tetelek: [], kind: 'megyek' });
        location.href = `${BASE}/p/?uj=1#${r.token}`;
        return;
      }

      const okK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(k) || k.replace(/\D/g, '').length >= 7;
      if (!okK) { window.HB && HB.toast('E-mail-cím vagy telefonszám kell, hogy a jegy a tiéd legyen.'); return; }
      let tetelek = rendelesBol(ev, fd.get('t'));
      if (!tetelek.length) { const t0 = tipusokOf(ev)[0]; tetelek = t0 ? [{ tipusId: t0.id, nev: t0.nev, ar: t0.ar || 0, db: 1 }] : []; }
      if (!tetelek.length) { window.HB && HB.toast('Ezen a bulin nincs megvehető jegy — a belépés ingyenes.'); return; }
      zar('Jegy készül…');
      const { token } = HBS.issuePass({ eventId: ev.id, nev, kapcsolat: k, ref: fd.get('ref') || null, tetelek });
      location.href = `${BASE}/p/?uj=1#${token}`;
      return;
    }
    if (action.startsWith('/admin')) {
      e.preventDefault();
      // A saját kezelőnk elvégzi a megerősítést — az admin.js bubble-kezelőjét NE engedjük utána
      // futni, mert akkor két megerősítő ablak jön egymás után.
      e.stopImmediatePropagation();
      if (f.dataset.confirm && !confirm(f.dataset.confirm)) return;
      if (action.endsWith('/kiemelt')) {
        const b = f.querySelector('button');
        if (b) {
          const on = !b.classList.contains('on');
          b.classList.toggle('on', on);
          b.textContent = (on ? '★' : '☆') + ' Kiemelt';
          // Jegyezzük meg, hogy újratöltés után se ugorjon vissza.
          const id = (f.getAttribute('action') || '').split('/').filter(Boolean)[2] || '';
          if (id) { db.kiemelt[id] = on; save(); }
        }
        window.HB && HB.toast(`Bemutató: a kiemelés csak ezen az eszközön látszik`);
        return;
      }
      window.HB && HB.toast('Bemutató-nézet: itt nincs szerver, ezért a mentés nem történik meg.');
    }
  }, true);

  // ---------- statikus passz-oldal (#TOKEN) ----------
  function fillPassPage() {
    const root = document.getElementById('pass-static');
    if (!root) return;
    const token = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const pd = decode(token);
    const $ = (id) => document.getElementById(id);
    // Érvénytelen jegynél a TELJES tartalom eltűnik — korábban ott maradt két értelmetlen gomb.
    if (!pd || !evById(pd.eventId)) { $('ps-tartalom').classList.add('hidden'); $('ps-hiba').classList.remove('hidden'); return; }
    const ev = evById(pd.eventId), v = venueById(ev.venueId);
    const sajat = db.passes.find((p) => p.id === pd.id) || null; // a saját eszközön a tételek is megvannak
    root.dataset.token = token; root.dataset.event = ev.id; root.dataset.nev = pd.nev; root.dataset.kind = pd.kind || 'jegy'; // az app.js ebből menti a Jegyeimbe
    if (new URLSearchParams(location.search).get('uj') === '1') { $('ps-hooray').textContent = `🎉 ${pd.kind === 'megyek' ? 'Ott leszel' : 'Megvan a jegyed'}, ${keresztnev(pd.nev)}!`; $('ps-hooray').classList.remove('hidden'); }
    $('ps-genre').textContent = (GENRE_NEV[ev.mufaj] || ev.mufaj || '').toUpperCase();
    $('ps-cim').textContent = ev.cim;
    $('ps-date').textContent = longDate(ev.kezdes);
    $('ps-venue').textContent = v ? `${v.nev} · ${v.kerulet} kerület` : '';
    $('ps-nev').textContent = pd.nev;
    const tetelek = (sajat && sajat.tetelek) || [];
    const osszeg = sajat ? (sajat.amountHuf || 0) : 0;
    const rsvp = pd.kind === 'megyek'; // ingyenes belépés: nincs jegy
    const qrKell = !rsvp || vanJuttatas(ev); // juttatásnál VAN mit beváltani → kell a kód
    const fo = (sajat && sajat.fo) || pd.fo || 1;
    if (rsvp) {
      $('ps-fejlec').textContent = 'Megyek';
      $('ps-ticket').classList.add('rsvp');
      const ingyen = ev.ingyenEddig ? `Ingyenes belépés ${ev.ingyenEddig}-ig` : 'Ingyenes belépés';
      if (qrKell) {
        $('ps-hint').innerHTML = `<b>${ingyen}, jegy nem kell.</b> A kód a juttatásokhoz kell.`;
      } else {
        $('ps-qr').classList.add('hidden');
        $('ps-rsvp').classList.remove('hidden');
        $('ps-hint').innerHTML = `<b>${ingyen}, jegy nem kell.</b> A neved rajta van a hely listáján.`;
      }
      $('ps-kind').textContent = `${ev.korhatar}+`;
      $('ps-sorszam').textContent = '';
      $('ps-id').textContent = 'Jelentkezés';
      $('ps-share').dataset.shareTitle = window.HB_APP_NAME || 'Hola!Buli';
    } else {
      $('ps-kind').textContent = `${tetelek.length ? tetelSor(tetelek) : 'Jegy'} · ${osszeg > 0 ? huf(osszeg) : 'Ingyenes'} · ${ev.korhatar}+`;
      $('ps-sorszam').textContent = (pd.sorszam || (sajat && sajat.sorszam) || '') + (fo > 1 ? ` · ${fo} fő` : '');
      $('ps-id').textContent = `Jegyazonosító: ${pd.sorszam || pd.id}`;
    }
    // Helyszín: cím, útvonal, naptár
    $('ps-hely-nev').textContent = v ? v.nev : '';
    $('ps-hely-cim').textContent = v ? `${v.kerulet} kerület, ${v.cim}` : '';
    $('ps-utvonal').href = 'https://www.google.com/maps/search/' + encodeURIComponent((v ? `${v.nev}, ${v.cim}` : '') + ', Budapest');
    const ics = $('ps-ics');
    ics.dataset.icsCim = ev.cim;
    ics.dataset.icsKezdes = ev.kezdes;
    ics.dataset.icsHely = v ? `${v.nev}, ${v.cim}, Budapest` : 'Budapest';
    ics.dataset.icsLeiras = `${pd.sorszam || ''} · ${window.HB_APP_NAME || 'Hola!Buli'}`;
    const passUrl = `${location.origin}${BASE}/p/#${token}`;
    const invite = `${location.origin}${BASE}/e/${ev.id}/?ref=${pd.id}`;
    $('ps-invite').value = invite; $('ps-copy').dataset.copy = invite;
    $('ps-invite-share').dataset.shareTitle = `Gyere velem: ${ev.cim}`; $('ps-invite-share').dataset.shareText = `${longDate(ev.kezdes)} · ${v ? v.nev : ''} – itt a lista:`; $('ps-invite-share').dataset.shareUrl = invite;
    $('ps-share').dataset.shareText = `${ev.cim} · ${longDate(ev.kezdes)}`; $('ps-share').dataset.shareUrl = passUrl;
    $('ps-chat').href = `${BASE}/chat/${ev.id}/`; $('ps-event').href = `${BASE}/e/${ev.id}/`;
    // „Jár neked” lista beváltás-állapottal
    const jutt = juttatasAllapot(ev, sajat || pd);
    if (jutt.length) {
      const ul = $('ps-juttatasok');
      ul.innerHTML = '';
      jutt.forEach((j) => {
        const li = document.createElement('li');
        li.className = 'juttatas-sor' + (j.bevaltva ? ' bevaltva' : '');
        const i = document.createElement('span'); i.className = 'juttatas-ikon'; i.textContent = j.ikon;
        const n = document.createElement('span'); n.className = 'juttatas-nev'; n.textContent = j.nev;
        const a = document.createElement('span'); a.className = 'juttatas-allapot'; a.textContent = j.bevaltva ? '✓ beváltva ' + hhmm(j.bevaltva) : 'még nem';
        li.appendChild(i); li.appendChild(n); li.appendChild(a);
        ul.appendChild(li);
      });
      $('ps-juttatas-blokk').classList.remove('hidden');
    }
    if (!rsvp && db.scanned[pd.id]) { $('ps-ticket').classList.add('used'); $('ps-hint').outerHTML = `<div class="stamp">BELÉPETT · ${hhmm(db.scanned[pd.id])}</div>`; }
    if (qrKell) {
      try {
        const q = window.qrcode(0, 'M'); q.addData(passUrl); q.make();
        $('ps-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      } catch (e) { $('ps-qr').textContent = 'QR nem rajzolható: ' + e.message; }
    }
  }

  // ---------- statikus pénztár (?e=&t=) ----------
  function fillPenztar() {
    const root = document.getElementById('penztar-static');
    if (!root) return;
    const $ = (id) => document.getElementById(id);
    const q = new URLSearchParams(location.search);
    const ev = evById(q.get('e'));
    if (!ev) { $('pz-tartalom').classList.add('hidden'); $('pz-hiba').classList.remove('hidden'); return; }
    const v = venueById(ev.venueId);
    let tetelek = rendelesBol(ev, q.get('t'));
    if (!tetelek.length) { const t0 = tipusokOf(ev)[0]; tetelek = t0 ? [{ tipusId: t0.id, nev: t0.nev, ar: t0.ar || 0, db: 1 }] : []; }
    const osszeg = osszegOf(tetelek), fo = darabOf(tetelek);

    root.dataset.event = ev.id;
    const evUrl = `${BASE}/e/${ev.id}/`;
    $('pz-vissza').href = evUrl + '#jegyek';
    $('pz-modosit').href = evUrl + '#jegyek';
    $('pz-megse').href = evUrl;
    $('pz-mufaj').textContent = GENRE_NEV[ev.mufaj] || ev.mufaj || '';
    $('pz-cim').textContent = ev.cim;
    $('pz-datum').textContent = longDate(ev.kezdes);
    $('pz-hely').textContent = v ? `${v.nev} · ${v.kerulet} kerület` : '';

    const lista = $('pz-tetelek');
    lista.innerHTML = '';
    tetelek.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'rendeles-sor';
      const a = document.createElement('span'); a.className = 'rendeles-db'; a.textContent = t.db + '×';
      const b = document.createElement('span'); b.className = 'rendeles-nev'; b.textContent = t.nev;
      const c = document.createElement('span'); c.className = 'rendeles-ar'; c.textContent = t.ar ? huf(t.ar * t.db) : 'Ingyenes';
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      lista.appendChild(li);
    });
    $('pz-fo').textContent = ` · ${fo} fő`;
    $('pz-osszeg').textContent = osszeg > 0 ? huf(osszeg) : 'Ingyenes';
    $('pz-eventid').value = ev.id;
    $('pz-rendeles').value = tetelek.map((t) => `${t.tipusId}:${t.db}`).join(',');
    $('pz-ref').value = (q.get('ref') || '').slice(0, 40);
    $('pz-korhatar').textContent = `Elmúltam ${ev.korhatar} éves.`;
    if (osszeg > 0) {
      $('pz-demo').classList.remove('hidden');
      $('pz-fizetes-blokk').classList.remove('hidden');
      $('pz-teljes-ar').classList.remove('hidden');
      $('pz-kuld').textContent = `Fizetés · ${huf(osszeg)}`;
    } else {
      $('pz-kuld').textContent = 'Ingyenes jegy igénylése';
    }
  }

  // ---------- a demó-adat sose járjon le ----------
  // A statikus oldal a BUILD napjához képest relatív dátumokat süt be. Néhány hét múlva minden buli
  // „lement” volna, és az ügyfél egy ÜRES főoldalt kapott volna, magyarázat nélkül. Ha már nincs élő
  // buli, egész hetekkel előre toljuk a demó-adatot — így a hétköznap-ritmus is megmarad.
  function frissitDatumok() {
    if (!events.length) return;
    const legkesobb = Math.max(...events.map((e) => new Date(e.kezdes).getTime()));
    if (legkesobb > Date.now() - 6 * 3600 * 1000) return; // van még élő buli
    const legkorabbi = Math.min(...events.map((e) => new Date(e.kezdes).getTime()));
    const HET = 7 * 86400000;
    const eltolas = Math.ceil((Date.now() - legkorabbi) / HET) * HET;
    if (eltolas <= 0) return;
    const told = (iso) => { const t = new Date(iso).getTime(); return isNaN(t) ? iso : new Date(t + eltolas).toISOString(); };
    events.forEach((e) => { e.kezdes = told(e.kezdes); });
    (SEED.passes || []).forEach((p) => { p.createdAt = told(p.createdAt); if (p.scannedAt) p.scannedAt = told(p.scannedAt); });
    (SEED.scans || []).forEach((s) => { s.at = told(s.at); });
    (SEED.messages || []).forEach((m) => { m.at = told(m.at); });
    document.querySelectorAll('[data-kezdes]').forEach((c) => { c.dataset.kezdes = told(c.dataset.kezdes); });
    document.querySelectorAll('time[datetime]').forEach((t) => t.setAttribute('datetime', told(t.getAttribute('datetime'))));
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
      // A Heti Top az ELSŐ csoport UTÁN áll (hogy az első képernyőn valódi bulik legyenek);
      // a csoportok újraépítése után vissza kell tenni oda, különben a lista elé ugrik.
      const top = document.getElementById('heti-top-szekcio');
      if (top && !top.querySelector('.card-poster')) top.remove();
      else if (top) { const elso = parent.querySelector('.list-group'); if (elso) elso.after(top); }
    }
    document.querySelectorAll('.top-list .top-row').forEach((r, i) => { const rank = r.querySelector('.top-rank'); if (rank) rank.textContent = i + 1; });
  }

  // ---------- admin: bemutató-nézet jelzés ----------
  function adminNote() {
    if (!location.pathname.replace(BASE, '').startsWith('/admin')) return;
    const h = document.querySelector('.topbar');
    if (!h) return;
    const n = document.createElement('div');
    n.className = 'alert';
    n.style.cssText = 'margin:12px 0 0';
    n.textContent = 'Bemutató-nézet: az admin megtekinthető, a mentések csak ezen az eszközön látszanak (nincs szerver).';
    // A fejléc UTÁN, teljes szélességben — a fejléc belsejében a cím mellé szorulna.
    h.insertAdjacentElement('afterend', n);
  }

  // FONTOS: azonnal futunk (defer-sorrend: static-mode.js → app.js → DOMContentLoaded), hogy a passz-oldal
  // data-nev/data-token attribútuma már kész legyen, amikor az app.js elmenti a Jegyeimbe és a becenevet.
  // (Enélkül a chat névre kérdez egy blokkoló ablakban.)
  function init() { frissitDatumok(); relabel(); fillPassPage(); fillPenztar(); adminNote(); }
  if (document.readyState === 'loading' && !document.getElementById('pass-static') && !document.getElementById('penztar-static')) document.addEventListener('DOMContentLoaded', init);
  else init();
})();
