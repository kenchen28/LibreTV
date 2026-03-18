// functions/stream/play/[[path]].js
// Re-streaming: fetch upstream m3u8, rewrite URLs, serve over HTTPS

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getTargetUrl(pathname) {
  const encoded = pathname.replace(/^\/stream\/play\//, '');
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {}
  return null;
}

function getBaseUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/');
    parts.pop();
    return `${u.origin}${parts.join('/')}/`;
  } catch {
    const idx = urlStr.lastIndexOf('/');
    return idx > 8 ? urlStr.substring(0, idx + 1) : urlStr + '/';
  }
}

function resolveUrl(base, relative) {
  if (/^https?:\/\//i.test(relative)) return relative;
  try { return new URL(relative, base).toString(); } catch {}
  if (relative.startsWith('/')) {
    try { return new URL(relative, new URL(base).origin).toString(); } catch {}
  }
  return base.replace(/\/[^/]*$/, '/') + relative;
}

function rewriteM3u8(content, originalUrl) {
  const base = getBaseUrl(originalUrl);
  const lines = content.split('\n');
  const out = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Rewrite URI="..." in #EXT-X-KEY and #EXT-X-MAP
    if (line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-MAP')) {
      out.push(line.replace(/URI="([^"]+)"/, (_, uri) => {
        const abs = resolveUrl(base, uri);
        return `URI="/stream/seg/${encodeURIComponent(abs)}"`;
      }));
      continue;
    }

    // Rewrite #EXT-X-MEDIA URI (sub-playlists)
    if (line.startsWith('#EXT-X-MEDIA') && line.includes('URI="')) {
      out.push(line.replace(/URI="([^"]+)"/, (_, uri) => {
        const abs = resolveUrl(base, uri);
        return `URI="/stream/play/${encodeURIComponent(abs)}"`;
      }));
      continue;
    }

    // Tags and empty lines — pass through
    if (line.startsWith('#') || line === '') {
      out.push(line);
      continue;
    }

    // URL line — sub-playlist (.m3u8) or segment (.ts etc)
    const abs = resolveUrl(base, line);
    if (abs.includes('.m3u8') || line.includes('.m3u8')) {
      out.push(`/stream/play/${encodeURIComponent(abs)}`);
    } else {
      out.push(`/stream/seg/${encodeURIComponent(abs)}`);
    }
  }
  return out.join('\n');
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const targetUrl = getTargetUrl(url.pathname);
  if (!targetUrl) {
    return new Response('Invalid stream URL', { status: 400 });
  }

  try {
    // Fetch upstream m3u8
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
    };
    try {
      headers['Referer'] = new URL(targetUrl).origin;
    } catch {}

    const resp = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      cf: { cacheTtl: 5 }, // short cache for live streams
    });

    if (!resp.ok) {
      return new Response(`Upstream error: ${resp.status} ${resp.statusText}`, {
        status: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const content = await resp.text();
    const rewritten = rewriteM3u8(content, targetUrl);

    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(`Stream fetch failed: ${err.message}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
