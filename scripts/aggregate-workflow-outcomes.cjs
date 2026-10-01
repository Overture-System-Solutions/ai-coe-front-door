#!/usr/bin/env node
'use strict';
/** Offline only. No SharePoint client, credential, model, sender or scheduler is constructed. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const usage = 'node scripts/aggregate-workflow-outcomes.cjs --input export.json --qualification qualification.json --scope expected-scope.json --as-of YYYY-MM-DD --out new-report.json';

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return 0; }
  const allowed = ['--input', '--qualification', '--scope', '--as-of', '--out'];
  const flags = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!allowed.includes(key) || Object.hasOwn(flags, key) || !value || value.startsWith('--')) throw new Error('arguments');
    flags[key] = value;
  }
  if (allowed.some(key => !flags[key])) throw new Error('arguments');
  const asOf = flags['--as-of'];
  const asOfStamp = Date.parse(`${asOf}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(asOfStamp) || new Date(asOfStamp).toISOString().slice(0, 10) !== asOf) throw new Error('as-of');
  const read = file => {
    if (fs.statSync(file).size > 10 * 1024 * 1024) throw new Error('size');
    return fs.readFileSync(file);
  };
  // Read only JSON data supplied explicitly by the operator; never execute input content.
  const sourceBytes = read(flags['--input']);
  const qualificationBytes = read(flags['--qualification']);
  const scopeBytes = read(flags['--scope']);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const qualification = JSON.parse(qualificationBytes.toString('utf8'));
  const expectedScope = JSON.parse(scopeBytes.toString('utf8'));

  // Use the installed compiler and the actual source implementation, not a duplicate CLI algorithm.
  // No shared Heft/lib output is read or written. Syntax diagnostics are fatal.
  const ts = require('typescript');
  const implementation = {};
  for (const extension of ['.ts', '.tsx']) {
    require.extensions[extension] = (module, filename) => {
      if (!filename.startsWith(sourceRoot + path.sep)) throw new Error('source boundary');
      const bytes = fs.readFileSync(filename);
      implementation[path.relative(root, filename).split(path.sep).join('/')] = sha(bytes);
      const compiled = ts.transpileModule(bytes.toString('utf8'), {
        fileName: filename, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }
      });
      if ((compiled.diagnostics || []).some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('source syntax');
      module._compile(compiled.outputText, filename);
    };
  }
  const { aggregateWorkflowOutcomes } = require(path.join(sourceRoot, 'webparts/aiCoeFrontDoor/services/workflowOutcomeAggregation.ts'));
  const report = aggregateWorkflowOutcomes(source, qualification, { expectedScope, sourceSha256: sha(sourceBytes), asOf: flags['--as-of'] });
  const output = {
    ...report,
    notice: qualification && qualification.mode === 'synthetic' ? 'SYNTHETIC FIXTURE OUTPUT — not business evidence or approval.' : 'OPERATOR REVIEW CANDIDATE — references are attestations, not independently authenticated evidence.',
    runReceipt: {
      sourceSha256: sha(sourceBytes), qualificationSha256: sha(qualificationBytes), scopeSha256: sha(scopeBytes),
      asOf: flags['--as-of'], commandSha256: sha(fs.readFileSync(__filename)), implementation,
      networkUsed: false, tenantWrites: false
    }
  };
  // Never replace another run's report or any input. Operators retain each run for reconciliation.
  fs.writeFileSync(flags['--out'], JSON.stringify(output, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, publication: 'manual-only', mode: report.mode || 'unqualified' }));
  return report.status === 'review-required' ? 0 : 2;
}
try { process.exitCode = main(); }
catch { console.error('Offline aggregation failed. Check arguments, local JSON files, installed dependencies and a new output path. No input content is logged.\n' + usage); process.exitCode = 1; }
