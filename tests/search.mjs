import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('lib/search.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {matchesSearch}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
// Names from independent kinds of searchable fields; no special casing one service.
const examples=[
 ['Preenchimento labial com ácido hialurônico','labial'],
 ['Preenchimento de olheiras','olheiras'],
 ['Toxina botulínica facial','BOTULINICA'],
 ['Avaliação estética corporal','corporal'],
 ['Combo Preenchimento Glúteo c/ Belarine 50 mL','Belarine'],
 ['Pacote de depilação a laser','laser'],
 ['Booster 1,5 mm','1,5'],
 ['Maria Clara de Souza','Souza']
];
for(const [name,query]of examples){
 assert.equal(matchesSearch(name,query),true,`${query} must match anywhere in ${name}`);
 assert.equal(matchesSearch(name,'  '+query+'  '),true,'Ignore surrounding spaces');
 assert.equal(matchesSearch(name,''),true,'Opening an empty search lists all options');
 assert.equal(matchesSearch(name,'termo-inexistente-qa'),false);
}
assert.equal(matchesSearch('Preenchimento labial com ácido hialurônico','LABIAL acido'),true);
assert.equal(matchesSearch('Preenchimento de olheiras','olheiras   preenchimento'),true);
assert.equal(matchesSearch('Preenchimento labial','labial laser'),false,'Every entered keyword must match');
assert.equal(matchesSearch('Avaliação estética','   '),true);
assert.equal(matchesSearch('Pacote corporal','labial'),false);
console.log('PASS: all searchable option types match beginning/middle/end keywords, accents, case, extra spaces and multiple keywords in any order; unrelated results stay excluded.');
