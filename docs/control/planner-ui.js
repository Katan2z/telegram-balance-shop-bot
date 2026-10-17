(function () {
  'use strict';
  const P=window.BK8Planner,labels=['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=null,worker=null,job=0;
  const number=v=>v===''?null:Number(v);
  const rpc=(name,payload)=>window.bk8Api(`rpc/${name}`,{method:'POST',body:JSON.stringify(payload)});
  function monday() {const now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Minsk'}));now.setDate(now.getDate()-(now.getDay()+6)%7+7);return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
  function field(path,value,type='number',extra='') {return `<input data-config="${path}" type="${type}" value="${escape(value)}" ${extra}>`;}
  function selectRoles(roles=[]) {return Object.entries(P.ROLES).map(([id,name])=>`<option value="${id}" ${roles.includes(id)?'selected':''}>${name}</option>`).join('');}
  function setStatus(message,error=false) {for(const id of ['plannerStatus','plannerGenerateFeedback']){const root=document.querySelector('#'+id);if(root){root.textContent=message;root.classList.toggle('error',error);}}}
  function generationProblems(){
    const c=state.config,problems=[];
    if(state.keeperPreview)problems.push('Файл ещё не применён. В блоке отчёта нажмите «Использовать для расписания».');
    const revenue=P.DAYS.filter(day=>c.forecasts[day]?.revenue===null||c.forecasts[day]?.revenue===''||!Number.isFinite(Number(c.forecasts[day]?.revenue))||Number(c.forecasts[day].revenue)<0);
    if(revenue.length)problems.push('Заполните прогноз выручки: '+revenue.map(day=>labels[P.DAYS.indexOf(day)]).join(', ')+'.');
    const checks=P.DAYS.filter(day=>{const f=c.forecasts[day];return f?.checks===null||f?.checks===''||f?.checks===undefined?!(Number(f?.averageCheck)>0):!Number.isFinite(Number(f.checks))||Number(f.checks)<0;});
    if(checks.length)problems.push('Не хватает чеков или среднего чека: '+checks.map(day=>labels[P.DAYS.indexOf(day)]).join(', ')+'. Примените отчёт Кипера либо введите их в дополнительных данных.');
    if(!state.employees.length)problems.push('Сотрудники не загружены. Нажмите «Обновить из бота».');
    if(!c.reviewed)problems.push('Один раз подтвердите часы работы в настройках ресторана.');
    if(!(Number(c.spmh)>0))problems.push('В настройках ресторана укажите цель по выручке на человеко-час.');
    const missing=state.employees.filter(e=>!c.skills[e.employee_profile_id]?.roles?.length);
    if(missing.length)problems.push('Выберите навыки кнопками «Универсал», «Кухня» или «Касса»: '+missing.map(e=>e.employee_name).join(', ')+'.');
    return problems;
  }
  function dayDate(index,options={day:'2-digit',month:'2-digit'}) {
    const date=new Date(`${state.week}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+index);
    return date.toLocaleDateString('ru-RU',{...options,timeZone:'UTC'});
  }
  function dayTotals(day,slots) {
    const shifts=state.shifts.filter(s=>s.day===day),hours=shifts.reduce((sum,s)=>sum+(s.end-s.start)/60,0);
    const daily=slots.filter(s=>s.day===day),revenue=daily.length?daily.reduce((sum,s)=>sum+s.revenue,0):null,checks=daily.length?daily.reduce((sum,s)=>sum+s.checks,0):null;
    return {hours,revenue,checks,spmh:hours&&revenue!==null?revenue/hours:null,gsph:hours&&checks!==null?checks/hours:null};
  }
  function rosterMarkup(available=state.view==='availability') {
    const {slots}=P.demand(state.config);
    return `<div class="planner-sheet-heading"><div><h2>${available?'Временные возможности':'Расписание'} · ${dayDate(0)}–${dayDate(6,{day:'2-digit',month:'2-digit',year:'numeric'})}</h2><p>${available?'Данные сотрудников из Telegram. Здесь они не редактируются.':'Нажмите на смену или пустую ячейку, чтобы изменить её. Прочерк — смена ещё не назначена.'}</p></div><span>${state.employees.length} сотрудников</span></div><div class="planner-scroll planner-roster-scroll"><table class="planner-roster"><thead><tr><th>№</th><th>Сотрудник</th>${P.DAYS.map((day,i)=>`<th scope="col">${labels[i]}<small>${dayDate(i)}</small></th>`).join('')}<th>${available?'Тип':'Часы'}</th>${available?'':'<th class="planner-signature">Ознакомлен<br>подпись</th>'}</tr></thead><tbody>${state.employees.map((employee,index)=>{
      const own=state.shifts.filter(s=>String(s.employeeId)===String(employee.employee_profile_id));
      return `<tr data-employee-row="${employee.employee_profile_id}"><td>${index+1}</td><th scope="row">${escape(employee.employee_name)}<small>${escape(employee.work_type||'Тип не указан')}</small></th>${P.DAYS.map(day=>{
        const shift=own.find(s=>s.day===day),a=P.availability(employee,day,state.config),raw=employee.availability?.[day]||'Не заполнено';
        if(available)return `<td class="${a.off?'roster-off':a.error?'roster-unknown':''}">${escape(a.off?'Выходной':raw)}${employee.regular_days_off?.[day]?'<small>Постоянный</small>':''}</td>`;
        const roles=shift?[...new Set(Object.values(shift.positions||{}))]:[];
        return `<td class="${shift?'roster-assigned':'roster-empty'}"><button class="planner-cell" data-edit-cell="${employee.employee_profile_id}/${day}" aria-label="${escape(employee.employee_name)}, ${labels[P.DAYS.indexOf(day)]}: ${shift?P.clock(shift.start)+'–'+P.clock(shift.end):'назначить смену'}"><strong>${shift?P.clock(shift.start)+'–'+P.clock(shift.end):'—'}</strong>${shift?`<small>${roles.map(r=>escape(P.ROLES[r]||'Укажите позицию')).join(' / ')}${shift.locked?' · закреплена':''}</small>`:`<small>${a.off?'Может: выходной':a.error?'Возможности не заполнены':'Может: '+escape(raw)}</small>`}</button></td>`;
      }).join('')}<td>${available?escape(employee.work_type||'—'):own.reduce((sum,s)=>sum+(s.end-s.start)/60,0).toFixed(1)}</td>${available?'':'<td class="planner-signature"></td>'}</tr>`;
    }).join('')}</tbody>${available?'':`<tfoot>${[['Часы','hours'],['SPMH','spmh'],['GSPH','gsph']].map(([title,key])=>`<tr><th colspan="2">${title}</th>${P.DAYS.map(day=>{const n=dayTotals(day,slots)[key];return `<td>${n===null?'—':n.toFixed(1)}</td>`;}).join('')}<td colspan="2"></td></tr>`).join('')}</tfoot>`}</table></div>${!state.employees.length?'<p>На эту неделю нет действующих сотрудников. Обновите возможности.</p>':''}`;
  }
  function coverageMarkup() {
    const {d,r}=report(),day=state.day||'mon',slots=d.slots.filter(s=>s.day===day);
    if(d.errors.length)return `<h2>Сначала заполните данные недели</h2><p>Без них нельзя понять, сколько людей нужно по часам. Существующие смены не удалены.</p><ul>${d.errors.map(e=>`<li>${escape(readableIssue(e))}</li>`).join('')}</ul><button data-view="inputs">Перейти к данным недели</button><button data-view="settings">Проверить настройки ресторана</button>`;
    const roles=Object.entries(P.ROLES).filter(([key])=>state.config.roles[key]?.enabled);
    return `<div class="planner-day-picker">${P.DAYS.map((key,i)=>`<button data-day="${key}" aria-pressed="${key===day}">${labels[i]} ${dayDate(i)}</button>`).join('')}</div><h2>Расстановка · ${labels[P.DAYS.indexOf(day)]}</h2><p>В ячейке: назначено / нужно. Красным показана нехватка, а не весь день целиком.</p><div class="planner-scroll"><table class="planner-coverage"><thead><tr><th>Позиция / время</th>${slots.map(s=>`<th>${P.clock(s.start)}</th>`).join('')}</tr></thead><tbody>${roles.map(([key,title])=>`<tr><th>${title}</th>${slots.map(s=>{const x=r.coverage.find(v=>v.day===day&&v.start===s.start&&v.role===key);return `<td class="${x?.missing?'planner-shortage':''}">${x?`${x.assigned} / ${x.needed}`:'—'}</td>`;}).join('')}</tr>`).join('')}<tr><th>Чеки</th>${slots.map(s=>`<td>${s.checks.toFixed(1)}</td>`).join('')}</tr><tr><th>Выручка ${escape(state.config.currency)}</th>${slots.map(s=>`<td>${s.revenue.toFixed(0)}</td>`).join('')}</tr></tbody></table></div><h3>Сотрудники в этот день</h3><div class="planner-day-list">${state.employees.map(e=>{const s=state.shifts.find(x=>String(x.employeeId)===String(e.employee_profile_id)&&x.day===day);return `<button data-edit-cell="${e.employee_profile_id}/${day}"><span>${escape(e.employee_name)}</span><strong>${s?P.clock(s.start)+'–'+P.clock(s.end):'Не назначено'}</strong></button>`;}).join('')}</div>`;
  }
  function openShiftEditor(key) {
    const owner=state,[id,day]=key.split('/'),employee=state.employees.find(e=>String(e.employee_profile_id)===id);
    if(!employee)return;
    const existing=state.shifts.find(s=>String(s.employeeId)===id&&s.day===day),a=P.availability(employee,day,state.config);
    const skill=state.config.skills[id],allowed=(skill?.roles||[]).filter(r=>state.config.roles[r]?.enabled),originalRoles=[...new Set(Object.values(existing?.positions||{}))];
    const dialog=document.createElement('dialog');dialog.className='planner-shift-dialog';
    dialog.innerHTML=`<form method="dialog"><div class="planner-dialog-head"><div><h2>${escape(employee.employee_name)}</h2><p>${labels[P.DAYS.indexOf(day)]}, ${dayDate(P.DAYS.indexOf(day))}</p></div><button value="cancel" aria-label="Закрыть">×</button></div><p class="planner-availability-note">Может работать: ${escape(a.off?'Выходной':a.error||`${P.clock(a.start)}–${P.clock(a.end)}`)}</p><div class="planner-dialog-times"><label>Начало<input id="shiftStart" value="${existing?P.clock(existing.start):''}" placeholder="09:00" required></label><label>Конец<input id="shiftEnd" value="${existing?P.clock(existing.end):''}" placeholder="18:00" required></label></div><label>Позиция<select id="shiftRole" required>${existing&&originalRoles.length>1?'<option value="keep">Сохранить расстановку по позициям</option>':''}<option value="">Выберите позицию</option>${allowed.map(r=>`<option value="${r}" ${originalRoles.length===1&&originalRoles[0]===r?'selected':''}>${escape(P.ROLES[r])}</option>`).join('')}</select></label>${allowed.length?'':'<p class="error">Сначала укажите навыки сотрудника в настройках.</p>'}<label>Комментарий<input id="shiftComment" value="${escape(existing?.comment||'')}"></label><label class="planner-pin"><input id="shiftLocked" type="checkbox" checked>Сохранить смену при следующем расчёте</label><p id="shiftError" class="error" role="alert"></p><div class="planner-dialog-actions"><button type="button" id="clearShift">Убрать смену</button><button value="cancel" formnovalidate>Отмена</button><button type="submit" id="applyShift" class="planner-primary">Применить</button></div></form>`;
    dialog.querySelector('.planner-dialog-head button').formNoValidate=true;
    document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#clearShift').onclick=()=>{if(state!==owner){dialog.close();return;}state.shifts=state.shifts.filter(s=>`${s.employeeId}/${s.day}`!==key);markDirty();dialog.close();render();};
    dialog.querySelector('form').onsubmit=event=>{
      if(event.submitter?.id!=='applyShift')return;
      event.preventDefault();
      const error=dialog.querySelector('#shiftError');
      if(state!==owner){dialog.close();return;}
      const start=P.time(dialog.querySelector('#shiftStart').value);let end=P.time(dialog.querySelector('#shiftEnd').value);
      if(end<=start)end+=1440;
      if(!Number.isFinite(start)||!Number.isFinite(end)||start%30||end%30||end<=start){error.textContent='Укажите начало и конец с шагом 30 минут, например 09:00 и 18:00.';return;}
      if(end-start>P.MAX_SHIFT_MINUTES){error.textContent='Максимум 12 часов на смену. Выберите более короткий промежуток.';return;}
      if(a.off||a.error||start<a.start||end>a.end){error.textContent='Смена выходит за временные возможности сотрудника.';return;}
      const role=dialog.querySelector('#shiftRole').value;
      if(role!=='keep'&&!allowed.includes(role)){error.textContent='Выберите разрешённую позицию.';return;}
      if(role==='keep'&&(start!==existing.start||end!==existing.end)){error.textContent='При изменении времени выберите позицию для новой смены.';return;}
      const shift={employeeId:Number(id),day,start,end,positions:role==='keep'?{...existing.positions}:Object.fromEntries(Array.from({length:(end-start)/30},(_,i)=>[start+i*30,role])),comment:dialog.querySelector('#shiftComment').value,locked:dialog.querySelector('#shiftLocked').checked};
      const next=state.shifts.filter(s=>`${s.employeeId}/${s.day}`!==key).concat(shift),oldErrors=new Set(P.evaluate(state.config,state.employees,state.shifts,[]).errors),newErrors=P.evaluate(state.config,state.employees,next,[]).errors.filter(e=>!oldErrors.has(e));
      if(newErrors.length){error.textContent=newErrors.join('; ');return;}
      state.shifts=next;markDirty();dialog.close();render();
    };
    dialog.showModal();
  }
  function readableIssue(message) {
    let text=String(message);
    text=text.replace(/\b(\d+)\/(mon|tue|wed|thu|fri|sat|sun)\b/g,(_,id,day)=>`${state.employees.find(e=>String(e.employee_profile_id)===id)?.employee_name||'Сотрудник '+id}, ${labels[P.DAYS.indexOf(day)]}`);
    text=text.replace(/\b(mon|tue|wed|thu|fri|sat|sun)\b/g,day=>labels[P.DAYS.indexOf(day)]);
    return text;
  }
  function staffCardMarkup(employee){
    const id=employee.employee_profile_id,skill=state.config.skills[id]||{roles:[],training:false};
    const enabled=Object.keys(P.ROLES).filter(role=>state.config.roles[role]?.enabled),chosen=[...(skill.roles||[])].sort();
    const initials=employee.employee_name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('');
    const selected=roles=>chosen.length===roles.length&&roles.every(role=>chosen.includes(role));
    return `<article class="planner-staff-card"><div class="planner-staff-person"><span class="planner-staff-avatar">${escape(initials)}</span><div><h3>${escape(employee.employee_name)}</h3><span>${escape(({FT:'ФТ · любое время',PT1:'ПТ1 · первая смена',PT2:'ПТ2 · вторая смена'})[employee.work_type]||'Тип работы не указан')}</span></div></div><div class="planner-role-badges">${chosen.length?chosen.map(role=>`<span>${escape(P.ROLES[role]||role)}</span>`).join(''):'<span class="planner-role-empty">Укажите навыки</span>'}</div><div class="planner-skill-presets">${[['universal','Универсал',enabled],['kitchen','Кухня',['kitchen']],['cashier','Касса',['cashier']]].map(([preset,label,roles])=>`<button data-skill-preset="${id}/${preset}" aria-pressed="${selected(roles)}" title="${preset==='universal'?'Все включённые позиции ресторана':'Только '+label}">${label}</button>`).join('')}</div><label class="planner-training"><input type="checkbox" data-training="${id}" ${skill.training?'checked':''}>Ещё обучается</label><details data-section="skill-detail-${id}"><summary>Выбрать позиции отдельно</summary><div class="planner-skill-options">${Object.entries(P.ROLES).map(([role,label])=>`<label><input type="checkbox" data-skill-toggle="${id}" value="${role}" ${chosen.includes(role)?'checked':''}>${escape(label)}</label>`).join('')}</div></details></article>`;
  }
  function applySkillPreset(id,preset){
    if(!['universal','kitchen','cashier'].includes(preset))throw Error('Неизвестный набор навыков');
    const skill=state.config.skills[id]||={roles:[],training:false};
    skill.roles=preset==='universal'?Object.keys(P.ROLES).filter(role=>state.config.roles[role]?.enabled):[preset];
  }
  function persistTestSkills(){
    if(!state.preview&&!state.readOnly)return;
    try{window.BK8PlannerSkills.save(localStorage,state.config.skills,state.preview);}
    catch{setStatus('Не удалось запомнить навыки на этом устройстве. Не закрывайте страницу, пока не сохраните результат другим способом.',true);}
  }
  function simpleMarkup(){
    const c=state.config,unknown=state.employees.filter(e=>P.DAYS.some(day=>P.availability(e,day,c).error)),withoutSkills=state.employees.filter(e=>!c.skills[e.employee_profile_id]?.roles?.length);
    return `${state.preview?'<div class="planner-demo-warning"><strong>ЭТО ОБРАЗЕЦ. Здесь нет данных ваших сотрудников.</strong><p>Настоящие временные доступны после входа в панель.</p><a href="index.html?planner_readonly=1#schedule">Открыть расписание с настоящими сотрудниками</a></div>':''}
      <section class="planner-simple-section"><h2>1. Кто и когда может работать</h2><p>${state.preview?'Вымышленный пример':`Возможности из Telegram на ${dayDate(0)}–${dayDate(6)}`}. Программа не поставит смену за пределами этих часов.</p><button data-action="refresh">Обновить из бота</button>${unknown.length?`<p class="error">Есть незаполненные дни: ${unknown.map(e=>escape(e.employee_name)).join(', ')}. На эти дни программа не назначит смены наугад.</p>`:''}${rosterMarkup(true)}<details data-section="staffSkills" ${withoutSkills.length?'open':''}><summary>Кто что умеет · быстрый выбор</summary><p>Кнопка заменяет набор навыков. «Универсал» — все включённые позиции ресторана. Выбор делает администратор, автоматически универсалом никто не становится.</p><div class="planner-staff-grid">${state.employees.map(staffCardMarkup).join('')}</div></details></section>
      <section class="planner-simple-section"><h2>2. Загрузите чеки и укажите будущую выручку</h2><label class="planner-upload">Файл из Кипера<input id="plannerKeeper" type="file" accept=".xls,.html,.htm"></label>${c.keeperImport?'<p>Отчёт применён. Почасовой поток берём из Кипера; будущая выручка — из таблицы ниже.</p>':'<p>После загрузки покажем отчёт. Проверьте его и нажмите «Использовать для расписания».</p>'}<div id="keeperPreview">${state.keeperPreview?keeperPreviewMarkup():''}</div><div class="planner-scroll"><table class="planner-forecast"><thead><tr><th>Новая неделя</th>${labels.map((label,i)=>`<th>${label}<small>${dayDate(i)}</small></th>`).join('')}</tr></thead><tbody><tr><th>Выручка, ${escape(c.currency)}</th>${P.DAYS.map((day,i)=>`<td>${field(`forecasts.${day}.revenue`,c.forecasts[day].revenue,'number',`min="0" step="any" aria-label="Прогноз выручки, ${labels[i]}"`)}</td>`).join('')}</tr></tbody></table></div><p>Только ожидаемая выручка на каждый день. Чеки по часам и средний чек после применения отчёта программа берёт сама.</p><details><summary>Нужны акции, погода или ручной ввод чеков?</summary><button data-view="inputs">Дополнительные данные</button></details></section>
      ${!c.reviewed||!c.spmh||withoutSkills.length?`<section class="planner-simple-section"><h2>Нужно настроить один раз</h2><p>${!c.reviewed?'Подтвердите часы работы ресторана. ':''}${!c.spmh?'Укажите цель по выручке на человеко-час. ':''}${withoutSkills.length?'Укажите, кто умеет работать на кухне, кассе и других позициях. Без этого нельзя безопасно распределить людей.':''}</p><button data-view="settings">Настроить ресторан и навыки</button></section>`:''}
      <div class="planner-auto"><button data-action="generate" class="planner-primary">Составить расписание автоматически</button><div id="plannerGenerateFeedback" role="status" aria-live="polite"></div><p>Самостоятельно подберём людей и часы. Ваши закреплённые смены сохраним. Если людей не хватит, покажем где — не назначим сотрудника против его возможностей.</p></div>${state.shifts.length?'<button data-view="shifts">Посмотреть готовые смены</button>':''}`;
  }
  function inputsMarkup() {
    const c=state.config;
    return `<h2>Данные для выбранной недели</h2><p>Введите прогноз аналитиков. Возможности сотрудников уже берём из Telegram — переносить их вручную не нужно.</p>
      <aside class="planner-help"><strong>1. Загрузите отчёт из r_keeper</strong><p>Выберите такую же выгрузку XLS за полную прошлую неделю: даты по столбцам, часы по строкам, «Чеков» и «Оплачено». Файл читается на вашем устройстве. Сначала покажем данные; без подтверждения ничего не меняется.</p><input id="plannerKeeper" type="file" accept=".xls,.html,.htm" aria-label="Выгрузка r_keeper"><p>Продажи прошлой недели не считаются прогнозом автоматически. Ниже вы отдельно указываете будущую выручку.</p>${c.keeperImport?`<p>Применён отчёт ${escape(c.keeperImport.sourceDates[0])}–${escape(c.keeperImport.sourceDates[6])}. ${c.keeperImport.profiles?'Почасовое распределение обновлено. ':''}${c.keeperImport.averageChecks?'Средний чек взят из отчёта.':''}</p>`:''}</aside><div id="keeperPreview">${state.keeperPreview?keeperPreviewMarkup():''}</div><h3>2. Укажите прогноз выручки на новую неделю</h3>
      <div class="planner-scroll"><table class="planner-forecast"><thead><tr><th>Что заполняем</th>${labels.map((label,i)=>`<th>${label}<small>${dayDate(i)}</small></th>`).join('')}</tr></thead><tbody>${[['Прогноз выручки, '+escape(c.currency),'revenue','Сколько ожидаем продать за день'],['Ожидаемые чеки','checks','Количество покупок за день, не сумма'],['Средний чек, '+escape(c.currency),'averageCheck','Заполните, только если не указаны чеки']].map(([label,key,hint])=>`<tr><th>${label}<small>${hint}</small></th>${P.DAYS.map(day=>`<td>${field(`forecasts.${day}.${key}`,c.forecasts[day][key],'number',`min="0" step="any" aria-label="${label}, ${labels[P.DAYS.indexOf(day)]}"`)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="planner-example">Пример: выручка 10 000 BYN и средний чек 20 BYN → 500 чеков. Если количество чеков введено, средний чек в расчёте не используется.</p>
      <div class="planner-target"><label>Цель по выручке на час работы (SPMH) ${field('spmh',c.spmh,'number','min="0" step="any" placeholder="Например, 150"')}</label><p>Например, 10 000 BYN ÷ 100 человеко-часов = 100 SPMH. Если для обслуживания нужно больше людей, покажем отклонение от цели.</p></div>
      <div id="plannerForecastSummary" aria-live="polite"></div><details data-section="events"><summary>Акции и новинки ${c.events.length?'('+c.events.length+')':'— если есть'}</summary><p>Укажите, когда акция увеличит поток гостей и насколько. Если аналитики уже включили рост в прогноз, поставьте галочку — второй раз его не прибавляем.</p>
      ${c.events.map((e,i)=>`<div class="planner-event"><label>День<select data-event="${i}" data-key="day">${P.DAYS.map((day,j)=>`<option value="${day}" ${e.day===day?'selected':''}>${labels[j]} ${dayDate(j)}</option>`).join('')}</select></label><label>Название<input data-event="${i}" data-key="title" value="${escape(e.title)}" placeholder="Например, запуск новинки"></label><label>С<input data-event="${i}" data-key="start" value="${P.clock(e.start)}"></label><label>До<input data-event="${i}" data-key="end" value="${P.clock(e.end)}"></label><label>Изменение спроса, %<input type="number" data-event="${i}" data-key="percent" value="${e.percent}" step="any"></label><label>Дополнительная нагрузка, %<input type="number" data-event="${i}" data-key="laborPercent" value="${e.laborPercent}" step="any"></label><label><input type="checkbox" data-event="${i}" data-key="included" ${e.included?'checked':''}>Рост спроса уже учтён в прогнозе аналитиков</label><button data-delete-event="${i}">Убрать акцию</button></div>`).join('')}<p>Спрос +10% означает больше ожидаемых продаж и чеков. Нагрузка +10% означает, что обслуживание требует больше труда; она учитывается отдельно.</p><button data-action="addEvent">Добавить акцию или новинку</button></details>
      <details data-section="weather"><summary>Погода — необязательная поправка</summary><p>Можно посмотреть прогноз погоды, не меняя расчёт. Пока вы не настроили влияние погоды, коэффициенты равны 0%.</p><button data-action="weather">Посмотреть / обновить погоду</button><label>Моя поправка к спросу, % ${field('weatherPercent',c.weatherPercent,'number','step="any"')}</label><p>Например, −5 уменьшит прогноз на 5%. Если погода уже учтена аналитиками, оставьте 0 и отключите автоматическую поправку.</p>${weatherMarkup()}<details data-section="weatherRules"><summary>Настроить автоматическое влияние погоды</summary><label><input type="checkbox" data-config="weatherEnabled" ${c.weatherEnabled?'checked':''}>Применять мои коэффициенты к прогнозу</label><div class="planner-fields">${Object.entries({rainThreshold:'Дождь от, мм',rainPercent:'Изменение спроса при дожде, %',coldThreshold:'Холоднее, °C',coldPercent:'Изменение спроса в холод, %',heatThreshold:'Жарче, °C',heatPercent:'Изменение спроса в жару, %',windThreshold:'Ветер от, м/с',windPercent:'Изменение спроса при ветре, %'}).map(([key,title])=>`<label>${title}${field(`weatherRules.${key}`,c.weatherRules[key],'number','step="any"')}</label>`).join('')}</div><p>Нет свежего прогноза — нет автоматической поправки на эти часы. Источник: MET Norway.</p></details></details>
      <details data-section="history"><summary>Дополнительно: анализ прошлых продаж</summary><p>Это не импорт из r_keeper. Здесь поддерживается только подготовленный CSV с колонками date,hour,revenue,checks. Сначала показываем содержимое, затем запрашиваем подтверждение. Прогноз текущей недели не заменяется.</p><input type="file" id="plannerActuals" accept=".csv,text/csv"><div id="actualPreview"></div><p>В черновике ${c.actuals.length} строк фактических продаж.</p><button data-action="history">Предложить распределение чеков по часам</button><p>Предложение можно применить только вручную. Для погодной оценки нужны минимум 7 полных дней с условием и 7 без него; это связь в данных, а не доказанная причина.</p><button data-action="weatherHistory">Проверить влияние погоды по истории</button><div id="weatherSuggestions"></div></details>
      <div class="planner-next"><button data-view="availability">Посмотреть возможности сотрудников</button><button data-view="settings">Проверить настройки ресторана</button><button data-action="generate" class="planner-primary">Данные готовы — составить расписание</button></div>`;
  }
  function keeperPreviewMarkup(){
    const options=state.keeperPreview.options||{profiles:true,averageChecks:true,acknowledgeMissing:false};
    const report=state.keeperPreview.report,missing=window.BK8Keeper.missingTradingHours(report,state.config);
    const headers=report.daily.map((day,i)=>`<th>${labels[i]}<small>${escape(day.date)}</small></th>`).join('');
    const totals=[['Чеков','checks'],['Выручка отчёта','revenue'],['Средний чек','averageCheck']].map(([label,key])=>`<tr><th>${label}</th>${report.daily.map(day=>`<td>${day[key]===null?'—':key==='checks'?day[key]:day[key].toFixed(2)}</td>`).join('')}</tr>`).join('');
    const hours=report.hours.map(hour=>`<tr><th>${P.clock(hour*60)}</th>${report.dates.map(date=>{const row=report.actuals.find(item=>item.date===date&&item.hour===hour);return `<td>${row?row.checks:'Нет данных'}</td>`;}).join('')}</tr>`).join('');
    return `<div class="planner-import-card">
      <div class="planner-import-heading"><div><span class="planner-import-badge">Файл прочитан</span><h3>${escape(state.keeperPreview.name)}</h3><p>Факт: ${escape(report.dates[0])}–${escape(report.dates[6])}. Итоги по часам совпадают.</p></div></div>
      <details class="planner-import-totals"><summary>Посмотреть суммы по дням</summary><div class="planner-scroll"><table><thead><tr><th>Факт</th>${headers}</tr></thead><tbody>${totals}</tbody></table></div></details>
      <details><summary>Посмотреть чеки по часам</summary><div class="planner-scroll"><table><thead><tr><th>Час</th>${labels.map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${hours}</tbody></table></div></details>
      <h3>Что использовать для новой недели</h3><div class="planner-import-options">
      <label class="planner-check-option"><input id="keeperProfiles" type="checkbox" ${options.profiles?'checked':''}><span><strong>Нагрузка по часам</strong><small>Когда нужно больше людей: берём распределение чеков для ПН–ВС.</small></span></label>
      <label class="planner-check-option"><input id="keeperAverage" type="checkbox" ${options.averageChecks?'checked':''}><span><strong>Средний чек</strong><small>Будущие чеки рассчитаем из вашей выручки. Старые ручные значения чеков будут заменены.</small></span></label></div>
      <p>Прогноз будущей выручки не меняется. Валюта файла должна совпадать с ${escape(state.config.currency)}.</p>
      ${missing.length?`<div class="planner-import-warning"><strong>В отчёте есть незаполненные рабочие часы</strong><p>Проверьте часы открытия ресторана или подтвердите, что продаж в это время не было.</p><details><summary>Какие именно часы?</summary><p>${missing.map(item=>labels[P.DAYS.indexOf(item.day)]+' '+P.clock(item.hour*60)).join(', ')}</p></details><label class="planner-check-option"><input id="keeperMissing" type="checkbox" ${options.acknowledgeMissing?'checked':''}><span><strong>В эти часы продаж не было</strong><small>Разрешаю использовать 0 для распределения нагрузки. Без подтверждения пропуски не считаются нулями.</small></span></label></div>`:''}
      <p id="keeperError" class="error" role="alert"></p><div class="planner-import-actions"><button id="keeperCancel">Отмена</button><button id="keeperApply" class="planner-primary">Использовать для расписания</button></div>
      <p class="planner-import-note">Новая неделя: ${escape(state.week)}. Загрузка файла сама не публикует расписание.</p></div>`;
  }
  function reviewMarkup() {
    const d=P.demand(state.config),r=P.evaluate(state.config,state.employees,state.shifts,d.slots),errors=[...new Set([...d.errors,...r.errors,...(!state.shifts.length?['Расписание пока пустое: назначьте смены или запустите составление.']:[]),...(state.stale?['Возможности сотрудников изменились. Обновите данные и пересчитайте расписание.']:[])])];
    const missing=r.coverage.filter(x=>x.missing),shortage=missing.reduce((sum,x)=>sum+x.missing/2,0);
    return `<h2>Проверить перед публикацией</h2><p>Неделя ${dayDate(0)}–${dayDate(6)}. Пока вы не нажали «Опубликовать сотрудникам», этот черновик не заменяет действующее расписание.</p><div class="planner-review-list"><p><strong>${state.shifts.length} смен</strong> назначено · ${r.hours.toFixed(1)} человеко-часов</p><p><strong>${errors.length?'Нужно исправить '+errors.length+' пунктов':'Ошибок в исходных данных и назначенных сменах не найдено'}</strong></p>${errors.length?`<ul>${errors.map(e=>`<li>${escape(readableIssue(e))}</li>`).join('')}</ul>`:''}<p>Нехватка персонала: <strong>${shortage.toFixed(1)} человеко-часов</strong>. ${missing.length?'Посмотрите конкретные дни и позиции на шаге «Проверка».':'По рассчитанной потребности все позиции покрыты.'}</p><p>Выручка на человеко-час (SPMH): <strong>${d.errors.length||r.spmh===null?'Не рассчитана':r.spmh.toFixed(1)}</strong>, цель ${state.config.spmh??'не задана'}.</p>${r.warnings.length?`<ul>${r.warnings.map(e=>`<li>${escape(readableIssue(e))}</li>`).join('')}</ul>`:''}</div><div class="planner-next"><button data-view="coverage">Проверить нехватку по часам</button><button data-action="save">Сохранить только черновик</button><button data-action="export">Скачать Excel для проверки</button><button data-action="publish" class="planner-primary" ${errors.length?'disabled':''}>Опубликовать сотрудникам</button></div><p>Публикация выполняется после отдельного подтверждения. В тестовом варианте запись в ресторан отключена.</p>`;
  }
  function report() {
    const d=P.demand(state.config),r=P.evaluate(state.config,state.employees,state.shifts,d.slots);
    const root=document.querySelector('#plannerReport');if(!root)return;
    const issues=[...new Set([...d.errors,...r.errors,...r.warnings,...(state.stale?['Возможности изменились: пересчитайте черновик']:[])])];
    root.innerHTML=`${d.warnings?.length?'<div class="planner-norm-notice"><strong>Расчёт продолжен с предупреждением</strong><p>На пике поток выше проверенных нормативов. Использован последний известный норматив — потребность в людях приблизительная. Подробности ниже.</p></div>':''}<div class="planner-metrics"><span>Назначено часов <strong>${r.hours.toFixed(1)}</strong></span><span>Выручка / час (SPMH) <strong>${d.errors.length||r.spmh===null?'—':r.spmh.toFixed(1)}</strong></span><span>Чеки / час (GSPH) <strong>${d.errors.length||r.gsph===null?'—':r.gsph.toFixed(1)}</strong></span><span>Не хватает людей <strong>${d.errors.length?'не рассчитано':(r.coverage.reduce((s,x)=>s+x.missing,0)/2).toFixed(1)+' чел.-ч.'}</strong></span></div>${issues.length?`<details><summary>Что нужно проверить (${issues.length})</summary>${issues.map(e=>`<small>${escape(readableIssue(e))}</small>`).join('')}</details>`:''}`;
    const forecast=document.querySelector('#plannerForecastSummary');
    if(forecast)forecast.innerHTML=d.errors.length?'<p>Итоговый прогноз появится после заполнения обязательных данных и проверки настроек ресторана.</p>':`<h3>Что пойдёт в расчёт</h3><div class="planner-scroll"><table><thead><tr><th>Прогноз</th>${labels.map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${[['Выручка до поправок','baseRevenue'],['Выручка с акциями и погодой','revenue'],['Ожидаемые чеки с поправками','checks']].map(([title,key])=>`<tr><th>${title}</th>${P.DAYS.map(day=>`<td>${d.slots.filter(slot=>slot.day===day).reduce((sum,slot)=>sum+slot[key],0).toFixed(0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return {d,r};
  }
  function render() {
    const root=state.root,c=state.config;
    state.openSections||={};
    root.querySelectorAll('details[data-section]').forEach(element=>state.openSections[element.dataset.section]=element.open);
    root.innerHTML=`<div class="planner-header"><div><h1>Расписание</h1><p>${escape(c.address)}${state.preview?' · ОБРАЗЕЦ, не настоящие сотрудники':state.readOnly?' · Реальные возможности, тест без сохранения':''}</p></div><label>Неделя с <input type="date" id="plannerWeek" value="${state.week}"></label></div>
      <nav class="planner-tabs planner-steps">${[['simple','Составить'],['shifts','Готовое расписание'],['review','Скачать и опубликовать']].map(([id,label])=>`<button data-view="${id}" aria-pressed="${state.view===id}">${label}</button>`).join('')}</nav>
      ${state.view==='simple'?'':`<div class="planner-toolbar"><button data-view="simple">Назад к составлению</button><button data-view="settings">Настройки ресторана</button><span class="planner-toolbar-spacer"></span><button data-action="save">Сохранить черновик</button><button data-action="export">Скачать Excel</button><details class="planner-more" data-section="more"><summary>Ещё</summary><button data-view="coverage">Проверить нагрузку по часам</button><button data-action="refresh">Обновить возможности</button><button data-action="cancel">Отменить расчёт</button></details></div>`}
      <p id="plannerStatus" role="status" aria-live="polite"></p><section id="plannerBody"></section><div id="plannerReport" class="planner-report"></div>`;
    const body=root.querySelector('#plannerBody');
    if(state.view==='simple')body.innerHTML=simpleMarkup();
    if(state.view==='inputs')body.innerHTML=inputsMarkup();
    if(state.view==='review')body.innerHTML=reviewMarkup();
    if(state.view==='coverage')body.innerHTML=coverageMarkup()+'<div class="planner-next"><button data-view="shifts">Вернуться к сменам</button><button data-view="review" class="planner-primary">Перейти к публикации</button></div>';
    if(['shifts','availability'].includes(state.view))body.innerHTML=rosterMarkup()+(state.view==='shifts'?'<div class="planner-next"><button data-view="inputs">Изменить прогноз</button><button data-action="generate">Составить / пересчитать смены</button><button data-view="coverage" class="planner-primary">Проверить покрытие по часам</button></div>':'<div class="planner-next"><button data-action="refresh">Обновить из Telegram</button><button data-view="shifts">Вернуться к расписанию</button></div>');
    if(state.view==='settings') body.innerHTML=`<h2>Параметры расчёта</h2><div class="planner-fields"><label>Валюта ${field('currency',c.currency,'text')}</label><label>Целевой SPMH ${field('spmh',c.spmh,'number','min="0" step="any"')}</label>${['pt1','pt2'].map(key=>`<label>${key.toUpperCase()} с ${field(`${key}.0`,P.clock(c[key][0]),'text','data-minute="true"')}</label><label>до ${field(`${key}.1`,P.clock(c[key][1]),'text','data-minute="true"')}</label>`).join('')}</div><h2>Режим работы</h2><p>Часы после полуночи: 25:00 = 01:00 следующего дня. Все границы — с шагом 30 минут.</p><div class="planner-scroll"><table><thead><tr><th>День</th><th>Открытие</th><th>Закрытие</th><th>Подготовка, мин</th><th>Уборка, мин</th></tr></thead><tbody>${P.DAYS.map((d,i)=>`<tr><th>${labels[i]}</th>${['open','close'].map(k=>`<td>${field(`periods.${d}.${k}`,P.clock(c.periods[d][k]),'text','data-minute="true"')}</td>`).join('')}${['prep','cleanup'].map(k=>`<td>${field(`periods.${d}.${k}`,c.periods[d][k],'number','min="0" step="30"')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><h2>Позиции</h2>${Object.entries(c.roles).map(([role,v])=>`<div class="planner-fields"><label><input type="checkbox" data-config="roles.${role}.enabled" ${v.enabled?'checked':''}>${P.ROLES[role]}</label>${!['kitchen','cashier'].includes(role)?`<label>С ${field(`roles.${role}.start`,P.clock(v.start),'text','data-minute="true"')}</label><label>До ${field(`roles.${role}.end`,P.clock(v.end),'text','data-minute="true"')}</label><label>Людей ${field(`roles.${role}.count`,v.count)}</label>${v.days?`<span>Дни: ${v.days.join(', ')}</span>`:''}`:''}</div>`).join('')}<h2>Навыки сотрудников</h2>${state.employees.map(e=>{const s=c.skills[String(e.employee_profile_id)]||{roles:[],training:false};return `<div class="planner-skills"><strong>${escape(e.employee_name)}</strong><select multiple data-skills="${e.employee_profile_id}" aria-label="Навыки ${escape(e.employee_name)}">${selectRoles(s.roles)}</select><label><input type="checkbox" data-training="${e.employee_profile_id}" ${s.training?'checked':''}>На обучении</label></div>`;}).join('')}<details><summary>Нормативы и почасовые шаблоны Excel</summary><p>Нормативы: [чеки за час от, норматив]. Кухня и касса получают каждое округлённую половину норматива, как в исходной таблице. Шаблоны: 24 веса с 00 до 23 часов.</p><label>Нормативы<textarea id="plannerBands">${escape(JSON.stringify(c.bands))}</textarea></label>${P.DAYS.map((d,i)=>`<label>${labels[i]}<textarea data-profile="${d}">${escape(JSON.stringify(c.profiles[d]))}</textarea></label>`).join('')}</details>`;
    if(state.view==='settings')body.insertAdjacentHTML('beforeend',`<p><label>Максимальная нагрузка в настроенных нормативах, чеков за час ${field('normMax',c.normMax)}</label></p><p><label><input type="checkbox" data-config="reviewed" ${c.reviewed?'checked':''}>Я проверил часы работы и нормативы для своего ресторана</label></p><label>Приёмка по дням ${P.DAYS.map((day,i)=>`<span><input type="checkbox" data-receiving-day="${day}" ${c.roles.receiving.days.includes(day)?'checked':''}>${labels[i]}</span>`).join('')}</label>`);
    if(state.view==='settings') {
      const bands=body.querySelector('#plannerBands')?.closest('details');
      if(bands)bands.dataset.section='norms';
      if(bands)bands.innerHTML=`<summary>Нормативы и распределение чеков по часам</summary><p>Кухня и касса получают каждое округлённую половину норматива. Введите числа, как в старой таблице.</p><div class="planner-scroll"><table><thead><tr><th>Чеков в час от</th><th>Норматив</th></tr></thead><tbody>${c.bands.map((band,i)=>`<tr><td>${field(`bands.${i}.0`,band[0])}</td><td>${field(`bands.${i}.1`,band[1])}</td></tr>`).join('')}</tbody></table></div><h3>Распределение по часам</h3><p>Вес каждого часа. Дневные чеки распределяются пропорционально этим значениям.</p><div class="planner-scroll"><table><thead><tr><th>День</th>${Array.from({length:24},(_,i)=>`<th>${P.clock(i*60)}</th>`).join('')}</tr></thead><tbody>${P.DAYS.map((day,i)=>`<tr><th>${labels[i]}</th>${c.profiles[day].map((weight,h)=>`<td>${field(`profiles.${day}.${h}`,weight,'number','min="0" step="any"')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      body.querySelectorAll('[data-skills]').forEach(select=>{
        const fieldset=document.createElement('fieldset');fieldset.className='planner-skill-options';
        fieldset.innerHTML=`<legend>Разрешённые позиции</legend>${Object.entries(P.ROLES).map(([role,label])=>`<label><input type="checkbox" data-skill-toggle="${select.dataset.skills}" value="${role}" ${c.skills[select.dataset.skills]?.roles?.includes(role)?'checked':''}>${escape(label)}</label>`).join('')}`;
        select.replaceWith(fieldset);
      });
      const oldCards=[...body.querySelectorAll('.planner-skills')];
      if(oldCards.length){const grid=document.createElement('div');grid.className='planner-staff-grid';oldCards[0].before(grid);grid.innerHTML=state.employees.map(staffCardMarkup).join('');oldCards.forEach(card=>card.remove());}
    }

    if(state.view==='settings') {
      body.insertAdjacentHTML('afterbegin','<p class="planner-example">Настройте один раз, затем проверяйте только изменения. ПТ1 — только первая смена, ПТ2 — только вторая. ФТ — любое время в пределах возможностей сотрудника. Подготовка и уборка добавляют рабочее время до открытия и после закрытия.</p>');
      for(const [index,heading] of [...body.querySelectorAll(':scope > h2')].entries()) {
        if(index===0)continue;
        const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=heading.textContent;details.dataset.section='settings-'+index;details.append(summary);heading.before(details);
        let next=heading.nextSibling;heading.remove();
        while(next&&next.nodeName!=='H2'){const following=next.nextSibling;details.append(next);next=following;}
      }
      const norms=body.querySelector('[data-section="norms"]');
      if(norms){norms.dataset.section='norms';body.append(norms);const maximum=body.querySelector('[data-config="normMax"]')?.closest('p');if(maximum)norms.append(maximum);}
      const receiving=body.querySelector('[data-receiving-day]')?.closest('label');
      if(receiving)body.querySelector('[data-section="settings-2"]')?.append(receiving);
      const confirmation=body.querySelector('[data-config="reviewed"]')?.closest('p');
      if(confirmation){confirmation.className='planner-example';body.append(confirmation);}
      body.insertAdjacentHTML('beforeend','<div class="planner-next"><button data-view="inputs">Вернуться к данным недели</button></div>');
    }
    root.querySelectorAll('details[data-section]').forEach(element=>{if(Object.hasOwn(state.openSections,element.dataset.section))element.open=!!state.openSections[element.dataset.section];});
    bind();report();
    if(state.stale)setStatus('Возможности изменились. Ручные правки сохранены, но перед публикацией нужен пересчёт.',true);
  }
  function weatherMarkup() {const w=state.config.weather;if(!w)return '<p>Погода не загружена. Автоматическая поправка не применяется.</p>';const stale=Date.now()-new Date(w.fetchedAt).getTime()>12*3600000;return `<p>${escape(w.provider)} · ${escape(w.fetchedAt)} ${stale?'· УСТАРЕЛО':''}</p><div class="planner-scroll"><table><tr><th>Время</th><th>°C</th><th>Осадки, мм</th><th>Ветер, м/с</th></tr>${(w.hours||[]).filter(x=>x.time.slice(0,10)>=state.week).slice(0,168).map(x=>`<tr><td>${escape(x.time)}</td><td>${x.temperature??'—'}</td><td>${x.precipitation??'—'}</td><td>${x.wind??'—'}</td></tr>`).join('')}</table></div>`;}
  function markDirty(){state.dirty=true;report();setStatus('Изменения не сохранены');}
  function bind() {
    const root=state.root;
    const generate=root.querySelector('[data-action="generate"]');
    if(generate&&!root.querySelector('#plannerGenerateFeedback'))generate.insertAdjacentHTML('afterend','<div id="plannerGenerateFeedback" role="status" aria-live="polite"></div>');
    root.querySelector('#plannerWeek').onchange=async event=>{if(state.dirty&&!confirm('Несохранённые изменения будут потеряны. Перейти?')){event.target.value=state.week;return;}const date=event.target.value;if(!date||new Date(`${date}T12:00:00Z`).getUTCDay()!==1){setStatus('Выберите понедельник',true);return;}await mount(root,state.preview,date);};
    root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render();});
    root.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.day=b.dataset.day;render();});
    root.querySelectorAll('[data-edit-cell]').forEach(b=>b.onclick=()=>openShiftEditor(b.dataset.editCell));
    root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action).catch(e=>setStatus(readableIssue(e.message),true)));
    root.querySelectorAll('[data-receiving-day]').forEach(input=>input.onchange=()=>{state.config.roles.receiving.days=[...root.querySelectorAll('[data-receiving-day]:checked')].map(x=>x.dataset.receivingDay);markDirty();});
    root.querySelectorAll('[data-config]').forEach(input=>input.onchange=()=>{const path=input.dataset.config.split('.');let target=state.config;while(path.length>1)target=target[path.shift()];const value=input.type==='checkbox'?input.checked:input.dataset.minute?P.time(input.value):input.type==='number'?number(input.value):input.value;target[path[0]]=value;markDirty();});
    root.querySelectorAll('[data-skill-toggle]').forEach(input=>input.onchange=()=>{const s=state.config.skills[input.dataset.skillToggle]||={roles:[],training:false};s.roles=[...root.querySelectorAll(`[data-skill-toggle="${input.dataset.skillToggle}"]:checked`)].map(x=>x.value);markDirty();persistTestSkills();render();});
    root.querySelectorAll('[data-skill-preset]').forEach(button=>button.onclick=()=>{
      const [id,preset]=button.dataset.skillPreset.split('/');applySkillPreset(id,preset);
      markDirty();persistTestSkills();render();
    });
    root.querySelectorAll('[data-training]').forEach(input=>input.onchange=()=>{const s=state.config.skills[input.dataset.training]||={roles:[],training:false};s.training=input.checked;markDirty();persistTestSkills();});
    root.querySelectorAll('[data-role-days]').forEach(input=>input.onchange=()=>{state.config.roles[input.dataset.roleDays].days=[...input.selectedOptions].map(x=>x.value);markDirty();});
    root.querySelectorAll('[data-event]').forEach(input=>input.onchange=()=>{const key=input.dataset.key;state.config.events[Number(input.dataset.event)][key]=input.type==='checkbox'?input.checked:['start','end'].includes(key)?P.time(input.value):input.type==='number'?number(input.value):input.value;markDirty();});
    root.querySelectorAll('[data-delete-event]').forEach(b=>b.onclick=()=>{state.config.events.splice(Number(b.dataset.deleteEvent),1);markDirty();render();});
    root.querySelectorAll('input[data-config],input[data-event]').forEach(input=>{input.oninput=input.onchange;});
    const actual=root.querySelector('#plannerActuals');if(actual)actual.onchange=()=>previewActuals(actual.files[0]).catch(e=>setStatus(e.message,true));
    const keeper=root.querySelector('#plannerKeeper');if(keeper)keeper.onchange=()=>previewKeeper(keeper.files[0]).catch(e=>setStatus(e.message,true));
    for(const [id,key] of [['keeperProfiles','profiles'],['keeperAverage','averageChecks'],['keeperMissing','acknowledgeMissing']]){
      const checkbox=root.querySelector('#'+id);if(checkbox)checkbox.onchange=()=>{state.keeperPreview.options[key]=checkbox.checked;};
    }
    const cancelKeeper=root.querySelector('#keeperCancel');if(cancelKeeper)cancelKeeper.onclick=()=>{state.keeperPreview=null;render();};
    const applyKeeper=root.querySelector('#keeperApply');if(applyKeeper)applyKeeper.onclick=()=>{
      try{
        state.config=window.BK8Keeper.apply(state.keeperPreview.report,state.config,{profiles:root.querySelector('#keeperProfiles').checked,averageChecks:root.querySelector('#keeperAverage').checked,acknowledgeMissing:!!root.querySelector('#keeperMissing')?.checked});
        state.keeperPreview=null;markDirty();render();setStatus('Отчёт применён к черновику. Будущая выручка не изменена. Проверьте прогноз и пересчитайте смены.');
      }catch(e){root.querySelector('#keeperError').textContent=e.message;}
    };
  }
  async function previewKeeper(file){
    if(!file)return;
    if(file.size>2*1024*1024)throw Error('Файл больше 2 МБ. Выгрузите одну неделю.');
    if(!window.BK8Keeper)throw Error('Импорт не загрузился. Обновите страницу.');
    const owner=state,ticket=(state.keeperTicket||0)+1;state.keeperTicket=ticket;
    const bytes=await file.arrayBuffer();
    if(state!==owner||owner.keeperTicket!==ticket||!['inputs','simple'].includes(state.view))return;
    const report=window.BK8Keeper.decode(bytes);
    state.keeperPreview={name:file.name,report,options:{profiles:true,averageChecks:true,acknowledgeMissing:false}};render();
  }
  async function action(name) {
    const owner=state,epoch=job;
    if(['generate','save','publish'].includes(name)&&Object.keys(state.invalidInputs).length)throw Error('Исправьте некорректно введённые поля: '+Object.keys(state.invalidInputs).join(', '));
    if(name==='addEvent'){state.config.events.push({day:'mon',title:'',start:720,end:840,percent:0,laborPercent:0,included:false});markDirty();render();state.root.querySelector('[data-section="events"]').open=true;return;}
    if(name==='weatherHistory') {
      const history=state.preview?{snapshots:[],actuals:[]}:await rpc('planner_weather_history',{});
      if(state!==owner||job!==epoch||state.view!=='inputs')return;
      const actuals=new Map(history.actuals.map(x=>[`${x.date}/${x.hour}`,x]));state.config.actuals.forEach(x=>actuals.set(`${x.date}/${x.hour}`,x));
      const suggestions=P.weatherSuggestions([state.config,...history.snapshots],[...actuals.values()],state.config.weatherRules),names={rainPercent:'Дождь',coldPercent:'Холод',heatPercent:'Жара',windPercent:'Ветер'};
      const root=document.querySelector('#weatherSuggestions');root.innerHTML=suggestions.map(s=>`<p>${names[s.key]}: ${s.percent===null?'недостаточно данных':`${s.percent.toFixed(1)}%`} · дней с условием ${s.exposed}, без ${s.controls} ${s.percent!==null?`<button data-apply-weather="${s.key}">Применить вручную</button>`:''}</p>`).join('');
      root.querySelectorAll('[data-apply-weather]').forEach(b=>b.onclick=()=>{const s=suggestions.find(x=>x.key===b.dataset.applyWeather);if(confirm(`Применить оценку ${names[s.key]} ${s.percent.toFixed(1)}%? Это наблюдаемая связь, а не доказанная причинность.`)){state.config.weatherRules[s.key]=Math.round(s.percent*10)/10;markDirty();b.disabled=true;}});return;
    }
    if(name==='cancel'){worker?.terminate();worker=null;job++;setStatus('Расчёт отменён; предыдущий черновик сохранён в редакторе');return;}
    if(name==='generate') {
      const problems=generationProblems();if(problems.length)throw Error('Пока не могу составить расписание:\n• '+problems.join('\n• '));
      if(!state.preview){
        setStatus('Проверяем последние возможности сотрудников в боте…');
        const latest=await rpc('planner_get_week',{p_week:state.week});
        if(state!==owner||job!==epoch)return;
        state.employees=latest.employees;state.sourceHash=latest.sourceHash;
      }
      const errors=P.validateConfig(state.config);if(errors.length)throw Error(errors.join('; '));worker?.terminate();const id=++job;
      worker=new Worker('planner-worker.js?v=20261017-normwarn1');setStatus('Расчёт…');
      worker.onmessage=event=>{if(event.data.id!==job)return;worker.terminate();worker=null;if(event.data.error){setStatus(readableIssue(event.data.error),true);return;}const result=event.data.result;if(result.errors.length){setStatus(readableIssue(result.errors.join('; ')),true);return;}state.shifts=result.shifts;state.stale=false;state.dirty=true;state.view='shifts';render();setStatus(`Черновик составлен. Это ещё не публикация для сотрудников. ${readableIssue([...(result.warnings||[]).slice(0,3),...result.issues.slice(0,5)].join('\n'))}`);};
      worker.onerror=e=>{worker?.terminate();worker=null;setStatus(`Ошибка расчёта: ${e.message}`,true);};
      worker.postMessage({id,config:state.config,employees:state.employees,shifts:state.shifts});return;
    }
    if(name==='refresh') {
      if(state.preview){setStatus('Демонстрационные возможности уже загружены');return;}
      const latest=await rpc('planner_get_week',{p_week:state.week});if(state!==owner||job!==epoch)return;state.stale=state.stale||latest.sourceHash!==state.sourceHash;state.employees=latest.employees;state.sourceHash=latest.sourceHash;render();setStatus(state.stale?'Возможности изменились. Ручные смены сохранены, нужен пересчёт.':'Возможности актуальны');return;
    }
    if(name==='save'||name==='publish') {
      if(state.preview){setStatus('Предпросмотр: сохранение и публикация в ресторан отключены');return;}
      if(state.readOnly){setStatus('Это тест на реальных возможностях: сохранение и публикация отключены. Можно составить расписание и скачать Excel.');return;}
      if(worker)throw Error('Дождитесь завершения расчёта');
      if(state.stale)throw Error('Пересчитайте черновик после обновления возможностей');
      const {d,r}=report();if(name==='publish'&&(d.errors.length||r.errors.length))throw Error([...d.errors,...r.errors].slice(0,8).join('; '));
      if(name==='publish'&&!confirm(`Опубликовать неделю ${state.week} для сотрудников? ${r.warnings.length?'Есть предупреждения: '+r.warnings.length+'. Проверьте их на экране публикации. ':''}Это заменит расписание этой недели в Telegram. Временные возможности сотрудников не изменятся.`))return;
      const week=owner.week,document=JSON.parse(JSON.stringify({config:owner.config,shifts:owner.shifts}));
      const version=await rpc('planner_save_week',{p_week:week,p_version:owner.version,p_source_hash:owner.sourceHash,p_document:document});owner.version=version;
      const unchanged=JSON.stringify({config:owner.config,shifts:owner.shifts})===JSON.stringify(document)&&!Object.keys(owner.invalidInputs).length;
      owner.dirty=!unchanged;
      if(state!==owner||job!==epoch)return;
      if(!unchanged)throw Error('Предыдущая редакция сохранена, но появились новые правки. Публикация отменена; сохраните ещё раз.');
      if(name==='publish')await rpc('planner_publish_week',{p_week:week,p_version:version,p_acknowledge:true});
      if(state!==owner||job!==epoch)return;
      setStatus(name==='save'?`Черновик сохранён, версия ${version}. Не опубликован.`:owner.dirty?'Версия опубликована; новые правки ещё не сохранены':'Расписание опубликовано');return;
    }
    if(name==='export'){await exportExcel();return;}
    if(name==='weather') {
      const w=await window.BK8PlannerWeather.load();if(state!==owner||job!==epoch)return;state.config.weather=w;state.dirty=true;render();setStatus('Погода обновлена. Настройки коэффициентов не менялись.');return;
    }
    if(name==='history') {
      if(!state.config.actuals.length)throw Error('Сначала импортируйте фактические продажи');
      const proposal=P.historyProposal(state.config);if(!proposal.complete.length)throw Error('Нет дней с полными почасовыми данными за рабочее время');
      if(confirm(`Заменить шаблоны средним профилем фактических чеков? ${proposal.complete.map(x=>`${x.day}: ${x.days} дней`).join(', ')}. Неполные дни исключены.`)){state.config.profiles=proposal.profiles;markDirty();setStatus('Предложенные шаблоны применены. Погодные коэффициенты не изменялись.');}return;
    }
  }
  async function previewActuals(file) {
    if(!file)return;if(file.size>2*1024*1024)throw Error('CSV больше 2 МБ');
    const lines=(await file.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/),header=lines.shift().trim();
    if(header!=='date,hour,revenue,checks')throw Error('Заголовок должен быть date,hour,revenue,checks');
    const seen=new Set(),rows=lines.map((line,i)=>{const [date,h,r,c,...extra]=line.split(',');const hour=Number(h),revenue=Number(r),checks=Number(c),key=`${date}/${hour}`;
      if(extra.length||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date||![h,r,c].every(v=>v!==undefined&&v.trim()!=='')||!Number.isInteger(hour)||hour<0||hour>23||!Number.isFinite(revenue)||revenue<0||!Number.isInteger(checks)||checks<0||seen.has(key))throw Error(`Некорректная или повторная строка ${i+2}`);seen.add(key);return {date,hour,revenue,checks};});
    const root=document.querySelector('#actualPreview');root.innerHTML=`<p>Будет импортировано ${rows.length} строк. Существующие записи с тем же днём и часом будут заменены.</p><pre>${escape(JSON.stringify(rows.slice(0,5),null,2))}</pre><button id="confirmActuals">Подтвердить импорт</button>`;
    root.querySelector('button').onclick=()=>{const merged=new Map(state.config.actuals.map(r=>[`${r.date}/${r.hour}`,r]));rows.forEach(r=>merged.set(`${r.date}/${r.hour}`,r));state.config.actuals=[...merged.values()];markDirty();render();setStatus('Импорт в черновик завершён. Нажмите «Сохранить черновик» для записи в Supabase.');};
  }
  async function exportExcel() {
    if(!window.ExcelJS)throw Error('Библиотека Excel не загрузилась');
    const wb=new ExcelJS.Workbook(),schedule=wb.addWorksheet('Расписание'),coverage=wb.addWorksheet('Покрытие'),inputs=wb.addWorksheet('Прогноз');
    schedule.addRow([`Расписание с ${dayDate(0)} по ${dayDate(6,{day:'2-digit',month:'2-digit',year:'numeric'})} · ${state.preview?'ТЕСТОВЫЙ ПРИМЕР':'Черновик, версия '+state.version}`]);schedule.mergeCells('A1:L1');
    schedule.addRow(['№','Сотрудник',...labels.map((label,i)=>`${label}\n${dayDate(i)}`),'Часы','Комментарий','Ознакомлен (подпись)']);
    for(const [index,e] of state.employees.entries()){
      const rows=state.shifts.filter(s=>String(s.employeeId)===String(e.employee_profile_id));
      const row=schedule.addRow([index+1,e.employee_name,...P.DAYS.map(d=>{const s=rows.find(x=>x.day===d);return s?`${P.clock(s.start)}–${P.clock(s.end)}`:'—';}),rows.reduce((sum,s)=>sum+(s.end-s.start)/60,0),rows.map(s=>`${labels[P.DAYS.indexOf(s.day)]}: ${s.comment}`).filter((v,i)=>rows[i].comment).join('; '),'']);
      row.height=28;
      P.DAYS.forEach((day,i)=>{if(!rows.some(s=>s.day===day))row.getCell(i+3).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE4CE'}};});
    }
    coverage.addRow(['День','Время','Позиция','Нужно','Назначено','Дефицит','Избыток','Норматив']);const {d,r}=report();r.coverage.forEach(x=>coverage.addRow([labels[P.DAYS.indexOf(x.day)],P.clock(x.start),P.ROLES[x.role],x.needed,x.assigned,x.missing,x.excess,x.normEstimated?'Приблизительно: выше проверенного диапазона':'В пределах настроенных нормативов']));
    inputs.addRow(['День','Время','Выручка база','Выручка итог','Чеки','Поправка %','Источник чеков','Норматив']);d.slots.forEach(x=>inputs.addRow([labels[P.DAYS.indexOf(x.day)],P.clock(x.start),x.baseRevenue,x.revenue,x.checks,x.percent,x.source,x.normEstimated?'Последний известный норматив; людей может потребоваться больше':'В пределах настроенных нормативов']));
    for(const [label,key] of [['Часы','hours'],['SPMH','spmh'],['GSPH','gsph']])schedule.addRow(['',label,...P.DAYS.map(day=>dayTotals(day,d.slots)[key])]);
    for(const sheet of wb.worksheets){
      sheet.views=[{state:'frozen',ySplit:sheet===schedule?2:1,xSplit:sheet===schedule?2:1,showGridLines:false}];
      sheet.columns.forEach((col,i)=>col.width=sheet===schedule?([4,30,16,16,16,16,16,16,16,8,24,18][i]||18):i===0?24:18);
      sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:sheet===schedule?'1:2':'1:1',margins:{left:.2,right:.2,top:.3,bottom:.3,header:.1,footer:.1}};
      sheet.eachRow(row=>row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:10};cell.alignment={vertical:'middle',horizontal:sheet===schedule&&[2,11].includes(cell.col)?'left':'center',wrapText:true};cell.border={top:{style:'thin',color:{argb:'FFDCCFBA'}},bottom:{style:'thin',color:{argb:'FFDCCFBA'}},left:{style:'thin',color:{argb:'FFDCCFBA'}},right:{style:'thin',color:{argb:'FFDCCFBA'}}};if(typeof cell.value==='number')cell.numFmt='0.0';}));
      const header=sheet.getRow(sheet===schedule?2:1);header.height=36;header.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFDF82'}};cell.font={name:'Arial',size:10,bold:true,color:{argb:'FF3B2018'}};});
    }
    schedule.getRow(1).height=28;schedule.getRow(1).font={name:'Arial',size:12,bold:true};
    schedule.getColumn(1).numFmt='0';schedule.getColumn(10).numFmt='0.0';
    schedule.pageSetup.printArea=`A1:L${schedule.rowCount}`;
    const url=URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`BK8-${state.week}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function mount(root,preview=false,week=monday()) {
    worker?.terminate();worker=null;job++;
    const ticket=job;
    root.innerHTML='<p role="status">Загрузка планировщика…</p>';
    try {
      let loaded;
      if(preview){const employees=Array.from({length:8},(_,i)=>({employee_profile_id:i+1,employee_name:`Сотрудник ${i+1}`,work_type:'FT',availability:Object.fromEntries(P.DAYS.map(d=>[d,'ФТ'])),regular_days_off:{}}));loaded={employees,version:0,sourceHash:'demo',document:null};}
      else loaded=await rpc('planner_get_week',{p_week:week});
      if(ticket!==job)return;
      state={root,preview,readOnly:new URLSearchParams(location.search).get('planner_readonly')==='1',week,employees:loaded.employees,version:loaded.version,sourceHash:loaded.sourceHash,config:loaded.document?.config||P.defaults(),shifts:loaded.document?.shifts||[],stale:!!loaded.savedSourceHash&&loaded.savedSourceHash!==loaded.sourceHash,dirty:false,view:'simple',day:'mon'};
      state.config.weekStart=week;
      state.invalidInputs={};
      state.config.weatherRules||=P.defaults().weatherRules;
      state.config.normMax??=140;
      if(!loaded.document&&loaded.defaults){const fresh=P.defaults();state.config={...fresh,...loaded.defaults,weekStart:week,forecasts:fresh.forecasts,events:[]};}
      if(preview){
        state.config.reviewed=true;state.config.spmh=150;P.DAYS.forEach(d=>state.config.forecasts[d]={revenue:10000,checks:600,averageCheck:null});
        state.employees.forEach((e,index)=>{
          state.config.skills[e.employee_profile_id]={roles:['kitchen','cashier'],training:false};
          P.DAYS.forEach((day,i)=>{
            if((index+i)%4===0){e.availability[day]='Выходной';return;}
            const start=index%2?900:480,end=index%2?1380:960,role=index%3?'kitchen':'cashier';
            state.shifts.push({employeeId:e.employee_profile_id,day,start,end,locked:false,comment:'',positions:Object.fromEntries(Array.from({length:(end-start)/30},(_,slot)=>[start+slot*30,role]))});
          });
        });
      }
      if((preview||state.readOnly)&&window.BK8PlannerSkills)state.config.skills=window.BK8PlannerSkills.restore(localStorage,state.config.skills,preview);
      render();
    }catch(e){if(ticket!==job)return;root.innerHTML=`<h1>Не удалось загрузить возможности сотрудников</h1><p role="alert">Проверьте подключение к интернету и вход в панель. Настоящие данные не подменены примером.</p><button id="retryPlanner">Попробовать ещё раз</button><details><summary>Текст ошибки для проверки</summary><p>${escape(e.message)}</p></details>`;root.querySelector('button').onclick=()=>mount(root,preview,week);}
  }
  window.BK8PlannerUI={mount};
  if(window.openPage){const previous=window.openPage;window.openPage=function(page){if(state?.dirty&&!confirm('В планировщике есть несохранённые изменения. Покинуть редактор?'))return;if(state)state.dirty=false;if(page!=='schedule'){worker?.terminate();worker=null;job++;return previous(page);}document.querySelector('#crumb').textContent='Планировщик расписания';document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='schedule'));return mount(document.querySelector('#content'));};}
  if(window.enterPanel){const previousEnter=window.enterPanel;window.enterPanel=function(profile){const result=previousEnter(profile);if(location.hash==='#schedule')window.openPage('schedule');return result;};}
  window.addEventListener('beforeunload',event=>{if(state?.dirty){event.preventDefault();event.returnValue='';}});
})();
