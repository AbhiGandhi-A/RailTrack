/* RailTrack frontend – vanilla JS. Talks only to /api/* (the proxy); the API key never reaches the browser. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// g(obj,'a','b.c') -> first defined value among candidate keys (response shapes are read defensively)
const g = (o, ...ks) => { for (const k of ks) { let v = o; for (const p of k.split('.')) v = v == null ? v : v[p]; if (v != null && v !== '') return v; } };
const lst = d => Array.isArray(d) ? d : (d && Object.values(d).find(Array.isArray)) || [];
const stn = x => x == null ? null : typeof x === 'string' ? { code: x, name: x } : { code: g(x, 'code', 'stationCode', 'station_code', 'station.code'), name: g(x, 'name', 'stationName', 'station_name', 'station.name') };
const toast = m => { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3200); };
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const ms = v => { if (v == null) return NaN; const t = Date.parse(v); return t; };
const scalar = v => v == null || typeof v !== 'object' ? v : (g(v, 'value', 'time', 'dateTime', 'datetime', 'timestamp', 'expectedTime', 'estimatedTime', 'arrivalTime', 'departureTime', 'date') ?? (v.date && v.time ? `${v.date} ${v.time}` : null));
const numeric = v => { const n = Number(scalar(v)); return scalar(v) == null || scalar(v) === '' || !Number.isFinite(n) ? null : n; };
const fmt = value => {
  const v = scalar(value);
  if (v == null || v === '') return '—';
  const t = typeof v === 'number' ? new Date(Math.abs(v) < 1e11 ? v * 1000 : v).getTime() : ms(v);
  if (typeof v !== 'number' && (isNaN(t) || !/\d{4}-\d{2}/.test(v))) return esc(v);
  if (isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

async function api(p) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('/api' + p, { signal: ctl.signal });
    const j = await r.json().catch(() => null);
    const retryHeader = r.headers.get('Retry-After');
    const retryAfter = retryHeader ? parseInt(retryHeader, 10) : null;
    const reqId = j?.meta?.requestId || r.headers.get('x-request-id') || '-';

    if (j && (j.status === 'SUCCESS' || j.status === 'STALE_DATA')) {
      console.log(`[API 200] ${p} -> SUCCESS (reqId: ${reqId})`);
      return j;
    }
    const errCode = j?.error?.code || 'HTTP_' + r.status;
    console.warn(`[API ${r.status}] ${p} -> ${errCode} (reqId: ${reqId})`);
    throw {
      http: r.status,
      code: errCode,
      message: j?.error?.message || 'Unexpected response',
      retryAfter,
      requestId: reqId
    };
  } catch (e) {
    if (e.name === 'AbortError') throw { http: 408, code: 'TIMEOUT', message: 'Request timed out.' };
    throw e;
  } finally {
    clearTimeout(to);
  }
}
const errText = e => ({ 404: 'Not found. Check the number and date.', 401: 'Server API key rejected.', 429: 'Rate limited – retrying later.', 503: 'Data provider unavailable. Try again shortly.' }[e.http] || e.message || 'Something went wrong.');

/* ---------- theme, nav, routing, clock ---------- */
document.documentElement.dataset.theme = ls.get('theme', 'dark');
const updateThemeIcon = () => {
  const btn = $('#themeBtn');
  if (!btn) return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  btn.innerHTML = isDark
    ? `<svg class="theme-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg class="theme-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
};
updateThemeIcon();

$('#themeBtn').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  ls.set('theme', t);
  updateThemeIcon();
};
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
const today = () => new Date().toISOString().slice(0, 10);
if ($('#dateIn')) $('#dateIn').value = today();
if ($('#scd')) $('#scd').value = today();

function updateLiveClock() {
  const clock = $('#liveClock');
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// Quick Date Offset chips handler
document.querySelectorAll('[data-date-offset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const offset = Number(btn.dataset.dateOffset);
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    const dateInput = $('#dateIn');
    if (dateInput) dateInput.value = iso;
    document.querySelectorAll('[data-date-offset]').forEach(b => b.classList.toggle('active', b === btn));
  });
});
$('#dateIn')?.addEventListener('change', () => {
  const val = $('#dateIn').value;
  document.querySelectorAll('[data-date-offset]').forEach(btn => {
    const offset = Number(btn.dataset.dateOffset);
    const d = new Date();
    d.setDate(d.getDate() + offset);
    btn.classList.toggle('active', d.toISOString().slice(0, 10) === val);
  });
});

function route() {
  const [v, arg] = (location.hash.slice(1) || 'home').split('/');
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== v);
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
  $('#nav').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (v === 'train' && arg) openTrain(arg); else if (v !== 'train') { stopRefresh(); cancelRouteRetry(); }
  if (v === 'fav') renderFav();
  if (v === 'home') renderRecent();
}
addEventListener('hashchange', route);

/* ---------- favourites / recents ---------- */
const favs = () => ls.get('fav', []), recents = () => ls.get('recent', []);
function toggleFav() { const f = favs(), i = f.findIndex(x => x.number === S.num); if (i >= 0) f.splice(i, 1); else f.push({ number: S.num, name: S.name }); ls.set('fav', f); updFav(); }
const updFav = () => {
  const isFav = favs().some(x => x.number === S.num);
  const btn = $('#favBtn');
  if (btn) {
    const starSvg = isFav
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    btn.innerHTML = `${starSvg}<span>${isFav ? 'Favourited' : 'Favourite'}</span>`;
    btn.classList.toggle('favourited', isFav);
  }
};
$('#favBtn').onclick = toggleFav;

function renderFav() {
  const f = favs();
  const trainSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><circle cx="8" cy="15" r="1.5"/><circle cx="16" cy="15" r="1.5"/><path d="m8 19-3 3"/><path d="m16 19 3 3"/></svg>`;
  const boltSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const trashSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
  const emptyStarSvg = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  $('#favList').innerHTML = f.length
    ? f.map(x => `
      <div class="card fav-card">
        <div class="fav-header">
          <span class="fav-icon">${trainSvg}</span>
          <div>
            <b class="fav-num">${esc(x.number)}</b>
            <div class="fav-name muted">${esc(x.name || 'Express')}</div>
          </div>
        </div>
        <div class="fav-actions">
          <button class="ghost track-now-btn" onclick="location.hash='train/${esc(x.number)}'">${boltSvg} <span>Track Live</span></button>
          <button class="ghost rm-fav-btn" onclick="rmFav('${esc(x.number)}')" title="Remove favourite">${trashSvg} <span>Remove</span></button>
        </div>
      </div>
    `).join('')
    : `<div class="empty-state"><span class="empty-icon">${emptyStarSvg}</span><p class="muted">No favourites yet. Open any train and tap Favourite to save it here.</p></div>`;
}
window.rmFav = n => { ls.set('fav', favs().filter(x => x.number !== n)); renderFav(); };
function addRecent(n, name) { ls.set('recent', [{ number: n, name }, ...recents().filter(x => x.number !== n)].slice(0, 6)); }
function renderRecent() {
  const r = recents();
  $('#recent').innerHTML = r.length
    ? '<span class="recent-label">Recent Searches:</span>' + r.map(x => `
      <button data-t="${esc(x.number)}" class="recent-chip">
        <span class="recent-num">${esc(x.number)}</span>
        <span class="recent-name">${esc(x.name || '')}</span>
      </button>
    `).join('')
    : '';
}
document.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (t) location.hash = 'train/' + t.dataset.t; });

/* ---------- autocomplete ---------- */
function autocomplete(input, ul, path, label, pick, delayMs = 300, minChars = 2) {
  let timer, seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer); const q = input.value.trim(); if (q.length < minChars) { ul.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const d = lst((await api(path + encodeURIComponent(q))).data).slice(0, 8);
        if (my !== seq) return;
        ul.innerHTML = d.map((x, i) => `<li data-i="${i}"><span class="sugg-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><circle cx="8" cy="15" r="1.5"/><circle cx="16" cy="15" r="1.5"/></svg></span> ${esc(label(x))}</li>`).join('');
        ul._d = d;
      } catch { ul.innerHTML = ''; }
    }, delayMs);
  });
  ul.addEventListener('click', e => { const li = e.target.closest('li'); if (li) { pick(ul._d[li.dataset.i]); ul.innerHTML = ''; } });
  document.addEventListener('click', e => { if (!ul.contains(e.target) && e.target !== input) ul.innerHTML = ''; });
}
const trainNum = x => g(x, 'number', 'trainNumber', 'train_number');
const trainName = x => g(x, 'name', 'trainName', 'train_name');
autocomplete($('#q'), $('#sugg'), '/trains/search?q=', x => `${trainNum(x)} – ${trainName(x)}`, x => location.hash = 'train/' + trainNum(x));
autocomplete($('#sq'), $('#sSugg'), '/stations/search?q=', x => `${g(x, 'code', 'stationCode')} – ${g(x, 'name', 'stationName')}`, x => { $('#sq').value = g(x, 'code', 'stationCode'); loadBoard(g(x, 'code', 'stationCode')); }, 900, 3);

$('#searchForm').onsubmit = async e => {
  e.preventDefault(); const q = $('#q').value.trim(); if (!q) return;
  if (/^\d{5}$/.test(q)) return void (location.hash = 'train/' + q);
  $('#searchForm').classList.add('loading');
  try {
    const d = lst((await api('/trains/search?q=' + encodeURIComponent(q))).data);
    if (!d.length) toast('No train found for “' + q + '”');
    else location.hash = 'train/' + trainNum(d[0]);
  } catch (e) { toast(errText(e)); }
  finally { $('#searchForm').classList.remove('loading'); }
};

