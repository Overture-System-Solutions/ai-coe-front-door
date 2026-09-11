// New assembler: preserves the original AMD/SPFx scope and declaration order.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { format } from 'prettier';
const root = path.resolve(import.meta.dirname, '..');
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? path.join(root, fallback) : path.resolve(process.argv[index + 1]);
}
const sourceDir = option('--src', 'src'), output = option('--out', 'dist');
const map = JSON.parse(await fs.readFile(path.join(sourceDir, 'recovery-map.json'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
async function readSource(file) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error('Unsafe source path');
  return fs.readFile(path.join(sourceDir, file), 'utf8');
}
function replaceOnce(source, marker, value) {
  if (source.split(marker).length !== 2) throw new Error('Missing or duplicate recovery marker: ' + marker);
  return source.replace(marker, () => value);
}
let source = await readSource(map.template);
for (const fragment of map.fragments) source = replaceOnce(source, fragment.marker, await readSource(fragment.file));
for (const style of map.styles) source = replaceOnce(source, style.marker, JSON.stringify(await readSource(style.file)));
if (source.includes('/* @recovery:') || source.includes('__RECOVERED_CSS_')) throw new Error('Unresolved source marker');
const built = await format(source, { parser: 'babel' });
function normalized(text) {
  return JSON.stringify(parse(text, { ecmaVersion: 'latest' }),
    (key, value) => ['start', 'end', 'raw', 'loc'].includes(key) ? undefined : value);
}
const original = await fs.readFile(path.join(root, 'recovered/package', map.bundle), 'utf8');
if (sha(original) !== map.originalBundleSha256) throw new Error('Preserved original bundle changed');
const equivalent = normalized(built) === normalized(original);
await fs.mkdir(output, { recursive: true });
const assetsDir = path.join(root, 'recovered/package/ClientSideAssets');
for (const file of await fs.readdir(assetsDir))
  if (!file.endsWith('.js')) await fs.copyFile(path.join(assetsDir, file), path.join(output, file));
await fs.writeFile(path.join(output, path.basename(map.bundle)), built);
const report = {
  status: 'LOCAL_AMD_BUILD_PASS', packageVersion: map.packageVersion,
  bundle: path.basename(map.bundle), sha256: sha(built),
  equivalentToPackagedBaseline: equivalent,
  evidence: 'AST equality ignores formatting/comments and literal spellings, not executable structure',
  deployment: 'Not packaged, imported, or tenant-tested; dist is not an .sppkg',
};
await fs.writeFile(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
