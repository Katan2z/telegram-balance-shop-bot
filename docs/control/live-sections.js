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
      root.innerHTML=`<div class="stats mini-stats"><div class="stat"><small>Товары</small><strong>${items.filter(x=>x.is_active).length}</strong></div><div class="stat"><small>Ожидают выдачи</small><strong>${purchases.filter(x=>x.status==='pending').length}</strong></div><div class="stat"><small>Всего покупок</small><strong>${purchases.length}</strong></div></div><h3>Последние покупки</h3>`+table(["Сотрудник","Товар","Стоимость","Код","Статус","Дата"],purchases.map(row=>`<tr><td>${esc(names.get(String(row.user_id))||row.user_id)}</td><td><strong>${esc(row.item_title)}</strong></td><td>${Number(row.price_coins||0)} мон.</td><td><code>${esc(row.receipt_code)}</code></td><td><span class="status ${row.status==='pending'?'orange':'green'}">${esc(row.status)}</span></td><td>${date(row.created_at)}</td></tr>`));
    }catch(error){fail(root,error);}
  }

  async function schedule() {
    const root=setPage("Расписание","Текущая неделя ресторана BK8");
    try{
      const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const week=monday.toISOString().slice(0,10);
      const rows=await api("rpc/schedule_get_week",{method:"POST",body:JSON.stringify({p_actor_id:actorId(),p_week_start:week})});
      const data=Array.isArray(rows)?rows:(rows?.employees||rows?.rows||[]);
      root.innerHTML=`<div class="section-summary">Неделя с <strong>${date(week)}</strong> · данные из рабочего расписания</div><pre class="schedule-preview">${esc(JSON.stringify(data,null,2))}</pre>`;
    }catch(error){fail(root,error);}
  }

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
      root.innerHTML=table(["Сотрудник","Должность","Telegram ID","Добавлен"],rows.map(row=>{const p=people.get(String(row.telegram_id))||{};return `<tr><td><strong>${esc(p.full_name||"Профиль не найден")}</strong></td><td>${esc(p.position||"—")}</td><td><code>${esc(row.telegram_id)}</code></td><td>${date(row.created_at)}</td></tr>`;}));
    }catch(error){fail(root,error);}
  }

  async function notifications() {
    const root=setPage("Уведомления","Каналы, которые видит бот");
    try{const chats=await api("chats?type=neq.private&select=*&order=title.asc");root.innerHTML=`<div class="section-summary">Бот зарегистрирован в <strong>${chats.length}</strong> чатах</div>`+table(["Название чата","Тип","Chat ID","Последний контакт"],chats.map(row=>`<tr><td><strong>${esc(row.title)}</strong></td><td>${esc(row.type)}</td><td><code>${esc(row.chat_id)}</code></td><td>${date(row.updated_at)}</td></tr>`));}catch(error){fail(root,error);}
  }

  const previousOpen=window.openPage;
  const routes={documents,klokr,shop,schedule,feedback,managers,notifications};
  window.openPage=function(page){if(routes[page]){activate(page);return routes[page]();}return previousOpen(page);};
})();
