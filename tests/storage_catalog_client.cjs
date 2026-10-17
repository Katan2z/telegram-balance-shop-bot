const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const context = {document:{getElementById:()=>null,querySelector:()=>null}, window:{STORAGE_ITEMS:[]}, Date, Number};
vm.runInNewContext(fs.readFileSync('docs/storage-calculator.js','utf8'), context);
const modes = vm.runInNewContext(`storageModesForItem({name:'Рожок',productionLabel:'ТД = 5 дней; Д = 24 часа',productionVariants:[{label:'5 дней в пэне',hours:120},{label:'24 часа в диспенсере',hours:24}]})`, context);
assert.deepEqual(Array.from(modes, x=>x.hours),[120,24]);
const opened = vm.runInNewContext(`storageModesForItem({name:'Сироп',prepLabel:'ТД = 14 дей',openedHours:336,productionVariants:[]})`,context);
assert.equal(opened[0].hours,336);
console.log('Storage calculator separate conditions passed');
