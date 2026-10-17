const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/control/live-data.js','utf8');
const start=source.indexOf('  async function api('),end=source.indexOf('  window.bk8Api = api;');
let status=200,body=[];
const context={window:{APP_CONFIG:{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public'},bk8AccessSession:async()=>({access_token:'session'})},
  AbortSignal,fetch:async()=>({status,ok:status<400,json:async()=>body,text:async()=>JSON.stringify(body)})};
vm.runInNewContext(source.slice(start,end)+'\nwindow.testApi=api;',context);
(async()=>{
  const options={method:'DELETE',requireRows:true,headers:{Prefer:'return=representation'}};
  await assert.rejects(context.window.testApi('admin_tasks?id=eq.1',options),/не сохранено/);
  body=[{id:1}];assert.equal((await context.window.testApi('admin_tasks?id=eq.1',options))[0].id,1);
  status=204;await assert.rejects(context.window.testApi('admin_tasks?id=eq.1',options),/не подтвердила/);
  status=403;body={message:'permission denied'};await assert.rejects(context.window.testApi('admin_tasks?id=eq.1',options),/permission denied/);
  console.log('Admin write verification tests passed');
})().catch(error=>{console.error(error);process.exitCode=1});
