/* Local test persistence only. No credentials or employee names are stored. */
(function(root){
  'use strict';
  const ROLES=['kitchen','cashier','hall','delivery','receiving'];
  function clean(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    return Object.fromEntries(Object.entries(value).filter(([id,v])=>/^\d+$/.test(id)&&v&&Array.isArray(v.roles)).map(([id,v])=>[id,{roles:[...new Set(v.roles.filter(role=>ROLES.includes(role)))],training:v.training===true}]));
  }
  function key(demo){return 'bk8:planner:skills:v1:'+(demo?'demo':'restaurant-bk8');}
  function save(storage,skills,demo=false){storage.setItem(key(demo),JSON.stringify(clean(skills)));}
  function restore(storage,skills,demo=false){
    try{return {...clean(skills),...clean(JSON.parse(storage.getItem(key(demo))||'{}'))};}catch{return clean(skills);}
  }
  const api={save,restore};if(typeof module==='object'&&module.exports)module.exports=api;else root.BK8PlannerSkills=api;
})(typeof globalThis!=='undefined'?globalThis:this);
