'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const tests = json('regression-verified.json');
assert.equal(tests.success, true);
assert.equal(tests.numFailedTests, 0);
assert.equal(tests.numPendingTests, 0);
const assertions = tests.testResults.flatMap(suite => suite.testResults || suite.assertionResults || []);
assert.equal(assertions.length, tests.numTotalTests);
assert.equal(assertions.filter(test => test.status === 'passed').length, tests.numPassedTests);
const reports = ['synthetic-report-verified', 'synthetic-unknown-report-verified', 'synthetic-suppressed-report-verified'].map(name => {
  const report = json(name + '.json');
  assert.ok(report.notice.includes('SYNTHETIC FIXTURE OUTPUT'));
  assert.equal(report.runReceipt.commandSha256, sha(path.join(root, 'scripts/aggregate-workflow-outcomes.cjs')));
  assert.equal(report.runReceipt.sourceSha256, sha(path.join(__dirname, 'fixtures/synthetic-outcomes.json')));
  for (const [file, digest] of Object.entries(report.runReceipt.implementation)) assert.equal(digest, sha(path.join(root, file)));
  if (report.status !== 'review-required') {
    assert.equal(report.observed, undefined);
    assert.equal(report.reconciliation, undefined);
  }
  assert.ok(!JSON.stringify(report).includes('OVT-AICOE'));
  return { file: name + '.json', status: report.status, sha256: sha(path.join(__dirname, name + '.json')), observed: report.observed, reconciliation: report.reconciliation };
});
const owned = [
  'src/webparts/aiCoeFrontDoor/components/app/AppSections.tsx',
  'src/webparts/aiCoeFrontDoor/components/app/AppSections.test.tsx',
  'src/webparts/aiCoeFrontDoor/services/workflowOutcomeAggregation.ts',
  'src/webparts/aiCoeFrontDoor/services/workflowOutcomeAggregation.test.ts',
  'scripts/aggregate-workflow-outcomes.cjs', 'scripts/aggregate-workflow-outcomes.test.cjs', 'docs/MEASUREMENT-AND-TEACHING.md'
];
console.log(JSON.stringify({ status: 'verified-local-only', suites: tests.numPassedTestSuites, tests: tests.numPassedTests, failed: tests.numFailedTests, skipped: tests.numPendingTests, focusedTests: json('focused-final.json').numPassedTests, cliExitCode: json('cli-final-execution.json').result.exit_code, typecheckExitCode: json('typecheck-final-execution.json').result.exit_code, reports, files: owned.map(file => ({ file, sha256: sha(path.join(root, file)) })) }, null, 2));
