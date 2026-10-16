import fs from "node:fs";import assert from "node:assert/strict";import ts from "typescript";
async function load(file){const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));}
const {canAccessTab,standardTabs,canReadEntity,canWriteEntity,tabLabel}=await load("lib/access.ts");
assert.equal(tabLabel('Cadastro de Procedimentos'),'Cadastro de Produtos');
const existingProductUser={login:'catalog-qa',role:'standard',tabs:['Cadastro de Procedimentos']};
assert.equal(canAccessTab(existingProductUser,'Cadastro de Procedimentos'),true);
assert.equal(canReadEntity(existingProductUser,'procedures'),true);
assert.equal(canWriteEntity(existingProductUser,'procedures'),true);
assert.equal(standardTabs.length,8);for(const tab of standardTabs)assert.equal(canAccessTab("standard",tab),true);
for(const tab of ["Metas","Dashboard","Receitas","Pagamento Profissional","Relatório Profissional","Lançamento de Procedimentos","Recibos de Pagamento"]){assert.equal(canAccessTab("standard",tab),false);assert.equal(canAccessTab("admin",tab),true);}
for(const entity of ["revenues","monthly_goals","receipts","professional_receipts"])assert.equal(canReadEntity("standard",entity),false);
process.env.AVVI_SESSION_SECRET="test-secret-is-only-for-isolated-tests-0000";
const {verifyCredentials,signAccess,readAccess,sameOrigin,accessCookie}=await load("lib/accessServer.ts");
const user=verifyCredentials(" AVVICLINICA ","avviclinica2026");assert.deepEqual(user,{login:"avviclinica",role:"standard"});
assert.equal(verifyCredentials("avviclinica","wrong"),null);assert.equal(verifyCredentials("random@example.test","avviclinica2026"),null);
const token=signAccess(user,1000);const request=()=>new Request("http://app.test/api/access",{headers:{cookie:accessCookie+"="+token}});
assert.deepEqual(readAccess(request(),2000),user);assert.equal(readAccess(request(),50000000),null);
const changed=token.replace(/.$/,token.endsWith("a")?"b":"a");assert.equal(readAccess(new Request("http://app.test",{headers:{cookie:accessCookie+"="+changed}}),2000),null);
assert.equal(readAccess(new Request("http://app.test",{headers:{cookie:"avvi.session=active; role=admin"}}),2000),null);
const [payload,signature]=token.split(".");const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,"base64url").toString()),role:"admin"})).toString("base64url")+"."+signature;
assert.equal(readAccess(new Request("http://app.test",{headers:{cookie:accessCookie+"="+forged}}),2000),null);
assert.equal(sameOrigin(new Request("http://app.test",{headers:{origin:"http://evil.test"}})),false);
console.log("PASS: Exact eight allowed tabs, forbidden financial sections and goals, explicit credentials only, signed roles, expiry, tampering and origin validation. No real accounts or cloud records modified.");
