'use strict';
// Local build only. No network, cloud authentication, import, enable or deployment operations.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const releaseVersion = '0.1.1';
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, 'src/webparts/aiCoeFrontDoor');
const ts = require(path.join(root, 'node_modules/typescript'));
const arg = process.argv.indexOf('--out');
const out = path.resolve(arg >= 0 ? process.argv[arg + 1] : path.join(__dirname, 'out/candidate'));
if (!out.startsWith(path.join(__dirname, 'out') + path.sep)) throw new Error('Build output must stay in marketing-runtime/out.');
fs.mkdirSync(out, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = [], outputs = new Set();
function emit(name, text) { const target = path.join(out, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); outputs.add(name.replaceAll('\\', '/')); }
function source(file) { const bytes = fs.readFileSync(file); inputs.push({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: digest(bytes) }); return bytes; }
const visited = new Set();
function compile(file) {
  if (visited.has(file)) return; visited.add(file);
  if (!file.startsWith(base + path.sep) || !file.endsWith('.ts') || file.endsWith('.test.ts')) throw new Error('Unexpected compile input: ' + file);
  const text = source(file).toString('utf8');
  const compiled = ts.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error(ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  emit('compiled/' + path.relative(base, file).replace(/\.ts$/, '.js'), compiled.outputText);
  // Follow emitted runtime imports only; type-only browser/SPFx dependencies are not runtime dependencies.
  for (const match of compiled.outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (!match[1].startsWith('.')) throw new Error('Unexpected external runtime dependency: ' + match[1]);
    compile(path.resolve(path.dirname(file), match[1] + '.ts'));
  }
}
for (const name of ['services/marketing/artifactRepository', 'services/marketing/marketingDraftService', 'services/marketing/marketingReviewService', 'services/marketing/sourceRegistry', 'content/actionEnvelope', 'content/marketing/schema', 'content/marketing/artifactTypes', 'content/marketing/sourceGate']) compile(path.join(base, name + '.ts'));
compile(path.join(base, 'services/marketing/businessServices.ts'));
for (const name of fs.readdirSync(path.join(__dirname, 'server')).filter(n => n.endsWith('.cjs'))) emit('server/' + name, source(path.join(__dirname, 'server', name)));
for (const name of fs.readdirSync(path.join(base, 'content/marketing/schemas')).filter(n => n.endsWith('.json'))) emit('schemas/' + name, source(path.join(base, 'content/marketing/schemas', name)));
for (const name of ['config.example.json', 'provisioning.json', 'connector-binding.json', 'README.md', 'HANDOFF.md', 'evidence/source-suite.tap', 'evidence/typecheck.txt', 'evidence/test-results.json']) emit(name, source(path.join(__dirname, name)));
emit('operations.json', source(path.join(__dirname, 'operations.json')));
emit('package.json', JSON.stringify({ name: '@oss/marketing-runtime-offline-candidate', version: releaseVersion, private: true, type: 'commonjs', main: 'server/invoke.cjs', engines: { node: '>=22' }, description: 'Offline review candidate; NOT a Power Automate solution or commissioned tenant runtime' }, null, 2) + '\n');
const manifest = { kind: 'offline-node-extension-candidate', version: releaseVersion, powerAutomateImportable: false, enabledByDefault: false, node: process.version, compiler: ts.version, inputs: inputs.sort((a,b) => a.path.localeCompare(b.path)), files: [...outputs].sort().map(p => ({ path: p, sha256: digest(fs.readFileSync(path.join(out,p))) })) };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ kind: manifest.kind, out, inputCount: inputs.length, fileCount: manifest.files.length }));
