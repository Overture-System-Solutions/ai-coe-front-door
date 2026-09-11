import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const root = path.resolve(import.meta.dirname, '..');

test('loopback preview serves only allowlisted assets with an offline warning and CSP', async () => {
  const file = path.join(root, 'scripts/preview.mjs');
  assert.ok(fs.existsSync(file), 'Preview server not implemented');
  const child = spawn(process.execPath, [file, '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No readiness URL')), 10000);
      child.stdout.once('data', data => { clearTimeout(timer); resolve(JSON.parse(data).url); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Early exit ' + code)); });
    });
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-security-policy').includes("connect-src 'none'"));
    const html = await response.text();
    assert.match(html, /OFFLINE RECOVERY PREVIEW/);
    assert.match(html, /simulated/i);
    for (const [, url] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      assert.equal((await fetch(new URL(url, base))).status, 200, url);
    }
    for (const url of ['/original/overture-ai-coe-front-door.sppkg', '/.env', '/src/recovery-map.json', '/unknown', '/%2e%2e/secrets']) {
      assert.equal((await fetch(base + url)).status, 404, url);
    }
  } finally { child.kill(); await exit; }
});
