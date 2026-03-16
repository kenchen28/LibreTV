# Live TV (IPTV) Feature

## Overview

The live TV feature allows users to watch free IPTV channels directly in the browser. It parses standard M3U/M3U8 playlists and plays HLS streams using the existing HLS.js library.

## Files

| File | Purpose |
|---|---|
| `live.html` | Live TV page — sidebar + player layout |
| `js/live.js` | M3U parser, channel list logic, HLS playback, source management |
| `css/live.css` | Sidebar, channel list, player area, mobile responsive styles |

## How It Works

1. On page load, the default IPTV source (央视+卫视 IPV4) is fetched
2. The M3U content is parsed into channel objects with `name`, `group`, `logo`, and `url` fields
3. Channels are displayed in a sidebar, grouped by category tabs
4. Clicking a channel plays the HLS stream using HLS.js (or native HLS on Safari)

## M3U Parsing

The parser handles standard M3U format:

```
#EXTM3U
#EXTINF:-1 tvg-logo="logo.png" group-title="央视",CCTV-1 综合
http://example.com/stream.m3u8
```

Extracted fields:
- `name` — from the text after the last comma in `#EXTINF`
- `group` — from `group-title="..."` attribute (defaults to "其他" if missing)
- `logo` — from `tvg-logo="..."` attribute
- `url` — the line following `#EXTINF`

## Built-in Sources

| Source | URL | Region |
|---|---|---|
| 央视+卫视+地方台 | m3u.ibert.me/cn.m3u (auto-updated) | CN |
| 央视+卫视 (IPV6) | m3u.ibert.me/fmml_ipv6.m3u | CN |
| 央视+卫视 (多线路) | m3u.ibert.me/fmml_itv.m3u | CN |
| 国际频道 | iptv-org/iptv (full index) | International |
| 中国频道 (iptv-org) | iptv-org/iptv/countries/cn | CN |
| 香港频道 | iptv-org/iptv/countries/hk | HK |
| 台湾频道 | iptv-org/iptv/countries/tw | TW |
| 日本频道 | iptv-org/iptv/countries/jp | JP |
| 韩国频道 | iptv-org/iptv/countries/kr | KR |
| 美国频道 | iptv-org/iptv/countries/us | US |
| 英国频道 | iptv-org/iptv/countries/uk | UK |

Users can also paste any custom M3U playlist URL.

## Network Strategy

The `fetchM3U()` function uses a two-step approach:

1. Try direct fetch (GitHub and iptv-org serve `Access-Control-Allow-Origin: *`)
2. If direct fetch fails (CORS, network, etc.), fall back to the site's `/proxy/` endpoint with auth

This ensures it works both locally and on Cloudflare Pages.

## Playback

- HLS streams (`.m3u8`) — played via HLS.js with `maxBufferLength: 30`
- Safari — uses native HLS support via `<video>` element
- Direct streams (`.mp4`, etc.) — played natively by the browser

## Layout

- Desktop: sidebar (320px) on the left with channel list, player area fills the rest
- Mobile: stacked layout — collapsible channel list on top, player below
- The sidebar has: source selector dropdown, custom M3U input, search box, category tabs, and scrollable channel list

## Adding New Sources

Add entries to the `LIVE_TV_SOURCES` array in `js/live.js`:

```js
{
    name: 'Display Name',
    url: 'https://example.com/playlist.m3u',
    region: 'xx'
}
```

The `region` field is informational only (not used for filtering currently).
