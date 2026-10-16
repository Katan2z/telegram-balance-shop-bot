(function () {
  'use strict';
  const P=window.BK8Planner,labels=['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=null,worker=null,job=0;
  const number=v=>v===''?null:Number(v);
  const rpc=(name,payload)=>window.bk8Api(`rpc/${name}`,{method:'POST',body:JSON.stringify(payload)});
  function monday() {const now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Minsk'}));now.setDate(now.getDate()-(now.getDay()+6)%7);return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
  function field(path,value,type='number',extra='') {return `<input data-config="${path}" type="${type}" value="${escape(value)}" ${extra}>`;}
  function selectRoles(roles=[]) {return Object.entries(P.ROLES).map(([id,name])=>`<option value="${id}" ${roles.includes(id)?'selected':''}>${name}</option>`).join('');}
  function setStatus(message,error=false) {const root=document.querySelector('#plannerStatus');if(root){root.textContent=message;root.classList.toggle('error',error);}}
  function report() {
    const d=P.demand(state.config),r=P.evaluate(state.config,state.employees,state.shifts,d.slots);
    const root=document.querySelector('#plannerReport');if(!root)return;
    root.innerHTML=`<strong>${r.hours.toFixed(1)} ч. · SPMH ${r.spmh===null?'—':r.spmh.toFixed(1)} · GSPH ${r.gsph===null?'—':r.gsph.toFixed(1)}</strong><span>Выручка ${r.revenue.toFixed(2)} ${escape(state.config.currency)} · Дополнительные часы к цели ${r.extraHours.toFixed(1)}</span><span>Дефицит: ${(r.coverage.reduce((s,x)=>s+x.missing,0)/2).toFixed(1)} человеко-часов</span>${[...d.errors,...r.errors,...r.warnings,...(state.stale?['Возможности изменились: пересчитайте черновик']:[])].slice(0,12).map(e=>`<small>${escape(e)}</small>`).join('')}`;
    return {d,r};
  }
  function render() {
    const root=state.root,c=state.config;
    root.innerHTML=`<div class="planner-header"><div><h1>Планировщик смен</h1><p>${escape(c.address)} · Europe/Minsk${state.preview?' · ДЕМОНСТРАЦИЯ, данные не сохраняются в ресторан':''}</p></div><label>Неделя с <input type="date" id="plannerWeek" value="${state.week}"></label></div><div class="planner-toolbar"><button data-action="refresh">Обновить возможности</button><button data-action="generate">Рассчитать черновик</button><button data-action="cancel">Отменить расчёт</button><button data-action="save">Сохранить черновик</button><button data-action="publish">Опубликовать</button><button data-action="export">Excel</button></div><p id="plannerStatus" role="status" aria-live="polite"></p><div id="plannerReport" class="planner-report"></div><nav class="planner-tabs">${[['inputs','Исходные данные'],['coverage','Нагрузка по часам'],['shifts','Смены'],['settings','Настройки']].map(([id,label])=>`<button data-view="${id}" aria-pressed="${state.view===id}">${label}</button>`).join('')}</nav><section id="plannerBody"></section>`;
    const body=root.querySelector('#plannerBody');
    if(state.view==='inputs') body.innerHTML=`<h2>Прогноз аналитиков</h2><p>Заполните выручку и чеки либо средний чек. Исторические суммы не подставляются.</p><div class="planner-scroll"><table><thead><tr><th>День</th><th>Выручка</th><th>Чеки</th><th>Средний чек</th></tr></thead><tbody>${P.DAYS.map((d,i)=>`<tr><th>${labels[i]}</th>${['revenue','checks','averageCheck'].map(k=>`<td>${field(`forecasts.${d}.${k}`,c.forecasts[d][k],'number','min="0" step="any"')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><h2>Акции и новинки</h2><p>Проценты суммируются относительно базы. Уже учтённые аналитиками акции не увеличивают спрос повторно.</p><div id="plannerEvents">${c.events.map((e,i)=>`<div class="planner-event"><select data-event="${i}" data-key="day">${P.DAYS.map((d,j)=>`<option value="${d}" ${e.day===d?'selected':''}>${labels[j]}</option>`).join('')}</select><input data-event="${i}" data-key="title" value="${escape(e.title)}" placeholder="Название"><label>С <input data-event="${i}" data-key="start" value="${P.clock(e.start)}"></label><label>До <input data-event="${i}" data-key="end" value="${P.clock(e.end)}"></label><label>Спрос % <input type="number" data-event="${i}" data-key="percent" value="${e.percent}"></label><label>Трудоёмкость % <input type="number" data-event="${i}" data-key="laborPercent" value="${e.laborPercent}"></label><label><input type="checkbox" data-event="${i}" data-key="included" ${e.included?'checked':''}>Учтено аналитиками</label><button data-delete-event="${i}">Удалить</button></div>`).join('')}</div><button data-action="addEvent">Добавить событие</button><h2>Погода</h2><p>Ручная поправка к спросу % ${field('weatherPercent',c.weatherPercent)}. Без подтверждённой модели коэффициент остаётся 0%.</p><button data-action="weather">Обновить погоду</button><div id="plannerWeather">${weatherMarkup()}</div><h2>Фактические продажи</h2><p>CSV: date,hour,revenue,checks. Дата YYYY-MM-DD, час 0–23; суммы и чеки неотрицательные. Сначала предварительный просмотр.</p><input type="file" id="plannerActuals" accept=".csv,text/csv"><div id="actualPreview"></div><p>Сохранено строк: ${c.actuals.length}</p><button data-action="history">Предложить шаблон по истории</button>`;
    if(state.view==='settings') body.innerHTML=`<h2>Параметры расчёта</h2><div class="planner-fields"><label>Валюта ${field('currency',c.currency,'text')}</label><label>Целевой SPMH ${field('spmh',c.spmh,'number','min="0" step="any"')}</label>${['pt1','pt2'].map(key=>`<label>${key.toUpperCase()} с ${field(`${key}.0`,P.clock(c[key][0]),'text','data-minute="true"')}</label><label>до ${field(`${key}.1`,P.clock(c[key][1]),'text','data-minute="true"')}</label>`).join('')}</div><h2>Режим работы</h2><p>Часы после полуночи: 25:00 = 01:00 следующего дня. Все границы — с шагом 30 минут.</p><div class="planner-scroll"><table><thead><tr><th>День</th><th>Открытие</th><th>Закрытие</th><th>Подготовка, мин</th><th>Уборка, мин</th></tr></thead><tbody>${P.DAYS.map((d,i)=>`<tr><th>${labels[i]}</th>${['open','close'].map(k=>`<td>${field(`periods.${d}.${k}`,P.clock(c.periods[d][k]),'text','data-minute="true"')}</td>`).join('')}${['prep','cleanup'].map(k=>`<td>${field(`periods.${d}.${k}`,c.periods[d][k],'number','min="0" step="30"')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><h2>Позиции</h2>${Object.entries(c.roles).map(([role,v])=>`<div class="planner-fields"><label><input type="checkbox" data-config="roles.${role}.enabled" ${v.enabled?'checked':''}>${P.ROLES[role]}</label>${!['kitchen','cashier'].includes(role)?`<label>С ${field(`roles.${role}.start`,P.clock(v.start),'text','data-minute="true"')}</label><label>До ${field(`roles.${role}.end`,P.clock(v.end),'text','data-minute="true"')}</label><label>Людей ${field(`roles.${role}.count`,v.count)}</label>${v.days?`<span>Дни: ${v.days.join(', ')}</span>`:''}`:''}</div>`).join('')}<h2>Навыки сотрудников</h2>${state.employees.map(e=>{const s=c.skills[String(e.employee_profile_id)]||{roles:[],training:false};return `<div class="planner-skills"><strong>${escape(e.employee_name)}</strong><select multiple data-skills="${e.employee_profile_id}" aria-label="Навыки ${escape(e.employee_name)}">${selectRoles(s.roles)}</select><label><input type="checkbox" data-training="${e.employee_profile_id}" ${s.training?'checked':''}>На обучении</label></div>`;}).join('')}<details><summary>Нормативы и почасовые шаблоны Excel</summary><p>Нормативы: [чеки за час от, норматив]. Кухня и касса получают каждое округлённую половину норматива, как в исходной таблице. Шаблоны: 24 веса с 00 до 23 часов.</p><label>Нормативы<textarea id="plannerBands">${escape(JSON.stringify(c.bands))}</textarea></label>${P.DAYS.map((d,i)=>`<label>${labels[i]}<textarea data-profile="${d}">${escape(JSON.stringify(c.profiles[d]))}</textarea></label>`).join('')}</details>`;
    if(state.view==='coverage') {
      const {d,r}=report();
      body.innerHTML=`<div class="planner-scroll"><table><thead><tr><th>День</th><th>Время</th><th>Выручка база → итог</th><th>Чеки</th><th>Позиция</th><th>Нужно</th><th>Назначено</th><th>Дефицит</th></tr></thead><tbody>${r.coverage.map(x=>{const slot=d.slots.find(s=>s.day===x.day&&s.start===x.start);return `<tr class="${x.missing?'planner-shortage':''}"><td>${labels[P.DAYS.indexOf(x.day)]}</td><td>${P.clock(x.start)}</td><td>${slot.baseRevenue.toFixed(1)} → ${slot.revenue.toFixed(1)}</td><td title="${escape(slot.source)}">${slot.checks.toFixed(1)}</td><td>${P.ROLES[x.role]}</td><td>${x.needed}</td><td>${x.assigned}</td><td>${x.missing}</td></tr>`;}).join('')}</tbody></table></div>`;
    }
    if(state.view==='shifts') body.innerHTML=`<p>Редактирование смены закрепляет её при следующем расчёте. Возможности сотрудников показаны отдельно и не являются назначением.</p><div class="planner-scroll"><table><thead><tr><th>Сотрудник</th><th>День</th><th>Доступность</th><th>Смена</th><th>Позиция</th><th>Закрепить</th><th>Комментарий</th><th></th></tr></thead><tbody>${state.employees.flatMap(e=>P.DAYS.map((d,i)=>{const s=state.shifts.find(x=>String(x.employeeId)===String(e.employee_profile_id)&&x.day===d),role=s?.positions?.[s.start];return `<tr><th>${escape(e.employee_name)}</th><td>${labels[i]}</td><td>${escape(e.availability?.[d]||'Не заполнено')}${e.regular_days_off?.[d]?' · постоянный выходной':''}</td><td><input data-shift="${e.employee_profile_id}/${d}" data-key="interval" value="${s?`${P.clock(s.start)}–${P.clock(s.end)}`:''}" placeholder="09:00–13:00"></td><td><select data-shift="${e.employee_profile_id}/${d}" data-key="role"><option value="">Не назначено</option>${Object.entries(P.ROLES).map(([r,label])=>`<option value="${r}" ${r===role?'selected':''}>${label}</option>`).join('')}</select>${s&&new Set(Object.values(s.positions)).size>1?'<small>Несколько позиций; выбор заменит все</small>':''}</td><td><input type="checkbox" data-shift="${e.employee_profile_id}/${d}" data-key="locked" ${s?.locked?'checked':''}></td><td><input data-shift="${e.employee_profile_id}/${d}" data-key="comment" value="${escape(s?.comment||'')}"></td><td><button data-remove="${e.employee_profile_id}/${d}">Очистить</button></td></tr>`;})).join('')}</tbody></table></div>`;
    if(state.view==='inputs') body.insertAdjacentHTML('beforeend',`<details><summary>Автоматическая погодная поправка</summary><p><a href="https://api.met.no/" target="_blank" rel="noopener">MET Norway</a>, CC BY 4.0. Если прогноз уже учтён аналитиками, отключите автопоправку. Недоступные часы не заполняются выдуманной погодой.</p><label><input type="checkbox" data-config="weatherEnabled" ${c.weatherEnabled?'checked':''}>Применять погодные коэффициенты</label><div class="planner-fields">${Object.entries({rainThreshold:'Осадки от, мм',rainPercent:'Дождь %',coldThreshold:'Холод ниже °C',coldPercent:'Холод %',heatThreshold:'Жара от °C',heatPercent:'Жара %',windThreshold:'Ветер от, м/с',windPercent:'Ветер %'}).map(([key,label])=>`<label>${label} ${field(`weatherRules.${key}`,c.weatherRules[key],'number','step="any"')}</label>`).join('')}</div></details>`);
    if(state.view==='settings')body.insertAdjacentHTML('beforeend',`<p><label>Нормативы настроены до, чеков/час ${field('normMax',c.normMax)}</label></p><p><label><input type="checkbox" data-config="reviewed" ${c.reviewed?'checked':''}>Режим работы и нормативы проверены для моего ресторана</label></p>`);
    bind();report();
    if(state.stale)setStatus('Возможности изменились. Пересчитайте черновик перед сохранением.',true);
  }
  function weatherMarkup() {const w=state.config.weather;if(!w)return '<p>Погода не загружена. Автоматическая поправка не применяется.</p>';const stale=Date.now()-new Date(w.fetchedAt).getTime()>12*3600000;return `<p>${escape(w.provider)} · ${escape(w.fetchedAt)} ${stale?'· УСТАРЕЛО':''}</p><div class="planner-scroll"><table><tr><th>Время</th><th>°C</th><th>Осадки, мм</th><th>Ветер, м/с</th></tr>${(w.hours||[]).filter(x=>x.time.slice(0,10)>=state.week).slice(0,168).map(x=>`<tr><td>${escape(x.time)}</td><td>${x.temperature??'—'}</td><td>${x.precipitation??'—'}</td><td>${x.wind??'—'}</td></tr>`).join('')}</table></div>`;}
  function markDirty(){state.dirty=true;report();}
  function bind() {
    const root=state.root;
    root.querySelector('#plannerWeek').onchange=async event=>{if(state.dirty&&!confirm('Несохранённые изменения будут потеряны. Перейти?')){event.target.value=state.week;return;}const date=event.target.value;if(!date||new Date(`${date}T12:00:00Z`).getUTCDay()!==1){setStatus('Выберите понедельник',true);return;}await mount(root,state.preview,date);};
    root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render();});
    root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action).catch(e=>setStatus(e.message,true)));
    root.querySelectorAll('[data-config]').forEach(input=>input.onchange=()=>{const path=input.dataset.config.split('.');let target=state.config;while(path.length>1)target=target[path.shift()];const value=input.type==='checkbox'?input.checked:input.dataset.minute?P.time(input.value):input.type==='number'?number(input.value):input.value;target[path[0]]=value;markDirty();});
    root.querySelectorAll('[data-skills]').forEach(input=>input.onchange=()=>{const s=state.config.skills[input.dataset.skills]||={roles:[],training:false};s.roles=[...input.selectedOptions].map(o=>o.value);markDirty();});
    root.querySelectorAll('[data-training]').forEach(input=>input.onchange=()=>{const s=state.config.skills[input.dataset.training]||={roles:[],training:false};s.training=input.checked;markDirty();});
    root.querySelectorAll('[data-event]').forEach(input=>input.onchange=()=>{const key=input.dataset.key;state.config.events[Number(input.dataset.event)][key]=input.type==='checkbox'?input.checked:['start','end'].includes(key)?P.time(input.value):input.type==='number'?number(input.value):input.value;markDirty();});
    root.querySelectorAll('[data-delete-event]').forEach(b=>b.onclick=()=>{state.config.events.splice(Number(b.dataset.deleteEvent),1);markDirty();render();});
    root.querySelectorAll('[data-profile],#plannerBands').forEach(input=>input.onchange=()=>{const key=input.dataset.profile||'bands';try{const value=JSON.parse(input.value);if(!Array.isArray(value))throw Error('Ожидается массив');if(input.dataset.profile)state.config.profiles[input.dataset.profile]=value;else state.config.bands=value;delete state.invalidInputs[key];markDirty();}catch(e){state.invalidInputs[key]=input.value;state.dirty=true;setStatus(`Не сохранено: ${e.message}. Исправьте поле перед расчётом.`,true);}});
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.shifts=state.shifts.filter(s=>`${s.employeeId}/${s.day}`!==b.dataset.remove);markDirty();render();});
    root.querySelectorAll('[data-shift]').forEach(input=>input.onchange=()=>{const key=input.dataset.shift+'/'+input.dataset.key;try{editShift(input);delete state.invalidInputs[key];markDirty();}catch(e){state.invalidInputs[key]=input.value;state.dirty=true;setStatus(e.message,true);}});
    const actual=root.querySelector('#plannerActuals');if(actual)actual.onchange=()=>previewActuals(actual.files[0]).catch(e=>setStatus(e.message,true));
  }
  function editShift(input) {
    const [id,day]=input.dataset.shift.split('/');let s=state.shifts.find(x=>String(x.employeeId)===id&&x.day===day);const key=input.dataset.key;
    if(key==='interval') {
      if(!input.value.trim()){state.shifts=state.shifts.filter(x=>x!==s);render();return;}
      const [a,b,...rest]=input.value.replace(/[–—−]/g,'-').split('-');let start=P.time(a),end=P.time(b);if(rest.length||!Number.isFinite(start)||!Number.isFinite(end))throw Error('Введите часы как 09:00–13:00');if(end<=start)end+=1440;
      const role=input.closest('tr').querySelector('[data-key="role"]').value;
      if(!s){s={employeeId:Number(id),day,comment:'',locked:true,positions:{}};state.shifts.push(s);}s.start=start;s.end=end;s.positions=Object.fromEntries(Array.from({length:Math.max(0,Math.ceil((end-start)/30))},(_,i)=>[start+i*30,role]));s.locked=true;
    } else {if(!s)throw Error('Сначала укажите смену');if(key==='role'){s.positions=Object.fromEntries(Object.keys(s.positions).map(t=>[t,input.value]));s.locked=true;}else s[key]=input.type==='checkbox'?input.checked:input.value;}
    if(s)input.closest('tr').querySelector('[data-key="locked"]').checked=s.locked;
  }
  async function action(name) {
    if(['generate','save','publish'].includes(name)&&Object.keys(state.invalidInputs).length)throw Error('Исправьте некорректно введённые поля: '+Object.keys(state.invalidInputs).join(', '));
    if(name==='addEvent'){state.config.events.push({day:'mon',title:'',start:720,end:840,percent:0,laborPercent:0,included:false});markDirty();render();return;}
    if(name==='cancel'){worker?.terminate();worker=null;job++;setStatus('Расчёт отменён; предыдущий черновик сохранён в редакторе');return;}
    if(name==='generate') {
      const errors=P.validateConfig(state.config);if(errors.length)throw Error(errors.join('; '));worker?.terminate();const id=++job;
      worker=new Worker('planner-worker.js?v=20261016-1');setStatus('Расчёт…');
      worker.onmessage=event=>{if(event.data.id!==job)return;worker.terminate();worker=null;if(event.data.error){setStatus(event.data.error,true);return;}const result=event.data.result;if(result.errors.length){setStatus(result.errors.join('; '),true);return;}state.shifts=result.shifts;state.stale=false;state.dirty=true;state.view='shifts';render();setStatus(`Черновик рассчитан. ${result.issues.slice(0,8).join('; ')}`);};
      worker.onerror=e=>{worker?.terminate();worker=null;setStatus(`Ошибка расчёта: ${e.message}`,true);};
      worker.postMessage({id,config:state.config,employees:state.employees,shifts:state.shifts});return;
    }
    if(name==='refresh') {
      if(state.preview){setStatus('Демонстрационные возможности уже загружены');return;}
      const latest=await rpc('planner_get_week',{p_week:state.week});state.stale=latest.sourceHash!==state.sourceHash;state.employees=latest.employees;state.sourceHash=latest.sourceHash;render();setStatus(state.stale?'Возможности изменились. Ручные смены сохранены, нужен пересчёт.':'Возможности актуальны');return;
    }
    if(name==='save'||name==='publish') {
      if(state.preview){setStatus('Предпросмотр: сохранение и публикация в ресторан отключены');return;}
      if(worker)throw Error('Дождитесь завершения расчёта');
      if(state.stale)throw Error('Пересчитайте черновик после обновления возможностей');
      const {d,r}=report();if(name==='publish'&&(d.errors.length||r.errors.length))throw Error([...d.errors,...r.errors].slice(0,8).join('; '));
      if(name==='publish'&&!confirm(`Опубликовать неделю ${state.week}? ${r.warnings.join('. ')}. Проверьте покрытие и SPMH. Это изменит расписание, видимое сотрудникам.`))return;
      const version=await rpc('planner_save_week',{p_week:state.week,p_version:state.version,p_source_hash:state.sourceHash,p_document:{config:state.config,shifts:state.shifts}});state.version=version;state.dirty=false;
      if(name==='publish')await rpc('planner_publish_week',{p_week:state.week,p_version:state.version,p_acknowledge:true});
      setStatus(name==='save'?`Черновик сохранён, версия ${version}. Не опубликован.`:'Расписание опубликовано');return;
    }
    if(name==='export'){await exportExcel();return;}
    if(name==='weather') {
      const w=await window.BK8PlannerWeather.load();state.config.weather=w;state.dirty=true;render();setStatus('Погода обновлена. Настройки коэффициентов не менялись.');return;
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
    schedule.addRow([`Неделя с ${state.week} · черновик версии ${state.version}`]);schedule.addRow(['Сотрудник',...labels,'Часы','Комментарий','Ознакомлен (подпись)']);
    for(const e of state.employees){const rows=state.shifts.filter(s=>String(s.employeeId)===String(e.employee_profile_id));schedule.addRow([e.employee_name,...P.DAYS.map(d=>{const s=rows.find(x=>x.day===d);return s?`${P.clock(s.start)}–${P.clock(s.end)}`:'Выходной';}),rows.reduce((sum,s)=>sum+(s.end-s.start)/60,0),rows.map(s=>s.comment).filter(Boolean).join('; '),'']);}
    coverage.addRow(['День','Время','Позиция','Нужно','Назначено','Дефицит','Избыток']);const {d,r}=report();r.coverage.forEach(x=>coverage.addRow([labels[P.DAYS.indexOf(x.day)],P.clock(x.start),P.ROLES[x.role],x.needed,x.assigned,x.missing,x.excess]));
    inputs.addRow(['День','Время','Выручка база','Выручка итог','Чеки','Поправка %','Источник чеков']);d.slots.forEach(x=>inputs.addRow([labels[P.DAYS.indexOf(x.day)],P.clock(x.start),x.baseRevenue,x.revenue,x.checks,x.percent,x.source]));
    for(const sheet of wb.worksheets){sheet.views=[{state:'frozen',ySplit:sheet===schedule?2:1,xSplit:1}];sheet.columns.forEach((col,i)=>col.width=i===0?32:18);sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};sheet.getRow(sheet===schedule?2:1).font={bold:true};}
    const url=URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`BK8-${state.week}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function mount(root,preview=false,week=monday()) {
    worker?.terminate();worker=null;job++;
    root.innerHTML='<p role="status">Загрузка планировщика…</p>';
    try {
      let loaded;
      if(preview){const employees=Array.from({length:8},(_,i)=>({employee_profile_id:i+1,employee_name:`Сотрудник ${i+1}`,work_type:'FT',availability:Object.fromEntries(P.DAYS.map(d=>[d,'ФТ'])),regular_days_off:{}}));loaded={employees,version:0,sourceHash:'demo',document:null};}
      else loaded=await rpc('planner_get_week',{p_week:week});
      state={root,preview,week,employees:loaded.employees,version:loaded.version,sourceHash:loaded.sourceHash,config:loaded.document?.config||P.defaults(),shifts:loaded.document?.shifts||[],stale:!!loaded.savedSourceHash&&loaded.savedSourceHash!==loaded.sourceHash,dirty:false,view:'inputs'};
      state.config.weekStart=week;
      state.invalidInputs={};
      state.config.weatherRules||=P.defaults().weatherRules;
      state.config.normMax??=140;
      if(!loaded.document&&loaded.defaults){const fresh=P.defaults();state.config={...fresh,...loaded.defaults,weekStart:week,forecasts:fresh.forecasts,events:[]};}
      if(preview){state.config.reviewed=true;state.config.spmh=150;P.DAYS.forEach(d=>state.config.forecasts[d]={revenue:10000,checks:600,averageCheck:null});state.employees.forEach(e=>state.config.skills[e.employee_profile_id]={roles:['kitchen','cashier'],training:false});}
      render();
    }catch(e){root.innerHTML=`<h1>Планировщик</h1><p role="alert">${escape(e.message)}</p><p>Если planner_get_week отсутствует, сначала требуется отдельная миграция 20261016_schedule_planner.sql. Данные ресторана не заменяются демонстрационными.</p><button id="retryPlanner">Повторить</button>`;root.querySelector('button').onclick=()=>mount(root,preview,week);}
  }
  window.BK8PlannerUI={mount};
  if(window.openPage){const previous=window.openPage;window.openPage=function(page){if(state?.dirty&&!confirm('В планировщике есть несохранённые изменения. Покинуть редактор?'))return;if(state)state.dirty=false;if(page!=='schedule'){worker?.terminate();worker=null;job++;return previous(page);}document.querySelector('#crumb').textContent='Планировщик расписания';document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='schedule'));return mount(document.querySelector('#content'));};}
  window.addEventListener('beforeunload',event=>{if(state?.dirty){event.preventDefault();event.returnValue='';}});
})();
