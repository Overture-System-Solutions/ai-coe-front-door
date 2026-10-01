'use strict';
const { createHash } = require('node:crypto');
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const guid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function listUrl(config, key) {
  if (!/^https:\/\/[^\s/?#@]+\.sharepoint\.com\/(sites|teams)\/[A-Za-z0-9_-]+$/.test(config.siteUrl) || !guid(config[key])) throw new Error('Invalid server SharePoint binding.');
  return `${config.siteUrl}/_api/web/lists(guid'${config[key]}')/items`;
}
function collection(response) {
  if (response.status !== 200) throw new Error('SharePoint read unavailable.');
  const body = response.body;
  const values = body?.value ?? body?.d?.results;
  if (!Array.isArray(values)) throw new Error('Invalid SharePoint collection.');
  return { values, next: body['@odata.nextLink'] ?? body['odata.nextLink'] ?? body?.d?.__next };
}
/** Service principal only. Its canonical list is private; no browser transport receives this adapter. */
class SharePointCanonicalStore {
  mode = 'live';
  label = 'Private server-side Marketing canonical extension';
  unavailableReasons = [];
  constructor(sp, config) { this.sp = sp; this.config = config; this.url = listUrl(config, 'canonicalListId'); }
  title(key) { return sha(`${this.config.siteUrl}\n${key}`); }
  async row(key) {
    const { values, next } = collection(await this.sp.request('GET', `${this.url}?$filter=${encodeURIComponent(`Title eq '${this.title(key)}'`)}&$top=2`));
    if (next || values.length > 1) throw new Error('Canonical duplicate key.');
    const row = values[0];
    if (row && (row.RecordKey !== key || row.TenantScope !== this.config.siteUrl || sha(row.RecordJson) !== row.RecordHash || typeof (row['@odata.etag'] ?? row['odata.etag'] ?? row.__metadata?.etag) !== 'string')) throw new Error('Canonical integrity mismatch.');
    return row;
  }
  async read(key) { const r = await this.row(key); return r ? { key, value: r.RecordJson, version: r['@odata.etag'] ?? r['odata.etag'] ?? r.__metadata.etag } : undefined; }
  async keys(prefix) {
    const found = []; let url = `${this.url}?$filter=${encodeURIComponent(`startswith(RecordKey,'${prefix.replace(/'/g,"''")}')`)}&$top=5000`;
    const seen = new Set();
    while (url) {
      if (seen.size >= 20) throw new Error('Canonical enumeration exceeds the bounded 20-page limit.');
      if (!url.startsWith(this.url) || seen.has(url)) throw new Error('Unsafe SharePoint continuation.'); seen.add(url);
      const { values, next } = collection(await this.sp.request('GET', url));
      for (const r of values) if (r.TenantScope === this.config.siteUrl && typeof r.RecordKey === 'string' && r.RecordKey.startsWith(prefix)) found.push(r.RecordKey);
      url = next;
    }
    return [...new Set(found)].sort();
  }
  async write(key, value, options = {}) {
    try {
      const before = await this.read(key);
      if (options.ifAbsent && before || options.expectedVersion !== undefined && before?.version !== options.expectedVersion) return { ok: false, conflict: true, version: before?.version };
      if (before && options.expectedVersion === undefined) return { ok: false, conflict: true, reason: 'An explicit ETag is required for every update.' };
      const row = { Title: this.title(key), RecordKey: key, TenantScope: this.config.siteUrl, RecordJson: value, RecordHash: sha(value) };
      let response;
      if (!before) response = await this.sp.request('POST', this.url, row);
      else { const original = await this.row(key); response = await this.sp.request('POST', `${this.url}(${original.Id})`, row, { 'IF-MATCH': options.expectedVersion, 'X-HTTP-Method': 'MERGE' }); }
      if ([409, 412].includes(response.status)) return { ok: false, conflict: true };
      if (![200, 201, 204].includes(response.status)) return { ok: false, uncertain: true };
      const readback = await this.read(key);
      return readback?.value === value ? { ok: true, version: readback.version } : { ok: false, uncertain: true };
    } catch { return { ok: false, uncertain: true, reason: 'Canonical write/readback unavailable; retain the original intent.' }; }
  }
}
/** OAuth bearer acquired by the existing writer identity; tokens never enter request records or logs. */
function createSharePointHttp({ siteUrl, getAccessToken, fetchImpl = globalThis.fetch }) {
  return { request: async (method, url, body, extraHeaders = {}) => {
    if (!url.startsWith(`${siteUrl}/_api/`)) throw new Error('Outside configured SharePoint site.');
    const token = await getAccessToken();
    const response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let parsed = text;
    if (response.headers.get('content-type')?.includes('json') && text) parsed = JSON.parse(text);
    return { status: response.status, body: parsed, etag: response.headers.get('etag') };
  } };
}
module.exports = { SharePointCanonicalStore, createSharePointHttp, listUrl, collection, sha };
