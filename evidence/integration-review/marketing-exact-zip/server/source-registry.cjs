'use strict';
const { sha } = require('./sharepoint.cjs');
const path = require('node:path');
/** Reads private approval/source metadata and actual SharePoint bytes under the verified request Author. */
class ServerSourceRegistry {
  mode = 'business';
  constructor(options) { Object.assign(this, options); this.shared = options.shared ?? (name => require(path.join(__dirname, '../compiled', name + '.js'))); }
  async readRegister() {
    const held = await this.store.read('register:active');
    if (!held) return { available: false, reasons: ['No approved register snapshot is retained.'] };
    const readback = JSON.parse(held.value);
    const approval = readback.evidence;
    const receipt = approval ? await this.store.read(`receipt:${approval.receiptId}`) : undefined;
    const authority = approval ? await this.store.read(`authority:${approval.approvedByBindingRef}`) : undefined;
    const receiptValue = receipt ? JSON.parse(receipt.value) : undefined;
    const binding = authority ? JSON.parse(authority.value) : undefined;
    const gate = this.shared('content/marketing/sourceGate');
    const denied = { available: false, reasons: ['Register approval receipt or current owner authority could not be verified.'] };
    if (!gate.parseApprovalEvidence(approval).evidence || receiptValue?.receiptId !== approval.receiptId || receiptValue?.operation !== 'approveSourceRegister' || receiptValue?.result !== 'PASS' || receiptValue.readbackHash !== approval.snapshotHash || receiptValue.payloadHash !== approval.snapshotHash || receiptValue.targetRef !== readback.snapshotRef || binding?.actorId !== receiptValue.actorId || binding?.synthetic !== false || !binding?.scope?.includes('sourceRegister') || binding?.revoked === true || binding?.tenantScope !== this.siteUrl || !Number.isFinite(Date.parse(binding?.expiresAt)) || Date.parse(binding.expiresAt) <= (this.now?.() ?? new Date()).getTime() || !Array.isArray(readback.revoked)) return denied;
    try { if (!(await gate.qualifyRegister(readback.register, { mode: 'business', now: this.now?.() ?? new Date(), evidence: { ...approval, source: 'authenticatedReadback' } })).usable) return denied; } catch { return denied; }
    return { available: true, readback: { ...readback, evidence: { ...approval, source: 'authenticatedReadback' } } };
  }
  async readExcerpt(reference) {
    const approved = await this.readRegister();
    if (!approved.available || approved.readback.revoked.includes(reference.sourceId)) return undefined;
    const registered = approved.readback.register.entries.find(e => e.id === reference.sourceId);
    if (!registered || !this.shared('content/marketing/sourceGate').checkSourceAccess(approved.readback.register, reference, { callerId: this.actorId, purpose: this.purpose, audience: this.audience, now: this.now?.() ?? new Date(), revoked: approved.readback.revoked }).ok) return undefined;
    const held = await this.store.read(`source:${reference.sourceId}`);
    if (!held) return undefined;
    const source = JSON.parse(held.value), entry = source.entry;
    const hash = this.shared('content/actionEnvelope').payloadHash;
    if (await hash(entry) !== await hash(registered)) return undefined;
    if (source.revoked !== false || !source.actors?.includes(this.actorId) || !source.purposes?.includes(this.purpose) || !source.audiences?.includes(this.audience) || entry?.id !== reference.sourceId || entry.versionOrETag !== reference.versionOrETag || !entry.location.startsWith(`${this.siteUrl}/`)) return undefined;
    const url = new URL(entry.location), site = new URL(this.siteUrl);
    if (url.origin !== site.origin || url.search || url.hash || !url.pathname.startsWith(site.pathname + '/')) return undefined;
    const file = `${this.siteUrl}/_api/web/GetFileByServerRelativePath(decodedurl='${encodeURIComponent(decodeURIComponent(url.pathname).replace(/'/g,"''"))}')`;
    const permissions = await this.sp.request('GET', `${file}/ListItemAllFields/getUserEffectivePermissions(@u)?@u='${encodeURIComponent(this.loginName.replace(/'/g,"''"))}'`);
    const low = permissions.body?.GetUserEffectivePermissions?.Low ?? permissions.body?.d?.GetUserEffectivePermissions?.Low;
    if (permissions.status !== 200 || !/^\d+$/.test(String(low)) || (BigInt(low) & 33n) !== 33n) return undefined;
    const metadata = await this.sp.request('GET', `${file}?$select=ETag`);
    if (metadata.status !== 200 || (metadata.body?.ETag ?? metadata.body?.d?.ETag) !== reference.versionOrETag) return undefined;
    const content = await this.sp.request('GET', `${file}/$value`, undefined, { 'If-Match': reference.versionOrETag });
    if (content.status !== 200 || typeof content.body !== 'string' || content.body.length > 200000 || content.etag !== reference.versionOrETag || sha(content.body) !== source.contentHash) return undefined;
    return { sourceId: entry.id, versionOrETag: entry.versionOrETag, locator: entry.location, excerpt: content.body, mayNotProve: entry.mayNotProve ?? 'Provenance is not proof of the claim.' };
  }
}
module.exports = { ServerSourceRegistry };
