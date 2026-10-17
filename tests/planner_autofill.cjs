const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('docs/control/planner-ui.js','utf8');
const action=source.slice(source.indexOf('  async function action(name)'),source.indexOf('  async function previewActuals'));
function setup(){
  let resolve;const requests=[],jobs=[];
  const owner={preview:false,week:'2026-10-19',sourceHash:'old',employees:[{employee_profile_id:1,availability:{mon:'ФТ'}}],config:{},shifts:[{employeeId:1,day:'mon',locked:true}],invalidInputs:{}};
  const context={state:owner,job:0,worker:null,generationProblems:()=>[],P:{validateConfig:()=>[]},setStatus:()=>{},rpc:(name,args)=>{requests.push({name,args});return new Promise(done=>resolve=done);},Worker:class{terminate(){}postMessage(message){jobs.push(message);}},JSON,Object,Error};
  vm.runInNewContext(action+';globalThis.run=action;',context);
  return {context,owner,requests,jobs,resolve:value=>resolve(value)};
}
(async()=>{
  let test=setup(),pending=test.context.run('generate');
  assert.equal(test.requests[0].name,'planner_get_week');
  const latest=[{employee_profile_id:1,availability:{mon:'Выходной'}}];
  test.resolve({employees:latest,sourceHash:'fresh'});await pending;
  assert.equal(test.jobs.length,1);
  assert.equal(test.jobs[0].employees[0].availability.mon,'Выходной','worker uses the latest Telegram availability');
  assert.equal(test.jobs[0].shifts[0].locked,true,'manual locks are preserved');
  assert.equal(test.owner.sourceHash,'fresh');
  test=setup();pending=test.context.run('generate');test.context.state={week:'2026-10-26'};test.context.job++;
  test.resolve({employees:latest,sourceHash:'fresh'});await pending;
  assert.equal(test.jobs.length,0,'late availability response cannot generate for the wrong week');
  assert.equal(test.owner.sourceHash,'old');
  test=setup();test.owner.readOnly=true;await test.context.run('publish');
  assert.equal(test.requests.length,0,'read-only real-data test cannot save or publish');
  console.log('Planner live availability generation tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
