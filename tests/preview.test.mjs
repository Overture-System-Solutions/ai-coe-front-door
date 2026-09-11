import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
const root = path.resolve(import.meta.dirname, '..');

async function boot() {
  assert.ok(fs.existsSync(path.join(root, 'preview/host.js')), 'Offline preview host not implemented');
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  console.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
    url: 'http://127.0.0.1:4173/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const map = JSON.parse(fs.readFileSync(path.join(root, 'src/recovery-map.json')));
  for (const file of ['node_modules/react/umd/react.development.js',
      'node_modules/react-dom/umd/react-dom.development.js', 'preview/host.js',
      'dist/' + path.basename(map.bundle)])
    dom.window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  await dom.window.RecoveryPreview.mount();
  await new Promise(resolve => setTimeout(resolve, 50));
  return { dom, errors, preview: dom.window.RecoveryPreview };
}
test('actual recovered React UI mounts and opens the idea workflow offline', async () => {
  const { dom, errors, preview } = await boot();
  try {
    const text = dom.window.document.body.textContent;
    assert.match(text, /Explore an AI idea/);
    assert.match(text, /Check a tool or task/);
    const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent.includes('Explore an AI idea'));
    assert.ok(button, 'Idea entry button');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(dom.window.document.querySelector('input, textarea'), 'Idea workflow displays an input');
    assert.equal(preview.mode, 'OFFLINE_SIMULATION');
    assert.deepEqual(errors, []);
    await assert.rejects(dom.window.fetch('https://api.openai.com/v1/responses'), /blocked/);
  } finally { dom.window.close(); }
});
test('real recovered submission service preserves all five workflow routes in simulated transport', async () => {
  const { dom, errors, preview } = await boot();
  try {
    const service = preview.webpart.governanceService;
    for (const [workflow, count] of [['idea', 2], ['toolCheck-review-request', 2],
        ['teamUsage', 2], ['helpTraining', 1], ['feedback', 1]]) {
      const start = preview.requests.length;
      const result = await service.submitWorkflow(workflow, {
        originalAnswers: { workToImprove: 'Fictional demo task', humanReview: 'yes' },
        requestedBy: { name: 'Local Preview', email: 'preview@example.invalid' },
      });
      assert.equal(result.connected, true, result.message);
      const posts = preview.requests.slice(start).filter(item => item.method === 'POST');
      assert.equal(posts.length, count, workflow);
      assert.equal(posts[0].list, 'AI CoE Pilot Intakes');
      if (count === 2) {
        assert.equal(posts[1].list, 'AI CoE Use Cases');
        assert.equal(posts[0].body.IntakeId, posts[1].body.CoEID);
        assert.equal(posts[1].body.Status, 'Submitted');
        assert.equal(posts[1].body.ApprovalRequested, false);
      }
    }
    const dashboard = await service.getAdminDashboardData();
    assert.equal(dashboard.intakes.length, 5);
    assert.equal(dashboard.useCases.length, 3);
    assert.equal(dashboard.decisions.length, 0);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
