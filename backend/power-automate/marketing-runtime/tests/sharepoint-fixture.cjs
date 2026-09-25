'use strict';
// In-memory SharePoint-shaped boundary double. Never a tenant connector.
class FixtureSharePoint {
  constructor() { this.rows = new Map(); this.version = 0; this.calls = []; }
  async request(method, uri, body, headers = {}) {
    this.calls.push({ method, uri, body, headers });
    const match = /items\((\d+)\)/.exec(uri);
    if (method === 'GET') {
      if (match) return { status: 200, body: this.rows.get(+match[1]) };
      const key = /Title eq '([^']+)'/.exec(decodeURIComponent(uri));
      const prefix = /startswith\(RecordKey,'([^']*)'\)/.exec(decodeURIComponent(uri));
      return { status: 200, body: { value: [...this.rows.values()].filter(r => (!key || r.Title === key[1]) && (!prefix || r.RecordKey.startsWith(prefix[1]))) } };
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
module.exports = { FixtureSharePoint };
