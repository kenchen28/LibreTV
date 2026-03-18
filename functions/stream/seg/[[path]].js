// functions/stream/seg/[[path]].js
// Re-streaming: proxy binary segments (.ts), encryption keys, etc.

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getTargetUrl(pathname) {
  const encoded = pathname.replace(/^\/stream\/seg\//, '');
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {}
  return null;
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
    return new Response('Invalid segment URL', { status: 400 });
  }

  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
    };
    try {
      headers['Referer'] = new URL(targetUrl).origin;
    } catch {}

    // Pass through Range header for partial content requests
    const range = request.headers.get('Range');
    if (range) headers['Range'] = range;

    const resp = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
    });

    if (!resp.ok && resp.status !== 206) {
      return new Response(`Upstream error: ${resp.status}`, {
        status: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Build response headers — forward content-type and content-length
    const respHeaders = new Headers();
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    respHeaders.set('Cache-Control', 'no-cache');

    const ct = resp.headers.get('Content-Type');
    if (ct) respHeaders.set('Content-Type', ct);
    const cl = resp.headers.get('Content-Length');
    if (cl) respHeaders.set('Content-Length', cl);
    const cr = resp.headers.get('Content-Range');
    if (cr) respHeaders.set('Content-Range', cr);
    const ar = resp.headers.get('Accept-Ranges');
    if (ar) respHeaders.set('Accept-Ranges', ar);

    // Stream the body directly — no buffering
    return new Response(resp.body, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(`Segment fetch failed: ${err.message}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