/* ---------- route caching & retry manager ---------- */
const routeCache = {
  get(num, date) {
    const key = `route:v4:${num}:${date}`;
    const c = ls.get(key, null);
    if (!c) return null;
    if (c.savedAt && Date.now() - c.savedAt > 86400000) return null;
    return c.data || c;
  },
  set(num, date, data) {
    ls.set(`route:v4:${num}:${date}`, { data, savedAt: Date.now() });
  }
};

const routeRetryState = {
  count: 0,
  timer: null,
  cdInterval: null,
  inFlight: null
};

function cancelRouteRetry() {
  clearTimeout(routeRetryState.timer);
  clearInterval(routeRetryState.cdInterval);
  routeRetryState.timer = null;
  routeRetryState.cdInterval = null;
  routeRetryState.inFlight = null;
}

function showRouteNotice(html) {
  const n = $('#routeNotice');
  if (n) {
    n.innerHTML = html;
    n.hidden = false;
  }
  const tc = $('#trackContent');
  if (tc) tc.hidden = !S.stops.length;
  $('#routeVisual').hidden = false;
}

function hideRouteNotice() {
  const n = $('#routeNotice');
  if (n) {
    n.innerHTML = '';
    n.hidden = true;
  }
  const tc = $('#trackContent');
  if (tc) tc.hidden = !S.stops.length;
}

// Status can arrive before route data. Resolve its station codes again as soon
// as stops are available, rather than using the fallback start-of-route point.
function renderRouteWithCurrentStatus() {
  if (S.status) {
    S.cur = null;
    applyStatus({ data: S.status });
  } else {
    renderTimeline();
    buildTrack();
  }
}

async function loadRoute(num, date, isRetry) {
  if (!num || num !== S.num || date !== S.date) return;

  // Check client cache first
  const cached = routeCache.get(num, date);
  if (cached) {
    S.stops = lst(g(cached, 'stops', 'stations', 'route') ?? cached);
    S.routeData = cached;
    hideRouteNotice();
    renderRouteWithCurrentStatus();
    if (!isRetry) return;
  }

  // Prevent duplicate concurrent in-flight requests for the same train/date
  if (routeRetryState.inFlight === `${num}:${date}`) return;
  routeRetryState.inFlight = `${num}:${date}`;

  if (!S.stops.length && !isRetry) {
    showRouteNotice('<span>⏳ Loading route timeline and traction track…</span>');
  }

  try {
    const res = await api(`/train/${num}/route?date=${date}`);
    routeRetryState.inFlight = null;
    routeRetryState.count = 0;
    cancelRouteRetry();

    S.stops = lst(g(res.data, 'stops', 'stations', 'route') ?? res.data);
    S.routeData = res.data;
    routeCache.set(num, date, res.data);
    hideRouteNotice();
    renderRouteWithCurrentStatus();
    if (isRetry) toast('Route loaded successfully');
  } catch (e) {
    routeRetryState.inFlight = null;
    console.warn(`[Route Error] ${e.http} ${e.code} (reqId: ${e.requestId || '-'}): ${e.message}`);

    // If we already have stops, keep displaying them!
    if (S.stops.length > 0) {
      if (isRetry) toast('Route update rate-limited; displaying cached route.');
      return;
    }

    const isRateLimit = e.http === 429 || e.code === 'RATE_LIMITED' || e.code === 'PROVIDER_RATE_LIMITED';
    if (isRateLimit) {
      const seen = new Set();
      S.stops = ['origin', 'previousStation', 'currentStation', 'nextStation', 'destination']
        .map(key => S.status?.[key])
        .filter(point => point?.code && point?.name && !seen.has(point.code) && seen.add(point.code))
        .map((point, index) => ({
          sequence: index + 1,
          station: point,
          stationCode: point.code,
          stationName: point.name,
          code: point.code,
          name: point.name,
          halt: true,
          distanceKm: point.code === S.status?.currentStation?.code ? S.status.distanceCoveredKm : null
        }));

      if (S.stops.length > 1) {
        renderRouteWithCurrentStatus();
        showRouteNotice('<span class="route-notice-msg">Full route is temporarily rate-limited. Showing stations available from live tracking.</span>');
        return;
      }

      const baseSec = e.retryAfter || 45;
      const backoffSec = Math.min(120, Math.round(baseSec * Math.pow(1.5, routeRetryState.count)));
      routeRetryState.count++;

      if (routeRetryState.count <= 3) {
        let left = backoffSec;
        showRouteNotice(`
          <span class="route-notice-msg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Route data temporarily rate-limited. Retrying in <b id="routeCdSec">${left}s</b>…
          </span>
          <div class="route-notice-actions">
            <button type="button" class="ghost" id="manualRouteRetryBtn">Retry Now</button>
          </div>
        `);
        $('#manualRouteRetryBtn')?.addEventListener('click', () => {
          cancelRouteRetry();
          loadRoute(num, date, true);
        });

        clearInterval(routeRetryState.cdInterval);
        routeRetryState.cdInterval = setInterval(() => {
          left--;
          const el = $('#routeCdSec');
          if (el) el.textContent = `${left}s`;
          if (left <= 0) clearInterval(routeRetryState.cdInterval);
        }, 1000);

        clearTimeout(routeRetryState.timer);
        routeRetryState.timer = setTimeout(() => {
          clearInterval(routeRetryState.cdInterval);
          loadRoute(num, date, true);
        }, backoffSec * 1000);
      } else {
        showRouteNotice(`
          <span class="route-notice-msg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Route details temporarily unavailable due to provider rate limit. Live train tracking is fully active above.
          </span>
          <div class="route-notice-actions">
            <button type="button" class="ghost" id="manualRouteRetryBtn">Retry Route</button>
          </div>
        `);
        $('#manualRouteRetryBtn')?.addEventListener('click', () => {
          routeRetryState.count = 0;
          cancelRouteRetry();
          loadRoute(num, date, true);
        });
      }
    } else if (e.http === 401) {
      showRouteNotice('<span class="route-notice-msg"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Route service authentication error. Server API key rejected.</span>');
    } else if (e.http === 404) {
      showRouteNotice('<span class="route-notice-msg"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Route details are unavailable for this train on this date.</span>');
    } else if (e.http === 503) {
      showRouteNotice(`
        <span class="route-notice-msg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Railway route provider is temporarily unavailable.
        </span>
        <div class="route-notice-actions">
          <button type="button" class="ghost" id="manualRouteRetryBtn">Retry</button>
        </div>
      `);
      $('#manualRouteRetryBtn')?.addEventListener('click', () => loadRoute(num, date, true));
    } else {
      showRouteNotice(`
        <span class="route-notice-msg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Could not load route details (${esc(e.message || 'Network error')}).
        </span>
        <div class="route-notice-actions">
          <button type="button" class="ghost" id="manualRouteRetryBtn">Retry</button>
        </div>
      `);
      $('#manualRouteRetryBtn')?.addEventListener('click', () => loadRoute(num, date, true));
    }
  }
}

/* ---------- live train state ---------- */
const S = { num: null, name: '', date: null, status: null, stops: [], busy: false, t0: 0, last: 0, timer: null, nextAt: 0, cur: null, raf: 0, model: null, routeData: null, timelineOpen: new Set(), timelineTouched: new Set() };
const REFRESH = 60;
function stopRefresh() { clearInterval(S.timer); cancelAnimationFrame(S.raf); S.timer = null; }

async function openTrain(num) {
  if (!/^\d{5}$/.test(num)) { $('#trainErr').innerHTML = '<div class="err">Train number must be 5 digits.</div>'; return; }
  stopRefresh();
  cancelRouteRetry();
  let date = $('#dateIn').value || today();
  Object.assign(S, { num, date, stops: [], status: null, model: null, routeData: null, cur: null, timelineOpen: new Set(), timelineTouched: new Set() });
  $('#trainErr').innerHTML = '';

  // 1. Check if route data is already cached
  const cachedRoute = routeCache.get(num, date);
  if (cachedRoute) {
    S.stops = lst(g(cachedRoute, 'stops', 'stations', 'route') ?? cachedRoute);
    S.routeData = cachedRoute;
  }

  // 2. Reveal dashboard immediately
  $('#dash').hidden = false;
  if (!S.status) {
    $('#tName').textContent = `${num}`;
    $('#tRoute').textContent = 'Fetching live journey status…';
    $('#tMeta').textContent = `Journey Date: ${date}`;
    $('#info').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  }

  // If route is cached, render route visuals immediately
  if (S.stops.length) {
    hideRouteNotice();
    renderTimeline();
    buildTrack();
  }

  // 3. Fetch live status independently
  try {
    let st = await api(`/train/${num}/status?date=${date}`);
    const isNotStartedAtOrigin = response => {
      const data = response?.data || {};
      const origin = stn(g(data, 'origin'));
      const current = stn(g(data, 'currentStation'));
      const atOrigin = (origin?.code && current?.code && origin.code.toUpperCase() === current.code.toUpperCase()) ||
        (origin?.name && current?.name && origin.name.toLowerCase() === current.name.toLowerCase());
      return /^unknown$/i.test(String(g(data, 'status') || '')) && atOrigin &&
        Number(g(data, 'distanceCoveredKm', 'distanceCovered', 'progress.distanceCoveredKm')) === 0 &&
        !g(data, 'previousStation.code', 'previousStation.stationCode');
    };
    if (isNotStartedAtOrigin(st)) {
      const previousDateValue = new Date(`${date}T00:00:00Z`);
      previousDateValue.setUTCDate(previousDateValue.getUTCDate() - 1);
      const previousDate = previousDateValue.toISOString().slice(0, 10);
      try {
        const previousStatus = await api(`/train/${num}/status?date=${previousDate}`);
        const previousData = previousStatus?.data || {};
        const previousCurrent = stn(g(previousData, 'currentStation'));
        const previousOrigin = stn(g(previousData, 'origin'));
        const previousDistance = Number(g(previousData, 'distanceCoveredKm', 'distanceCovered', 'progress.distanceCoveredKm'));
        const previousProgress = Number(g(previousData, 'progressPercent', 'progress.percent'));
        const previousStatusName = String(g(previousData, 'status') || '');
        const priorJourneyFound = (previousCurrent?.code || previousCurrent?.name) && (
          !/^unknown$/i.test(previousStatusName) || previousDistance > 0 || previousProgress > 0 ||
          g(previousData, 'previousStation.code', 'previousStation.stationCode') ||
          (previousOrigin?.code && previousCurrent?.code && previousOrigin.code.toUpperCase() !== previousCurrent.code.toUpperCase()) ||
          /departed|running/i.test(String(g(previousData, 'position.status') || ''))
        );
        if (priorJourneyFound) {
          date = previousDate;
          S.date = date;
          S.stops = [];
          S.routeData = null;
          S.cur = null;
          $('#dateIn').value = date;
          st = previousStatus;
        }
      } catch (fallbackError) {
        console.warn(`[Fallback] Previous-day status unavailable for train ${num}: ${fallbackError.message}`);
      }
    }
    // Overnight services belong to the date on which their journey started.
    // Follow the date returned by live telemetry before rendering the route,
    // otherwise the UI can show a different day's earlier position.
    const liveJourneyDate = g(st.data, 'journeyDate', 'journey_date', 'date');
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(liveJourneyDate || '')) && liveJourneyDate !== date) {
      date = liveJourneyDate;
      S.date = date;
      S.stops = [];
      S.routeData = null;
      S.cur = null;
      $('#dateIn').value = date;
      st = await api(`/train/${num}/status?date=${date}`);
    }
    S.name = g(st.data, 'trainName', 'name') || g(S.routeData, 'trainName', 'name') || '';
    $('#dash').hidden = false;
    applyStatus(st);
    addRecent(num, S.name);
    updFav();
    S.timer = setInterval(tick, 1000);
    S.nextAt = Date.now() + REFRESH * 1000;
    startAnim();
  } catch (e) {
    $('#trainErr').innerHTML = `<div class="err">${esc(e.http === 404 ? 'Train not found or no running data for this date.' : errText(e))}</div>`;
  }

  // 4. Fetch route independently (if not already cached)
  if (!S.stops.length) {
    loadRoute(num, date);
  }
}

