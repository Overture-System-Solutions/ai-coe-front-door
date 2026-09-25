'use strict';
// Standalone no-emit check. No Heft/shared output or generated typings.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const ts=require(path.join(root,'node_modules/typescript'));
const inputs=['src/webparts/aiCoeFrontDoor/services/core/nativeCoreWorkService.ts','src/webparts/aiCoeFrontDoor/services/serverDraftStore.ts'];
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,strict:true,skipLibCheck:true,noEmit:true,esModuleInterop:true,resolveJsonModule:true,types:['node'],typeRoots:[path.join(root,'node_modules/@types')]};
const hashes=Object.fromEntries(inputs.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
const program=ts.createProgram(inputs.map(p=>path.join(root,p)),options);
const diagnostics=ts.getPreEmitDiagnostics(program);
const result={scope:'Strict no-emit native CORE client and server draft store; dependency graph included, not full host/build acceptance',compiler:ts.version,rootFiles:inputs,sourceHashes:hashes,diagnostics:diagnostics.map(d=>({code:d.code,file:d.file?path.relative(root,d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))};
fs.writeFileSync(path.join(__dirname,'focused-typecheck.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(diagnostics.length)process.exitCode=1;
