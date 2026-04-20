const UA = 'Mozilla/5.0 (compatible; LibreTV/1.0)';

export default async function handler(req, res) {
  const { action } = req.query;
  try {
    let deezerUrl;
    if (action === 'search') {
      const q = req.query.q;
      if (!q) return res.status(400).json({ error: 'Missing q' });
      deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=30`;
    } else if (action === 'chart') {
      deezerUrl = 'https://api.deezer.com/chart/0/tracks?limit=30';
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    const resp = await fetch(deezerUrl, { headers: { 'User-Agent': UA } });
    const data = await resp.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
}