$('#refreshBtn').onclick = () => refresh(true);
function tick() {
  if (document.hidden) { S.nextAt += 1000; return; }
  const left = Math.max(0, Math.round((S.nextAt - Date.now()) / 1000));
  $('#countdown').textContent = S.busy ? 'Refreshing…' : `Auto-refresh in ${left}s`;
  if (left === 0 && !S.busy) refresh();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.timer && Date.now() > S.nextAt) refresh(); });

// Auto-refresh updates ONLY live status, never route
async function refresh(manual) {
  if (S.busy || !S.num) return; S.busy = true;
  const refBtn = $('#refreshBtn');
  if (refBtn) refBtn.classList.add('refreshing');
  try {
    applyStatus(await api(`/train/${S.num}/status?date=${S.date}`));
    if (manual) toast('Live status updated');
    S.nextAt = Date.now() + REFRESH * 1000;
  } catch (e) {
    toast(errText(e));
    S.nextAt = Date.now() + (e.http === 429 ? 120 : REFRESH) * 1000;
  } finally {
    S.busy = false;
    if (refBtn) refBtn.classList.remove('refreshing');
  }
}

/* ---------- status -> view model ---------- */
const minsBetween = (a, b) => { const x = ms(a), y = ms(b); return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 60000); };

function idxOf(code, name) {
  if (!code && !name) return -1;
  const c = code ? String(code).trim().toUpperCase() : '';
  const n = name ? String(name).trim().toLowerCase() : '';
  let idx = -1;
  if (c) {
    idx = S.stops.findIndex(s => {
      const sc = String(g(s, 'station.code', 'stationCode', 'code', 'station_code') || '').trim().toUpperCase();
      return sc === c;
    });
  }
  if (idx < 0 && n) {
    idx = S.stops.findIndex(s => {
      const sn = String(g(s, 'station.name', 'stationName', 'name', 'station_name') || '').trim().toLowerCase();
      return sn === n;
    });
  }
  return idx;
}

function isIntermediateStop(s, idx, total) {
  if (!s) return false;
  if (idx === 0 || (total != null && idx === total - 1)) return false;

  const h = g(s, 'halt', 'isHalt', 'is_halt');
  if (h === false || h === 'false' || h === 0) return true;
  if (h === true || h === 'true') return false;

  const hm = g(s, 'haltMinutes', 'halt_minutes', 'stopMinutes');
  if (hm != null && Number(hm) === 0) return true;
  if (hm != null && Number(hm) > 0) return false;

  const sa = g(s, 'scheduledArrival', 'arrival_time');
  const sd = g(s, 'scheduledDeparture', 'departure_time');
  if (sa && sd && String(sa).trim() === String(sd).trim()) return true;

  const rem = String(g(s, 'remark', 'haltType', 'stopType') || '');
  if (/no[ -]?halt|pass[ -]?through/i.test(rem)) return true;

  return false;
}

function getActiveSegment(m) {
  if (!m || !S.stops.length) return { from: -1, to: -1, isAtStation: false, fraction: 0 };
  const total = S.stops.length;
  const ci = m.ci;
  const pi = m.pi;
  const ni = m.ni;
  const currentIsIntermediate = ci >= 0 && isIntermediateStop(S.stops[ci], ci, total);

  // 1. Final destination reached
  if (ci === total - 1 || /completed|terminated/i.test(m.run)) {
    return { from: total - 1, to: total - 1, isAtStation: true, fraction: 0 };
  }

  // 2. Explicit stationary halt
  if (m.atStation && ci >= 0) {
    return { from: ci, to: ci, isAtStation: true, fraction: 0 };
  }

  const dist = i => Number(g(S.stops[i], 'distanceKm', 'distance', 'distance_km'));
  const dc = Number(g(m.d, 'distanceCoveredKm', 'distanceCovered', 'progress.distanceCoveredKm'));

  // 3. Current Station observation anchor
  // In railway telemetry, ci is the confirmed checkpoint station.
  // The train CANNOT be behind ci - 1.
  if (ci >= 0) {
    const curDist = dist(ci);
    const prevIdx = Math.max(0, ci - 1);
    const prevDist = dist(prevIdx);
    const nextIdx = Math.min(total - 1, ci + 1);
    const nextDist = dist(nextIdx);

    const etaVal = g(m.d, 'eta.value', 'eta', 'expectedArrival', 'nextStation.expectedArrival');
    const schArr = g(S.stops[ci], 'scheduledArrival', 'arrival_time');
    const expArr = g(S.stops[ci], 'expectedArrival') || etaVal;
    const nowMs = Date.now();
    const arrMs = ms(expArr || schArr);

    // Is the train reaching / approaching ci?
    // If arrival time at ci is upcoming (within 15 min or in future), or status indicates approaching:
    const isApproachingCi = !currentIsIntermediate && (
      (arrMs != null && arrMs > nowMs - 3 * 60 * 1000) ||
      /approach|reach|arriving/i.test(m.run) ||
      (g(m.d, 'nextStation.code') === g(S.stops[ci], 'station.code', 'code'))
    );

    if (isApproachingCi && prevIdx !== ci) {
      let frac = 0.88;
      // If dc is within [prevDist, curDist], use it for exact fraction
      if (!isNaN(dc) && !isNaN(prevDist) && !isNaN(curDist) && curDist > prevDist && dc >= prevDist && dc <= curDist) {
        frac = (dc - prevDist) / (curDist - prevDist);
      } else if (arrMs != null && arrMs > nowMs) {
        const minsToArr = (arrMs - nowMs) / 60000;
        frac = Math.min(0.96, Math.max(0.75, 1 - (minsToArr / 15) * 0.25));
      }
      return { from: prevIdx, to: ci, isAtStation: false, fraction: Math.min(0.96, Math.max(0.75, frac)) };
    }

    // If status indicates halt / stopped at ci:
    if (/halt|stop|stationary|platform/i.test(m.run)) {
      return { from: ci, to: ci, isAtStation: true, fraction: 0 };
    }

    // Train has departed ci and is running to next station (ci -> nextIdx):
    if (ci < total - 1) {
      let frac = 0.20;
      if (!isNaN(dc) && !isNaN(curDist) && !isNaN(nextDist) && nextDist > curDist && dc >= curDist && dc <= nextDist) {
        frac = (dc - curDist) / (nextDist - curDist);
      }
      return { from: ci, to: nextIdx, isAtStation: false, fraction: Math.min(0.95, Math.max(0.10, frac)) };
    }

    return { from: ci, to: ci, isAtStation: true, fraction: 0 };
  }

  // 4. Fallback if ci is not matched: use physical distanceCoveredKm if available
  if (!isNaN(dc) && dc > 0 && total > 1) {
    for (let i = 0; i < total - 1; i++) {
      const d1 = dist(i), d2 = dist(i + 1);
      if (!isNaN(d1) && !isNaN(d2) && d2 > d1 && dc >= d1 && dc <= d2) {
        return { from: i, to: i + 1, isAtStation: false, fraction: (dc - d1) / (d2 - d1) };
      }
    }
  }

  // 5. Fallback using pi or index 0
  let from = pi >= 0 ? pi : 0;
  let to = ni >= 0 && ni > from ? ni : (from < total - 1 ? from + 1 : from);
  return { from, to, isAtStation: (from === to), fraction: from === to ? 0 : 0.15 };
}

