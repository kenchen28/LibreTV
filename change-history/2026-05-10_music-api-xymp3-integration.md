# Music API: Switch to xymp3.vip for Full-Length Playback

**Date/Time:** 2026-05-10

## Summary

Replaced the iframe-based "full playback" approach with a native server-side integration of xymp3.vip as the music source. The page now supports search, full-length MP3 streaming, playlist management, and auto-play — all through the site's own UI with no embedded third-party player.

Previously gequbao.com was used but became blocked by Cloudflare. Switched to xymp3.vip which is scrape-friendly and returns kuwo CDN URLs for full-length playback. Also restored the `/api/music/*` routes in `server.mjs` which had been accidentally dropped during an earlier edit (causing 404 errors).

## Files Modified

- `LibreTV/server.mjs` — Added `/api/music/:action` route with `search`, `detail`, and `chart` actions that scrape xymp3.vip
- `LibreTV/music.html` — Rebuilt frontend: native search results, bottom player bar, playlist tab, auto-play next, localStorage persistence
- `LibreTV/api/music/[action].mjs` — Vercel serverless function (fallback)
- `LibreTV/functions/api/music/[action].js` — Cloudflare Workers function (fallback)
