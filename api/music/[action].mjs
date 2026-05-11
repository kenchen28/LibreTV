const BASE = 'https://www.xymp3.vip';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export default async function handler(req, res) {
  const { action } = req.query;
  try {
    if (action === 'search') {
      const q = req.query.q;
      if (!q) return res.status(400).json({ error: 'Missing q' });
      const resp = await fetch(`${BASE}/search?page=0&keyword=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, 'Referer': BASE + '/' } });
      const html = await resp.text();
      const regex = /href="\/music\/info\.html\?id=(MUSIC_[0-9]+)"[\s\S]*?<div class="song_info2"[^>]*>\s*<div>\s*([^<]+?)\s*<\/div>/g;
      const results = []; const seen = new Set(); let m;
      while ((m = regex.exec(html)) !== null) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        const parts = m[2].trim().split(' - ');
        results.push({ id: m[1], title: parts[0] || m[2].trim(), artist: parts.slice(1).join(' - ') || '' });
      }
      return res.json({ code: 200, data: results });
    }

    if (action === 'detail') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });

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
      // The numeric music_id is the part after "MUSIC_"
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

      if (!mp3Url) return res.status(404).json({ error: 'Not found' });

      return res.json({ code: 200, data: { mp3Url, cover, title, artist, lrc } });
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
      return res.json({ code: 200, data: results });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
