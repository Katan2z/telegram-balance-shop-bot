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
        api("employee_pvv_documents?select=employee_profile_id,storage_path,file_name,mime_type,updated_at")
      ]);
      const med = new Map(medical.map(row => [String(row.employee_profile_id), row]));
      const docs = new Map(pvv.map(row => [String(row.employee_profile_id), row]));
      root.innerHTML = `<div class="section-summary"><strong>${employees.length}</strong> сотрудников · <strong>${medical.length}</strong> сансправок · <strong>${pvv.length}</strong> бланков ПВВ</div>` + table(["Сотрудник","Санитарная справка","Санминимум","Флюорография","ПВВ","Действия"], employees.map(employee => { const m=med.get(String(employee.id))||{}, p=docs.get(String(employee.id)); return `<tr><td><strong>${esc(employee.full_name)}</strong><small>${esc(employee.position||"")}</small></td><td>${date(m.sanitary_certificate_expires_on)}</td><td>${date(m.sanitary_minimum_expires_on)}</td><td>${date(m.fluorography_expires_on)}</td><td>${p?`<button class="secondary pvv-open" data-profile="${employee.id}">${esc(p.file_name||"Открыть")}</button>`:'<span class="status orange">Нет файла</span>'}</td><td><div class="row-actions"><button class="secondary medical-edit" data-profile="${employee.id}">Сроки</button><button class="secondary pvv-upload" data-profile="${employee.id}">${p?'Заменить ПВВ':'Загрузить ПВВ'}</button>${p?`<button class="secondary danger-action pvv-delete" data-profile="${employee.id}" title="Удалить ПВВ">×</button>`:''}</div></td></tr>`; }));
      root.querySelectorAll(".medical-edit").forEach(button=>button.onclick=()=>editMedical(Number(button.dataset.profile),med.get(String(button.dataset.profile))||{}));
      root.querySelectorAll(".pvv-open").forEach(button=>button.onclick=()=>openPvv(docs.get(String(button.dataset.profile))));
      root.querySelectorAll(".pvv-upload").forEach(button=>button.onclick=()=>editPvv(Number(button.dataset.profile),employees.find(row=>Number(row.id)===Number(button.dataset.profile)),docs.get(String(button.dataset.profile))));
      root.querySelectorAll(".pvv-delete").forEach(button=>button.onclick=()=>deletePvv(Number(button.dataset.profile),employees.find(row=>Number(row.id)===Number(button.dataset.profile)),docs.get(String(button.dataset.profile))));
    } catch (error) { fail(root,error); }
  }

  function editMedical(profileId,row){
    let dialog=document.querySelector("#medicalDialog");
    if(!dialog){document.body.insertAdjacentHTML("beforeend",'<dialog class="editor-dialog" id="medicalDialog"><form id="medicalForm"><div class="compose-head"><div><span class="eyebrow">САНИТАРНАЯ СПРАВКА</span><h2>Сроки документов</h2></div><button type="button" id="medicalClose">×</button></div><input type="hidden" id="medicalProfile"><label>Санитарная справка<input type="date" id="medicalCertificate"></label><label>Санминимум<input type="date" id="medicalMinimum"></label><label>Флюорография<input type="date" id="medicalFluoro"></label><button class="primary" type="submit">Сохранить</button></form></dialog>');dialog=document.querySelector("#medicalDialog");document.querySelector("#medicalClose").onclick=()=>dialog.close();document.querySelector("#medicalForm").onsubmit=async event=>{event.preventDefault();try{await api("employee_medical_records?on_conflict=employee_profile_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({employee_profile_id:Number(document.querySelector("#medicalProfile").value),sanitary_certificate_expires_on:document.querySelector("#medicalCertificate").value||null,sanitary_minimum_expires_on:document.querySelector("#medicalMinimum").value||null,fluorography_expires_on:document.querySelector("#medicalFluoro").value||null,updated_at:new Date().toISOString()})});dialog.close();toast("Сроки документов сохранены");documents()}catch(error){toast(error.message)}}}
    document.querySelector("#medicalProfile").value=profileId;document.querySelector("#medicalCertificate").value=row.sanitary_certificate_expires_on||"";document.querySelector("#medicalMinimum").value=row.sanitary_minimum_expires_on||"";document.querySelector("#medicalFluoro").value=row.fluorography_expires_on||"";dialog.showModal();
  }

  async function openPvv(row){
    if(!row?.storage_path)return;
    try{const active=window.bk8Session();const config=window.APP_CONFIG||{};const response=await fetch(`${String(config.SUPABASE_URL).replace(/\/$/,"")}/storage/v1/object/sign/employee-pvv/${row.storage_path.split('/').map(encodeURIComponent).join('/')}`,{method:"POST",headers:{apikey:config.SUPABASE_ANON_KEY,Authorization:`Bearer ${active.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600})});if(!response.ok)throw new Error(await response.text());const data=await response.json();window.open(`${String(config.SUPABASE_URL).replace(/\/$/,"")}/storage/v1${data.signedURL}`,'_blank','noopener');}catch(error){toast(error.message)}
  }

  function editPvv(profileId,employee,previous){
    let dialog=document.querySelector("#pvvDialog");
    if(!dialog){
      document.body.insertAdjacentHTML("beforeend",'<dialog class="editor-dialog" id="pvvDialog"><form id="pvvForm"><div class="compose-head"><div><span class="eyebrow">БЛАНК ПВВ</span><h2 id="pvvEmployeeName">Загрузка документа</h2></div><button type="button" id="pvvClose">×</button></div><input type="hidden" id="pvvProfile"><input type="hidden" id="pvvPreviousPath"><label>PDF или фотография<input type="file" id="pvvFile" accept="application/pdf,image/jpeg,image/png,image/webp" required></label><p class="muted">PDF, JPG, PNG или WEBP, не больше 15 МБ.</p><p id="pvvStatus" class="login-error"></p><button class="primary" type="submit">Загрузить и сохранить</button></form></dialog>');
      dialog=document.querySelector("#pvvDialog");
      document.querySelector("#pvvClose").onclick=()=>dialog.close();
      document.querySelector("#pvvForm").onsubmit=uploadPvv;
    }
    document.querySelector("#pvvProfile").value=profileId;
    document.querySelector("#pvvPreviousPath").value=previous?.storage_path||"";
    document.querySelector("#pvvEmployeeName").textContent=employee?.full_name||"Сотрудник";
    document.querySelector("#pvvFile").value="";
    document.querySelector("#pvvStatus").textContent="";
    dialog.showModal();
  }

  async function storage(path,options={}){
    const active=window.bk8Session();const config=window.APP_CONFIG||{};
    const response=await fetch(`${String(config.SUPABASE_URL).replace(/\/$/,"")}/storage/v1/${path}`,{...options,headers:{apikey:config.SUPABASE_ANON_KEY,Authorization:`Bearer ${active.access_token}`,...(options.headers||{})}});
    if(!response.ok)throw new Error(await response.text()||"Ошибка хранилища");
    return response.status===204?null:response.json().catch(()=>null);
  }

  async function uploadPvv(event){
    event.preventDefault();
    const file=document.querySelector("#pvvFile").files?.[0],status=document.querySelector("#pvvStatus"),button=event.currentTarget.querySelector('[type="submit"]');
    const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
    if(!file||!allowed.has(file.type)){status.textContent="Выбери PDF, JPG, PNG или WEBP.";return;}
    if(file.size>15*1024*1024){status.textContent="Файл больше 15 МБ.";return;}
    const profileId=Number(document.querySelector("#pvvProfile").value),previous=document.querySelector("#pvvPreviousPath").value;
    const extension=(file.name.split(".").pop()||"file").toLowerCase().replace(/[^a-z0-9]/g,"");
    const storagePath=`${profileId}/${crypto.randomUUID()}.${extension}`;
    button.disabled=true;status.textContent="Загружаю…";
    try{
      await storage(`object/employee-pvv/${storagePath}`,{method:"POST",headers:{"Content-Type":file.type,"x-upsert":"false"},body:file});
      await api("employee_pvv_documents?on_conflict=employee_profile_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({employee_profile_id:profileId,storage_path:storagePath,file_name:file.name,mime_type:file.type,size_bytes:file.size,updated_by:actorId(),updated_at:new Date().toISOString()})});
      if(previous)await storage(`object/employee-pvv/${previous}`,{method:"DELETE"}).catch(()=>{});
      document.querySelector("#pvvDialog").close();toast("Бланк ПВВ сохранён");documents();
    }catch(error){await storage(`object/employee-pvv/${storagePath}`,{method:"DELETE"}).catch(()=>{});status.textContent=error.message;}
    finally{button.disabled=false;}
  }

  async function klokr() {
    const root = setPage("КЛОКР", "Реальные оценки сотрудников");
    try {
      const [rows, employees] = await Promise.all([api("klokr_assessments?select=*&order=created_at.desc&limit=200"),api("employee_profiles?select=telegram_id,full_name")]);
      const names=new Map(employees.map(row=>[String(row.telegram_id),row.full_name]));
      root.innerHTML = `<div class="section-summary"><strong>${rows.length}</strong> оценок</div>` + table(["Сотрудник","Результат","Баллы","Дата","Комментарий",""], rows.map(row=>`<tr><td><strong>${esc(names.get(String(row.employee_id))||row.employee_id)}</strong></td><td><span class="score-live">${Number(row.percent||0)}%</span></td><td>${Number(row.total_score||0)} / ${Number(row.max_score||0)}</td><td>${date(row.created_at)}</td><td>${esc(row.comment||"—")}</td><td>${row.id!=null?`<button class="secondary danger-action klokr-delete" data-id="${esc(row.id)}" title="Удалить ошибочную оценку">×</button>`:''}</td></tr>`));
      root.querySelectorAll(".klokr-delete").forEach(button=>button.onclick=async()=>{if(!confirm("Удалить эту оценку КЛОКР?"))return;try{await api(`klokr_assessments?id=eq.${encodeURIComponent(button.dataset.id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});toast("Оценка удалена");klokr()}catch(error){toast(error.message)}});
    } catch(error){fail(root,error);}
  }

  async function deletePvv(profileId,employee,row){if(!row||!confirm(`Удалить бланк ПВВ сотрудника ${employee?.full_name||''}?`))return;try{await storage(`object/employee-pvv/${row.storage_path}`,{method:"DELETE"});await api(`employee_pvv_documents?employee_profile_id=eq.${profileId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});toast("Бланк ПВВ удалён");documents();}catch(error){toast(error.message)}}

  async function balances(){
    const root=setPage("Балансы","Спасибки, монеты и история начислений");
    try{
      const [employees,users,transactions]=await Promise.all([
        api("employee_profiles?select=id,telegram_id,full_name,position,activation_status&order=full_name.asc"),
        api("users?select=telegram_id,balance,coins,updated_at"),
        api("transactions?select=id,user_id,amount,type,comment,admin_id,created_at&order=created_at.desc&limit=100")
      ]);
      const people=new Map(employees.filter(row=>row.telegram_id).map(row=>[String(row.telegram_id),row]));
      const balances=users.map(user=>({...user,employee:people.get(String(user.telegram_id))})).filter(row=>row.employee);
      root.innerHTML=`<div class="stats mini-stats"><div class="stat"><small>Активных счетов</small><strong>${balances.length}</strong></div><div class="stat"><small>Всего спасибок</small><strong>${balances.reduce((sum,row)=>sum+Number(row.balance||0),0)}</strong></div><div class="stat"><small>Всего монет</small><strong>${balances.reduce((sum,row)=>sum+Number(row.coins||0),0)}</strong></div></div><div class="employee-tools"><input id="balanceSearch" placeholder="Найти сотрудника"><span id="balanceCount">${balances.length} сотрудников</span></div><div id="balanceTable"></div><h3>Последние операции</h3><div id="balanceHistory">${balanceHistory(transactions,people)}</div>`;
      const draw=query=>{const q=query.trim().toLowerCase(),shown=balances.filter(row=>`${row.employee.full_name} ${row.employee.position||''}`.toLowerCase().includes(q));document.querySelector("#balanceCount").textContent=`${shown.length} сотрудников`;document.querySelector("#balanceTable").innerHTML=table(["Сотрудник","Спасибки","Монеты","Обновлено",""],shown.map(row=>`<tr><td><strong>${esc(row.employee.full_name)}</strong><small>${esc(row.employee.position||"")}</small></td><td><span class="balance-number">${Number(row.balance||0)}</span></td><td><span class="coin-number">${Number(row.coins||0)}</span></td><td>${date(row.updated_at)}</td><td><button class="primary compact balance-adjust" data-user="${Number(row.telegram_id)}">Изменить</button></td></tr>`));document.querySelectorAll(".balance-adjust").forEach(button=>button.onclick=()=>editBalance(Number(button.dataset.user),balances.find(row=>Number(row.telegram_id)===Number(button.dataset.user))));};
      document.querySelector("#balanceSearch").oninput=event=>draw(event.target.value);draw("");
    }catch(error){fail(root,error)}
  }

  function balanceHistory(rows,people){
    return table(["Дата","Сотрудник","Изменение","Комментарий"],rows.map(row=>`<tr><td>${new Date(row.created_at).toLocaleString("ru-RU")}</td><td>${esc(people.get(String(row.user_id))?.full_name||row.user_id)}</td><td><strong class="${Number(row.amount)>=0?'amount-plus':'amount-minus'}">${Number(row.amount)>=0?'+':''}${Number(row.amount||0)}</strong></td><td>${esc(row.comment||row.type||"—")}</td></tr>`));
  }

  function editBalance(userId,row){
    let dialog=document.querySelector("#balanceDialog");
    if(!dialog){document.body.insertAdjacentHTML("beforeend",'<dialog class="editor-dialog" id="balanceDialog"><form id="balanceForm"><div class="compose-head"><div><span class="eyebrow">БАЛАНС СОТРУДНИКА</span><h2 id="balanceEmployee">Изменение</h2></div><button type="button" id="balanceClose">×</button></div><input type="hidden" id="balanceUser"><div class="balance-current"><span>Сейчас</span><strong id="balanceCurrent"></strong></div><label>Что изменить<select id="balanceKind"><option value="balance">Спасибки</option><option value="coins">Монеты</option></select></label><label>Операция<select id="balanceDirection"><option value="add">Начислить</option><option value="remove">Списать</option></select></label><label>Количество<input id="balanceAmount" type="number" min="1" max="100000" required></label><label>Причина<input id="balanceComment" maxlength="200" placeholder="Например: помощь коллеге" required></label><p id="balanceError" class="login-error"></p><button class="primary" type="submit">Подтвердить изменение</button></form></dialog>');dialog=document.querySelector("#balanceDialog");document.querySelector("#balanceClose").onclick=()=>dialog.close();document.querySelector("#balanceKind").onchange=()=>updateBalanceCurrent();document.querySelector("#balanceForm").onsubmit=saveBalance;}
    dialog.dataset.balance=String(Number(row.balance||0));dialog.dataset.coins=String(Number(row.coins||0));document.querySelector("#balanceUser").value=userId;document.querySelector("#balanceEmployee").textContent=row.employee.full_name;document.querySelector("#balanceAmount").value="";document.querySelector("#balanceComment").value="";document.querySelector("#balanceError").textContent="";updateBalanceCurrent();dialog.showModal();
  }

  function updateBalanceCurrent(){const dialog=document.querySelector("#balanceDialog"),kind=document.querySelector("#balanceKind").value;document.querySelector("#balanceCurrent").textContent=`${dialog.dataset[kind]||0} ${kind==='coins'?'монет':'спасибок'}`;}

  async function saveBalance(event){
    event.preventDefault();const dialog=document.querySelector("#balanceDialog"),userId=Number(document.querySelector("#balanceUser").value),kind=document.querySelector("#balanceKind").value,direction=document.querySelector("#balanceDirection").value,amount=Number(document.querySelector("#balanceAmount").value),comment=document.querySelector("#balanceComment").value.trim(),error=document.querySelector("#balanceError"),button=event.currentTarget.querySelector('[type="submit"]');
    if(!amount||amount<1||!comment){error.textContent="Укажи количество и причину.";return;}const delta=direction==='remove'?-amount:amount,current=Number(dialog.dataset[kind]||0);if(current+delta<0){error.textContent="Нельзя списать больше текущего баланса.";return;}button.disabled=true;
    try{if(kind==='balance'){await api("transactions",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:userId,amount:delta,type:"balance_change",comment:`АП: ${comment}`,admin_id:actorId(),created_at:new Date().toISOString()})});}else{await api(`users?telegram_id=eq.${userId}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({coins:current+delta,updated_at:new Date().toISOString()})});}dialog.close();toast(direction==='add'?"Начисление выполнено":"Списание выполнено");balances();}catch(cause){error.textContent=cause.message;}finally{button.disabled=false;}
  }

  async function shop() {
    const root=setPage("Магазин","Товары и выдача покупок");
    try{
      const [items,purchases,employees]=await Promise.all([api("shop_items?select=*&order=sort_order.asc"),api("shop_purchases?select=*&order=created_at.desc&limit=200"),api("employee_profiles?select=telegram_id,full_name")]);
      const names=new Map(employees.map(row=>[String(row.telegram_id),row.full_name]));
      root.innerHTML=`<div class="stats mini-stats"><div class="stat"><small>Товары</small><strong>${items.filter(x=>x.is_active).length}</strong></div><div class="stat"><small>Ожидают выдачи</small><strong>${purchases.filter(x=>x.status==='pending').length}</strong></div><div class="stat"><small>Всего покупок</small><strong>${purchases.length}</strong></div></div><div class="section-heading"><h3>Каталог наград</h3><button class="primary compact" id="shopItemAdd">＋ Добавить товар</button></div>`+table(["Товар","Описание","Цена","Статус",""],items.map(item=>`<tr><td><strong>${esc(item.emoji||'🎁')} ${esc(item.title)}</strong></td><td>${esc(item.description||'—')}</td><td>${Number(item.price_coins||0)} мон.</td><td><span class="status ${item.is_active?'green':'red'}">${item.is_active?'Активен':'Скрыт'}</span></td><td><button class="secondary shop-item-edit" data-item="${Number(item.id)}">Изменить</button></td></tr>`))+`<h3>Последние покупки</h3>`+table(["Сотрудник","Товар","Стоимость","Код","Статус","Дата","Действие"],purchases.map(row=>`<tr><td>${esc(names.get(String(row.user_id))||row.user_id)}</td><td><strong>${esc(row.item_title)}</strong></td><td>${Number(row.price_coins||0)} мон.</td><td><code>${esc(row.receipt_code)}</code></td><td><span class="status ${row.status==='pending'?'orange':'green'}">${esc(row.status)}</span></td><td>${date(row.created_at)}</td><td>${row.status==='pending'?`<button class="secondary redeem-live" data-purchase="${esc(row.id)}">Подтвердить</button>`:'—'}</td></tr>`));
      document.querySelector("#shopItemAdd").onclick=()=>editShopItem({id:0,is_active:true,sort_order:items.length+1});
      root.querySelectorAll(".shop-item-edit").forEach(button=>button.onclick=()=>editShopItem(items.find(item=>Number(item.id)===Number(button.dataset.item))));
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
    const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    await scheduleForWeek(monday.toISOString().slice(0,10),root);
  }

  async function scheduleForWeek(week,root=document.querySelector("#liveSection")){
    const monday=new Date(`${week}T12:00:00`);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    const normalized=monday.toISOString().slice(0,10);root.innerHTML='<div class="empty-live">Загрузка недели…</div>';
    try{const rows=await api("rpc/schedule_get_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:normalized})});renderScheduleEditor(root,normalized,rows);}catch(error){fail(root,error)}
  }

  function renderScheduleEditor(root,week,rows){
    const data=rows?.entries||[],days=[['mon','ПН'],['tue','ВТ'],['wed','СР'],['thu','ЧТ'],['fri','ПТ'],['sat','СБ'],['sun','ВС']];
    const status={collecting:"идёт сбор",open:"открыто",closed:"закрыто",published:"опубликовано"}[rows?.week?.status]||rows?.week?.status||"идёт сбор";
    const summary=days.map(day=>{const values=data.map(entry=>entry.final_schedule?.[day[0]]||entry.availability?.[day[0]]||'').filter(Boolean),off=values.filter(value=>/выход|отпуск|^от$/i.test(value)).length;return `<div><strong>${day[1]}</strong><span>${values.length-off} работают</span><small>${off} выходных</small></div>`}).join('');
    root.innerHTML=`<div class="schedule-topline"><div class="week-switcher"><button class="secondary" id="schedulePrev" title="Предыдущая неделя">←</button><label>Неделя<input id="scheduleWeek" type="date" value="${week}"></label><button class="secondary" id="scheduleNext" title="Следующая неделя">→</button></div><div class="schedule-main-actions"><button class="secondary" id="scheduleExport">Скачать Excel</button><button class="secondary" id="scheduleSaveAll">Сохранить всё</button><button class="primary compact" id="schedulePublish">Опубликовать</button></div></div><div class="schedule-access"><div>Неделя с <strong>${date(week)}</strong> · статус: <strong>${esc(status)}</strong> · ${data.length} сотрудников</div><div><button class="secondary" id="scheduleOpen">Разблокировать заполнение</button><button class="secondary" id="scheduleClose">Заблокировать</button></div></div><div class="coverage-strip">${summary}</div><datalist id="schedulePresets"><option value="Выходной"><option value="ФТ"><option value="08:00–17:00"><option value="09:00–18:00"><option value="10:00–19:00"><option value="12:00–21:00"><option value="15:00–00:00"></datalist><div class="live-table-wrap schedule-table-wrap"><table class="schedule-grid"><thead><tr><th>Сотрудник</th>${days.map(day=>`<th>${day[1]}</th>`).join('')}<th>Комментарий</th><th></th></tr></thead><tbody>${data.map(entry=>`<tr data-schedule-row="${Number(entry.employee_profile_id)}"><td><strong>${esc(entry.employee_name)}</strong><small>${esc(entry.work_type||'')}</small></td>${days.map(day=>{const value=entry.final_schedule?.[day[0]]||entry.availability?.[day[0]]||'';return `<td><input list="schedulePresets" data-day="${day[0]}" value="${esc(value)}" class="${/выход|отпуск|^от$/i.test(value)?'day-off-cell':''}"></td>`}).join('')}<td><input data-comment value="${esc(entry.comment||'')}"></td><td><button class="secondary schedule-save">Сохранить</button></td></tr>`).join('')||'<tr><td colspan="10" class="empty-live">На эту неделю сотрудников нет</td></tr>'}</tbody></table></div>`;
    root.querySelector("#scheduleWeek").onchange=event=>scheduleForWeek(event.target.value,root);
    root.querySelector("#schedulePrev").onclick=()=>scheduleForWeek(moveWeek(week,-7),root);
    root.querySelector("#scheduleNext").onclick=()=>scheduleForWeek(moveWeek(week,7),root);
    root.querySelectorAll(".schedule-save").forEach(button=>button.onclick=()=>saveScheduleRow(button.closest("tr"),week));
    root.querySelectorAll("[data-day]").forEach(input=>input.oninput=()=>input.classList.toggle("day-off-cell",/выход|отпуск|^от$/i.test(input.value.trim())));
    root.querySelector("#scheduleSaveAll").onclick=async event=>{const button=event.currentTarget,tableRows=[...root.querySelectorAll("[data-schedule-row]")];button.disabled=true;button.textContent="Сохраняю…";const results=await Promise.all(tableRows.map(row=>saveScheduleRow(row,week,true)));button.disabled=false;button.textContent="Сохранить всё";toast(results.every(Boolean)?"Всё расписание сохранено":"Часть строк не удалось сохранить");};
    root.querySelector("#scheduleExport").onclick=()=>exportSchedule(week,data,days);
    root.querySelector("#scheduleOpen").onclick=()=>setScheduleAccess(week,true);
    root.querySelector("#scheduleClose").onclick=()=>setScheduleAccess(week,false);
    root.querySelector("#schedulePublish").onclick=async()=>{try{await api("rpc/schedule_publish_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week})});toast("Расписание опубликовано");scheduleForWeek(week,root);}catch(error){toast(error.message)}};
  }

  function editShopItem(item){
    let dialog=document.querySelector("#shopItemDialog");if(!dialog){document.body.insertAdjacentHTML("beforeend",'<dialog class="editor-dialog" id="shopItemDialog"><form id="shopItemForm"><div class="compose-head"><div><span class="eyebrow">МАГАЗИН</span><h2>Карточка награды</h2></div><button type="button" id="shopItemClose">×</button></div><input type="hidden" id="shopItemId"><label>Название<input id="shopItemTitle" required maxlength="100"></label><label>Описание<input id="shopItemDescription" maxlength="300"></label><div class="form-pair"><label>Эмодзи<input id="shopItemEmoji" maxlength="8"></label><label>Цена в монетах<input id="shopItemPrice" type="number" min="1" required></label></div><label>Ссылка на изображение<input id="shopItemImage" type="url"></label><label class="switch-row"><span><strong>Показывать в магазине</strong><small>Скрытый товар нельзя купить</small></span><input id="shopItemActive" type="checkbox"></label><div class="dialog-error" id="shopItemError" role="alert"></div><button class="primary" type="submit">Сохранить товар</button></form></dialog>');dialog=document.querySelector("#shopItemDialog");document.querySelector("#shopItemClose").onclick=()=>dialog.close();document.querySelector("#shopItemForm").onsubmit=saveShopItem;}
    document.querySelector("#shopItemId").value=item.id||0;document.querySelector("#shopItemTitle").value=item.title||"";document.querySelector("#shopItemDescription").value=item.description||"";document.querySelector("#shopItemEmoji").value=item.emoji||"🎁";document.querySelector("#shopItemPrice").value=item.price_coins||"";document.querySelector("#shopItemImage").value=item.image_url||"";document.querySelector("#shopItemActive").checked=item.is_active!==false;document.querySelector("#shopItemError").textContent="";dialog.showModal();
  }

  async function saveShopItem(event){event.preventDefault();const id=Number(document.querySelector("#shopItemId").value),payload={p_actor_id:actorId(),p_item_id:id||null,p_title:document.querySelector("#shopItemTitle").value.trim(),p_description:document.querySelector("#shopItemDescription").value.trim(),p_emoji:document.querySelector("#shopItemEmoji").value.trim()||"🎁",p_price_coins:Number(document.querySelector("#shopItemPrice").value),p_image_url:document.querySelector("#shopItemImage").value.trim()||null,p_is_active:document.querySelector("#shopItemActive").checked},errorBox=document.querySelector("#shopItemError");const button=event.currentTarget.querySelector('[type="submit"]');errorBox.textContent="";button.disabled=true;try{await api("rpc/admin_save_shop_item",{method:"POST",body:JSON.stringify(payload)});document.querySelector("#shopItemDialog").close();toast(id?"Товар обновлён":"Товар добавлен");shop();}catch(error){let message=error.message;try{const parsed=JSON.parse(message);message=parsed.message||parsed.hint||message}catch(_){}if(message.includes("admin_save_shop_item"))message="Нужно применить обновление базы данных для магазина.";errorBox.textContent=`Не удалось сохранить: ${message}`;}finally{button.disabled=false}}

  function moveWeek(week,days){const value=new Date(`${week}T12:00:00`);value.setDate(value.getDate()+days);return value.toISOString().slice(0,10)}

  async function exportSchedule(week,data,days){
    if(!window.ExcelJS){toast("Модуль Excel ещё загружается");return;}
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Расписание");const start=new Date(`${week}T12:00:00`),end=new Date(start);end.setDate(end.getDate()+6);
    sheet.mergeCells(1,1,1,10);sheet.getCell(1,1).value=`Расписание с ${start.toLocaleDateString("ru-RU")} по ${end.toLocaleDateString("ru-RU")}`;sheet.getCell(1,1).font={bold:true,size:14};sheet.getCell(1,1).alignment={horizontal:"center"};
    sheet.addRow(["№","Сотрудник",...days.map((day,index)=>{const value=new Date(start);value.setDate(value.getDate()+index);return `${day[1]} ${value.toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit"})}`}),"Комментарий","Ознакомлен (подпись)"]);
    data.forEach((entry,index)=>sheet.addRow([index+1,entry.employee_name,...days.map(day=>entry.final_schedule?.[day[0]]||entry.availability?.[day[0]]||""),entry.comment||"",""]));
    sheet.columns=[{width:5},{width:30},...days.map(()=>({width:18})),{width:28},{width:22}];sheet.views=[{state:"frozen",xSplit:2,ySplit:2}];sheet.getRow(2).font={bold:true};sheet.getRow(2).alignment={horizontal:"center",vertical:"middle",wrapText:true};sheet.eachRow(row=>row.eachCell(cell=>{cell.border={top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"}};cell.alignment={...cell.alignment,vertical:"middle",wrapText:true}}));
    const buffer=await workbook.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),link=document.createElement("a");link.href=url;link.download=`Расписание_${week}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function saveScheduleRow(row,week,quiet=false){
    const values={};row.querySelectorAll("[data-day]").forEach(input=>values[input.dataset.day]=input.value.trim());
    const button=row.querySelector(".schedule-save");button.disabled=true;
    try{await api("rpc/schedule_save_entry",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week,p_employee_profile_id:Number(row.dataset.scheduleRow),p_mode:"final",p_values:values,p_comment:row.querySelector("[data-comment]").value.trim()})});if(!quiet)toast("Строка сохранена");return true;}
    catch(error){if(!quiet)toast(error.message);return false}finally{button.disabled=false}
  }

  async function setScheduleAccess(week,open){try{await api("rpc/schedule_set_input_access",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week,p_open:open})});toast(open?"Заполнение открыто":"Заполнение закрыто");scheduleForWeek(week);}catch(error){toast(error.message)}}

  async function feedback() {
    const root=setPage("Жалобы и предложения","Обращения сотрудников BK8");
    try{
      const result=await api("rpc/feedback_list",{method:"POST",body:JSON.stringify({p_actor_id:actorId()})});
      const rows=Array.isArray(result)?result:[];
      root.innerHTML=`<div class="section-summary"><strong>${rows.length}</strong> обращений · удаляй только рассмотренные сообщения и спам</div>`+table(["Сотрудник","Тип","Сообщение","Дата",""],rows.map(row=>`<tr><td><strong>${esc(row.employee_name)}</strong></td><td><span class="status orange">${esc(row.kind)}</span></td><td>${esc(row.message)}</td><td>${date(row.created_at)}</td><td><button class="secondary danger-action feedback-delete" data-id="${Number(row.id)}">Удалить</button></td></tr>`));
      root.querySelectorAll(".feedback-delete").forEach(button=>button.onclick=async()=>{if(!confirm("Удалить рассмотренное обращение? Вернуть его будет нельзя."))return;button.disabled=true;try{await api("rpc/feedback_delete",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_feedback_id:Number(button.dataset.id)})});toast("Обращение удалено");feedback()}catch(error){button.disabled=false;toast(error.message.includes("feedback_delete")?"Сначала примени миграцию управления обращениями":error.message)}});
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
      const channels=[
        {id:'manager',title:'Задачи менеджеров',description:'Новые задачи для менеджеров и администраторов.',enabled:'manager_task_notify_enabled',chat:'task_notify_chat_id',thread:'task_notify_thread_id'},
        {id:'instructor',title:'Задачи инструкторов',description:'Новые задачи, назначенные инструкторам.',enabled:'instructor_task_notify_enabled',chat:'instructor_notify_chat_id',thread:'instructor_notify_thread_id'},
        {id:'schedule',title:'Незаполненное расписание',description:'С воскресенья напоминает сотрудникам, которые ещё не внесли временные.',enabled:'schedule_notify_enabled',chat:'schedule_notify_chat_id',thread:'schedule_notify_thread_id',interval:true}
      ];
      root.innerHTML=`<div class="notification-guide"><strong>Как это работает</strong><span>Включи сценарий → выбери чат → при необходимости укажи ID темы → сохрани. Значение 0 отправляет сообщение в общий чат.</span></div><div class="section-summary">Бот видит <strong>${chats.length}</strong> групп и каналов</div><div class="notification-grid">${channels.map(item=>`<article class="notification-card" data-channel="${item.id}" data-enabled-key="${item.enabled}" data-chat-key="${item.chat}" data-thread-key="${item.thread}"><div class="notification-title"><div><strong>${item.title}</strong><small>${item.description}</small></div><span class="status ${values.get(item.enabled)==='0'?'red':'green'}">${values.get(item.enabled)==='0'?'Выключено':'Работает'}</span></div><label class="switch-row"><span><strong>Постоянные уведомления</strong><small>Бот будет работать автоматически</small></span><input data-enabled type="checkbox" ${values.get(item.enabled)!=='0'?'checked':''}></label><label>Куда отправлять<select data-chat><option value="">Выберите чат</option>${chats.map(chat=>`<option value="${chat.chat_id}" ${String(values.get(item.chat))===String(chat.chat_id)?'selected':''}>${esc(chat.title||`Чат ${chat.chat_id}`)}</option>`).join('')}</select></label><label>Тема Telegram <small>(необязательно)</small><input data-thread type="number" min="0" placeholder="0 — без темы" value="${esc(values.get(item.thread)||0)}"></label>${item.interval?`<label>Повторять<select data-interval><option value="1" ${values.get('schedule_notify_interval_hours')==='1'?'selected':''}>Каждый час</option><option value="2" ${values.get('schedule_notify_interval_hours')==='2'?'selected':''}>Каждые 2 часа</option><option value="4" ${!values.get('schedule_notify_interval_hours')||values.get('schedule_notify_interval_hours')==='4'?'selected':''}>Каждые 4 часа</option><option value="6" ${values.get('schedule_notify_interval_hours')==='6'?'selected':''}>Каждые 6 часов</option><option value="12" ${values.get('schedule_notify_interval_hours')==='12'?'selected':''}>Каждые 12 часов</option></select></label>`:''}<button class="primary compact save-notification">Сохранить сценарий</button><small class="notification-saved"></small></article>`).join('')}</div>`;
      root.querySelectorAll(".save-notification").forEach(button=>button.onclick=async()=>{
        const card=button.closest("[data-channel]");button.disabled=true;
        try{if(!card.querySelector("[data-chat]").value)throw new Error("Сначала выбери чат");const now=new Date().toISOString(),payload=[{key:card.dataset.enabledKey,value:card.querySelector("[data-enabled]").checked?'1':'0',updated_at:now},{key:card.dataset.chatKey,value:card.querySelector("[data-chat]").value,updated_at:now},{key:card.dataset.threadKey,value:card.querySelector("[data-thread]").value||'0',updated_at:now}];const interval=card.querySelector("[data-interval]");if(interval)payload.push({key:'schedule_notify_interval_hours',value:interval.value,updated_at:now});await api("bot_settings?on_conflict=key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload)});card.querySelector(".notification-saved").textContent=`Сохранено ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}`;toast("Сценарий уведомлений сохранён");notifications();}catch(error){toast(error.message)}finally{button.disabled=false}
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
  const routes={documents,klokr,balances,shop,schedule,feedback,managers,notifications,settings:settingsLive};
  window.openPage=function(page){if(routes[page]){activate(page);return routes[page]();}return previousOpen(page);};
})();
