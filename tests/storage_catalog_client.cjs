const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const context = {document:{getElementById:()=>null,querySelector:()=>null}, window:{STORAGE_ITEMS:[]}, Date, Number};
vm.runInNewContext(fs.readFileSync('docs/storage-calculator.js','utf8'), context);
const modes = vm.runInNewContext(`storageModesForItem({name:'Рожок',productionLabel:'ТД = 5 дней; Д = 24 часа',productionVariants:[{label:'5 дней в пэне',hours:120},{label:'24 часа в диспенсере',hours:24}]})`, context);
assert.deepEqual(Array.from(modes, x=>x.hours),[120,24]);
const opened = vm.runInNewContext(`storageModesForItem({name:'Сироп',prepLabel:'ТД = 14 дей',openedHours:336,productionVariants:[]})`,context);
assert.equal(opened[0].hours,336);
console.log('Storage calculator separate conditions passed');

(async () => {
  const items = [{name:'old'}];
  let poll, updates = 0;
  const client = {
    window:{STORAGE_ITEMS:items,APP_CONFIG:{SUPABASE_URL:'https://test',SUPABASE_ANON_KEY:'public'},bk8PollSection:(id,interval,fn)=>{poll=fn;}},
    document:{dispatchEvent:()=>updates++},CustomEvent:class{},AbortSignal,Date,console:{warn(){}},
    fetch:async()=>({ok:true,status:200,json:async()=>[{revision:'v1',catalog:{items:[{name:'new'}]},source:'sheet.xlsx',updated_at:'2026-10-18T00:00:00Z'}]}),
  };
  vm.runInNewContext(fs.readFileSync('docs/storage-catalog-client.js','utf8'),client);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.window.STORAGE_ITEMS,items,'live update preserves calculator array reference');
  assert.equal(items[0].name,'new');
  assert.equal(client.window.STORAGE_CATALOG_BLOCKED,false);
  assert.ok(updates>0);
  client.fetch=async()=>{throw new Error('offline');};
  await poll();
  assert.equal(client.window.STORAGE_CATALOG_BLOCKED,true,'network failure cannot look like current data');
  console.log('Storage catalog load and failure-state tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
