const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 5500;
const root = process.cwd();

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(root, urlPath);
    if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(filePath, (err, st) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      const ct = mime[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    });
  } catch (err) { res.writeHead(500); res.end('Server error'); }
}).listen(port, () => console.log(`Static server serving ${root} at http://localhost:${port}`));