'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const cli = path.join(__dirname, 'aggregate-workflow-outcomes.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-aggregation-test-'));
  const scope = { tenant: 'fixture-tenant', site: 'fixture-site', list: 'fixture-list', cohort: 'fixture-cohort' };
  const rows = Array.from({ length: 10 }, (_, index) => {
    const id = `OVT-AICOE-20260910-${String(index).padStart(8, '0')}`;
    return { Title: `Task outcome — ${id}`, OutcomeId: id, RecordedAt: '2026-09-10T12:00:00.000Z', TaskType: 'Drafting or writing', Outcome: index < 5 ? 'Accepted' : 'Corrected', ReviewState: 'Reviewed by me', CorrectionCategory: index < 5 ? '' : 'fact', RouteAvailability: 'Draft only', WorkflowVersion: '1.0' };
  });
  const source = JSON.stringify({ schemaVersion: 'workflow-outcomes-export.v1', scope, rows });
  const qualification = { schemaVersion: 'workflow-outcomes-qualification.v1', mode: 'synthetic', scope, period: { start: '2026-09-01', end: '2026-09-20' }, sourceReceipt: { reference: 'fixture-receipt', sha256: sha(source), complete: true }, method: { id: 'content-free-outcomes-v1', approvalRef: 'fixture-method-not-business-approval' }, privacy: { approvalRef: 'fixture-privacy-not-business-approval', cohortSize: 5, minimumCohort: 5, minimumCellCohort: 5 }, freshnessDays: 30 };
  const input = path.join(dir, 'source.json'); const qual = path.join(dir, 'qualification.json');
  const binding = path.join(dir, 'scope.json'); const out = path.join(dir, 'candidate.json');
  fs.writeFileSync(input, source); fs.writeFileSync(qual, JSON.stringify(qualification)); fs.writeFileSync(binding, JSON.stringify(scope));
  return { dir, input, qual, binding, out, run: (asOf = '2026-09-23') => spawnSync(process.execPath, [cli, '--input', input, '--qualification', qual, '--scope', binding, '--as-of', asOf, '--out', out], { encoding: 'utf8' }) };
}

test('actual offline command invokes the source aggregator, binds receipts and never overwrites', () => {
  const f = setup();
  try {
    let result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(fs.readFileSync(f.out, 'utf8'));
    assert.equal(report.status, 'review-required');
    assert.equal(report.mode, 'synthetic');
    assert.equal(report.publication, 'manual-only');
    assert.equal(report.observed.reviewedOutputPass, 0.5);
    assert.equal(report.runReceipt.sourceSha256, sha(fs.readFileSync(f.input)));
    assert.equal(report.runReceipt.qualificationSha256, sha(fs.readFileSync(f.qual)));
    assert.equal(report.runReceipt.asOf, '2026-09-23');
    assert.ok(report.notice.includes('not business evidence'));
    const before = fs.readFileSync(f.out);
    result = f.run();
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readFileSync(f.out), before);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('tampered bytes fail closed with body-free output', () => {
  const f = setup();
  try {
    fs.appendFileSync(f.input, ' ');
    const result = f.run();
    assert.equal(result.status, 2);
    const report = JSON.parse(fs.readFileSync(f.out, 'utf8'));
    assert.equal(report.status, 'blocked');
    assert.ok(report.notice.includes('SYNTHETIC FIXTURE OUTPUT'));
    assert.equal(report.observed, undefined);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('invalid as-of input is not reflected into a report', () => {
  const f = setup();
  try {
    const result = f.run('PRIVATE-CONTENT-CANARY');
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(f.out), false);
    assert.ok(!(result.stdout + result.stderr).includes('PRIVATE-CONTENT-CANARY'));
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('parse errors cannot print private input', () => {
  const f = setup();
  try {
    fs.writeFileSync(f.input, 'PRIVATE-CONTENT-CANARY');
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(f.out), false);
    assert.ok(!(result.stdout + result.stderr).includes('PRIVATE-CONTENT-CANARY'));
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
