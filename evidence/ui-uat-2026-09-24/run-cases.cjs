// Offline source-only Cases checks; full production build/browser verification follows.
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../..');
const dep = name => require.resolve(name, { paths: [root] });
const config = {
  rootDir: root,
  roots: ['<rootDir>/src'],
  testEnvironment: dep('jest-environment-jsdom'),
  transform: { '^.+\\.tsx?$': path.join(root, 'evidence/frontend-audit/source-transform.cjs') },
  moduleNameMapper: { '\\.s?css$': path.join(__dirname, 'style-stub.cjs') },
  testMatch: ['<rootDir>/src/webparts/aiCoeFrontDoor/components/app/AppCoreWorkspace*.test.tsx'],
  setupFiles: [path.join(root, 'evidence/frontend-audit/network-disabled.cjs')],
  setupFilesAfterEnv: [root + '/src/testing/setupTests.ts']
};
const args = { runInBand: true, cache: false, config: JSON.stringify(config) };
if (process.argv[2]) args.testNamePattern = process.argv[2];
require(dep('@jest/core')).runCLI(args, [root]).then(result => {
  fs.writeFileSync(path.join(__dirname, (process.argv[3] || 'cases-results') + '.json'), JSON.stringify(result.results, null, 2));
  process.exit(result.results.success && result.results.numTotalTests > 0 ? 0 : 1);
}).catch(error => { console.error(error); process.exit(1); });
