/* AbuNawaf hardened — © 2026 أبو نواف · MIT */
const __RL = new Map();
function __rate(req, res, max = 90, win = 60_000) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'x';
    const key = ip + ':' + (req.url || '');
    const now = Date.now();
    const b = __RL.get(key);
    if (!b || now > b.r) { __RL.set(key, { n: 1, r: now + win }); if (__RL.size > 4000) __RL.clear(); return true; }
    b.n++;
    if (b.n > max) { res.setHeader('Retry-After', String(Math.ceil((b.r - now) / 1000))); res.status(429).json({ error: 'rate_limited', message: 'تم تجاوز الحد المسموح — أعد المحاولة بعد قليل' }); return false; }
    return true;
  } catch { return true; }
}
const __origin = (req) => {
  const o = req.headers.origin || '';
  if (!o) return '*';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  if (/^https?:\/\/[a-z0-9-]+\.(vercel|arcada)\.app$/.test(o)) return o;
  try { if (o === 'https://' + req.headers.host) return o; } catch {}
  return 'null';
};

export default async function handler(req, res) {
  __ABUNAWAF_HARDENED__: if (!__rate(req, res)) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { query } = body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const results = [];
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  // Source 1: Pirate Bay API (multiple mirrors)
  const pbMirrors = [
    'https://apibay.org/q.php?q=',
    'https://tpb.party/apibay/q.php?q=',
  ];
  
  for (const mirror of pbMirrors) {
    if (results.length > 0) break;
    try {
      const r = await fetch(`${mirror}${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000)
      });
      const data = await r.json();
      if (Array.isArray(data)) {
        data.forEach(t => {
          if (t.name && t.name !== 'No results returned') {
            const sizeBytes = parseInt(t.size);
            results.push({
              title: t.name,
              size: sizeBytes > 1073741824 ? `${(sizeBytes/1073741824).toFixed(2)} GB` : `${(sizeBytes/1048576).toFixed(1)} MB`,
              seeders: parseInt(t.seeders),
              leechers: parseInt(t.leechers),
              magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}&tr=udp://tracker.coppersurfer.tk:6969/announce&tr=udp://tracker.openbittorrent.com:6969/announce&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://open.stealth.si:80/announce&tr=udp://tracker.torrent.eu.org:451/announce`,
              source: 'The Pirate Bay',
              date: new Date(parseInt(t.added) * 1000).toISOString().split('T')[0],
              uploader: t.username || 'Anonymous',
              infoHash: t.info_hash,
              verified: t.status === 'vip' || t.status === 'trusted'
            });
          }
        });
      }
    } catch {}
  }

  // Source 2: Torrent Galaxy via RSS (if PB failed)
  if (results.length === 0) {
    try {
      const r = await fetch(`https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(query)}&sort=seeders&order=desc`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      const html = await r.text();
      // Parse torrent entries
      const blocks = html.match(/<div class="tgxtable[^"]*"[\s\S]*?<\/div>\s*<\/div>/g);
      if (blocks) {
        blocks.slice(0, 20).forEach(block => {
          const titleM = block.match(/title="([^"]+)"/);
          const linkM = block.match(/href="(magnet:[^"]+)"/);
          const sizeM = block.match(/<span[^>]*>(\d+\.?\d*\s*[GMK]B)<\/span>/);
          const seedM = block.match(/<font[^>]*color=['"]green['"][^>]*>(\d+)/);
          const leechM = block.match(/<font[^>]*color=['"]red['"][^>]*>(\d+)/);
          
          if (titleM) {
            results.push({
              title: titleM[1],
              size: sizeM?.[1] || 'Unknown',
              seeders: parseInt(seedM?.[1] || '0'),
              leechers: parseInt(leechM?.[1] || '0'),
              magnet: linkM?.[1] || '',
              source: 'TorrentGalaxy',
              date: new Date().toISOString().split('T')[0]
            });
          }
        });
      }
    } catch {}
  }

  // Source 3: Nyaa (for anime/media) as last resort
  if (results.length === 0) {
    try {
      const r = await fetch(`https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=0_0&f=0`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(6000)
      });
      const xml = await r.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g);
      if (items) {
        items.slice(0, 20).forEach(item => {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1];
          const link = item.match(/<link>(.*?)<\/link>/)?.[1];
          const size = item.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1];
          const seeds = item.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)?.[1];
          const leechers = item.match(/<nyaa:leechers>(.*?)<\/nyaa:leechers>/)?.[1];
          
          if (title) {
            results.push({
              title,
              size: size || 'Unknown',
              seeders: parseInt(seeds || '0'),
              leechers: parseInt(leechers || '0'),
              magnet: link || '',
              source: 'Nyaa',
              date: new Date().toISOString().split('T')[0]
            });
          }
        });
      }
    } catch {}
  }

  results.sort((a, b) => b.seeders - a.seeders);

  res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.json({ results: results.slice(0, 50), total: results.length, query });
}
