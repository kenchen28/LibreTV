const BASE = 'https://www.xymp3.vip';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequest(context) {
  const action = context.params.action;
  const url = new URL(context.request.url);
  try {
    if (action === 'search') {
      const q = url.searchParams.get('q');
      if (!q) return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers: CORS });
      const resp = await fetch(`${BASE}/search?page=0&keyword=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, 'Referer': BASE + '/' } });
      const html = await resp.text();
      const regex = /href="\/music\/info\.html\?id=(MUSIC_[0-9]+)"[^>]*>[\s\S]*?<div class="song_info2"[^>]*>\s*<div>([^<]+)<\/div>/g;
      const results = []; let m;
      while ((m = regex.exec(html)) !== null) {
        const parts = m[2].trim().split(' - ');
        results.push({ id: m[1], title: parts[0] || m[2].trim(), artist: parts.slice(1).join(' - ') || '' });
      }
      return new Response(JSON.stringify({ code: 200, data: results }), { headers: CORS });
    }

    if (action === 'detail') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: CORS });
      const resp = await fetch(`${BASE}/music/info.html?id=${encodeURIComponent(id)}`, { headers: { 'User-Agent': UA, 'Referer': BASE + '/' } });
      const html = await resp.text();
      const coverMatch = html.match(/id="record-img"[^>]*\bsrc="([^"]+)"/);
      const cover = coverMatch ? coverMatch[1] : '';
      let lrc = '';
      const lrcBlock = html.match(/<div class="lrc">[\s\S]*?<article[^>]*>([\s\S]*?)<\/article>/);
      if (lrcBlock) {
        lrc = lrcBlock[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
      }
      const match = html.match(/window\.appData\s*=\s*JSON\.parse\('(.+?)'\)/);
      if (match) {
        const jsonStr = match[1].replace(/\\u0022/g, '"').replace(/\\\//g, '/');
        const appData = JSON.parse(jsonStr);
        if (cover) appData.cover = cover;
        if (lrc) appData.lrc = lrc;
        return new Response(JSON.stringify({ code: 200, data: appData }), { headers: CORS });
      }
      const urlMatch = html.match(/mp3Url\s*=\s*'([^']+)'/);
      if (urlMatch) return new Response(JSON.stringify({ code: 200, data: { mp3Url: urlMatch[1], cover, lrc } }), { headers: CORS });
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });
    }

    if (action === 'chart') {
      const resp = await fetch(BASE + '/', { headers: { 'User-Agent': UA } });
      const html = await resp.text();
      const regex = /href="\/music\/info\.html\?id=(MUSIC_[0-9]+)"[^>]*>[\s\S]*?<div[^>]*>\s*([^<]+?)\s*<\/div>/g;
      const results = []; const seen = new Set(); let m;
      while ((m = regex.exec(html)) !== null && results.length < 30) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        const parts = m[2].trim().split(' - ');
        if (parts[0]) results.push({ id: m[1], title: parts[0], artist: parts.slice(1).join(' - ') || '' });
      }
      return new Response(JSON.stringify({ code: 200, data: results }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400, headers: CORS });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS }); }
}
