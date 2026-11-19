// RailTrack API proxy: Dual-Engine Architecture (RailEngine + RailCore)
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const KEY_RE = process.env.RAILWAY_ENGINE_API_KEY;
const KEY_RC = process.env.RAILCORE_API_KEY || 'rk_live_5Neu3w4o04FNCQ-Zh5_2uIM1ySm3YmbR';
const KEY_RR = process.env.RAILRADAR_API_KEY;
const KEY_RK = process.env.RAILKIT_API_KEY;
const BASE_RE = 'https://railway-engine.apkscope.workers.dev';
const BASE_RC = 'https://ir.railcore.tech/v1';
const BASE_RR = 'https://api.railradar.in';
let railkit = null;

if (KEY_RK) {
  try {
    railkit = require('railkit');
    railkit.configure(KEY_RK);
  } catch (e) {
    console.warn('[RailKit] SDK unavailable:', e.message);
  }
}

if (!KEY_RE && !KEY_RC && !KEY_RR && !railkit) {
  console.error('Missing API keys in .env');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'ERROR', data: null, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } }
}));

const cache = new Map();
const inflight = new Map();
let callsRE = [];
let callsRC = [];
let callsRR = [];

const err = (code, c, m, reqId) => ({ code, body: { status: 'ERROR', data: null, error: { code: c, message: m }, meta: { requestId: reqId } } });
const isDate = s => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);

// Safe response sender
const send = (res, r) => {
  if (r.retryAfter) res.set('Retry-After', String(r.retryAfter));
  res.status(r.code).json(r.body);
};
const bad = (res, m) => res.status(400).json(err(400, 'INVALID_REQUEST', m).body);

