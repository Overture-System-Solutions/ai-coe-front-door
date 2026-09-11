// Loopback-only, allowlisted static server for the offline preview of the built bundle.
// No proxy and no real API calls; see preview/index.html and src/preview/previewHost.ts.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/** Value of a `--name value` argument, or undefined. */
function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const port = Number(argument('--port') ?? 4173);
// `--bundle <path>` previews another build, e.g. the shipped 1.0.0.7 bundle under recovered/package/ClientSideAssets.
const bundleOverride = argument('--bundle');

/** The file in dist/ matching `pattern` that the build wrote last (dev builds omit the hash). */
async function newestDistFile(pattern) {
  const dist = path.join(root, 'dist');
  const names = (await fs.readdir(dist)).filter((name) => pattern.test(name));
  if (names.length === 0) {
    throw new Error(`No file matching ${pattern} in dist/; run npm run build or npm test first.`);
  }
  const stats = await Promise.all(names.map(async (name) => [name, (await fs.stat(path.join(dist, name))).mtimeMs]));
  stats.sort((a, b) => b[1] - a[1]);
  return path.join('dist', stats[0][0]);
}

const routes = new Map([
  ['/', ['preview/index.html', 'text/html; charset=utf-8']],
  ['/react.js', ['node_modules/react/umd/react.development.js', 'text/javascript']],
  ['/react-dom.js', ['node_modules/react-dom/umd/react-dom.development.js', 'text/javascript']],
  ['/host.js', ['lib/preview/previewHost.js', 'text/javascript']],
  ['/mount.js', ['preview/mount.js', 'text/javascript']],
  ['/strings.js', [await newestDistFile(/^AiCoeFrontDoorWebPartStrings_en-us.*\.js$/), 'text/javascript']],
  ['/bundle.js', [bundleOverride ?? (await newestDistFile(/^ai-coe-front-door-web-part.*\.js$/)), 'text/javascript']]
]);
for (const [target] of routes.values()) {
  await fs.access(path.join(root, target));
}

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const server = http.createServer(async (request, response) => {
  const host = String(request.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    response.writeHead(403);
    response.end('Loopback only');
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  const target = routes.get(request.url.split('?')[0]);
  if (!target) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    const data = await fs.readFile(path.join(root, target[0]));
    response.writeHead(200, {
      'Content-Type': target[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': CSP
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(500);
    response.end('Missing local preview asset; run npm ci and npm run build');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ status: 'OFFLINE_PREVIEW_READY', url: `http://127.0.0.1:${server.address().port}`, simulated: true }));
});
