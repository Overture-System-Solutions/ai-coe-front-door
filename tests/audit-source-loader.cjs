'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.env.AUDIT_SOURCE_ROOT || path.resolve(__dirname, '..');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    if (!filename.startsWith(path.join(root, 'src') + path.sep)) throw new Error('Only project source is transpiled.');
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }
    });
    module._compile(compiled.outputText, filename);
  };
}
module.exports = relative => require(path.join(root, 'src/webparts/aiCoeFrontDoor', relative));
