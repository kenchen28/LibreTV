# Music Search: Frontend & Regex Hardening

**Date/Time:** 2026-05-10

## Summary

Made the music search more robust after a report of broken rendering despite the API returning valid data.

### Frontend (`music.html`)
- `doSearch()` now handles non-OK HTTP responses (shows status + first 200 chars of server response instead of silently failing)
- Accepts multiple response shapes: `data` / `list` / bare array
- Logs the full API response to the console for debugging
- `renderTracks()` falls back across field names (`title` / `name` / `mp3_title`, etc.) so minor API drift doesn't break rendering
- Displays error messages inline with the actual cause

### Server-side search regex (server.mjs, api/, functions/)
- Made the search regex tolerant of HTML comments between the `<a>` link and the `song_info2` inner div
- Added dedup with a `seen` Set to avoid duplicate entries when xymp3 wraps items in multiple `<li>` variants

## Files Modified

- `music.html` — Hardened `doSearch` and `renderTracks` with fallbacks and better error reporting
- `server.mjs` — Improved search regex + added dedup
- `api/music/[action].mjs` — Same regex improvement for Vercel
- `functions/api/music/[action].js` — Same regex improvement for Cloudflare Workers
