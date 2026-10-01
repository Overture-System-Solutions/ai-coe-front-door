const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../..');
const dep = n => require.resolve(n, { paths: [root] });
const config = {
  roots: [path.join(root, 'src')], rootDir: root, testEnvironment: dep('jest-environment-jsdom'),
  transform: { '^.+\\.tsx?$': path.join(root, 'evidence/frontend-audit/source-transform.cjs') },
  testMatch: ['<rootDir>/src/webparts/aiCoeFrontDoor/components/app/App*Marketing*.test.tsx'],
  setupFiles: [path.join(root, 'evidence/frontend-audit/network-disabled.cjs')],
  setupFilesAfterEnv: [path.join(root, 'src/testing/setupTests.ts')]
};
const args = { runInBand: true, cache: false, config: JSON.stringify(config) };
if (process.argv[2]) args.testNamePattern = process.argv[2];
require(dep('@jest/core')).runCLI(args, [root]).then(r => {
  fs.writeFileSync(path.join(__dirname, (process.argv[3] || 'owned-results') + '.json'), JSON.stringify(r.results, null, 2));
  process.exit(r.results.success ? 0 : 1);
}).catch(e => { console.error(e); process.exit(1); });
