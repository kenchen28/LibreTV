// functions/manga/[[path]].js
// Proxy MangaDex API requests to avoid CORS issues on production

const MANGADEX_API = 'https://api.mangadex.org';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Extract the API path: /manga/manga?title=... → /manga?title=...
  const apiPath = url.pathname.replace(/^\/manga/, '') + url.search;

  try {
    const resp = await fetch(`${MANGADEX_API}${apiPath}`, {
      headers: {
        'User-Agent': 'LibreTV-Comic/1.0',
        'Accept': 'application/json',
      },
      cf: { cacheTtl: 60 },
    });

    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
