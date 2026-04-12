const BASE = 'https://www.gequbao.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequest(context) {
  const action = context.params.action;
  const url = new URL(context.request.url);
  try {
    if (action === 'search') {
      const q = url.searchParams.get('q');
      if (!q) return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers: CORS });
      const resp = await fetch(`${BASE}/s/${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
      const html = await resp.text();
      const regex = /href="\/music\/(\d+)"[^>]*title="([^"]+)"/g;
      const results = []; const seen = new Set(); let m;
      while ((m = regex.exec(html)) !== null) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        const parts = m[2].split(' - ');
        results.push({ id: m[1], title: parts[0] || m[2], artist: parts[1] || '' });
      }
      return new Response(JSON.stringify({ code: 200, data: results }), { headers: CORS });
    }
    if (action === 'detail') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: CORS });
      const resp = await fetch(`${BASE}/music/${id}`, { headers: { 'User-Agent': UA } });
      const html = await resp.text();
      const match = html.match(/window\.appData\s*=\s*JSON\.parse\('(.+?)'\)/);
      if (!match) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });
      const jsonStr = match[1].replace(/\\u0022/g, '"').replace(/\\\//g, '/');
      const appData = JSON.parse(jsonStr);
      const lrcMatch = html.match(/id="content-lrc">([\s\S]*?)<\/div>/);
      if (lrcMatch) appData.lrc = lrcMatch[1].replace(/<br\s*\/?>/g, '\n').trim();
      return new Response(JSON.stringify({ code: 200, data: appData }), { headers: CORS });
    }
    if (action === 'play-url') {
      const playId = url.searchParams.get('play_id');
      if (!playId) return new Response(JSON.stringify({ error: 'Missing play_id' }), { status: 400, headers: CORS });
      const resp = await fetch(`${BASE}/api/play-url`, {
        method: 'POST', body: `id=${encodeURIComponent(playId)}`,
        headers: { 'User-Agent': UA, 'Referer': BASE, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return new Response(JSON.stringify(await resp.json()), { headers: CORS });
    }
    return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400, headers: CORS });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS }); }
}