function applyStatus(res) {
  const d = res.data || {}, now = Date.now();
  const fresh = String(g(d, 'freshness.state', 'freshness') || (res.status === 'STALE_DATA' ? 'STALE' : '')).toUpperCase();
  let isStale = res.status === 'STALE_DATA' || fresh === 'STALE';
  // A successful provider response can omit its freshness label. It is still
  // live unless the API explicitly marks it stale; never show a misleading
  // UNKNOWN badge for that case.
  let state = isStale ? 'STALE' : (fresh === 'RECENT' ? 'RECENT' : 'LIVE');
  const run = String(g(d, 'status', 'runningStatus', 'state') || '');
  const dc = Number(g(d, 'distanceCoveredKm', 'distanceCovered', 'progress.distanceCoveredKm'));
  let cur = stn(g(d, 'currentStation')), prev = stn(g(d, 'previousStation')), next = stn(g(d, 'nextStation'));
  let ci = idxOf(cur?.code, cur?.name);
  if (ci < 0) {
    const posCode = g(d, 'position.stationCode', 'position.code', 'lastReportedStationCode');
    if (posCode) {
      ci = idxOf(posCode);
      if (ci >= 0 && !cur) cur = stn(g(S.stops[ci], 'station')) || stn(S.stops[ci]);
    }
  }
  let pi = idxOf(prev?.code, prev?.name);
  let ni = idxOf(next?.code, next?.name);

  // A confirmed actual arrival at the final station is stronger than an older
  // in-progress checkpoint returned by a status provider.  Route data carries
  // this arrival report for completed journeys.
  const finalStop = S.stops[S.stops.length - 1];
  const finalArrival = g(finalStop, 'actualArrival', 'actual_arrival', 'actual_arrival_time');
  const statusSaysCompleted = /completed|journey[ _-]?complete|terminated/i.test(run) ||
    (/\barrived\b/i.test(run) && (ci < 0 || ci === S.stops.length - 1));
  const hasReachedDestination = statusSaysCompleted || (finalStop && finalArrival != null && finalArrival !== '');
  if (hasReachedDestination) {
    ci = S.stops.length - 1;
    pi = Math.max(0, ci - 1);
    ni = -1;
    cur = stn(g(finalStop, 'station')) || stn(finalStop);
    prev = pi >= 0 ? (stn(g(S.stops[pi], 'station')) || stn(S.stops[pi])) : null;
    next = null;
  }

  // Train is only held at a station when telemetry explicitly says so.  This
  // keeps the animation stopped during a halt and lets it resume immediately
  // after the next live update reports a departure/running state.
  const isTerminus = (ci >= 0 && ci === S.stops.length - 1);
  const atFlag = g(d,
    'atStation', 'at_station', 'isAtStation', 'is_at_station',
    'isHalted', 'is_halted', 'halted', 'position.atStation',
    'position.isAtStation', 'position.halted', 'position.status', 'currentStation.isHalted'
  );
  const curDist = ci >= 0 ? Number(g(S.stops[ci], 'distanceKm', 'distance', 'distance_km')) : null;
  const currentIsIntermediate = ci >= 0 && isIntermediateStop(S.stops[ci], ci, S.stops.length);
  const saysStopped = atFlag === true || /^(true|yes|halted|stopped|stationary|at-station)$/i.test(String(atFlag ?? ''));
  const saysMoving = atFlag === false || /^(false|no|departed|running|moving)$/i.test(String(atFlag ?? '')) || /departed|running|moving|left station/i.test(run);
  const stopStatus = /at[ _-]?station|at[ _-]?platform|halt|stationary|stopped|waiting|\barrived\b/i.test(run);
  let atStation = hasReachedDestination || isTerminus || (!currentIsIntermediate && (saysStopped || (!saysMoving && stopStatus)));
  // Only infer a station stop from distance when telemetry does not say the train is moving.
  if (!currentIsIntermediate && ci >= 0 && !isNaN(dc) && !isNaN(curDist) && dc >= curDist && !saysMoving) {
    atStation = true;
  }
  if (hasReachedDestination) {
    // Completion is a final confirmed state, not a stale in-progress position.
    isStale = false;
    state = 'COMPLETED';
  }
  S.status = d;
  S.model = { state, isStale, run: hasReachedDestination ? 'ARRIVED' : run, cur, prev, next, ci, pi, ni, atStation, d, t: now, curDist };
  S.last = now;
  S.t0 = now;
  S.model.f0 = baseFraction(S.model);

  renderAll();
}

function baseFraction(m) {
  const seg = getActiveSegment(m);
  if (seg.isAtStation || seg.from < 0 || seg.to < 0 || seg.from === seg.to) return 0;
  return Math.min(0.95, Math.max(0, seg.fraction != null ? seg.fraction : 0.15));
}

