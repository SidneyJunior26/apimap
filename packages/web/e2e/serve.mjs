// Minimal static server: node e2e/serve.mjs <dir> <port>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const [root, port] = [path.resolve(process.argv[2]), Number(process.argv[3])];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    statSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port);
