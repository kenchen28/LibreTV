# LibreTV Tech Stack

## Frontend

- Vanilla JavaScript (ES6+) — no framework, all custom modules under `js/`
- Tailwind CSS (via CDN, `libs/tailwindcss.min.js`)
- ArtPlayer (`libs/artplayer.min.js`) — video player
- HLS.js (`libs/hls.min.js`) — HLS/M3U8 stream playback
- PWA support — `manifest.json` + `service-worker.js`

## Backend / Server

- Node.js + Express 5 (`server.mjs`)
- Axios — outbound HTTP requests (proxy)
- CORS middleware
- dotenv — environment variable management
- Nodemon — dev hot-reload

## Deployment Platforms

The project supports multiple deployment targets:

| Platform | Config | Notes |
|---|---|---|
| Cloudflare Pages | `functions/`, `wrangler` (devDep) | Primary. Uses Pages Functions for proxy + middleware. KV namespace (`LIBRETV_PROXY_KV`) for M3U8 caching. |
| Vercel | `vercel.json`, `middleware.js`, `api/proxy/[...path].mjs` | Serverless functions + edge middleware for env injection. |
| Netlify | `netlify.toml`, `netlify/functions/proxy.mjs`, `netlify/edge-functions/inject-env.js` | Netlify Functions + Edge Functions. |
| Render | `render.yaml` | Runs `node server.mjs` directly. |
| Docker | `Dockerfile`, `docker-compose.yml` | `node:lts-alpine` image, port 8080. |

## Proxy Architecture

All external API requests are routed through an internal `/proxy/` endpoint to avoid CORS issues and add auth. The proxy:

- Accepts encoded target URLs as path parameters (`/proxy/<encodedURL>`)
- Validates requests via SHA-256 password hash + timestamp
- Handles M3U8 playlist parsing, recursive resolution, and URL rewriting
- Streams binary content (images, media) directly
- Caches processed content in Cloudflare KV (when available)

## Search Architecture

- Aggregated multi-source search across 20+ Chinese video APIs
- Each API follows the same interface pattern: `?ac=videolist&wd=<query>`
- Client-side keyword filtering to prevent APIs from returning full catalogs on empty/mismatched queries
- Pagination support (up to 5 pages per source)
- Results are deduplicated by `source_code + vod_id`

## Security

- Password protection via SHA-256 hashing (injected at build/serve time via middleware)
- Proxy auth with password hash + timestamp validation (10-min TTL)
- XSS protection on search results (HTML entity escaping)
- URL validation on proxy requests (blocks private IPs, localhost)
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`

## Key Config Files

- `js/config.js` — API sources, search settings, player config, security limits
- `.env` — runtime secrets (`PASSWORD`, `PORT`, `DEBUG`, etc.)
- `package.json` — dependencies and scripts (`npm run dev`, `npm start`)
