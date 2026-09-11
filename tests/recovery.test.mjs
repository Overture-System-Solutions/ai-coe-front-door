import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';

const root = path.resolve(import.meta.dirname, '..');
function normalized(source) {
  return JSON.parse(JSON.stringify(parse(source, { ecmaVersion: 'latest' }),
    (key, value) => ['start', 'end', 'raw', 'loc'].includes(key) ? undefined : value));
}
function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
test('all recovered editable fragments reassemble the original JavaScript AST', () => {
  assert.ok(fs.existsSync(path.join(root, 'scripts/recover.mjs')), 'Recovery tooling not implemented');
  assert.ok(fs.existsSync(path.join(root, 'scripts/build.mjs')), 'Build tooling not implemented');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'overture-recovery-'));
  try {
    const source = path.join(temp, 'src');
    const output = path.join(temp, 'dist');
    run('scripts/recover.mjs', ['--out', source]);
    run('scripts/build.mjs', ['--src', source, '--out', output]);
    const map = JSON.parse(fs.readFileSync(path.join(source, 'recovery-map.json')));
    const original = fs.readFileSync(path.join(root, 'recovered/package', map.bundle), 'utf8');
    const rebuilt = fs.readFileSync(path.join(output, path.basename(map.bundle)), 'utf8');
    assert.deepEqual(normalized(rebuilt), normalized(original));
    assert.equal(map.applicationStatementCount, 103);
    assert.ok(map.fragments.some(item => item.file.includes('governance-service')));
    assert.ok(map.styles.length > 0);
    for (const fragment of map.fragments) {
      assert.ok(fs.readFileSync(path.join(source, fragment.file), 'utf8').includes('Recovered compiled JavaScript'));
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('editing recovered JavaScript and CSS changes the built bundle without touching originals', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'overture-edit-'));
  try {
    const source = path.join(temp, 'src'), output = path.join(temp, 'dist');
    fs.cpSync(path.join(root, 'src'), source, { recursive: true });
    const file = path.join(source, 'components/usage-dashboard.js');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('Explore an AI idea'));
    fs.writeFileSync(file, text.replace('Explore an AI idea', 'Recovery edit verified'));
    fs.appendFileSync(path.join(source, 'styles/AiCoeFrontDoor.global.css'), '\n/* recovery edit verified */\n');
    run('scripts/build.mjs', ['--src', source, '--out', output]);
    const report = JSON.parse(fs.readFileSync(path.join(output, 'build-report.json')));
    assert.equal(report.equivalentToPackagedBaseline, false);
    const built = fs.readFileSync(path.join(output, report.bundle), 'utf8');
    assert.ok(built.includes('Recovery edit verified'));
    assert.ok(built.includes('/* recovery edit verified */'));
    assert.ok(!fs.readFileSync(path.join(root, 'src/components/usage-dashboard.js'), 'utf8').includes('Recovery edit verified'));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('recovery refuses to overwrite an existing editable tree', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'overture-existing-'));
  try {
    fs.writeFileSync(path.join(temp, 'keep.txt'), 'user edits');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/recover.mjs'), '--out', temp], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to overwrite edits/);
    assert.equal(fs.readFileSync(path.join(temp, 'keep.txt'), 'utf8'), 'user edits');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
