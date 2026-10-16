/* Pure planning model. Minutes belong to the business date, including after midnight. */
(function (root) {
  'use strict';
  const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const ROLES = {kitchen:'Кухня',cashier:'Касса / сборка / выдача',hall:'Зал',delivery:'Доставка',receiving:'Приёмка'};
  const sourceCounts = [
    [0,0,0,16,13,25,36,46,39,84,49,58,51,34,41,41,22,0],
    [0,0,0,14,18,31,40,58,46,69,73,56,68,45,55,35,31,1],
    [0,0,0,11,24,26,36,58,70,61,60,73,64,69,49,46,63,0],
    [0,1,0,18,15,21,46,55,51,64,54,78,65,50,78,31,26,0],
    [0,0,0,22,30,30,38,72,75,79,94,78,90,107,66,90,59,11],
    [0,0,0,15,32,37,62,89,85,76,104,88,62,77,64,63,28,4],
    [0,0,0,19,26,40,56,62,84,105,56,81,85,57,68,51,47,5],
  ];
  function defaults() {
    return {schema:1, reviewed:false,currency:'BYN',spmh:null,timezone:'Europe/Minsk',address:'Минск, проспект Независимости, 179, ТЦ Спектр',
      periods:Object.fromEntries(DAYS.map(d=>[d,{open:480,close:1380,prep:60,cleanup:60}])),
      pt1:[420,960],pt2:[960,1440],weatherPercent:0,weatherEnabled:false,
      weatherRules:{rainThreshold:0.1,rainPercent:0,coldThreshold:0,coldPercent:0,heatThreshold:28,heatPercent:0,windThreshold:10,windPercent:0},
      roles:{kitchen:{enabled:true},cashier:{enabled:true},hall:{enabled:false,start:780,end:1260,count:1},delivery:{enabled:false,start:600,end:1380,count:1},receiving:{enabled:false,start:480,end:1080,count:1,days:['tue','fri']}},
      normMax:140,bands:[[0,2],[21,3],[31,4],[41,6],[51,8],[61,9],[81,10],[91,11],[101,12],[121,14]],
      profiles:Object.fromEntries(DAYS.map((d,i)=>[d,Array.from({length:24},(_,h)=>sourceCounts[i][h-6]||0)])),
      forecasts:Object.fromEntries(DAYS.map(d=>[d,{revenue:null,checks:null,averageCheck:null}])),events:[],skills:{},weather:null,actuals:[]};
  }
  function time(value) {
    const match=String(value).trim().match(/^(\d{1,2})(?::([0-5]\d))?$/);
    if(!match) return NaN;
    const h=Number(match[1]),m=Number(match[2]||0);
    return h<=48 && (h<48||!m)?h*60+m:NaN;
  }
  function clock(minute) {return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
  function availability(employee,day,config) {
    const p=config.periods[day],raw=String(employee.availability?.[day]||'').trim();
    if(employee.regular_days_off?.[day] || /^(выходной\*?|вых|отпуск|б\/л|от)$/i.test(raw)) return {off:true};
    if(!raw) return {error:'Возможности не заполнены'};
    let start,end;
    if(/^(фт|ft|full\s*time)$/i.test(raw)) {start=p.open-p.prep;end=p.close+p.cleanup;}
    else {
      const parts=raw.replace(/[–—−]/g,'-').split(/\s*-\s*/);
      if(parts.length!==2) return {error:`Не распознано: ${raw}`};
      start=time(parts[0]);end=time(parts[1]);
      if(!Number.isFinite(start)||!Number.isFinite(end)) return {error:`Не распознано: ${raw}`};
      if(end<=start) end+=1440;
    }
    start=Math.max(start,p.open-p.prep);end=Math.min(end,p.close+p.cleanup);
    const type=String(employee.work_type||'FT').toUpperCase().replace('ПТ','PT');
    if(type==='PT1'||type==='PT2') {const bounds=config[type.toLowerCase()];start=Math.max(start,bounds[0]);end=Math.min(end,bounds[1]);}
    start=Math.ceil(start/30)*30;end=Math.floor(end/30)*30;
    return end>start?{start,end}:{error:'Нет доступного времени в рабочем периоде'};
  }
  function validateConfig(c) {
    const errors=[];
    if(!c.reviewed)errors.push('Проверьте и подтвердите режим работы и нормативы в настройках');
    if(!(Number(c.spmh)>0)) errors.push('Укажите целевой SPMH');
    if(!String(c.currency||'').trim()) errors.push('Укажите валюту');
    for(const key of ['pt1','pt2']) if(!Array.isArray(c[key])||!c[key].every(Number.isFinite)||c[key][1]<=c[key][0]) errors.push(`Проверьте ${key}`);
    if(!Array.isArray(c.bands)||!c.bands.length||!Array.isArray(c.bands[0])||c.bands[0][0]!==0||c.bands.some((b,i)=>!Array.isArray(b)||b.length!==2||!b.every(Number.isFinite)||b[1]<0||(i&&b[0]<=c.bands[i-1][0]))) errors.push('Проверьте нормативы чеков');
    if(!(c.normMax>=0)||!Number.isFinite(c.normMax))errors.push('Укажите максимальную нагрузку, покрытую нормативами');
    if(!Number.isFinite(Number(c.weatherPercent))) errors.push('Проверьте погодную поправку');
    if(c.weatherEnabled&&(!c.weatherRules||Object.values(c.weatherRules).some(x=>!Number.isFinite(x))))errors.push('Проверьте погодные коэффициенты');
    for(const day of DAYS) {
      const p=c.periods?.[day],f=c.forecasts?.[day],weights=c.profiles?.[day];
      if(!p||![p.open,p.close,p.prep,p.cleanup].every(Number.isFinite)||p.open<0||p.close<=p.open||p.close>2880||p.prep<0||p.cleanup<0||p.open-p.prep<0||p.close+p.cleanup>2880||[p.open,p.close,p.prep,p.cleanup].some(x=>x%30)) errors.push(`${day}: проверьте часы работы (шаг 30 минут)`);
      if(!f||f.revenue===null||!Number.isFinite(Number(f.revenue))||Number(f.revenue)<0) errors.push(`${day}: укажите выручку`);
      if(f && f.checks!==null && f.checks!=='' ? !Number.isFinite(Number(f.checks))||Number(f.checks)<0 : !(Number(f?.averageCheck)>0)) errors.push(`${day}: укажите чеки или средний чек`);
      if(!Array.isArray(weights)||weights.length!==24||weights.some(w=>!Number.isFinite(w)||w<0)||!weights.some(w=>w>0)) errors.push(`${day}: проверьте почасовой шаблон`);
    }
    for(const e of c.events||[]) if(!DAYS.includes(e.day)||!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.end<=e.start||![e.percent,e.laborPercent].every(Number.isFinite)) errors.push('Проверьте даты, часы и проценты событий');
    for(const [role,v] of Object.entries(c.roles||{})) if(!ROLES[role]||(!['kitchen','cashier'].includes(role)&&v.enabled&&(![v.start,v.end,v.count].every(Number.isFinite)||v.end<=v.start||v.count<0))) errors.push(`Проверьте позицию ${role}`);
    return errors;
  }
  function demand(c) {
    const errors=validateConfig(c);if(errors.length) return {errors,slots:[]};
    const slots=[];
    for(const day of DAYS) {
      const p=c.periods[day],f=c.forecasts[day],checks=f.checks!==null&&f.checks!==''?Number(f.checks):Number(f.revenue)/Number(f.averageCheck);
      const source=f.checks!==null&&f.checks!==''?'Прогноз чеков':'Выручка / средний чек';
      let weightTotal=0;for(let t=p.open;t<p.close;t+=30) weightTotal+=c.profiles[day][Math.floor(t/60)%24];
      if(!weightTotal) {errors.push(`${day}: нет весов в часы работы`);continue;}
      for(let t=p.open-p.prep;t<p.close+p.cleanup;t+=30) {
        const trading=t>=p.open&&t<p.close,weight=trading?c.profiles[day][Math.floor(t/60)%24]/weightTotal:0;
        const events=c.events.filter(e=>e.day===day&&t>=e.start&&t<e.end);
        const weather=weatherEffect(c,day,t);
        const percent=Number(c.weatherPercent)+weather.percent+events.filter(e=>!e.included).reduce((s,e)=>s+e.percent,0);
        const labor=1+events.reduce((s,e)=>s+e.laborPercent,0)/100;
        if(percent< -100||labor<0){errors.push(`${day} ${clock(t)}: итоговая поправка ниже -100%`);continue;}
        const revenue=Number(f.revenue)*weight*(1+percent/100),volume=checks*weight*(1+percent/100);
        const rate=volume*2,band=[...c.bands].reverse().find(b=>rate>=b[0]);
        if(trading&&rate>c.normMax){errors.push(`${day} ${clock(t)}: ${rate.toFixed(1)} чеков/час выше настроенных нормативов (${c.normMax}). Дополните нормативы.`);continue;}
        const need={};
        for(const [role,opts] of Object.entries(c.roles)) if(opts.enabled) {
          if(['kitchen','cashier'].includes(role)) need[role]=trading?Math.ceil(Math.round(band[1]*0.5)*labor):1;
          else need[role]=t>=opts.start&&t<opts.end&&(!opts.days||opts.days.includes(day))?Math.ceil(opts.count*labor):0;
        }
        slots.push({day,start:t,end:t+30,baseRevenue:Number(f.revenue)*weight,revenue,checks:volume,source,percent,weather,need});
      }
    }
    return {errors,slots};
  }
  function weatherEffect(c,day,t) {
    if(!c.weatherEnabled)return {percent:0,status:'Отключена'};
    if(!c.weekStart||!c.weather||Date.now()-Date.parse(c.weather.fetchedAt)>12*3600000||!Number.isFinite(Date.parse(c.weather.fetchedAt)))return {percent:0,status:'Нет актуального снимка'};
    const date=new Date(`${c.weekStart}T00:00:00Z`);date.setUTCMinutes(DAYS.indexOf(day)*1440+t);
    const key=date.toISOString().slice(0,13)+':00';
    const w=c.weather.hours.find(x=>x.time===key),r=c.weatherRules;
    if(!w||w.temperature===null||w.wind===null||w.precipitation===null)return {percent:0,status:'Нет почасового прогноза'};
    return {percent:(w.precipitation>=r.rainThreshold?r.rainPercent:0)+(w.temperature<r.coldThreshold?r.coldPercent:0)+(w.temperature>=r.heatThreshold?r.heatPercent:0)+(w.wind>=r.windThreshold?r.windPercent:0),status:'По настроенным коэффициентам',observation:w};
  }
  function historyProposal(c) {
    const profiles=JSON.parse(JSON.stringify(c.profiles)),complete=[];
    for(const day of DAYS){
      const p=c.periods[day],hours=[...new Set(Array.from({length:(p.close-p.open)/30},(_,i)=>Math.floor((p.open+i*30)/60)%24))];
      const dates=[...new Set(c.actuals.filter(r=>(new Date(`${r.date}T12:00:00Z`).getUTCDay()+6)%7===DAYS.indexOf(day)).map(r=>r.date))];
      const valid=dates.filter(date=>hours.every(h=>c.actuals.some(r=>r.date===date&&r.hour===h)));
      if(valid.length){const values=Array.from({length:24},(_,h)=>c.actuals.filter(r=>valid.includes(r.date)&&r.hour===h).reduce((s,r)=>s+r.checks,0)/valid.length);if(values.some(v=>v>0)){profiles[day]=values;complete.push({day,days:valid.length});}}
    }
    return {profiles,complete};
  }
  function evaluate(c,employees,shifts,slots=demand(c).slots) {
    const errors=[],warnings=[],coverage=[];let hours=0;
    if(c.weatherEnabled&&slots.some(s=>s.weather?.status!=='По настроенным коэффициентам'))warnings.push('Для части часов нет актуальной погоды; применена только ручная поправка');
    const seen=new Set(),byId=new Map(employees.map(e=>[String(e.employee_profile_id),e]));
    for(const s of shifts) {
      const key=`${s.employeeId}/${s.day}`,e=byId.get(String(s.employeeId)),a=e&&DAYS.includes(s.day)?availability(e,s.day,c):null;
      if(seen.has(key)) errors.push(`${key}: несколько смен за день`);seen.add(key);
      if(!a||a.error||a.off||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start%30||s.end%30||s.start<a.start||s.end>a.end||s.end<=s.start) errors.push(`${key}: смена вне доступности`);
      const skill=c.skills[String(s.employeeId)];
      if(!skill?.roles?.length) errors.push(`${key}: не заданы навыки`);
      for(let t=s.start;t<s.end;t+=30) if(!skill?.roles?.includes(s.positions?.[t])||!c.roles[s.positions?.[t]]?.enabled) {errors.push(`${key} ${clock(t)}: недопустимая позиция`);break;}
      if(skill?.training) warnings.push(`${key}: сотрудник на обучении`);
      if(Number.isFinite(s.start)&&Number.isFinite(s.end)) hours+=(s.end-s.start)/60;
    }
    // Business dates may overlap after midnight.
    for(let i=0;i<shifts.length;i++) for(let j=i+1;j<shifts.length;j++) {
      const a=shifts[i],b=shifts[j];if(String(a.employeeId)!==String(b.employeeId))continue;
      const as=DAYS.indexOf(a.day)*1440+a.start,ae=DAYS.indexOf(a.day)*1440+a.end,bs=DAYS.indexOf(b.day)*1440+b.start,be=DAYS.indexOf(b.day)*1440+b.end;
      if(as<be&&bs<ae) errors.push(`${a.employeeId}: пересекающиеся смены`);
    }
    for(const slot of slots) for(const [role,needed] of Object.entries(slot.need)) {
      const assigned=shifts.filter(s=>s.day===slot.day&&s.start<=slot.start&&s.end>slot.start&&s.positions?.[slot.start]===role).length;
      coverage.push({day:slot.day,start:slot.start,role,needed,assigned,missing:Math.max(0,needed-assigned),excess:Math.max(0,assigned-needed)});
    }
    const revenue=slots.reduce((s,x)=>s+x.revenue,0),checks=slots.reduce((s,x)=>s+x.checks,0),spmh=hours?revenue/hours:null;
    if(coverage.some(x=>x.missing))warnings.push('Есть непокрытая потребность');
    if(spmh!==null&&spmh<c.spmh)warnings.push('SPMH ниже целевого');
    return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],coverage,hours,revenue,checks,spmh,gsph:hours?checks/hours:null,extraHours:Math.max(0,hours-revenue/c.spmh)};
  }
  function generate(c,employees,existing=[]) {
    const result=demand(c);if(result.errors.length)return {...result,shifts:[]};
    const shifts=existing.filter(s=>s.locked).map(s=>JSON.parse(JSON.stringify(s))),issues=[];
    const stable=[...employees].sort((a,b)=>(c.skills[a.employee_profile_id]?.roles?.length||99)-(c.skills[b.employee_profile_id]?.roles?.length||99)||Number(a.employee_profile_id)-Number(b.employee_profile_id));
    for(const day of DAYS) {
      for(const e of stable) {
        if(shifts.some(s=>s.day===day&&String(s.employeeId)===String(e.employee_profile_id)))continue;
        const a=availability(e,day,c),skill=c.skills[String(e.employee_profile_id)];
        if(a.error){issues.push(`${e.employee_name} ${day}: ${a.error}`);continue;}
        if(a.off)continue;
        if(!skill?.roles?.length){issues.push(`${e.employee_name}: не заданы навыки`);continue;}
        const positions={},relevant=result.slots.filter(s=>s.day===day&&s.start>=a.start&&s.end<=a.end);
        let previous=null;
        for(const slot of relevant) {
          const ranked=skill.roles.map(role=>({role,gap:(slot.need[role]||0)-shifts.filter(s=>s.day===day&&s.start<=slot.start&&s.end>slot.start&&s.positions?.[slot.start]===role).length})).filter(x=>x.gap>0).sort((x,y)=>y.gap-x.gap||Number(y.role===previous)-Number(x.role===previous)||x.role.localeCompare(y.role));
          if(ranked.length){positions[slot.start]=ranked[0].role;previous=ranked[0].role;}
        }
        const times=Object.keys(positions).map(Number).sort((a,b)=>a-b);if(!times.length)continue;
        const start=times[0],end=times[times.length-1]+30;
        for(let t=start;t<end;t+=30)if(!positions[t])positions[t]=positions[t-30]||positions[start];
        const shift={employeeId:e.employee_profile_id,day,start,end,positions,locked:false,comment:''};
        const overlaps=shifts.some(s=>String(s.employeeId)===String(shift.employeeId)&&DAYS.indexOf(s.day)*1440+s.start<DAYS.indexOf(day)*1440+end&&DAYS.indexOf(day)*1440+start<DAYS.indexOf(s.day)*1440+s.end);
        if(!overlaps)shifts.push(shift);else issues.push(`${e.employee_name}: пересечение с соседним днём`);
      }
    }
    return {...result,shifts,issues,report:evaluate(c,employees,shifts,result.slots)};
  }
  root.BK8Planner={DAYS,ROLES,defaults,time,clock,availability,validateConfig,demand,evaluate,generate,weatherEffect,historyProposal};
  if(typeof module!=='undefined')module.exports=root.BK8Planner;
})(typeof globalThis!=='undefined'?globalThis:this);
