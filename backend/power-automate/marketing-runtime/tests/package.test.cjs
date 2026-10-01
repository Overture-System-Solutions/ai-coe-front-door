'use strict';
const { test } = require('node:test');
const { assert, fs, path, root } = require('./helpers.cjs');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

test('offline candidate builds dependency-complete runtime and exports a disabled-safe host invocation', async () => {
  const build = path.join(__dirname, '../build.cjs');
  assert.ok(fs.existsSync(build), 'offline build script is missing');
  fs.mkdirSync(path.join(__dirname, '../out'), { recursive: true });
  const external = process.env.MARKETING_PACKAGE_ROOT;
  const out = external || fs.mkdtempSync(path.join(__dirname, '../out/package-test-'));
  try {
    if (!external) {
      const built = spawnSync(process.execPath, [build, '--out', out], { cwd: root, encoding: 'utf8' });
      assert.equal(built.status, 0, built.stderr + built.stdout);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.equal(manifest.kind, 'offline-node-extension-candidate'); assert.equal(manifest.powerAutomateImportable, false);
    assert.equal(manifest.version, '0.1.1');
    const operations = JSON.parse(fs.readFileSync(path.join(out, 'operations.json'), 'utf8'));
    assert.equal(operations.protocol, 'marketing.v1');
    assert.deepEqual(Object.keys(operations.operations).sort(), Object.keys(require('../server/runtime.cjs').fields).sort());
    assert.ok(manifest.files.length > 10);
    for (const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(out, file.path))).digest('hex'), file.sha256, file.path);
    const { MarketingRuntime } = require(path.join(out, 'server/runtime.cjs'));
    const { fixture } = require('./runtime-fixture.cjs');
    const f = await fixture(MarketingRuntime, undefined);
    // Default package resolution, not the source transpiler, is required for this smoke execution.
    class Packaged extends MarketingRuntime { constructor(o) { super({ ...o, shared: undefined }); } }
    const p = await fixture(Packaged);
    const result = await p.run('DraftCampaignBriefV1', { workId: 'CW-OFFLINE_TEST', objective: 'Offline smoke', audienceContext: ['Marketing team'], sourceIds: [p.entry.id] });
    assert.equal(result.kind, 'saved', JSON.stringify(result));
    const { createMarketingInvocation } = require(path.join(out, 'server/invoke.cjs'));
    assert.throws(() => createMarketingInvocation({ config: { enabled: false } }), /disabled|binding/i);
    let network = 0;
    const invoke = createMarketingInvocation({ config: f.config, sp: { request: async () => { network++; throw new Error('not called'); } }, invokeClaude: async () => {}, runAsCanonicalWriter: async (_, run) => run() });
    await assert.rejects(invoke({ requestItemId: 1, actorId: 'forged' }), /reference only/i); assert.equal(network, 0);
    // Exercise the packaged PUBLIC invocation with the actual SharePoint CAS adapter, not injected storage.
    const { FixtureSharePoint } = require('./sharepoint-fixture.cjs');
    const { SharePointCanonicalStore } = require(path.join(out, 'server/sharepoint.cjs'));
    const canonical = new FixtureSharePoint();
    const sp = { request: (...args) => args[1].includes(f.config.canonicalListId) ? canonical.request(...args) : f.sp.request(...args) };
    const store = new SharePointCanonicalStore(sp, f.config);
    for (const key of await f.store.keys('')) assert.equal((await store.write(key, (await f.store.read(key)).value, { ifAbsent: true })).ok, true);
    let guarded = 0;
    const invokeBound = createMarketingInvocation({ config: f.config, sp, invokeClaude: f.invokeClaude, runAsCanonicalWriter: async (scope, run) => { assert.equal(scope.extension, 'marketing.v1'); guarded++; return run(); } });
    const row = f.enqueue('DraftCampaignBriefV1', { workId: 'CW-OFFLINE_TEST', objective: 'Offline public invocation', audienceContext: ['Marketing team'], sourceIds: [f.entry.id] });
    const confirmation = await invokeBound({ requestItemId: row.Id });
    assert.equal(confirmation.projectionConfirmed, true); assert.equal(guarded, 1); assert.equal(f.providerCalls(), 1);
    assert.equal(Object.hasOwn(confirmation, 'value'), false);
    assert.equal(JSON.parse(f.projections[0].ResultJson).value.kind, 'saved');
    const m = require('./manual-fixture.cjs');
    const bound = { ...f, run: async (op, payload, author) => {
      const item = f.enqueue(op, payload, author);
      assert.equal((await invokeBound({ requestItemId: item.Id })).projectionConfirmed, true);
      return JSON.parse(f.projections.find(x => x.RequestId === item.Title).ResultJson).value;
    } };
    assert.deepEqual(await bound.run('ListMarketingWorkV1', {}), [m.workId]);
    const manual = await bound.run('SaveManualMarketingDraftV1', m.brief(bound));
    assert.equal(manual.kind, 'saved', JSON.stringify(manual));
    const accepted = await m.accept(bound, manual, 'strategyVoice');
    const plan = await bound.run('SaveManualMarketingDraftV1', m.plan(bound, manual, accepted.receipt.receiptId));
    assert.equal(plan.kind, 'saved', JSON.stringify(plan));
    const follow = await bound.run('SaveManualMarketingDraftV1', m.follow(bound, manual, plan));
    assert.equal(follow.kind, 'saved', JSON.stringify(follow));
    const revised = await bound.run('SaveManualMarketingDraftV1', { ...m.brief(bound), artifactId: manual.envelope.artifactId, expectedStoreVersion: manual.storeVersion });
    assert.equal(revised.kind, 'saved'); assert.equal(revised.envelope.revision, 2);
    assert.equal((await bound.run('SaveManualMarketingDraftV1', { ...m.brief(bound), artifactId: manual.envelope.artifactId, expectedStoreVersion: manual.storeVersion })).failure, 'staleVersion');
    assert.equal(f.providerCalls(), 1, 'Manual public invocation never calls the provider.');
  } finally { if (!external) fs.rmSync(out, { recursive: true, force: true }); }
});
