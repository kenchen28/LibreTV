# Music Page: xymp3-Style Rotating Vinyl Player + Synced Lyrics

**Date/Time:** 2026-05-10

## Summary

Redesigned the music page to match xymp3.vip's UX: rotating vinyl record album art, swinging tonearm, synced LRC lyrics, and a cleaner player layout.

### Player visuals (xymp3-inspired)
- Rotating 160px circular album art (spins while playing, stops when paused)
- Dark disc ring with dashed inner line and gold center spindle
- Metallic tonearm that swings into/out of place on play/pause
- Hover play/pause overlay on the disc
- Seekable progress bar, prev/play/next controls, volume slider

### Synced lyrics
- LRC format parser with millisecond precision
- Active line highlighted in indigo and auto-scrolled into view
- Scrollable lyrics panel inside the player

### Server improvements
- `/api/music/detail` now extracts the cover image from xymp3's `record-img` element
- Extracts and cleans LRC lyrics from xymp3's `<div class="lrc"> <article>` structure
- Removed duplicate `/api/music/:action` handler in `server.mjs`
- Same extraction logic applied to Vercel and Cloudflare Workers functions

## Files Modified

- `music.html` — Full rewrite: rotating vinyl UI, synced lyrics, cleaner controls
- `server.mjs` — Enhanced detail handler with cover + lyrics extraction; removed duplicate handler
- `api/music/[action].mjs` — Vercel function with cover + lyrics
- `functions/api/music/[action].js` — Cloudflare Workers function with cover + lyrics
