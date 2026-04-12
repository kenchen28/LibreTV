const BASE = 'https://www.gequbao.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export default async function handler(req, res) {
  const { action } = req.query;
  try {
    if (action === 'search') {
      const q = req.query.q;
      if (!q) return res.status(400).json({ error: 'Missing q' });
      const resp = await fetch(`${BASE}/s/${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
      const html = await resp.text();
      const regex = /href="\/music\/(\d+)"[^>]*title="([^"]+)"/g;
      const results = []; const seen = new Set(); let m;
      while ((m = regex.exec(html)) !== null) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        const parts = m[2].split(' - ');
        results.push({ id: m[1], title: parts[0] || m[2], artist: parts[1] || '' });
      }
      return res.json({ code: 200, data: results });
    }
    if (action === 'detail') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const resp = await fetch(`${BASE}/music/${id}`, { headers: { 'User-Agent': UA } });
      const html = await resp.text();
      const match = html.match(/window\.appData\s*=\s*JSON\.parse\('(.+?)'\)/);
      if (!match) return res.status(404).json({ error: 'Not found' });
      const jsonStr = match[1].replace(/\\u0022/g, '"').replace(/\\\//g, '/');
      return res.json({ code: 200, data: JSON.parse(jsonStr) });
    }
    if (action === 'play-url') {
      const playId = req.query.play_id;
      if (!playId) return res.status(400).json({ error: 'Missing play_id' });
      const resp = await fetch(`${BASE}/api/play-url`, {
        method: 'POST', body: `id=${encodeURIComponent(playId)}`,
        headers: { 'User-Agent': UA, 'Referer': BASE, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return res.json(await resp.json());
    }
    return res.status(400).json({ error: 'Invalid action' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
