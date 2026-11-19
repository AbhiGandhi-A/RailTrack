# RailTrack – live Indian Railways tracker
Vanilla HTML/CSS/JS frontend + a small Express proxy for the Railway Engine API.

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and set `RAILWAY_ENGINE_API_KEY` (free key: https://railengine.vercel.app/dashboard)
3. `npm start` → open http://localhost:3000

## Notes
- The key lives only in `.env` (git-ignored) and is sent only by `server/server.js`; the browser calls `/api/*`.
- Server: input validation, 10 s timeout, caching (status 30 s, route/schedule 10 min, search 5 min), in-flight de-duplication, 40 req/min per client and a 50/min global upstream budget (provider limit is 60/min).
- Animation honesty: the train is held still when the API says it is at a station or data is STALE; between refreshes it is interpolated only if an expected arrival time exists, and the UI says so.
- Response parsing is tolerant of field-name variants. If a card is missing, check the real JSON in your browser's Network tab (`/api/train/<n>/status`) and adjust the `g(...)` key lists in `public/js/app.js`.
- Rotate your API key if it was ever shared publicly.
