const fs = require('fs');
const ts = require('C:/Users/Vaibhav.Vichare/AppData/Local/Programs/Antigravity IDE/resources/app/extensions/node_modules/typescript/lib/typescript.js');

const program = ts.createProgram(['bundle.js'], {
  target: ts.ScriptTarget.ES2022,
  allowJs: true,
  checkJs: true,
  noEmit: true
});

const syntacticDiagnostics = program.getSyntacticDiagnostics();
console.log(`Found ${syntacticDiagnostics.length} syntactic diagnostics.`);

syntacticDiagnostics.forEach(diag => {
  if (diag.file) {
    const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
    console.log(`[Line ${line + 1}:${character + 1}] TS${diag.code}: ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
  } else {
    console.log(`TS${diag.code}: ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
  }
});