/* ---------- rendering ---------- */
const delayOf = m => (m && m.d ? g(m.d, 'delayMinutes', 'delay.minutes', 'delay') : null);
function renderAll() {
  const m = S.model || {}, d = m.d || {};
  const first = stn(g(S.stops[0], 'station')) || stn(g(d, 'origin'));
  const last = stn(g(S.stops[S.stops.length - 1], 'station')) || stn(g(d, 'destination'));
  const hasRoute = S.stops.length > 0;

  const tc = $('#trackContent');
  if (tc) tc.hidden = !hasRoute;
  $('#routeTitle').hidden = !hasRoute;
  $('#timeline').hidden = !hasRoute;
  const titleHint = $('.timeline-header-wrap'); if (titleHint) titleHint.hidden = !hasRoute;

  const noticeActive = !$('#routeNotice')?.hidden && $('#routeNotice')?.textContent.trim().length > 0;
  $('#routeVisual').hidden = !hasRoute && !noticeActive;

  $('#tName').textContent = `${S.num} ${S.name}`;
  $('#tRoute').innerHTML = (first?.name || last?.name)
    ? `<span>${esc(first?.name || '')}</span> <span class="route-arrow">→</span> <span>${esc(last?.name || '')}</span>`
    : 'Route details unavailable';
  $('#tMeta').textContent = `Journey Date: ${g(d, 'journeyDate', 'date') || S.date} · Last Observation: ${fmt(g(d, 'freshness.observedAt', 'position.observedAt', 'lastUpdated', 'updatedAt'))}`;

  const f = $('#fresh'); f.className = 'badge ' + (m.state || ''); f.textContent = m.state || 'UNKNOWN';
  const rs = $('#runState'); rs.textContent = m.run || 'Status n/a';
  if (/on[ -]?time/i.test(m.run)) rs.className = 'badge on-time';
  else if (/delay|late/i.test(m.run)) rs.className = 'badge delayed';
  else rs.className = 'badge';

  $('#lastOk').textContent = 'Last synced: ' + new Date(S.last).toLocaleTimeString();
  const w = $('#staleWarn'); w.hidden = !m.isStale;
  w.innerHTML = '<span class="route-notice-msg"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <b>Data is stale.</b> The train’s real-time movement is currently unknown; the route animation holds at the last confirmed station.</span>';

  const dl = numeric(delayOf(m)), kmOf = s => numeric(g(s, 'distanceKm', 'distance', 'distance_km')), total = S.stops.length ? kmOf(S.stops[S.stops.length - 1]) : null;
  const dc = numeric(g(d, 'distanceCoveredKm', 'distanceCovered', 'progress.distanceCoveredKm'));
  const prog = numeric(g(d, 'progressPercent', 'progress.percent', 'routeProgress.percent', 'routeProgress'));
  const speed = numeric(g(d, 'speedKmph', 'speed', 'position.speed'));
  const formatKm = value => `${Number(value.toFixed(1))} km`;

  const metricIcon = (label, delayVal) => {
    switch (label) {
      case 'Current station':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
      case 'Previous station':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`;
      case 'Next station':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`;
      case 'Est. arrival':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      case 'Est. departure':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>`;
      case 'Total distance':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`;
      case 'Distance covered':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="4" rx="1"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/></svg>`;
      case 'Remaining':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
      case 'Delay':
        return delayVal != null && delayVal > 0
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      case 'Speed':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
      case 'Progress':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
      default:
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
    }
  };

  const cards = [
    [m.atStation ? 'Current station' : 'Near', m.cur?.name],
    ['Previous station', m.prev?.name],
    ['Next station', m.next?.name],
    ['Est. arrival', fmt(g(d, 'eta.value', 'eta', 'expectedArrival', 'nextStation.expectedArrival'))],
    ['Est. departure', fmt(g(d, 'etd', 'expectedDeparture'))],
    ['Total distance', total != null ? formatKm(total) : null],
    ['Distance covered', dc != null ? formatKm(dc) : null],
    ['Remaining', total != null && dc != null ? formatKm(Math.max(0, total - dc)) : null],
    ['Delay', dl != null ? (dl <= 0 ? 'On Time' : `${dl} min late`) : null],
    ['Speed', speed > 0 ? speed + ' km/h' : null],
    ['Progress', prog != null ? Math.round(prog) + '%' : null]
  ].filter(c => c[1] != null && c[1] !== '—');

  $('#info').innerHTML = cards.map(c => {
    const isDelay = c[0] === 'Delay';
    const delayClass = isDelay ? (dl > 30 ? 'delay-heavy' : dl > 0 ? 'delay-warn' : 'delay-ok') : '';
    const isProg = c[0] === 'Progress';
    const progBar = isProg && prog != null ? `<div class="card-prog-wrap"><div class="card-prog-bar" style="width:${Math.min(100, Math.max(0, prog))}%"></div></div>` : '';
    return `<div class="card info-card ${delayClass}">
      <div class="card-label-row"><b>${c[0]}</b> <span class="card-icon">${metricIcon(c[0], dl)}</span></div>
      <span class="card-val">${esc(c[1])}</span>
      ${progBar}
    </div>`;
  }).join('');

  if (hasRoute) {
    renderTimeline();
    buildTrack();
  }
}

function renderTimeline() {
  const m = S.model || {};
  const idx = (m.ci >= 0) ? m.ci : ((m.pi >= 0) ? m.pi : -1);
  S.timelineOpen ||= new Set();
  S.timelineTouched ||= new Set();

  const stationCard = (s, i, intermediate, groupEnd) => {
    const st = stn(g(s, 'station')) || stn(s), sa = g(s, 'scheduledArrival', 'arrival_time'), aa = g(s, 'actualArrival'), sd = g(s, 'scheduledDeparture', 'departure_time'), ad = g(s, 'actualDeparture');
    const delay = g(s, 'delayMinutes') ?? minsBetween(sa, aa) ?? minsBetween(sd, ad);
    const isCur = m.ci != null && i === m.ci;
    const isDone = idx >= 0 && (i < idx || (i === idx && !m.atStation));
    const cls = `${isCur ? 'cur' : isDone ? 'done' : ''}${intermediate ? ' is-intermediate' : ''}`.trim();
    const late = delay > 0 ? ' late' : '';
    const statusPill = isCur
      ? `<span class="tl-status-pill cur">${m.atStation ? 'Current Stop' : 'Near'}</span>`
      : isDone ? '<span class="tl-status-pill done">Departed</span>' : '<span class="tl-status-pill upcoming">Upcoming</span>';
    const platform = g(s, 'platform', 'platform_number') ? `<span class="pf-badge">PF ${esc(g(s, 'platform', 'platform_number'))}</span>` : '';
    const delayBadge = delay != null ? `<span class="delay-tag ${delay > 0 ? 'late-t' : 'ok-t'}">${delay > 0 ? '+' + delay + ' min delay' : 'On Time'}</span>` : '';
    const distKm = g(s, 'distanceKm', 'distance_km');
    const betweenToggle = !intermediate && groupEnd != null
      ? `<button type="button" class="tl-expand" data-group="${i}" aria-expanded="${S.timelineOpen.has(i)}"><span>${S.timelineOpen.has(i) ? 'Hide' : 'Show'} ${groupEnd} pass-through station${groupEnd === 1 ? '' : 's'}</span><span class="tl-chevron">⌄</span></button>`
      : '';

    return `<div class="tl ${cls}${late}" data-i="${i}">
      <div class="tl-top">
        <div class="tl-name-wrap">
          <b>${esc(st.name)}</b>
          <span class="muted tl-code">${esc(st.code)}</span>
          ${platform}
          ${intermediate ? '<span class="tl-no-halt-tag">Pass-through</span>' : ''}
        </div>
        <div class="tl-badges-wrap">
          ${delayBadge}
          ${statusPill}
          ${betweenToggle}
          <button type="button" class="tl-details" data-i="${i}">Details</button>
        </div>
      </div>
      <div class="tl-timings">
        <div class="t-col"><b>Arrival</b><span>Sch: ${fmt(sa)}</span> · <span>Exp: ${fmt(g(s, 'expectedArrival'))}</span> · <span>Act: ${fmt(aa)}</span></div>
        <div class="t-col"><b>Departure</b><span>Sch: ${fmt(sd)}</span> · <span>Exp: ${fmt(g(s, 'expectedDeparture'))}</span> · <span>Act: ${fmt(ad)}</span></div>
      </div>
      <small class="tl-sub">${distKm != null ? distKm + ' km from origin' : ''} ${intermediate ? '· Train does not stop here' : ''}</small>
    </div>`;
  };

  const mainIndexes = S.stops.map((s, i) => ({ s, i })).filter(({ s, i }) => !isIntermediateStop(s, i, S.stops.length));
  $('#timeline').innerHTML = mainIndexes.map(({ s, i }, mainPos) => {
    const nextMain = mainIndexes[mainPos + 1]?.i ?? S.stops.length;
    const between = [];
    for (let j = i + 1; j < nextMain; j++) between.push(j);
    // Keep a current pass-through location visible without requiring an extra click.
    const open = S.timelineOpen.has(i) || (between.includes(m.ci) && !S.timelineTouched.has(i));
    return `<section class="tl-group ${open ? 'open' : ''}" data-group="${i}">
      ${stationCard(s, i, false, between.length || null)}
      ${between.length ? `<div class="tl-between" ${open ? '' : 'hidden'}>
        <div class="tl-between-label">Pass-through stations before the next scheduled stop</div>
        ${between.map(j => stationCard(S.stops[j], j, true)).join('')}
      </div>` : ''}
    </section>`;
  }).join('');
}

$('#timeline').onclick = async e => {
  const expand = e.target.closest('.tl-expand');
  if (expand) {
    const i = Number(expand.dataset.group);
    S.timelineTouched.add(i);
    if (S.timelineOpen.has(i)) S.timelineOpen.delete(i); else S.timelineOpen.add(i);
    renderTimeline();
    return;
  }
  const el = e.target.closest('.tl'); if (!el) return;
  // Main stations expand their in-between pass-through stations. Details stay
  // available through the dedicated button, while pass-through cards open
  // details directly as before.
  if (!el.classList.contains('is-intermediate') && !e.target.closest('.tl-details')) {
    const i = Number(el.dataset.i);
    const group = el.closest('.tl-group');
    if (group?.querySelector('.tl-between')) {
      S.timelineTouched.add(i);
      if (S.timelineOpen.has(i)) S.timelineOpen.delete(i); else S.timelineOpen.add(i);
      renderTimeline();
      return;
    }
  }
  await showStationDetails(Number(el.dataset.i));
};

async function showStationDetails(index) {
  const s = S.stops[index]; if (!s) return;
  const st = stn(g(s, 'station')) || stn(s), box = $('#stationDetail');
  box.hidden = false;
  box.innerHTML = '<div class="skel"></div>';
  let info = {}; try { info = (await api('/station/' + st.code)).data || {}; } catch {}
  const rows = {
    'Station': `${st.name} (${st.code})`,
    'State': g(info, 'state'),
    'Zone': g(info, 'zone'),
    'Division': g(info, 'division'),
    'Journey Day': g(s, 'journeyDay', 'day'),
    'Platform': g(s, 'platform', 'platform_number'),
    'Distance': g(s, 'distanceKm', 'distance_km') != null ? g(s, 'distanceKm', 'distance_km') + ' km' : null
  };
  box.innerHTML = `
    <div class="station-detail-head">
      <div>
        <div class="station-detail-title">${esc(st.name)}</div>
        <div class="station-detail-sub muted">${esc(st.code)} · Indian Railways Network</div>
      </div>
      <button type="button" class="close-btn" onclick="document.querySelector('#stationDetail').hidden=true" aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="station-detail-grid">
      ${Object.entries(rows).filter(r => r[1] != null).map(r => `
        <div class="station-detail-item">
          <b>${esc(r[0])}</b>
          <span>${esc(r[1])}</span>
        </div>
      `).join('')}
    </div>
  `;
};

/* ---------- SVG track + train animation ---------- */
const NS = 'http://www.w3.org/2000/svg'; let X = [], W = 900;
function buildTrack() {
  const svg = $('#track'), n = S.stops.length, m = S.model || {};
  if (!n) { X = []; svg.replaceChildren(); return; }
  const dist = S.stops.map(s => Number(g(s, 'distanceKm', 'distance', 'distance_km'))), useDist = dist.every((v, i) => !isNaN(v) && (i === 0 || v > dist[i - 1]));
  W = Math.max(1000, n * 110); const span = W - 160;
  X = S.stops.map((_, i) => 80 + (useDist ? (dist[i] - dist[0]) / (dist[n - 1] - dist[0] || 1) : i / (n - 1 || 1)) * span);
  if (useDist) {
    for (let i = 1; i < n; i++) X[i] = Math.max(X[i], X[i - 1] + 52);
  }
  W = Math.max(W, X[n - 1] + 100);
  svg.setAttribute('viewBox', `0 0 ${W} 220`);
  svg.style.width = W + 'px';
  const seg = getActiveSegment(m);
  const act = seg.isAtStation ? seg.from : seg.to;
  // The physical segment may end at a pass-through point; the live feed's
  // nextStation is the next scheduled stop and should receive the stop colour.
  const nextStopIdx = m?.ni >= 0 ? m.ni : -1;

  // Catenary Masts every 160px
  let masts = '';
  for (let mx = 50; mx <= W - 40; mx += 160) {
    masts += `<g class="catenary-mast" opacity="0.45">
      <line x1="${mx}" y1="20" x2="${mx}" y2="135" stroke="#475569" stroke-width="2.5"/>
      <line x1="${mx}" y1="36" x2="${mx + 16}" y2="36" stroke="#64748b" stroke-width="2"/>
      <line x1="${mx}" y1="52" x2="${mx + 16}" y2="52" stroke="#64748b" stroke-width="2"/>
      <circle cx="${mx + 16}" cy="36" r="2.5" fill="#f59e0b"/>
      <circle cx="${mx + 16}" cy="52" r="2.5" fill="#f59e0b"/>
    </g>`;
  }

  // Droppers every 28px
  let droppers = '';
  for (let dx = 40; dx <= W - 40; dx += 28) {
    droppers += `<line x1="${dx}" y1="36" x2="${dx}" y2="52" stroke="#64748b" stroke-width="1" opacity="0.35"/>`;
  }

  let h = `
  <defs>
    <linearGradient id="headlightBeam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8"/>
      <stop offset="25%" stop-color="#60a5fa" stop-opacity="0.4"/>
      <stop offset="70%" stop-color="#3b82f6" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="railGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cbd5e1"/>
      <stop offset="45%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="progRailGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="ballastGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#090d16" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="locoBodyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="50%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="coachBodyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="40%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="cabGlassGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a5f3fc"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="arcGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- 25kV Catenary Overhead Traction Infrastructure -->
  <g id="catenary">
    ${masts}
    <line x1="30" y1="36" x2="${W - 30}" y2="36" stroke="#64748b" stroke-width="1.5" opacity="0.45"/>
    ${droppers}
    <line x1="30" y1="52" x2="${W - 30}" y2="52" stroke="#38bdf8" stroke-width="2.5" opacity="0.8" class="contact-wire"/>
  </g>

  <!-- Ballast Bed Embankment -->
  <polygon points="20,154 40,126 ${W - 40},126 ${W - 20},154" fill="url(#ballastGrad)"/>

  <!-- Pre-stressed Concrete Sleepers -->
  <g id="sleepers">${Array.from({ length: Math.floor((W - 80) / 14) }, (_, i) => `<rect class="sleeper" x="${40 + i * 14}" y="122" width="5.5" height="19" rx="1.5" fill="#475569" opacity="0.8"/>`).join('')}</g>

  <!-- Twin Steel Rails -->
  <rect x="35" y="124" width="${W - 70}" height="3" rx="1.5" fill="#64748b" opacity="0.6"/>
  <rect x="35" y="132" width="${W - 70}" height="4.5" rx="2" fill="url(#railGrad)"/>
  <rect id="prog" x="40" y="132" width="0" height="4.5" rx="2" fill="url(#progRailGrad)" filter="url(#trackGlow)"/>
  `;

  // Stations along the track
  S.stops.forEach((s, i) => {
    const st = stn(g(s, 'station')) || stn(s);
    const done = seg.from >= 0 && (i < seg.from || (i === seg.from && !seg.isAtStation && seg.from !== m?.ci));
    const isCur = m?.ci != null ? i === m.ci : (seg.from >= 0 && i === seg.from);
    const isTarget = act >= 0 && i === act && !seg.isAtStation;
    const isStationHalt = Boolean(m?.atStation && isCur);
    const isNextStop = nextStopIdx === i && !isStationHalt;
    const intermediate = isIntermediateStop(s, i, n);
    // Keep non-stop stations purple after passing them too, so their route
    // role remains visible instead of being changed to the completed colour.
    const col = isStationHalt ? '#10b981' : isCur ? '#3b82f6' : isNextStop ? '#f59e0b' : isTarget ? '#a855f7' : intermediate ? '#a855f7' : done ? '#10b981' : '#38bdf8';
    const bg = isStationHalt ? 'rgba(16,185,129,0.3)' : isCur ? 'rgba(59,130,246,0.25)' : isNextStop ? 'rgba(245,158,11,0.16)' : intermediate ? 'rgba(168,85,247,0.14)' : done ? 'rgba(16,185,129,0.18)' : 'rgba(56,189,248,0.12)';
    const pulse = isStationHalt
      ? `<circle cx="${X[i]}" cy="134" r="18" fill="#10b981" opacity="0.45"><animate attributeName="r" values="8;24;8" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite"/></circle>`
      : (isCur ? `<circle cx="${X[i]}" cy="134" r="16" fill="#3b82f6" opacity="0.4"><animate attributeName="r" values="8;20;8" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite"/></circle>` : '');
    const node = isStationHalt
      ? `<circle cx="${X[i]}" cy="134" r="9" fill="#10b981" stroke="#ffffff" stroke-width="2.5"/>`
      : (isCur ? `<circle cx="${X[i]}" cy="134" r="8" fill="#3b82f6" stroke="#ffffff" stroke-width="2.5"/>` : isNextStop ? `<circle cx="${X[i]}" cy="134" r="7" fill="#f59e0b" stroke="#fef3c7" stroke-width="2"/>` : intermediate ? `<circle cx="${X[i]}" cy="134" r="5" fill="#0b1020" stroke="${col}" stroke-width="2"/>` : `<circle cx="${X[i]}" cy="134" r="6" fill="#38bdf8" stroke="#e0f2fe" stroke-width="1.8"/>`);

    h += `<g class="stn" data-i="${i}" style="cursor:pointer">
      <line x1="${X[i]}" y1="134" x2="${X[i]}" y2="160" stroke="${col}" stroke-width="1.5" stroke-dasharray="${isCur || isStationHalt ? 'none' : '3,3'}" opacity="0.6"/>
      ${pulse}
      ${node}
      <g transform="translate(${X[i]}, 166)">
        <rect x="-26" y="0" width="52" height="22" rx="11" fill="${bg}" stroke="${col}" stroke-width="${isCur || isStationHalt ? 2 : 1.2}"/>
        <text x="0" y="15" text-anchor="middle" font-size="11" font-weight="${isCur || isStationHalt || isNextStop ? '800' : '700'}" fill="${isStationHalt ? '#6ee7b7' : isCur ? '#60a5fa' : isNextStop ? '#fcd34d' : intermediate ? '#d8b4fe' : done ? '#34d399' : '#7dd3fc'}">${esc(st.code || st.name)}</text>
        <text x="0" y="34" text-anchor="middle" font-size="9.5" font-weight="500" fill="var(--text-muted)">${esc((st.name || '').slice(0, 12))}</text>
      </g>
    </g>`;
  });

  // Train Group: Aerodynamic Electric Locomotive + Coach + Pantograph + Headlights + Rotating Wheels + Overhead HUD
  h += `
  <g id="trainG">
    <!-- Floating Overhead Train HUD Badge -->
    <g id="trainHud" class="train-hud" transform="translate(-18, -4)">
      <rect id="trainHudBg" x="-75" y="8" width="150" height="24" rx="12" fill="#090d16" stroke="#38bdf8" stroke-width="1.5" opacity="0.95"/>
      <polygon id="trainHudArrow" points="-5,32 0,37 5,32" fill="#090d16" stroke="#38bdf8" stroke-width="1.2"/>
      <line id="trainHudSeam" x1="-4" y1="32" x2="4" y2="32" stroke="#090d16" stroke-width="2"/>
      <text id="trainHudText" x="0" y="24" text-anchor="middle" font-size="10" font-weight="700" fill="#f8fafc">Cruising</text>
    </g>

    <polygon class="headlight-beam" points="48,114 260,76 260,152" fill="url(#headlightBeam)"/>

    <g id="trainChassis">
      <g transform="translate(-104, 76)">
        <rect x="0" y="6" width="76" height="38" rx="5" fill="url(#coachBodyGrad)" stroke="#1e3a8a" stroke-width="1"/>
        <rect x="0" y="24" width="76" height="4" fill="#f59e0b" opacity="0.9"/>
        <rect x="8" y="12" width="16" height="10" rx="2" fill="#fef08a" opacity="0.9" stroke="#0f172a" stroke-width="1"/>
        <rect x="30" y="12" width="16" height="10" rx="2" fill="#fef08a" opacity="0.9" stroke="#0f172a" stroke-width="1"/>
        <rect x="52" y="12" width="16" height="10" rx="2" fill="#fef08a" opacity="0.9" stroke="#0f172a" stroke-width="1"/>
        <circle cx="16" cy="18" r="3" fill="#1e293b" opacity="0.5"/>
        <circle cx="38" cy="18" r="3" fill="#1e293b" opacity="0.5"/>
        <circle cx="60" cy="18" r="3" fill="#1e293b" opacity="0.5"/>
        <rect x="20" y="2" width="36" height="4" rx="2" fill="#475569"/>
      </g>

      <g transform="translate(-28, 86)">
        <rect x="0" y="0" width="10" height="26" rx="2" fill="#1e293b"/>
        <line x1="3" y1="2" x2="3" y2="24" stroke="#475569" stroke-width="1.5"/>
        <line x1="7" y1="2" x2="7" y2="24" stroke="#475569" stroke-width="1.5"/>
      </g>

      <g transform="translate(-18, 76)">
        <path d="M 0,8 L 44,8 Q 62,12 68,26 L 68,44 L 0,44 Z" fill="url(#locoBodyGrad)" stroke="#1e3a8a" stroke-width="1"/>
        <polygon points="56,44 70,44 66,48 56,48" fill="#334155"/>
        <path d="M 0,26 L 46,26 Q 58,28 66,38 L 66,42 L 0,42 Z" fill="#f59e0b" opacity="0.95"/>
        <rect x="0" y="39" width="60" height="2.5" fill="#ffffff" opacity="0.8"/>

        <path d="M 38,12 L 48,12 Q 58,16 62,24 L 46,24 Q 40,16 38,12 Z" fill="url(#cabGlassGrad)" stroke="#0f172a" stroke-width="1"/>
        <path d="M 40,14 L 46,14 Q 52,18 56,22" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.6"/>

        <rect x="10" y="16" width="18" height="6" rx="1.5" fill="#0f172a" opacity="0.6"/>
        <line x1="13" y1="18" x2="25" y2="18" stroke="#64748b" stroke-width="1"/>
        <line x1="13" y1="20" x2="25" y2="20" stroke="#64748b" stroke-width="1"/>
        <circle cx="32" cy="19" r="3" fill="#ffffff" opacity="0.9"/>
        <circle cx="32" cy="19" r="1.5" fill="#dc2626"/>

        <circle cx="66" cy="38" r="3.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1" filter="url(#arcGlow)"/>
        <circle cx="66" cy="38" r="1.8" fill="#ffffff"/>

        <g class="pantograph-assembly">
          <rect x="10" y="4" width="16" height="4" rx="1" fill="#334155"/>
          <circle cx="12" cy="6" r="2" fill="#f59e0b"/>
          <circle cx="24" cy="6" r="2" fill="#f59e0b"/>
          <line x1="14" y1="4" x2="8" y2="-12" stroke="#94a3b8" stroke-width="2"/>
          <line x1="8" y1="-12" x2="20" y2="-24" stroke="#94a3b8" stroke-width="2"/>
          <line x1="22" y1="4" x2="16" y2="-10" stroke="#64748b" stroke-width="1.5"/>
          <line x1="12" y1="-24" x2="28" y2="-24" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/>
          <g class="traction-arc">
            <circle cx="20" cy="-24" r="4" fill="#38bdf8" filter="url(#arcGlow)"/>
            <circle cx="20" cy="-24" r="2" fill="#ffffff"/>
          </g>
        </g>
      </g>

      ${[-92, -66, -42].map(c => `
        <g class="wheel">
          <circle cx="${c}" cy="125" r="7" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
          <line x1="${c - 6}" y1="125" x2="${c + 6}" y2="125" stroke="#cbd5e1" stroke-width="1.2"/>
          <line x1="${c}" y1="119" x2="${c}" y2="131" stroke="#cbd5e1" stroke-width="1.2"/>
          <circle cx="${c}" cy="125" r="2.5" fill="#f8fafc"/>
        </g>
      `).join('')}

      ${[-6, 16, 38].map(c => `
        <g class="wheel">
          <circle cx="${c}" cy="125" r="7" fill="#0f172a" stroke="#cbd5e1" stroke-width="1.8"/>
          <line x1="${c - 6}" y1="125" x2="${c + 6}" y2="125" stroke="#e2e8f0" stroke-width="1.3"/>
          <line x1="${c}" y1="119" x2="${c}" y2="131" stroke="#e2e8f0" stroke-width="1.3"/>
          <line x1="${c - 4}" y1="121" x2="${c + 4}" y2="129" stroke="#94a3b8" stroke-width="1"/>
          <line x1="${c - 4}" y1="129" x2="${c + 4}" y2="121" stroke="#94a3b8" stroke-width="1"/>
          <circle cx="${c}" cy="125" r="2.8" fill="#f8fafc"/>
        </g>
      `).join('')}

      <circle class="smoke" cx="-90" cy="118" r="5" fill="#64748b"/>
      <circle class="smoke" cx="-85" cy="116" r="4" fill="#94a3b8"/>
    </g>
  </g>
  `;

  svg.innerHTML = h;
}

