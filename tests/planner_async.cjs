const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/control/planner-ui.js','utf8');
const action=source.slice(source.indexOf('  async function action(name)'),source.indexOf('  async function previewActuals'));
function setup(){
  const calls=[];let finish;
  const state={preview:false,stale:false,week:'2026-10-19',version:0,sourceHash:'hash',config:{spmh:100},shifts:[],invalidInputs:{},dirty:true};
  const context={state,job:0,worker:null,report:()=>({d:{errors:[]},r:{errors:[],warnings:[]}}),confirm:()=>true,setStatus:()=>{},
    rpc:async(name,args)=>{calls.push({name,args});if(name==='planner_save_week')return new Promise(resolve=>{finish=resolve;});return {};},JSON,Object,Error};
  vm.runInNewContext(action+';globalThis.testAction=action;',context);
  return {context,calls,complete:()=>finish(1),original:state};
}
(async()=>{
  let t=setup(),promise=t.context.testAction('publish');
  t.context.state={...t.original,week:'2026-10-26'};t.context.job++;
  t.complete();await promise;
  assert.equal(t.calls.length,1,'switching week must not publish another week');
  assert.equal(t.context.state.version,0,'old response must not replace new week version');
  t=setup();promise=t.context.testAction('publish');t.original.config.spmh=200;t.complete();
  await assert.rejects(promise,/новые правки/);assert.equal(t.calls.length,1);assert.equal(t.original.dirty,true);
  assert.equal(t.calls[0].args.p_document.config.spmh,100,'save request uses immutable snapshot');
  t=setup();promise=t.context.testAction('publish');t.complete();await promise;
  assert.equal(t.calls.length,2);assert.equal(t.calls[1].args.p_week,'2026-10-19');assert.equal(t.calls[1].args.p_version,1);
  console.log('Planner async ownership tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
