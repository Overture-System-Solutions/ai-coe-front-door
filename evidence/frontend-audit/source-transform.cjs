const path = require('path');
const ts = require(require.resolve('typescript', {paths: [path.resolve(__dirname, '../..')]}));
module.exports = {process(src, filename) {
  const result = ts.transpileModule(src, {fileName:filename, reportDiagnostics:true, compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true,inlineSourceMap:true,inlineSources:true}});
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  return {code: result.outputText};
}};