// Where should the train be right now? Returns {x, moving, note, ...}. Never invents data.
function target() {
  const m = S.model; if (!m || !X.length) return null;
  const at = i => X[Math.max(0, Math.min(X.length - 1, i))];

  if (m.isStale) {
    const i = m.ci >= 0 ? m.ci : (m.pi >= 0 ? m.pi : 0);
    return {
      x: at(i),
      moving: false,
      isHalted: true,
      isApproaching: false,
      hudText: 'Data Stale · Position Held',
      hudType: 'halted',
      trackLabel: 'Data Stale · Station Position Held',
      note: 'Data is stale – movement state unknown. Showing last reported station only.'
    };
  }

  const seg = getActiveSegment(m);
  const stFrom = stn(g(S.stops[seg.from], 'station')) || stn(S.stops[seg.from]);
  const stTo = stn(g(S.stops[seg.to], 'station')) || stn(S.stops[seg.to]);
  const fromName = stFrom?.name || m.cur?.name || m.prev?.name || 'Station';
  const fromCode = stFrom?.code || m.cur?.code || m.prev?.code || '';
  const toName = stTo?.name || m.next?.name || 'Next Station';
  const toCode = stTo?.code || m.next?.code || '';

  const dist = i => Number(g(S.stops[i], 'distanceKm', 'distance', 'distance_km'));
  const dFrom = dist(seg.from), dTo = dist(seg.to);
  const dc = Number(g(m.d, 'distanceCoveredKm', 'distanceCovered', 'progress.distanceCoveredKm'));
  const prog = Number(g(m.d, 'progressPercent', 'progress.percent', 'routeProgress.percent', 'routeProgress'));
  const totalDist = dist(S.stops.length - 1);

  let kmLeft = null;
  if (!isNaN(dc) && dc > 0 && !isNaN(dTo) && dTo >= dc) {
    kmLeft = Math.max(0, dTo - dc);
  } else if (!isNaN(prog) && prog > 0 && !isNaN(totalDist) && totalDist > 0 && !isNaN(dTo)) {
    const curKm = (prog / 100) * totalDist;
    kmLeft = Math.max(0, dTo - curKm);
  } else if (seg.fraction != null && !isNaN(dTo) && !isNaN(dFrom) && dTo > dFrom) {
    const sectionLen = dTo - dFrom;
    kmLeft = Math.max(0, sectionLen * (1 - seg.fraction));
  } else if (seg.to > seg.from && X[seg.to] && X[seg.from]) {
    const fracLeft = 1 - (seg.fraction || 0.15);
    const estSpan = (!isNaN(dTo) && !isNaN(dFrom) && dTo > dFrom) ? (dTo - dFrom) : 6;
    kmLeft = Math.max(0, fracLeft * estSpan);
  }

  // 1. Train reached and stopped at station
  const isHalted = seg.isAtStation || seg.from === seg.to || Boolean(m.atStation) || (kmLeft != null && kmLeft <= 0.15 && /halt|stop/i.test(m.run));
  if (isHalted) {
    const hStation = (seg.from >= 0 ? fromName : (m.cur?.name || 'Station'));
    const hCode = (seg.from >= 0 ? fromCode : (m.cur?.code || ''));
    const hasArrived = !isNaN(dc) && !isNaN(m.curDist) && dc >= m.curDist;
    return {
      x: at(seg.from >= 0 ? seg.from : m.ci),
      moving: false,
      isHalted: true,
      isApproaching: false,
      kmLeft: 0,
      hudText: hasArrived ? `Arrived: ${hCode ? hCode + ' · ' : ''}${hStation}` : `Stationary: ${hCode ? hCode + ' · ' : ''}${hStation}`,
      hudType: 'halted',
      trackLabel: hasArrived ? `Arrived at ${hStation}` : `Stationary at Platform (${hStation})`,
      note: hasArrived ? `Arrived at ${hStation} station.` : `Stationary at ${hStation} platform (as reported by the API).`
    };
  }

  // 2. Approaching next station (1-2 km left: kmLeft <= 2.2)
  const isApproaching = (kmLeft != null && kmLeft <= 2.2);
  if (isApproaching) {
    const apprFrac = Math.min(0.96, Math.max(0.85, seg.fraction != null ? seg.fraction : 0.88));
    const targetX = at(seg.from) + (at(seg.to) - at(seg.from)) * apprFrac;
    return {
      x: targetX,
      moving: true,
      isHalted: false,
      isApproaching: true,
      kmLeft,
      hudText: `Near ${toCode || toName}`,
      hudType: 'approaching',
      trackLabel: `Near ${toName}`,
      note: `Near ${toName}${kmLeft > 0 ? ` · ${kmLeft.toFixed(1)} km left` : ''}.`
    };
  }

  // 3. Cruising en route
  const f = Math.min(0.95, Math.max(0, seg.fraction != null ? seg.fraction : 0.15));
  const realX = at(seg.from) + (at(seg.to) - at(seg.from)) * f;
  const isLeaving = (f <= 0.25);
  const hudTxt = isLeaving
    ? `Departing ${fromCode || fromName} → ${toCode || toName}`
    : (kmLeft != null ? `${toCode || toName}: ${kmLeft.toFixed(1)} km left` : `Cruising to ${toCode || toName}`);

  return {
    x: realX,
    moving: true,
    isHalted: false,
    isApproaching: false,
    kmLeft,
    hudText: hudTxt,
    hudType: 'cruising',
    trackLabel: '25kV AC Traction · Running on Track',
    note: `Between ${fromName} and ${toName}. Live tracking based on railway telemetry.`
  };
}

