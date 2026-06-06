function taskEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function taskDateInputValue(date = new Date()) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function taskFormatDate(value) {
  if (!value) return "Без срока";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Без срока";
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return `${time}, ${day}`;
}

function taskUserName(users, id) {
  return users[String(id)]?.name || "Сотрудник";
}

function taskIsOverdue(task) {
  return task.due_at && !task.completed && new Date(task.due_at).getTime() < Date.now();
}

let taskState = {
  users: {},
  adminIds: new Set(),
  tasks: [],
};

function tasksBuildSection() {
  if (!userId) return;
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;

  if (!tabs.querySelector('[data-tab="tasks"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="tasks">Задачи</button>');
    tabs.querySelector('[data-tab="tasks"]').addEventListener("click", () => switchTab("tasks"));
  }

  if (!document.getElementById("tab-tasks")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-tasks">
        <article class="card tasks-panel">
          <div class="tasks-title-row">
            <h2>🧩 Задачи менеджеров</h2>
            <button id="tasksRefresh" class="tasks-refresh">Обновить</button>
          </div>

          <div class="tasks-form">
            <label>Название задачи</label>
            <input id="taskTitle" type="text" />
            <label>Описание</label>
            <textarea id="taskDescription"></textarea>
            <div class="tasks-form-grid">
              <div>
                <label>Ответственный</label>
                <select id="taskAssignee"></select>
              </div>
              <div>
                <label>Срок</label>
                <input id="taskDueAt" type="datetime-local" />
              </div>
            </div>
            <button id="taskCreate" class="action-btn add">+ Создать задачу</button>
            <p id="taskStatus" class="admin-status"></p>
          </div>

          <div class="tasks-columns">
            <section>
              <h3>Активные</h3>
              <div id="tasksActive" class="tasks-list"></div>
            </section>
            <section>
              <h3>Выполненные</h3>
              <div id="tasksDone" class="tasks-list"></div>
            </section>
          </div>
        </article>
      </section>
    `);
  }
}

async function tasksLoadUsersAndAdmins() {
  const [usersRows, managerRows] = await Promise.all([
    supabaseFetch("users?select=telegram_id,username,first_name,last_name,balance&order=first_name.asc"),
    supabaseFetch("managers?select=telegram_id"),
  ]);

  const users = {};
  for (const row of usersRows || []) {
    const id = String(row.telegram_id);
    users[id] = { name: userNameFromRow(row), balance: Number(row.balance || 0) };
  }

  const rootIds = typeof ROOT_ADMIN_IDS !== "undefined" ? ROOT_ADMIN_IDS.map(String) : [];
  const managerIds = (managerRows || []).map(row => String(row.telegram_id));
  taskState.users = users;
  taskState.adminIds = new Set([...rootIds, ...managerIds]);
}

function tasksIsAllowed() {
  return Boolean(userId && taskState.adminIds.has(String(userId)));
}

function tasksRenderAssignees() {
  const select = document.getElementById("taskAssignee");
  if (!select) return;
  const previous = select.value;
  const options = [...taskState.adminIds]
    .filter(id => taskState.users[id])
    .map(id => `<option value="${taskEscape(id)}">${taskEscape(taskUserName(taskState.users, id))}</option>`)
    .join("");
  select.innerHTML = options || `<option value="">Нет админов</option>`;
  if (previous && [...select.options].some(option => option.value === previous)) select.value = previous;
  else if (userId && [...select.options].some(option => option.value === String(userId))) select.value = String(userId);
}

async function tasksLoad() {
  await tasksLoadUsersAndAdmins();
  if (!tasksIsAllowed()) return;
  tasksBuildSection();
  tasksRenderAssignees();
  const rows = await taskFetch("admin_tasks?select=*&order=completed.asc,due_at.asc,created_at.desc&limit=200");
  taskState.tasks = rows || [];
  tasksRender();
}

async function taskFetch(path, options = {}) {
  const config = window.APP_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Supabase config missing");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204 || !response.headers.get("content-type")?.includes("application/json")) return null;
  return response.json();
}

function taskCard(task) {
  const overdue = taskIsOverdue(task);
  const completed = Boolean(task.completed);
  const creator = task.created_by ? taskUserName(taskState.users, task.created_by) : "Неизвестно";
  const assignee = task.assigned_to ? taskUserName(taskState.users, task.assigned_to) : "Не назначен";
  const completedBy = task.completed_by ? taskUserName(taskState.users, task.completed_by) : "";
  const completedAt = task.completed_at ? taskFormatDate(task.completed_at) : "";

  return `
    <article class="task-card ${completed ? "done" : ""} ${overdue ? "overdue" : ""}">
      <div class="task-card-head">
        <div>
          <small>${completed ? "Выполнено" : overdue ? "Просрочено" : "Активно"}</small>
          <strong>${taskEscape(task.title)}</strong>
        </div>
        <label class="task-check">
          <input type="checkbox" data-task-toggle="${task.id}" ${completed ? "checked" : ""} />
          <span></span>
        </label>
      </div>
      ${task.description ? `<p>${taskEscape(task.description)}</p>` : ""}
      <div class="task-meta-grid">
        <div><span>Ответственный</span><strong>${taskEscape(assignee)}</strong></div>
        <div><span>Срок</span><strong>${taskEscape(taskFormatDate(task.due_at))}</strong></div>
        <div><span>Создал</span><strong>${taskEscape(creator)}</strong></div>
        ${completed ? `<div><span>Закрыл</span><strong>${taskEscape(completedBy)} · ${taskEscape(completedAt)}</strong></div>` : ""}
      </div>
    </article>
  `;
}

function tasksRender() {
  const activeRoot = document.getElementById("tasksActive");
  const doneRoot = document.getElementById("tasksDone");
  if (!activeRoot || !doneRoot) return;

  const active = taskState.tasks.filter(task => !task.completed);
  const done = taskState.tasks.filter(task => task.completed).slice(0, 30);

  activeRoot.innerHTML = active.map(taskCard).join("") || `<p>Активных задач пока нет.</p>`;
  doneRoot.innerHTML = done.map(taskCard).join("") || `<p>Выполненных задач пока нет.</p>`;

  document.querySelectorAll("[data-task-toggle]").forEach(input => {
    input.onchange = () => tasksToggle(Number(input.dataset.taskToggle), input.checked);
  });
}

async function tasksCreate() {
  const status = document.getElementById("taskStatus");
  const title = document.getElementById("taskTitle")?.value.trim();
  const description = document.getElementById("taskDescription")?.value.trim();
  const assignedTo = document.getElementById("taskAssignee")?.value;
  const dueAtValue = document.getElementById("taskDueAt")?.value;

  if (!title) {
    status.textContent = "Напиши название задачи.";
    return;
  }
  if (!assignedTo) {
    status.textContent = "Выбери ответственного.";
    return;
  }

  const dueAt = dueAtValue ? new Date(dueAtValue).toISOString() : null;
  try {
    await taskFetch("admin_tasks", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({
        title,
        description,
        assigned_to: Number(assignedTo),
        due_at: dueAt,
        created_by: userId ? Number(userId) : null,
      }),
    });
    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDescription").value = "";
    status.textContent = "Задача создана.";
    await tasksLoad();
  } catch (error) {
    status.textContent = "Не получилось создать задачу. Проверь SQL для задач.";
  }
}

async function tasksToggle(taskId, checked) {
  const status = document.getElementById("taskStatus");
  const payload = checked
    ? { completed: true, completed_by: userId ? Number(userId) : null, completed_at: new Date().toISOString() }
    : { completed: false, completed_by: null, completed_at: null };
  try {
    await taskFetch(`admin_tasks?id=eq.${taskId}`, {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify(payload),
    });
    status.textContent = checked ? "Задача закрыта." : "Задача снова активна.";
    await tasksLoad();
  } catch (error) {
    status.textContent = "Не получилось обновить задачу.";
  }
}

function tasksInit() {
  tasksLoad().then(() => {
    if (!tasksIsAllowed()) return;
    const dueInput = document.getElementById("taskDueAt");
    if (dueInput && !dueInput.value) dueInput.value = taskDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const createBtn = document.getElementById("taskCreate");
    const refreshBtn = document.getElementById("tasksRefresh");
    if (createBtn) createBtn.onclick = tasksCreate;
    if (refreshBtn) refreshBtn.onclick = () => tasksLoad().catch(() => {});
    setInterval(() => tasksLoad().catch(() => {}), 10000);
  }).catch(() => {});
}

tasksInit();
