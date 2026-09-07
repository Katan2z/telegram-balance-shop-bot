(function () {
  const originalEnterPanel = window.enterPanel;
  const originalOpenPage = window.openPage;
  const originalOverview = window.renderOverview;
  const originalTasks = window.renderTasks;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);

  function session() {
    try { return JSON.parse(sessionStorage.getItem("bk8_admin_session") || "null"); }
    catch (_) { return null; }
  }

  async function api(path, options = {}) {
    const active = session();
    const config = window.APP_CONFIG || {};
    if (!active?.access_token) throw new Error("Сессия завершена. Войдите снова.");
    const response = await fetch(`${String(config.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${active.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (response.status === 401) throw new Error("Сессия завершена. Войдите снова.");
    if (!response.ok) throw new Error(await response.text() || "Не удалось загрузить данные");
    if (response.status === 204 || options.headers?.Prefer === "return=minimal") return null;
    return response.json();
  }
  window.bk8Api = api;
  window.bk8Session = session;

  function showLoadError(error) {
    console.error(error);
    window.showDemo?.("Не удалось загрузить данные");
  }

  async function loadOverview() {
    const [profiles, medical, tasks, purchases] = await Promise.all([
      api("employee_profiles?select=id,activation_status,full_name,position,restaurant"),
      api("employee_medical_records?select=employee_profile_id,sanitary_certificate_expires_on,sanitary_minimum_expires_on,fluorography_expires_on"),
      api("admin_tasks?select=id,completed,due_at"),
      api("shop_purchases?select=id,status")
    ]);
    const active = profiles.filter(item => item.activation_status === "active");
    const now = new Date();
    const soon = new Date(now); soon.setDate(soon.getDate() + 30);
    const expiring = medical.filter(row => [row.sanitary_certificate_expires_on, row.sanitary_minimum_expires_on, row.fluorography_expires_on]
      .some(value => value && new Date(value) >= now && new Date(value) <= soon)).length;
    const openTasks = tasks.filter(item => !item.completed).length;
    const stats = document.querySelectorAll(".stats .stat");
    if (stats[0]) { stats[0].querySelector("strong").textContent = profiles.length; stats[0].querySelector(".trend").textContent = `${active.length} активны`; }
    if (stats[2]) { stats[2].querySelector("strong").textContent = expiring; stats[2].querySelector(".trend").textContent = "истекают в течение месяца"; }
    if (stats[3]) { stats[3].querySelector("strong").textContent = openTasks; stats[3].querySelector(".trend").textContent = `${purchases.filter(item => item.status === "pending").length} выдачи ожидают`; }
  }

  function employeeCard(row) {
    const initials = String(row.full_name || "?").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    const status = row.activation_status === "active" ? '<span class="status green">Активен</span>' : '<span class="status orange">Ожидает активации</span>';
    return `<article class="employee-live-card"><div class="avatar">${esc(initials)}</div><div><strong>${esc(row.full_name || "Без имени")}</strong><span>${esc(row.position || "Должность не указана")}</span></div>${status}<button class="secondary" onclick="showDemo()">Открыть</button></article>`;
  }

  async function renderEmployees() {
    content.innerHTML = '<div class="page-head"><div><h1>Сотрудники</h1><p>Реальные профили ресторана BK8</p></div><button class="primary compact" onclick="showDemo()">＋ Сотрудник</button></div><div class="panel"><div class="employee-tools"><input id="employeeSearch" placeholder="Поиск по ФИО или должности"><span id="employeeCount">Загрузка…</span></div><div id="employeeLiveList" class="employee-live-list"></div></div>';
    try {
      const rows = await api("employee_profiles?select=id,full_name,position,restaurant,activation_status,telegram_id&order=full_name.asc");
      const list = document.querySelector("#employeeLiveList");
      const count = document.querySelector("#employeeCount");
      const draw = query => {
        const normalized = query.trim().toLowerCase();
        const shown = rows.filter(row => `${row.full_name || ""} ${row.position || ""}`.toLowerCase().includes(normalized));
        count.textContent = `${shown.length} сотрудников`;
        list.innerHTML = shown.map(employeeCard).join("") || '<div class="empty-live">Сотрудники не найдены</div>';
      };
      document.querySelector("#employeeSearch").oninput = event => draw(event.target.value);
      draw("");
    } catch (error) { document.querySelector("#employeeLiveList").innerHTML = `<div class="empty-live">${error.message}</div>`; }
  }

  function taskRow(task, names) {
    const due = task.due_at ? new Date(task.due_at).toLocaleString("ru-RU", {day:"numeric", month:"long", hour:"2-digit", minute:"2-digit"}) : "Без срока";
    const done = Boolean(task.completed);
    return `<article class="task-row"><button class="task-check ${done ? "checked" : ""}">${done ? "✓" : ""}</button><div class="task-main"><div class="task-title">${esc(task.title)}</div><div class="task-meta"><span>♟ ${esc(names.get(String(task.assigned_to)) || "Получатель не найден")}</span><span>◷ ${esc(due)}</span></div><small>${esc(task.description || "Без описания")}</small></div><button class="dots" onclick="showDemo()">•••</button></article>`;
  }

  async function loadTasks() {
    const [tasks, chats, profiles] = await Promise.all([
      api("admin_tasks?select=*&order=created_at.desc"),
      api("chats?type=neq.private&select=chat_id,title,type&order=title.asc"),
      api("employee_profiles?select=telegram_id,full_name")
    ]);
    const names = new Map(profiles.map(row => [String(row.telegram_id), row.full_name]));
    const list = document.querySelector(".task-list");
    list.querySelectorAll(".task-row").forEach(node => node.remove());
    list.insertAdjacentHTML("beforeend", tasks.map(task => taskRow(task, names)).join("") || '<div class="empty-live">Задач пока нет</div>');
    const chat = document.querySelector("#taskChat");
    chat.innerHTML = '<option value="">Выберите чат</option>' + chats.map(row => `<option value="${Number(row.chat_id)}">${esc(row.title)}</option>`).join("");
    document.querySelector("#chatNote").textContent = `Бот видит ${chats.length} чата`;
    const assignee = document.querySelector("#taskAssignee");
    assignee.innerHTML = '<option value="">Выберите сотрудника</option>' + profiles.filter(row => row.telegram_id).map(row => `<option value="${Number(row.telegram_id)}">${esc(row.full_name)}</option>`).join("");
    const due = new Date(); due.setDate(due.getDate() + 1); due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
    document.querySelector("#taskDue").value = due.toISOString().slice(0, 16);
    document.querySelector("#taskForm").onsubmit = async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('[type="submit"]');
      button.disabled = true; button.textContent = "Создаём…";
      try {
        const active = session()?.profile || {};
        const payload = {
          title: document.querySelector("#taskTitle").value.trim(),
          description: document.querySelector("#taskDescription").value.trim(),
          assigned_to: Number(document.querySelector("#taskAssignee").value),
          due_at: new Date(document.querySelector("#taskDue").value).toISOString(),
          priority: document.querySelector("#taskPriority").value,
          notification_chat_id: Number(document.querySelector("#taskChat").value),
          created_by: active.admin_role === "super_admin" ? 818748106 : 1217248152,
          completed: false
        };
        await api("admin_tasks", {method:"POST", headers:{Prefer:"return=minimal"}, body:JSON.stringify(payload)});
        toast("Задача создана — бот отправит её в выбранный чат");
        originalTasks(); await loadTasks();
      } catch (error) { toast(error.message.includes("notification_chat_id") ? "Сначала примените миграцию маршрутизации задач" : error.message); }
      finally { button.disabled = false; button.textContent = "Создать и отправить"; }
    };
  }

  window.enterPanel = function (profile) { originalEnterPanel(profile); loadOverview().catch(showLoadError); };
  window.renderOverview = function () { originalOverview(); loadOverview().catch(showLoadError); };
  window.renderTasks = function () { originalTasks(); loadTasks().catch(showLoadError); };
  window.openPage = function (page) {
    if (page === "employees") {
      nav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.page === page));
      document.querySelector("#crumb").textContent = "Сотрудники";
      return renderEmployees();
    }
    return originalOpenPage(page);
  };
})();
