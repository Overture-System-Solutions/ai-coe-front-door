// Loopback-only, allowlisted static preview. No proxy and no real API calls.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const index = process.argv.indexOf('--port');
const port = index < 0 ? 4173 : Number(process.argv[index + 1]);
const map = JSON.parse(await fs.readFile(path.join(root, 'src/recovery-map.json'), 'utf8'));
const routes = new Map([
  ['/', ['preview/index.html', 'text/html; charset=utf-8']],
  ['/react.js', ['node_modules/react/umd/react.development.js', 'text/javascript']],
  ['/react-dom.js', ['node_modules/react-dom/umd/react-dom.development.js', 'text/javascript']],
  ['/host.js', ['preview/host.js', 'text/javascript']],
  ['/mount.js', ['preview/mount.js', 'text/javascript']],
  ['/bundle.js', ['dist/' + path.basename(map.bundle), 'text/javascript']],
]);
await fs.access(path.join(root, 'dist', path.basename(map.bundle)));
const server = http.createServer(async (request, response) => {
  const host = String(request.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) { response.writeHead(403); response.end('Loopback only'); return; }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  const target = routes.get(request.url.split('?')[0]);
  if (!target) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const data = await fs.readFile(path.join(root, target[0]));
    response.writeHead(200, {
      'Content-Type': target[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(500); response.end('Missing local preview asset; run npm ci and npm run build'); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({
  status: 'OFFLINE_PREVIEW_READY', url: `http://127.0.0.1:${server.address().port}`, simulated: true,
})));
