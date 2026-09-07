(function () {
  const api = (...args) => window.bk8Api(...args);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const profile = () => window.bk8Session()?.profile || {};
  const actorId = () => profile().admin_role === "super_admin" ? 818748106 : 1217248152;
  const setPage = (title, subtitle) => {
    document.querySelector("#crumb").textContent = title;
    content.innerHTML = `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><button class="secondary" onclick="location.reload()">↻ Обновить</button></div><div class="panel live-section" id="liveSection"><div class="empty-live">Загрузка…</div></div>`;
    return document.querySelector("#liveSection");
  };
  const activate = page => nav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  const fail = (root, error) => { root.innerHTML = `<div class="empty-live">Не удалось загрузить раздел<br><small>${esc(error.message)}</small></div>`; };
  const table = (headers, rows) => `<div class="live-table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  const date = value => value ? new Date(value).toLocaleDateString("ru-RU") : "—";

  async function documents() {
    const root = setPage("Документы", "Санитарные справки и бланки ПВВ");
    try {
      const [employees, medical, pvv] = await Promise.all([
        api("employee_profiles?select=id,full_name,position&order=full_name.asc"),
        api("employee_medical_records?select=*"),
        api("employee_pvv_documents?select=employee_profile_id,file_name,mime_type,updated_at")
      ]);
      const med = new Map(medical.map(row => [String(row.employee_profile_id), row]));
      const docs = new Map(pvv.map(row => [String(row.employee_profile_id), row]));
      root.innerHTML = `<div class="section-summary"><strong>${employees.length}</strong> сотрудников · <strong>${medical.length}</strong> сансправок · <strong>${pvv.length}</strong> бланков ПВВ</div>` + table(["Сотрудник","Санитарная справка","Санминимум","Флюорография","ПВВ"], employees.map(employee => { const m=med.get(String(employee.id))||{}, p=docs.get(String(employee.id)); return `<tr><td><strong>${esc(employee.full_name)}</strong><small>${esc(employee.position||"")}</small></td><td>${date(m.sanitary_certificate_expires_on)}</td><td>${date(m.sanitary_minimum_expires_on)}</td><td>${date(m.fluorography_expires_on)}</td><td>${p?`<span class="status green">${esc(p.file_name||"Загружен")}</span>`:'<span class="status orange">Нет файла</span>'}</td></tr>`; }));
    } catch (error) { fail(root,error); }
  }

  async function klokr() {
    const root = setPage("КЛОКР", "Реальные оценки сотрудников");
    try {
      const [rows, employees] = await Promise.all([api("klokr_assessments?select=*&order=created_at.desc&limit=200"),api("employee_profiles?select=telegram_id,full_name")]);
      const names=new Map(employees.map(row=>[String(row.telegram_id),row.full_name]));
      root.innerHTML = `<div class="section-summary"><strong>${rows.length}</strong> оценок</div>` + table(["Сотрудник","Результат","Баллы","Дата","Комментарий"], rows.map(row=>`<tr><td><strong>${esc(names.get(String(row.employee_id))||row.employee_id)}</strong></td><td><span class="score-live">${Number(row.percent||0)}%</span></td><td>${Number(row.total_score||0)} / ${Number(row.max_score||0)}</td><td>${date(row.created_at)}</td><td>${esc(row.comment||"—")}</td></tr>`));
    } catch(error){fail(root,error);}
  }

  async function shop() {
    const root=setPage("Магазин","Товары и выдача покупок");
    try{
      const [items,purchases,employees]=await Promise.all([api("shop_items?select=*&order=sort_order.asc"),api("shop_purchases?select=*&order=created_at.desc&limit=200"),api("employee_profiles?select=telegram_id,full_name")]);
      const names=new Map(employees.map(row=>[String(row.telegram_id),row.full_name]));
      root.innerHTML=`<div class="stats mini-stats"><div class="stat"><small>Товары</small><strong>${items.filter(x=>x.is_active).length}</strong></div><div class="stat"><small>Ожидают выдачи</small><strong>${purchases.filter(x=>x.status==='pending').length}</strong></div><div class="stat"><small>Всего покупок</small><strong>${purchases.length}</strong></div></div><h3>Последние покупки</h3>`+table(["Сотрудник","Товар","Стоимость","Код","Статус","Дата","Действие"],purchases.map(row=>`<tr><td>${esc(names.get(String(row.user_id))||row.user_id)}</td><td><strong>${esc(row.item_title)}</strong></td><td>${Number(row.price_coins||0)} мон.</td><td><code>${esc(row.receipt_code)}</code></td><td><span class="status ${row.status==='pending'?'orange':'green'}">${esc(row.status)}</span></td><td>${date(row.created_at)}</td><td>${row.status==='pending'?`<button class="secondary redeem-live" data-purchase="${esc(row.id)}">Подтвердить</button>`:'—'}</td></tr>`));
      root.querySelectorAll("[data-purchase]").forEach(button=>button.onclick=async()=>{
        if(!confirm("Подтвердить выдачу покупки?"))return;
        button.disabled=true;
        try{await api("rpc/redeem_shop_purchase",{method:"POST",body:JSON.stringify({p_purchase_id:String(button.dataset.purchase),p_manager_id:actorId()})});toast("Выдача подтверждена");shop();}
        catch(error){button.disabled=false;toast(error.message);}
      });
    }catch(error){fail(root,error);}
  }

  async function schedule() {
    const root=setPage("Расписание","Текущая неделя ресторана BK8");
    try{
      const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const week=monday.toISOString().slice(0,10);
      const rows=await api("rpc/schedule_get_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week})});
      const data=rows?.entries||[];
      const days=[['mon','ПН'],['tue','ВТ'],['wed','СР'],['thu','ЧТ'],['fri','ПТ'],['sat','СБ'],['sun','ВС']];
      root.innerHTML=`<div class="schedule-toolbar"><label>Неделя<input id="scheduleWeek" type="date" value="${week}"></label><div><button class="secondary" id="scheduleOpen">Разблокировать</button><button class="secondary" id="scheduleClose">Заблокировать</button><button class="primary compact" id="schedulePublish">Опубликовать</button></div></div><div class="section-summary">Статус: <strong>${esc(rows?.week?.status||"collecting")}</strong> · ${data.length} сотрудников</div><div class="live-table-wrap"><table class="schedule-grid"><thead><tr><th>Сотрудник</th>${days.map(day=>`<th>${day[1]}</th>`).join('')}<th>Комментарий</th><th></th></tr></thead><tbody>${data.map(entry=>`<tr data-schedule-row="${Number(entry.employee_profile_id)}"><td><strong>${esc(entry.employee_name)}</strong><small>${esc(entry.work_type||'')}</small></td>${days.map(day=>`<td><input data-day="${day[0]}" value="${esc(entry.final_schedule?.[day[0]]||'')}"></td>`).join('')}<td><input data-comment value="${esc(entry.comment||'')}"></td><td><button class="secondary schedule-save">Сохранить</button></td></tr>`).join('')}</tbody></table></div>`;
      document.querySelector("#scheduleWeek").onchange=event=>scheduleForWeek(event.target.value);
      root.querySelectorAll(".schedule-save").forEach(button=>button.onclick=()=>saveScheduleRow(button.closest("tr"),week));
      document.querySelector("#scheduleOpen").onclick=()=>setScheduleAccess(week,true);
      document.querySelector("#scheduleClose").onclick=()=>setScheduleAccess(week,false);
      document.querySelector("#schedulePublish").onclick=async()=>{try{await api("rpc/schedule_publish_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week})});toast("Расписание опубликовано");schedule();}catch(error){toast(error.message)}};
    }catch(error){fail(root,error);}
  }

  async function scheduleForWeek(week){
    const monday=new Date(`${week}T12:00:00`);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    const normalized=monday.toISOString().slice(0,10);const root=document.querySelector("#liveSection");root.innerHTML='<div class="empty-live">Загрузка недели…</div>';
    try{const rows=await api("rpc/schedule_get_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:normalized})});const data=rows?.entries||[];root.innerHTML=`<div class="section-summary">Неделя с <strong>${date(normalized)}</strong></div><pre class="schedule-preview">${esc(JSON.stringify(data,null,2))}</pre><button class="secondary" onclick="openPage('schedule')">Вернуться к редактору текущей недели</button>`;}catch(error){fail(root,error)}
  }

  async function saveScheduleRow(row,week){
    const values={};row.querySelectorAll("[data-day]").forEach(input=>values[input.dataset.day]=input.value.trim());
    const button=row.querySelector(".schedule-save");button.disabled=true;
    try{await api("rpc/schedule_save_entry",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week,p_employee_profile_id:Number(row.dataset.scheduleRow),p_mode:"final",p_values:values,p_comment:row.querySelector("[data-comment]").value.trim()})});toast("Строка сохранена");}
    catch(error){toast(error.message)}finally{button.disabled=false}
  }

  async function setScheduleAccess(week,open){try{await api("rpc/schedule_set_input_access",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week,p_open:open})});toast(open?"Заполнение открыто":"Заполнение закрыто");schedule();}catch(error){toast(error.message)}}

  async function feedback() {
    const root=setPage("Жалобы и предложения","Обращения сотрудников BK8");
    try{
      const result=await api("rpc/feedback_list",{method:"POST",body:JSON.stringify({p_actor_id:actorId()})});
      const rows=Array.isArray(result)?result:[];
      root.innerHTML=table(["Сотрудник","Тип","Сообщение","Дата"],rows.map(row=>`<tr><td><strong>${esc(row.employee_name)}</strong></td><td><span class="status orange">${esc(row.kind)}</span></td><td>${esc(row.message)}</td><td>${date(row.created_at)}</td></tr>`));
    }catch(error){fail(root,error);}
  }

  async function managers() {
    const root=setPage("Доступы","Администраторы и менеджеры");
    if(profile().admin_role!=="super_admin"){root.innerHTML='<div class="empty-live">Доступ есть только у суперадминистратора</div>';return;}
    try{
      const [rows,employees]=await Promise.all([api("managers?select=*&order=created_at.asc"),api("employee_profiles?select=telegram_id,full_name,position")]);
      const people=new Map(employees.map(row=>[String(row.telegram_id),row]));
      root.innerHTML=`<div class="manager-actions"><select id="managerEmployee"><option value="">Выберите активного сотрудника</option>${employees.filter(employee=>employee.telegram_id&&!rows.some(row=>String(row.telegram_id)===String(employee.telegram_id))).map(employee=>`<option value="${employee.telegram_id}">${esc(employee.full_name)}</option>`).join('')}</select><button class="primary compact" id="managerAdd">Дать доступ</button></div>`+table(["Сотрудник","Должность","Telegram ID","Добавлен",""],rows.map(row=>{const p=people.get(String(row.telegram_id))||{};return `<tr><td><strong>${esc(p.full_name||"Профиль не найден")}</strong></td><td>${esc(p.position||"—")}</td><td><code>${esc(row.telegram_id)}</code></td><td>${date(row.created_at)}</td><td>${Number(row.telegram_id)!==818748106?`<button class="secondary manager-remove" data-manager="${Number(row.telegram_id)}">Убрать</button>`:'Суперадмин'}</td></tr>`;}));
      document.querySelector("#managerAdd").onclick=async()=>{const id=Number(document.querySelector("#managerEmployee").value);if(!id)return toast("Выберите сотрудника");try{await api("managers?on_conflict=telegram_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:id,created_by:actorId(),created_at:new Date().toISOString()})});toast("Доступ менеджера выдан");managers()}catch(error){toast(error.message)}};
      root.querySelectorAll("[data-manager]").forEach(button=>button.onclick=async()=>{if(!confirm("Убрать доступ менеджера?"))return;try{await api(`managers?telegram_id=eq.${Number(button.dataset.manager)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});toast("Доступ убран");managers()}catch(error){toast(error.message)}});
    }catch(error){fail(root,error);}
  }

  async function notifications() {
    const root=setPage("Уведомления","Каналы, которые видит бот");
    try{
      const [chats,settings]=await Promise.all([api("chats?type=neq.private&select=*&order=title.asc"),api("bot_settings?select=key,value")]);
      const values=new Map(settings.map(row=>[row.key,row.value]));
      const channels=[['manager','Задачи менеджеров','manager_task_notify_enabled','task_notify_chat_id','task_notify_thread_id'],['instructor','Задачи инструкторов','instructor_task_notify_enabled','instructor_notify_chat_id','instructor_notify_thread_id'],['schedule','Напоминания расписания','schedule_notify_enabled','schedule_notify_chat_id','schedule_notify_thread_id']];
      root.innerHTML=`<div class="section-summary">Бот зарегистрирован в <strong>${chats.length}</strong> чатах</div><div class="notification-grid">${channels.map(item=>`<article class="notification-card" data-channel="${item[0]}" data-enabled-key="${item[2]}" data-chat-key="${item[3]}" data-thread-key="${item[4]}"><div><strong>${item[1]}</strong><small>Куда бот отправляет сообщения</small></div><label class="inline-switch"><input data-enabled type="checkbox" ${values.get(item[2])==='1'?'checked':''}> Включено</label><label>Чат<select data-chat>${chats.map(chat=>`<option value="${chat.chat_id}" ${String(values.get(item[3]))===String(chat.chat_id)?'selected':''}>${esc(chat.title)}</option>`).join('')}</select></label><label>ID темы<input data-thread type="number" min="0" value="${esc(values.get(item[4])||0)}"></label><button class="secondary save-notification">Сохранить</button></article>`).join('')}</div>`;
      root.querySelectorAll(".save-notification").forEach(button=>button.onclick=async()=>{
        const card=button.closest("[data-channel]");button.disabled=true;
        try{const payload=[{key:card.dataset.enabledKey,value:card.querySelector("[data-enabled]").checked?'1':'0',updated_at:new Date().toISOString()},{key:card.dataset.chatKey,value:card.querySelector("[data-chat]").value,updated_at:new Date().toISOString()},{key:card.dataset.threadKey,value:card.querySelector("[data-thread]").value||'0',updated_at:new Date().toISOString()}];await api("bot_settings?on_conflict=key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload)});toast("Настройки уведомлений сохранены");}catch(error){toast(error.message)}finally{button.disabled=false}
      });
    }catch(error){fail(root,error);}
  }

  async function settings(){
    const root=setPage("Настройки","Параметры ресторана BK8");
    try{const rows=await api("schedule_settings?select=*");const limit=rows[0]?.max_regular_days_off??3;root.innerHTML=`<div class="settings-live"><article><h3>Ограничение выходных</h3><p class="muted">Сколько сотрудников одновременно могут выбрать обычный выходной.</p><label>Максимум сотрудников<input id="dayOffLimit" type="number" min="1" max="20" value="${Number(limit)}"></label><button class="primary compact" id="saveDayOffLimit">Сохранить</button></article><article><h3>Ресторан</h3><p><strong>BK8</strong></p><p class="muted">Все существующие данные сейчас относятся к этому ресторану.</p></article></div>`;document.querySelector("#saveDayOffLimit").onclick=async()=>{try{await api("rpc/schedule_save_settings",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_max_regular_days_off:Number(document.querySelector("#dayOffLimit").value)})});toast("Настройка сохранена")}catch(error){toast(error.message)}};}catch(error){fail(root,error)}
  }

  async function settingsLive(){
    const root=setPage("Настройки","Параметры ресторана BK8");
    try{const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const scheduleData=await api("rpc/schedule_get_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:monday.toISOString().slice(0,10)})});const limit=scheduleData?.max_regular_days_off??3;root.innerHTML=`<div class="settings-live"><article><h3>Ограничение выходных</h3><p class="muted">Сколько сотрудников одновременно могут выбрать обычный выходной.</p><label>Максимум сотрудников<input id="dayOffLimit" type="number" min="1" max="20" value="${Number(limit)}"></label><button class="primary compact" id="saveDayOffLimit">Сохранить</button></article><article><h3>Ресторан</h3><p><strong>BK8</strong></p><p class="muted">Все существующие данные сейчас относятся к этому ресторану.</p></article></div>`;document.querySelector("#saveDayOffLimit").onclick=async()=>{try{await api("rpc/schedule_save_settings",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_max_regular_days_off:Number(document.querySelector("#dayOffLimit").value)})});toast("Настройка сохранена")}catch(error){toast(error.message)}};}catch(error){fail(root,error)}
  }

  const previousOpen=window.openPage;
  const routes={documents,klokr,shop,schedule,feedback,managers,notifications,settings:settingsLive};
  window.openPage=function(page){if(routes[page]){activate(page);return routes[page]();}return previousOpen(page);};
})();