function startAnim() {
  cancelAnimationFrame(S.raf); let init = false, lastNote = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loop = () => {
    const t = target(), g1 = $('#trainG');
    if (t && g1 && t.x != null) {
      if (!init || S.cur == null) {
        S.cur = t.x;
        init = true;
        const wrap = $('.svgwrap');
        if (wrap) wrap.scrollLeft = Math.max(0, t.x - 240);
      } else {
        // Enforce unidirectional forward motion on auto-refresh or minor telemetry jitter
        if (t.x >= S.cur) {
          S.cur += (t.x - S.cur) * (reduce ? 1 : 0.06);
        }
      }
      g1.setAttribute('transform', `translate(${S.cur},0)`);
      $('#prog')?.setAttribute('width', Math.max(0, S.cur - 40));

      const mv = Boolean(t.moving);
      const isHalted = Boolean(t.isHalted);
      const isAppr = Boolean(t.isApproaching);

      const track = $('#track');
      if (track) {
        track.classList.toggle('moving', mv);
        track.classList.toggle('moving-track', mv);
        track.classList.toggle('train-halted', isHalted);
        track.classList.toggle('train-approaching', isAppr);
      }

      // Update Overhead Floating Train HUD Badge
      const hud = $('#trainHud');
      const hudBg = $('#trainHudBg');
      const hudArrow = $('#trainHudArrow');
      const hudText = $('#trainHudText');

      if (hud && hudText && t.hudText) {
        hudText.textContent = t.hudText;
        hud.setAttribute('class', 'train-hud ' + (t.hudType || ''));

        // Adjust HUD pill width dynamically based on text
        const w = Math.min(230, Math.max(130, t.hudText.length * 7.5 + 24));
        const hx = -Math.round(w / 2);
        hudBg?.setAttribute('x', hx);
        hudBg?.setAttribute('width', w);

        if (t.hudType === 'halted') {
          hudBg?.setAttribute('stroke', '#10b981');
          hudArrow?.setAttribute('stroke', '#10b981');
          hudText.setAttribute('fill', '#6ee7b7');
        } else if (t.hudType === 'approaching') {
          hudBg?.setAttribute('stroke', '#f59e0b');
          hudArrow?.setAttribute('stroke', '#f59e0b');
          hudText.setAttribute('fill', '#fef08a');
        } else {
          hudBg?.setAttribute('stroke', '#38bdf8');
          hudArrow?.setAttribute('stroke', '#38bdf8');
          hudText.setAttribute('fill', '#e0f2fe');
        }
      }

      const tag = $('#trackLabel');
      if (tag) {
        tag.textContent = t.trackLabel || (mv ? '25kV AC Traction · Running on Track' : '25kV AC Electric Traction Route');
      }

      if (t.note !== lastNote) { $('#animNote').textContent = t.note; lastNote = t.note; }
    } else if (t && t.note !== lastNote) { $('#animNote').textContent = t.note; lastNote = t.note; }
    S.raf = requestAnimationFrame(loop);
  };
  loop();
}

