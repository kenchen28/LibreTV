const UA = 'Mozilla/5.0 (compatible; LibreTV/1.0)';
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequest(context) {
  const action = context.params.action;
  const url = new URL(context.request.url);
  try {
    let deezerUrl;
    if (action === 'search') {
      const q = url.searchParams.get('q');
      if (!q) return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers: CORS });
      deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=30`;
    } else if (action === 'chart') {
      deezerUrl = 'https://api.deezer.com/chart/0/tracks?limit=30';
    } else {
      return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400, headers: CORS });
    }
    const resp = await fetch(deezerUrl, { headers: { 'User-Agent': UA } });
    return new Response(JSON.stringify(await resp.json()), { headers: CORS });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS }); }
}
