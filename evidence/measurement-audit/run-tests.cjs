const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../..');
const dep = name => require.resolve(name, { paths: [root] });
const config = {
  rootDir: root,
  roots: [path.join(root, 'src')],
  testEnvironment: dep('jest-environment-jsdom'),
  transform: { '^.+\\.tsx?$': path.join(root, 'evidence/frontend-audit/source-transform.cjs') },
  testMatch: [
    '<rootDir>/src/webparts/aiCoeFrontDoor/services/workflowOutcomeAggregation.test.ts',
    '<rootDir>/src/webparts/aiCoeFrontDoor/components/app/AppSections.test.tsx'
  ],
  setupFiles: [path.join(root, 'evidence/frontend-audit/network-disabled.cjs')],
  setupFilesAfterEnv: [path.join(root, 'src/testing/setupTests.ts')]
};
if (process.env.MEASUREMENT_REGRESSION === '1') {
  config.testMatch.push('<rootDir>/src/webparts/aiCoeFrontDoor/components/app/AppShell.test.tsx', '<rootDir>/src/webparts/aiCoeFrontDoor/components/app/AppValue.test.tsx', '<rootDir>/src/webparts/aiCoeFrontDoor/content/workflows/outcome.test.ts', '<rootDir>/src/webparts/aiCoeFrontDoor/services/GovernanceService.test.ts', '<rootDir>/src/webparts/aiCoeFrontDoor/services/programMeasuresService.test.ts');
}
const args = { runInBand: true, cache: false, config: JSON.stringify(config) };
if (process.argv[2]) args.testNamePattern = process.argv[2];
require(dep('@jest/core')).runCLI(args, [root]).then(({ results }) => {
  fs.writeFileSync(path.join(__dirname, (process.argv[3] || 'results') + '.json'), JSON.stringify(results, null, 2));
  process.exit(results.success ? 0 : 1);
}).catch(() => { console.error('Measurement test runner failed.'); process.exit(1); });
