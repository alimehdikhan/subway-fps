const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = url === '/' ? '/index.html' : url;
  if (!/^\/(index\.html|js\/[^/]+\.js|css\/[^/]+\.css|models\/[^/]+\.glb|audio\/[^/]+\.(mp3|wav))$/.test(file)) {
    res.writeHead(404); return res.end();
  }
  fs.readFile(path.join(__dirname, '..', file), (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(error ? 'Not found' : data);
  });
}).listen(4173, '127.0.0.1', () => console.log('Game: http://127.0.0.1:4173'));