// Upstream caller for RailEngine
async function fetchRE(p, ttl) {
  const cacheKey = 'RE:' + p;
  const hit = cache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.t < (hit.ttl || ttl)) return hit;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const job = (async () => {
    callsRE = callsRE.filter(t => Date.now() - t < 60_000);
    if (callsRE.length >= 50) return err(429, 'RATE_LIMITED', 'RailEngine budget reached.', null);
    callsRE.push(Date.now());
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10_000);
    try {
      const r = await fetch(BASE_RE + p, { headers: { 'x-api-key': KEY_RE }, signal: ctl.signal });
      const body = await r.json().catch(() => null);
      if (!body) return err(502, 'BAD_RESPONSE', 'RailEngine returned non-JSON.');
      const reqId = body?.meta?.requestId || r.headers.get('x-request-id') || '-';
      const errCode = body?.error?.code || (r.ok ? 'OK' : 'HTTP_' + r.status);
      console.log(`[RailEngine ${r.status}] ${p} -> ${errCode} (reqId: ${reqId})`);

      const rawRetry = r.headers.get('retry-after');
      let retryAfter = rawRetry ? parseInt(rawRetry, 10) : (r.status === 429 ? 60 : null);
      const e = { t: Date.now(), code: r.status, body, ttl: r.status === 429 ? 60000 : ttl, retryAfter };
      if (r.ok || r.status === 429) cache.set(cacheKey, e);
      return e;
    } catch (e) {
      return err(503, e.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', e.message);
    } finally {
      clearTimeout(to);
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, job);
  return job;
}

// Upstream caller for RailCore
async function fetchRC(p, ttl) {
  const cacheKey = 'RC:' + p;
  const hit = cache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.t < (hit.ttl || ttl)) return hit;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const job = (async () => {
    callsRC = callsRC.filter(t => Date.now() - t < 60_000);
    callsRC.push(Date.now());
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10_000);
    try {
      const r = await fetch(BASE_RC + p, { headers: { 'X-RailCore-Key': KEY_RC }, signal: ctl.signal });
      const body = await r.json().catch(() => null);
      if (!body) return err(502, 'BAD_RESPONSE', 'RailCore returned non-JSON.');
      const reqId = body?.meta?.request_id || r.headers.get('x-request-id') || '-';
      const errCode = body?.error?.code || (r.ok ? 'OK' : 'HTTP_' + r.status);
      console.log(`[RailCore ${r.status}] ${p} -> ${errCode} (reqId: ${reqId})`);

      const rawRetry = r.headers.get('retry-after');
      const retryAfter = rawRetry ? parseInt(rawRetry, 10) : (r.status === 429 ? 60 : null);
      const e = { t: Date.now(), code: r.status, body, ttl: r.status === 429 ? retryAfter * 1000 : ttl, retryAfter };
      if (r.ok || r.status === 429) cache.set(cacheKey, e);
      return e;
    } catch (e) {
      return err(503, e.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', e.message);
    } finally {
      clearTimeout(to);
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, job);
  return job;
}

// RailRadar is queried with authoritative=true to avoid presenting a cached
// station position as a current one. It is preferred when available because it
// carries the live location, speed, and station state in one response.
async function fetchRR(p, ttl) {
  const cacheKey = 'RR:' + p;
  const hit = cache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.t < (hit.ttl || ttl)) return hit;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const job = (async () => {
    callsRR = callsRR.filter(t => Date.now() - t < 60_000);
    if (callsRR.length >= 8) return err(429, 'RATE_LIMITED', 'RailRadar budget reached.', null);
    callsRR.push(Date.now());
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10_000);
    try {
      const r = await fetch(BASE_RR + p, { headers: { Authorization: `Bearer ${KEY_RR}` }, signal: ctl.signal });
      const body = await r.json().catch(() => null);
      if (!body) return err(502, 'BAD_RESPONSE', 'RailRadar returned non-JSON.');
      const reqId = body?.meta?.traceId || r.headers.get('x-request-id') || '-';
      console.log(`[RailRadar ${r.status}] ${p} -> ${body?.success ? 'OK' : 'ERROR'} (reqId: ${reqId})`);
      const e = { t: Date.now(), code: r.status, body, ttl };
      if (r.ok) cache.set(cacheKey, e);
      return e;
    } catch (e) {
      return err(503, e.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', e.message);
    } finally {
      clearTimeout(to);
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, job);
  return job;
}

const station = (code, name) => code ? { code, name: name || code } : null;
const dateForRailKit = date => (date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).split('-').reverse().join('-');

function normalizeLive(data, provider, number, date) {
  const location = data.currentLocation || {};
  const train = data.train || (Array.isArray(data.trainInfo) ? data.trainInfo[0] : data.trainInfo) || {};
  const code = location.stationCode || location.stnCode;
  const name = location.stationName || location.stnName;
  const previous = data.previousHalt || {};
  const next = data.nextHalt || location.nextStation || {};
  const previousCode = previous.stationCode || previous.stnCode;
  const nextCode = next.stationCode || next.stnCode;
  const covered = Number(location.distanceFromOriginKm);
  const total = Number(train.distance);
  const progressPercent = Number.isFinite(covered) && Number.isFinite(total) && total > 0
    ? Math.max(0, Math.min(100, Math.round((covered / total) * 100)))
    : null;
  return {
    status: 'SUCCESS',
    data: {
      trainNumber: data.trainNumber || train.number || number,
      trainName: data.trainName || train.name,
      journeyDate: data.startDate || date,
      status: String(data.status || 'RUNNING').toUpperCase(),
      origin: station(train.source?.code, train.source?.name),
      destination: station(train.destination?.code, train.destination?.name),
      currentStation: station(code, name),
      previousStation: station(previousCode, previous.stationName || previous.stnName),
      nextStation: station(nextCode, next.stationName || next.stnName),
      position: code ? { stationCode: code, observedAt: data.lastUpdatedAt, status: location.status } : null,
      speedKmph: location.speedKmh ?? null,
      delayMinutes: location.delayMinutes ?? data.delayMinutes ?? 0,
      distanceCoveredKm: Number.isFinite(covered) ? covered : null,
      progressPercent,
      freshness: { state: data.isLive ? 'LIVE' : 'RECENT', observedAt: data.lastUpdatedAt || new Date().toISOString(), provider },
      confidence: data.trackingMode === 'real-time' || data.isLive ? 'HIGH' : 'MEDIUM'
    }
  };
}

async function fetchRailKit(number, date) {
  if (!railkit) return null;
  const cacheKey = `RK:${number}:${date || ''}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < 20_000) return hit.body;
  try {
    const response = await railkit.trackTrainV2(number, dateForRailKit(date));
    if (!response?.success || !response?.data?.currentLocation) return null;
    const body = normalizeLive(response.data, 'railkit', number, date);
    cache.set(cacheKey, { t: Date.now(), body });
    console.log(`[RailKit] train ${number} -> OK`);
    return body;
  } catch (e) {
    console.warn(`[RailKit] train ${number} unavailable: ${e.message}`);
    return null;
  }
}

/* ---------- API Endpoints ---------- */

// 1. Live Train Status
app.get('/api/train/:number/status', async (req, res) => {
  const { number } = req.params, date = req.query.date;
  if (!/^\d{5}$/.test(number)) return bad(res, 'Train number must be 5 digits.');
  if (!isDate(date)) return bad(res, 'Date must be YYYY-MM-DD.');

  // Prefer the authoritative RailRadar position. Its journey is auto-detected
  // when no date is passed, avoiding a stale report from a previous run.
  if (KEY_RR) {
    const rrQuery = new URLSearchParams({ authoritative: 'true' });
    if (date) rrQuery.set('date', date);
    const rrRes = await fetchRR(`/v1/trains/${number}/live?${rrQuery}`, 20_000);
    if (rrRes.code === 200 && rrRes.body?.success && rrRes.body?.data?.currentLocation) {
      return res.status(200).json(normalizeLive(rrRes.body.data, 'railradar', number, date));
    }
    console.log(`[Fallback] RailRadar status unavailable (${rrRes.code}); attempting RailKit for train ${number}`);
  }

  // RailKit uses its WIMT-backed tracker and remains available if RailRadar
  // has no result for this run.
  const railKitStatus = await fetchRailKit(number, date);
  if (railKitStatus) return res.status(200).json(railKitStatus);

  // Use RailEngine directly for live status; RailCore may reject live requests
  // with 429 even while the account still has monthly requests available.
  send(res, await fetchRE(`/v1/train/${number}/status${date ? '?date=' + date : ''}`, 30_000));
});

// 2. Train Route
app.get('/api/train/:number/route', async (req, res) => {
  const { number } = req.params, date = req.query.date;
  if (!/^\d{5}$/.test(number)) return bad(res, 'Train number must be 5 digits.');
  if (!isDate(date)) return bad(res, 'Date must be YYYY-MM-DD.');

  // Try RailCore first (reliable, 200 with all stops)
  const rcRes = await fetchRC(`/trains/${number}/route`, 7_200_000);
  if (rcRes.code === 200 && rcRes.body?.success) {
    const d = rcRes.body.data || {};
    const stops = (d.stops || []).map(s => {
      const arrival = s.notes?.arrival ? null : (s.arrival_time || null);
      const departure = s.departure_time || null;
      const haltMinutes = Number(s.halt_minutes);
      // Only an explicit stop flag or positive halt duration counts as a halt.
      const halt = s.is_stop === true ||
        (Number.isFinite(haltMinutes) && haltMinutes > 0);
      return {
      sequence: s.sequence,
      station: { code: s.station_code, name: s.station_name },
      stationCode: s.station_code,
      stationName: s.station_name,
      code: s.station_code,
      name: s.station_name,
      scheduledArrival: arrival,
      scheduledDeparture: departure,
      actualArrival: s.actual_arrival || s.actual_arrival_time || s.actualArrival || null,
      actualDeparture: s.actual_departure || s.actual_departure_time || s.actualDeparture || null,
      expectedArrival: s.expected_arrival || s.estimated_arrival || s.expectedArrival || null,
      expectedDeparture: s.expected_departure || s.estimated_departure || s.expectedDeparture || null,
      distanceKm: s.distance_km != null ? s.distance_km : null,
      platform: s.platform_number || null,
      halt,
      haltMinutes: Number.isFinite(haltMinutes) ? haltMinutes : null,
      day: s.day || 1
      };
    });
    return res.status(200).json({
      status: 'SUCCESS',
      data: {
        trainNumber: d.train_number || number,
        trainName: d.train_name,
        origin: { code: d.source_station_code },
        destination: { code: d.destination_station_code },
        stops
      }
    });
  }

  // Fallback to RailEngine
  console.log(`[Fallback] RailCore route unavailable (${rcRes.code}); attempting RailEngine for train ${number}`);
  send(res, await fetchRE(`/v1/train/${number}/route${date ? '?date=' + date : ''}`, 3_600_000));
});

// 3. Train Schedule
app.get('/api/train/:number/schedule', async (req, res) => {
  const { number } = req.params, date = req.query.date;
  if (!/^\d{5}$/.test(number)) return bad(res, 'Train number must be 5 digits.');
  if (!isDate(date)) return bad(res, 'Date must be YYYY-MM-DD.');

  // Try RailCore first
  const rcRes = await fetchRC(`/trains/${number}/schedule`, 7_200_000);
  if (rcRes.code === 200 && rcRes.body?.success) {
    const d = rcRes.body.data || {};
    const stops = (d.stops || []).map(s => ({
      sequence: s.sequence,
      station: { code: s.station_code, name: s.station_name },
      stationCode: s.station_code,
      stationName: s.station_name,
      code: s.station_code,
      name: s.station_name,
      scheduledArrival: s.notes?.arrival ? null : (s.arrival_time || null),
      scheduledDeparture: s.departure_time || null,
      distanceKm: s.distance_km,
      platform: s.platform_number,
      haltMinutes: s.halt_minutes,
      day: s.day
    }));
    return res.status(200).json({
      status: 'SUCCESS',
      data: {
        trainNumber: d.train_number || number,
        trainName: d.train_name,
        sourceStationCode: d.source_station_code,
        destinationStationCode: d.destination_station_code,
        runningDays: d.running_days,
        classes: d.classes,
        totalDurationMinutes: d.total_duration_minutes,
        distanceKm: d.distance_km,
        pantry: d.pantry,
        stops
      }
    });
  }

  // Fallback to RailEngine
  send(res, await fetchRE(`/v1/train/${number}/schedule${date ? '?date=' + date : ''}`, 3_600_000));
});

// 4. Trains Search
app.get('/api/trains/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 40) return bad(res, 'Query must be 2-40 characters.');

  // Try RailCore first
  const rcRes = await fetchRC(`/trains/search?q=${encodeURIComponent(q)}`, 300_000);
  if (rcRes.code === 200 && rcRes.body?.success) {
    const results = rcRes.body.data?.results || [];
    return res.status(200).json({
      status: 'SUCCESS',
      data: results.map(r => ({
        number: r.train_number,
        name: r.train_name,
        trainNumber: r.train_number,
        trainName: r.train_name,
        source: r.source_station_code,
        destination: r.destination_station_code
      }))
    });
  }

  // Fallback to RailEngine
  send(res, await fetchRE(`/v1/trains/search?q=${encodeURIComponent(q)}`, 300_000));
});

// 5. Stations Search
app.get('/api/stations/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 40) return bad(res, 'Query must be 2-40 characters.');

  // Try RailCore first; Railway Engine remains the fallback.
  const rcRes = await fetchRC(`/stations/search?q=${encodeURIComponent(q)}`, 300_000);
  if (rcRes.code === 200 && rcRes.body?.success) {
    const results = rcRes.body.data?.results || [];
    return res.status(200).json({
      status: 'SUCCESS',
      data: results.map(s => ({
        code: s.station_code,
        name: s.station_name,
        stationCode: s.station_code,
        stationName: s.station_name,
        state: s.state
      }))
    });
  }

  send(res, await fetchRE(`/v1/stations/search?q=${encodeURIComponent(q)}`, 300_000));
});

// 6. Station Live Board
app.get('/api/station/:code/live', async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!/^[A-Za-z]{1,6}$/.test(code)) return bad(res, 'Invalid station code.');

  // Try RailCore first
  const rcRes = await fetchRC(`/stations/${code}/live`, 30_000);
  if (rcRes.code === 200 && rcRes.body?.success) {
    const trains = rcRes.body.data?.trains || [];
    return res.status(200).json({
      status: 'SUCCESS',
      data: {
        stationCode: code,
        trains: trains.map(t => ({
          trainNumber: t.train_number,
          trainName: t.train_name,
          state: t.status || (t.departed_current_station ? 'DEPARTED' : 'UPCOMING'),
          scheduledArrival: t.scheduled_arrival,
          expectedArrival: t.estimated_arrival,
          scheduledDeparture: t.scheduled_departure,
          expectedDeparture: t.estimated_departure,
          delayMinutes: t.arrival_delay_minutes || t.departure_delay_minutes || 0,
          platform: t.platform_number
        }))
      }
    });
  }

  // Fallback to RailEngine
  send(res, await fetchRE(`/v1/station/${code}/live`, 30_000));
});

// 7. Station Details by Code
app.get('/api/station/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!/^[A-Za-z]{1,6}$/.test(code)) return bad(res, 'Invalid station code.');

  // Try RailCore first
  const rcRes = await fetchRC(`/stations/${code}`, 600_000);
  if (rcRes.code === 200 && rcRes.body?.success) {
    const d = rcRes.body.data || {};
    return res.status(200).json({
      status: 'SUCCESS',
      data: {
        code: d.station_code || code,
        name: d.station_name,
        state: d.state,
        zone: d.zone,
        division: d.division
      }
    });
  }

  // Fallback to RailEngine
  send(res, await fetchRE(`/v1/station/${code}`, 600_000));
});

app.use('/api', (q, res) => res.status(404).json(err(404, 'NOT_FOUND', 'Unknown endpoint.').body));
app.listen(process.env.PORT || 3000, () => console.log('RailTrack Dual-Engine on http://localhost:' + (process.env.PORT || 3000)));
