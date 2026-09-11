// New recovery tooling, not original application source. Never executes the bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { format } from 'prettier';

const root = path.resolve(import.meta.dirname, '..');
const expectedPackage = '97e5e1e3ff5e6c68188ae9d395ac5763dd8e8342a2b514416e51581d714f6500';
const sha = data => createHash('sha256').update(data).digest('hex');
const outIndex = process.argv.indexOf('--out');
const output = outIndex < 0 ? path.join(root, 'src') : path.resolve(process.argv[outIndex + 1]);
const inventory = JSON.parse(await fs.readFile(path.join(root, 'recovered/inventory.json'), 'utf8'));
if (sha(await fs.readFile(path.join(root, 'original', inventory.package_name))) !== expectedPackage)
  throw new Error('S181 package checksum mismatch; do not apply version-specific source boundaries');
const bundleEntry = inventory.files.find(file => file.path.endsWith('.js'));
const source = await fs.readFile(path.join(root, 'recovered/package', bundleEntry.path), 'utf8');
if (sha(source) !== bundleEntry.sha256) throw new Error('Extracted bundle checksum mismatch');
const ast = parse(source, { ecmaVersion: 'latest', locations: true });
const blocks = [], cssNodes = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'BlockStatement') blocks.push(node);
  if (node.type === 'Literal' && typeof node.value === 'string' &&
      node.value.startsWith('#overture-ai-coe-pilot .sr-only')) cssNodes.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast);
const app = blocks.sort((a, b) => b.body.length - a.body.length)[0];
if (app.body.length !== 103 || cssNodes.length !== 1) throw new Error('Unexpected bundle structure');
// Names describe inferred responsibilities; they are NOT recovered original filenames.
const groups = [
  [0, 9, 'runtime/transpiler-helpers.js'],
  [9, 14, 'runtime/imports-and-style-loader.js'],
  [14, 17, 'vendor/lucide-icons.js'],
  [17, 20, 'workflows/definitions-and-theme.js'],
  [20, 27, 'workflows/form-engine.js'],
  [27, 33, 'services/draft-storage-and-adapters.js'],
  [33, 41, 'services/idea-summary.js'],
  [41, 47, 'services/tool-policy-evaluator.js'],
  [47, 52, 'services/team-usage-summary.js'],
  [52, 57, 'services/feedback-summary.js'],
  [57, 69, 'components/shared-controls.js'],
  [69, 72, 'components/usage-dashboard.js'],
  [72, 75, 'components/governance-dashboard.js'],
  [75, 76, 'components/landing-page.js'],
  [76, 79, 'components/generic-workflow.js'],
  [79, 84, 'components/idea-workflow.js'],
  [84, 89, 'components/tool-check-workflow.js'],
  [89, 93, 'components/team-usage-workflow.js'],
  [93, 97, 'components/feedback-workflow.js'],
  [97, 99, 'components/front-door-root.js'],
  [99, 101, 'services/governance-service.js'],
  [101, 102, 'services/usage-metrics-service.js'],
  [102, 103, 'webpart/AiCoeFrontDoorWebPart.js'],
];
try { await fs.access(output); throw new Error('Recovery destination exists; refusing to overwrite edits'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.mkdir(output, { recursive: true });
const fragments = [], styles = [], replacements = [];
for (const [first, after, file] of groups) {
  const nodes = app.body.slice(first, after);
  const start = nodes[0].start, end = nodes.at(-1).end;
  const symbols = nodes.flatMap(node => node.type === 'VariableDeclaration'
    ? node.declarations.map(d => d.id.name).filter(Boolean)
    : node.type === 'FunctionDeclaration' ? [node.id.name] : []);
  const header = '// Recovered compiled JavaScript from S181; not original TypeScript.\n' +
    '// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.\n' +
    '// Descriptive filename assigned during recovery; original symbols preserved.\n';
  const content = await format(header + source.slice(start, end), { parser: 'babel' });
  const marker = `/* @recovery:${file} */`;
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.writeFile(path.join(output, file), content);
  fragments.push({ file, marker, symbols, originalStart: start, originalEnd: end,
    statementRange: [first, after], baselineSha256: sha(content) });
  replacements.push({ start, end, value: marker });
}
for (const [index, node] of cssNodes.entries()) {
  const file = 'styles/AiCoeFrontDoor.global.css';
  const marker = `__RECOVERED_CSS_${index}__`;
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.writeFile(path.join(output, file), node.value);
  styles.push({ file, marker, originalStart: node.start, originalEnd: node.end, baselineSha256: sha(node.value) });
  replacements.push({ start: node.start, end: node.end, value: marker });
}
let template = source;
for (const item of replacements.sort((a, b) => b.start - a.start))
  template = template.slice(0, item.start) + item.value + template.slice(item.end);
template = await format(template, { parser: 'babel' });
const templateFile = 'runtime/bundle.template.js';
await fs.writeFile(path.join(output, templateFile), template);
const map = {
  sourceId: 'S181', packageSha256: expectedPackage, packageVersion: inventory.version,
  bundle: bundleEntry.path, originalBundleSha256: bundleEntry.sha256,
  offsets: 'UTF-16 code units in the packaged JavaScript; ends are exclusive',
  originalSourcesRecovered: false, applicationStatementCount: app.body.length,
  originalSourceMapFiles: inventory.source_map_files,
  dependencies: ast.body[0].expression.arguments[1].elements.map(node => node.value),
  template: templateFile, fragments, styles,
};
await fs.writeFile(path.join(output, 'recovery-map.json'), JSON.stringify(map, null, 2) + '\n');
console.log(JSON.stringify({ status: 'RECOVERED_COMPILED_JAVASCRIPT', fragments: fragments.length,
  styles: styles.length, output }));
