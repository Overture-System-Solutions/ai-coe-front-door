'use strict';
const ts = require('typescript');
module.exports = { process(sourceText, sourcePath) {
  const result = ts.transpileModule(sourceText, { fileName: sourcePath, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  return { code: result.outputText };
} };
