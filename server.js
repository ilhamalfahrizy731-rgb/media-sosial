// Instagram-style comment censor — Node >= 22.13, tanpa dependency (pakai node:sqlite bawaan).
const http = require('http'), fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.PORT || 3000;
const CENSOR_CHAR = process.env.CENSOR_CHAR || '*'; // ganti ke '#' kalau mau ######

// ---------- Database ----------
const db = new DatabaseSync(path.join(__dirname, 'data', 'comments.db'));
db.exec(`CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, text TEXT NOT NULL,
  verified INTEGER DEFAULT 0, profile_pic_url TEXT, likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0, censored INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`);

// ---------- Sensor ----------
const { censor, wordCount } = require('./censor').createCensor(path.join(__dirname, 'wordlist.txt'), CENSOR_CHAR);

// ---------- Seed ----------
if (db.prepare('SELECT COUNT(*) n FROM comments').get().n === 0) {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'comments_seed.json'), 'utf8'));
  const likes = { dewafabiann: 26, xtrememerch: 18 }, replies = { dewafabiann: 6, 'ianbridgers._': 2, xtrememerch: 1 };
  const ins = db.prepare('INSERT INTO comments(username,text,verified,profile_pic_url,likes,replies,created_at) VALUES(?,?,?,?,?,?,?)');
  const t0 = Date.now() - 9 * 7 * 864e5;
  seed.forEach((c, i) => ins.run(c.username, censor(c.text).text, c.verified ? 1 : 0, c.profile_pic_url, likes[c.username] || 0, replies[c.username] || 0, t0 - i * 6e4));
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', d => { s += d; if (s.length > 1e4) { req.destroy(); no(); } }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/comments' && req.method === 'GET')
    return json(res, 200, db.prepare('SELECT * FROM comments ORDER BY created_at DESC, id DESC').all());

  if (url.pathname === '/api/comments' && req.method === 'POST') {
    const text = String((await body(req)).text || '').trim().slice(0, 2200);
    if (!text) return json(res, 400, { error: 'Komentar kosong' });
    // pinjam identitas acak dari daftar username yang ada, supaya terlihat natural
    const u = db.prepare('SELECT username,verified,profile_pic_url FROM comments GROUP BY username ORDER BY RANDOM() LIMIT 1').get();
    const c = censor(text);
    const r = db.prepare('INSERT INTO comments(username,text,verified,profile_pic_url,censored,created_at) VALUES(?,?,?,?,?,?)')
      .run(u.username, c.text, u.verified, u.profile_pic_url, c.count, Date.now());
    return json(res, 201, db.prepare('SELECT * FROM comments WHERE id=?').get(r.lastInsertRowid));
  }

  const like = url.pathname.match(/^\/api\/comments\/(\d+)\/like$/);
  if (like && req.method === 'POST') {
    const d = (await body(req)).delta === -1 ? -1 : 1;
    db.prepare('UPDATE comments SET likes=MAX(0,likes+?) WHERE id=?').run(d, like[1]);
    return json(res, 200, db.prepare('SELECT id,likes FROM comments WHERE id=?').get(like[1]) || {});
  }

  const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (${wordCount} kata di wordlist)`));