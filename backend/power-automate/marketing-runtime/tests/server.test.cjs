'use strict';
const { test } = require('node:test');
const { assert, path } = require('./helpers.cjs');
const fs = require('node:fs');
const crypto = require('node:crypto');
// Explicit offline SharePoint-shaped test double, not tenant results.
class FixtureSharePoint {
  constructor() { this.rows = new Map(); this.version = 0; this.calls = []; }
  async request(method, uri, body, headers = {}) {
    this.calls.push({ method, uri, body, headers });
    const match = /items\((\d+)\)/.exec(uri);
    if (method === 'GET') {
      if (match) return { status: 200, body: this.rows.get(+match[1]) };
      const key = /Title eq '([^']+)'/.exec(decodeURIComponent(uri));
      return { status: 200, body: { value: [...this.rows.values()].filter(r => !key || r.Title === key[1]) } };
    }
    if (headers['X-HTTP-Method'] === 'MERGE') {
      const row = this.rows.get(+match[1]);
      if (!row || headers['IF-MATCH'] !== row['@odata.etag']) return { status: 412, body: {} };
      Object.assign(row, body, { '@odata.etag': `"${++this.version}"` }); return { status: 204, body: null };
    }
    if ([...this.rows.values()].some(r => r.Title === body.Title)) return { status: 409, body: {} };
    const Id = ++this.version; const row = { ...body, Id, '@odata.etag': `"${this.version}"` }; this.rows.set(Id, row);
    return { status: 201, body: row };
  }
}
test('canonical enumeration is bounded even when continuation URLs never repeat', async () => {
  const { SharePointCanonicalStore } = require('../server/sharepoint.cjs');
  const cfg = { siteUrl: 'https://example.sharepoint.com/sites/marketing', canonicalListId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' };
  let pages = 0;
  const store = new SharePointCanonicalStore({ request: async () => ({ status: 200, body: { value: [], '@odata.nextLink': ++pages <= 21 ? store.url + '?page=' + pages : undefined } }) }, cfg);
  await assert.rejects(store.keys('envelope:'), /limit|bound/i);
  assert.ok(pages <= 20);
});

test('server SharePoint HTTP supplies a finite network deadline and disallows redirects', async () => {
  const { createSharePointHttp } = require('../server/sharepoint.cjs'); let options;
  const siteUrl = 'https://example.sharepoint.com/sites/marketing';
  const sp = createSharePointHttp({ siteUrl, getAccessToken: async () => 'OFFLINE-NOT-A-CREDENTIAL', fetchImpl: async (url, o) => { options = o; return { status: 200, headers: new Map(), text: async () => '' }; } });
  await sp.request('GET', siteUrl + '/_api/web');
  assert.ok(options.signal instanceof AbortSignal); assert.equal(options.redirect, 'error');
});

module.exports = { FixtureSharePoint };

test('server canonical adapter persists across instances and rejects stale ETags', async () => {
  const filename = path.join(__dirname, '../server/sharepoint.cjs');
  assert.ok(fs.existsSync(filename), 'executable SharePoint canonical adapter missing');
  const { SharePointCanonicalStore } = require(filename), sp = new FixtureSharePoint();
  const cfg = { siteUrl: 'https://example.sharepoint.com/sites/marketing', canonicalListId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' };
  const first = new SharePointCanonicalStore(sp, cfg);
  const created = await first.write('intent:test', '{"private":"business draft"}', { ifAbsent: true }); assert.equal(created.ok, true);
  const second = new SharePointCanonicalStore(sp, cfg);
  assert.equal((await second.read('intent:test')).value, '{"private":"business draft"}');
  assert.equal((await second.write('intent:test', '{}', { expectedVersion: 'stale' })).conflict, true);
  assert.equal((await second.write('intent:test', '{}', { expectedVersion: created.version })).ok, true);
  const row = [...sp.rows.values()][0]; row.RecordJson = 'tampered';
  await assert.rejects(second.read('intent:test'), /integrity/i);
});
