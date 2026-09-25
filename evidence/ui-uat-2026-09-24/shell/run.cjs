const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../../..');
const dep = name => require.resolve(name, { paths: [root] });
const config = {
  rootDir: root,
  roots: [path.join(root, 'src')],
  moduleNameMapper: { '\\.s?css$': path.join(root, 'evidence/ui-uat-2026-09-24/style-stub.cjs') },
  testEnvironment: dep('jest-environment-jsdom'),
  transform: { '^.+\\.tsx?$': path.join(root, 'evidence/frontend-audit/source-transform.cjs') },
  testMatch: [
    '<rootDir>/src/webparts/aiCoeFrontDoor/components/app/AppShell*.test.tsx',
    '<rootDir>/src/webparts/aiCoeFrontDoor/components/app/AppSections.test.tsx',
    '<rootDir>/src/webparts/aiCoeFrontDoor/content/appSections.test.ts'
  ],
  setupFiles: [path.join(root, 'evidence/frontend-audit/network-disabled.cjs')],
  setupFilesAfterEnv: [path.join(root, 'src/testing/setupTests.ts')]
};
if (process.argv[4] === 'regression') config.testMatch = [
  '<rootDir>/src/webparts/aiCoeFrontDoor/components/app/*.test.tsx',
  '<rootDir>/src/webparts/aiCoeFrontDoor/content/appSections.test.ts',
  '<rootDir>/src/webparts/aiCoeFrontDoor/services/authorization.test.ts',
  '<rootDir>/src/webparts/aiCoeFrontDoor/services/gatedServices.test.ts'
];
const args = { runInBand: true, cache: false, config: JSON.stringify(config) };
if (process.argv[2]) args.testNamePattern = process.argv[2];
require(dep('@jest/core')).runCLI(args, [root]).then(result => {
  fs.writeFileSync(path.join(__dirname, `${process.argv[3] || 'results'}.json`), JSON.stringify(result.results, null, 2));
  process.exit(result.results.success ? 0 : 1);
}).catch(error => { console.error(error); process.exit(1); });
