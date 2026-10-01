const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    }
  },
  {
    // The content document is a site file anyone with edit rights can change: nothing under the web
    // part may write raw HTML into the page. The React plugin comes from the SPFx react profile.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'react/no-danger': 'error'
    }
  }
];