// Track navigation buttons handlers
$('#btnFocusTrain')?.addEventListener('click', () => {
  const wrap = $('.svgwrap');
  if (wrap && S.cur != null) wrap.scrollTo({ left: Math.max(0, S.cur - 240), behavior: 'smooth' });
});
$('#btnTrackOrigin')?.addEventListener('click', () => {
  const wrap = $('.svgwrap');
  if (wrap) wrap.scrollTo({ left: 0, behavior: 'smooth' });
});
$('#btnTrackDest')?.addEventListener('click', () => {
  const wrap = $('.svgwrap');
  if (wrap) wrap.scrollTo({ left: wrap.scrollWidth, behavior: 'smooth' });
});

// Click station on track to open details
$('#track')?.addEventListener('click', e => {
  const stnEl = e.target.closest('.stn');
  if (!stnEl) return;
  const idx = stnEl.dataset.i;
  const tlItem = $(`#timeline .tl[data-i="${idx}"]`);
  if (tlItem) {
    tlItem.click();
    tlItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

/* ---------- station board ---------- */
$('#stForm').onsubmit = async e => {
  e.preventDefault(); let q = $('#sq').value.trim(); if (!q) return;
  if (!/^[A-Za-z]{2,5}$/.test(q) || q.length > 5) {
    try {
      const d = lst((await api('/stations/search?q=' + encodeURIComponent(q))).data);
      if (!d.length) return toast('No station found');
      q = g(d[0], 'code', 'stationCode');
    } catch (e) { return toast(errText(e)); }
  }
  loadBoard(q);
};

// Station quick buttons
$('#stQuickNDLS')?.addEventListener('click', () => { $('#sq').value = 'NDLS'; loadBoard('NDLS'); });
$('#stQuickMMCT')?.addEventListener('click', () => { $('#sq').value = 'MMCT'; loadBoard('MMCT'); });
$('#stQuickBRC')?.addEventListener('click', () => { $('#sq').value = 'BRC'; loadBoard('BRC'); });
$('#stQuickHWH')?.addEventListener('click', () => { $('#sq').value = 'HWH'; loadBoard('HWH'); });
$('#stQuickMAS')?.addEventListener('click', () => { $('#sq').value = 'MAS'; loadBoard('MAS'); });

async function loadBoard(code) {
  $('#board').innerHTML = '<div class="skel"></div><div class="skel"></div>'; $('#boardHead').textContent = '';
  try {
    const res = await api(`/station/${code}/live`), rows = lst(g(res.data, 'trains', 'entries', 'board', 'departures') ?? res.data);
    $('#boardHead').innerHTML = `<div class="board-badge">Station <b>${code.toUpperCase()}</b></div> · <span class="${res.status === 'STALE_DATA' ? 'warn-badge' : 'live-badge'}">${res.status === 'STALE_DATA' ? 'STALE data' : '● LIVE data'}</span> · <span>${rows.length} trains scheduled</span>`;
    if (!rows.length) { $('#board').innerHTML = '<div class="empty-state"><span class="empty-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H4z"/><path d="M12 16v5"/><path d="M8 21h8"/><circle cx="8" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg></span><p class="muted">No trains in the current time window.</p></div>'; return; }
    $('#board').innerHTML = `<div class="tw"><table class="board-table">
      <thead>
        <tr>
          <th>Train</th>
          <th>Running State</th>
          <th>Sch Arr</th>
          <th>Exp Arr</th>
          <th>Sch Dep</th>
          <th>Exp Dep</th>
          <th>Delay</th>
          <th>PF</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const s = String(g(r, 'state', 'liveState', 'status') || '');
          const dl = g(r, 'delayMinutes', 'delay');
          const isAt = /at|arriv/i.test(s);
          const dlNum = Number(dl);
          const dlClass = dl == null || isNaN(dlNum) || dlNum <= 0 ? 'delay-ok' : dlNum > 30 ? 'delay-heavy' : 'delay-warn';
          return `<tr class="${isAt ? 'blink' : ''}">
            <td><a href="#train/${esc(g(r, 'trainNumber', 'number', 'train.number'))}" class="train-link"><b>${esc(g(r, 'trainNumber', 'number', 'train.number'))}</b></a> <span class="board-tname">${esc(g(r, 'trainName', 'name', 'train.name'))}</span></td>
            <td><span class="board-status ${isAt ? 'active-stn' : ''}">${esc(s || '—')}</span></td>
            <td>${fmt(g(r, 'scheduledArrival'))}</td>
            <td>${fmt(g(r, 'expectedArrival'))}</td>
            <td>${fmt(g(r, 'scheduledDeparture'))}</td>
            <td>${fmt(g(r, 'expectedDeparture'))}</td>
            <td><span class="delay-pill ${dlClass}">${dl != null && !isNaN(dlNum) ? (dlNum > 0 ? '+' + dlNum + ' m' : 'On Time') : '—'}</span></td>
            <td><span class="pf-badge">${esc(g(r, 'platform') ?? '—')}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  } catch (e) { $('#board').innerHTML = `<div class="err">${esc(errText(e))}</div>`; }
}

/* ---------- schedule ---------- */
// Schedule quick buttons
$('#scQuick22930')?.addEventListener('click', () => { $('#scq').value = '22930'; $('#scForm').dispatchEvent(new Event('submit')); });
$('#scQuick12951')?.addEventListener('click', () => { $('#scq').value = '12951'; $('#scForm').dispatchEvent(new Event('submit')); });
$('#scQuick22435')?.addEventListener('click', () => { $('#scq').value = '22435'; $('#scForm').dispatchEvent(new Event('submit')); });

$('#scForm').onsubmit = async e => {
  e.preventDefault(); const n = $('#scq').value.trim(); if (!/^\d{5}$/.test(n)) return toast('Enter a 5-digit train number');
  $('#schedOut').innerHTML = '<div class="skel"></div><div class="skel"></div>';
  try {
    const res = await api(`/train/${n}/schedule?date=${$('#scd').value || today()}`);
    const d = res.data || {};
    const stops = lst(g(d, 'stops', 'stations', 'route') ?? d);
    const trainNumVal = g(d, 'trainNumber', 'train_number') || n;
    const trainNameVal = g(d, 'trainName', 'train_name') || '';
    const src = g(d, 'sourceStationCode', 'source_station_code', 'origin.code') || '';
    const dest = g(d, 'destinationStationCode', 'destination_station_code', 'destination.code') || '';
    const days = Array.isArray(d.runningDays || d.running_days) ? (d.runningDays || d.running_days).join(', ') : (d.runningDays || d.running_days || 'Daily');
    const classes = Array.isArray(d.classes) ? d.classes.join(', ') : (d.classes || 'All Classes');
    const dist = g(d, 'distanceKm', 'distance_km');
    const dur = g(d, 'totalDurationMinutes', 'total_duration_minutes');

    let html = `
      <div class="card sched-summary">
        <div>
          <div class="sched-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><circle cx="8" cy="15" r="1.5"/><circle cx="16" cy="15" r="1.5"/><path d="m8 19-3 3"/><path d="m16 19 3 3"/></svg>
            <span>${esc(trainNumVal)} ${esc(trainNameVal)}</span>
          </div>
          <div class="muted">${src && dest ? esc(src) + ' → ' + esc(dest) : ''}</div>
          <div class="sched-tags">
            <span class="sched-tag highlight">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${esc(days)}
            </span>
            <span class="sched-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
              ${esc(classes)}
            </span>
            ${dist != null ? `<span class="sched-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
              ${esc(dist)} km
            </span>` : ''}
            ${dur != null ? `<span class="sched-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${Math.floor(dur / 60)}h ${dur % 60}m
            </span>` : ''}
          </div>
        </div>
        <div>
          <button type="button" class="ghost track-now-btn" onclick="location.hash='train/${esc(trainNumVal)}'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Live Track</span>
          </button>
        </div>
      </div>
    `;

    if (stops.length) {
      html += `
        <div class="tw">
          <table class="sched-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Station</th>
                <th>Sch Arr</th>
                <th>Sch Dep</th>
                <th>Halt</th>
                <th>PF</th>
                <th>Distance</th>
                <th>Day</th>
              </tr>
            </thead>
            <tbody>
              ${stops.map((s, idx) => {
                const st = stn(g(s, 'station')) || stn(s);
                const seq = g(s, 'sequence') || (idx + 1);
                const arr = g(s, 'scheduledArrival', 'arrival_time');
                const dep = g(s, 'scheduledDeparture', 'departure_time');
                const pf = g(s, 'platform', 'platform_number') || '—';
                const distKm = g(s, 'distanceKm', 'distance_km');
                const haltM = g(s, 'haltMinutes', 'halt_minutes');
                const day = g(s, 'day') || 1;
                return `<tr>
                  <td class="sched-seq">${esc(seq)}</td>
                  <td><span class="sched-stn-name">${esc(st.name || st.code)}</span> <span class="sched-stn-code">${esc(st.code)}</span></td>
                  <td>${fmt(arr)}</td>
                  <td>${fmt(dep)}</td>
                  <td>${haltM != null ? haltM + ' m' : (arr && dep && arr !== dep ? 'Halt' : '—')}</td>
                  <td><span class="pf-badge">${esc(pf)}</span></td>
                  <td>${distKm != null ? distKm + ' km' : '—'}</td>
                  <td>Day ${esc(day)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    $('#schedOut').innerHTML = html;
  } catch (e) {
    $('#schedOut').innerHTML = `<div class="err">${esc(errText(e))}</div>`;
  }
};

route();
