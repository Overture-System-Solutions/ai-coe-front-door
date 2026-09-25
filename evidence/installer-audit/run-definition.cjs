'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const ts = require(require.resolve('typescript', { paths: [root] }));
const config = { rootDir: root, roots: [path.join(root, 'src/provisioning')], testEnvironment: 'node', transform: { '^.+\\.ts$': path.join(__dirname, 'source-transform.cjs') }, testMatch: ['<rootDir>/src/provisioning/onePageDefinition.test.ts'] };
require(require.resolve('@jest/core', { paths: [root] })).runCLI({ runInBand: true, cache: false, config: JSON.stringify(config) }, [root]).then(r => {
  fs.writeFileSync(path.join(__dirname, 'definition-results.json'), JSON.stringify(r.results, null, 2));
  const file = path.join(root, 'src/provisioning/onePageDefinition.test.ts');
  const program = ts.createProgram([file], { noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, types: ['node', 'jest'], skipLibCheck: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  console.log('Targeted no-emit TypeScript diagnostics: ' + diagnostics.length);
  for (const d of diagnostics) console.error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  process.exit(r.results.success && diagnostics.length === 0 ? 0 : 1);
}).catch(e => { console.error(e); process.exit(1); });
