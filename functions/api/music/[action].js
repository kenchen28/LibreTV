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
      const regex = /href="\/music\/info\.html\?id=(MUSIC_[0-9]+)"[\s\S]*?<div class="song_info2"[^>]*>\s*<div>\s*([^<]+?)\s*<\/div>/g;
      const results = []; const seen = new Set(); let m;
      while ((m = regex.exec(html)) !== null) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        const parts = m[2].trim().split(' - ');
        results.push({ id: m[1], title: parts[0] || m[2].trim(), artist: parts.slice(1).join(' - ') || '' });
      }
      return new Response(JSON.stringify({ code: 200, data: results }), { headers: CORS });
    }

    if (action === 'detail') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: CORS });

      // Fetch the info page to get metadata (cover, title, artist, lyrics)
      const resp = await fetch(`${BASE}/music/info.html?id=${encodeURIComponent(id)}`, { headers: { 'User-Agent': UA, 'Referer': BASE + '/' } });
      const html = await resp.text();

      let cover = '';
      let title = '';
      let artist = '';
      let lrc = '';

      // Parse the embedded JSON data (pattern: JSON.parse('{...}'))
      const jsonMatch = html.match(/JSON\.parse\('(\{.*?\})'\)/);
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1].replace(/\\'/g, "'").replace(/\\\//g, '/');
          const data = JSON.parse(jsonStr);
          cover = data.music_cover || '';
          title = data.music_name || '';
          artist = data.music_artist || '';
        } catch {}
      }

      // Fallback cover from img tag
      if (!cover) {
        const coverMatch = html.match(/id="record-img"[^>]*\bsrc="([^"]+)"/);
        if (coverMatch) cover = coverMatch[1];
      }

      // Extract lyrics
      const lrcBlock = html.match(/<div class="lrc">[\s\S]*?<article[^>]*>([\s\S]*?)<\/article>/);
      if (lrcBlock) {
        lrc = lrcBlock[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
      }

      // Get the playable stream URL via /audio/play endpoint
      const numericId = id.replace(/^MUSIC_/, '');
      let mp3Url = '';
      try {
        const playResp = await fetch(`${BASE}/audio/play?id=${numericId}`, {
          headers: { 'User-Agent': UA, 'Referer': `${BASE}/music/info.html?id=${id}` }
        });
        if (playResp.ok) {
          mp3Url = (await playResp.text()).trim();
        }
      } catch {}

      if (!mp3Url) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });

      return new Response(JSON.stringify({ code: 200, data: { mp3Url, cover, title, artist, lrc } }), { headers: CORS });
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
