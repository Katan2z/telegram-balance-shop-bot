const EMP_ARCHIVED = "archived";
const EMP_PENDING = "pending";
const EMP_ACTIVE = "active";
let emp2State = { rows: [], editingId: null, query: "" };

function emp2Escape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function emp2Code() {
  return "BK8-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function emp2IsRoot() {
  const id = String(window.userId || userId || "");
  return id === "818748106";
}

function emp2Build() {
  if (!emp2IsRoot()) return;
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;
  if (!tabs.querySelector('[data-tab="employees"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="employees">Сотрудники</button>');
    tabs.querySelector('[data-tab="employees"]').onclick = () => switchTab("employees");
  }
  if (document.getElementById("tab-employees")) return;
  app.insertAdjacentHTML("beforeend", `
    <section class="tab-page" id="tab-employees">
      <article class="card employee-v2-panel">
        <div class="employee-v2-hero">
          <div>
            <p class="label">BK8 Staff</p>
            <h2>👥 Сотрудники</h2>
            <p>Создаём коды регистрации, ведём профили и готовим основу под документы, табель и личный кабинет.</p>
          </div>
          <button id="emp2Refresh" class="tasks-refresh">Обновить</button>
        </div>
        <div class="employee-v2-layout">
          <div class="employee-v2-form">
            <h3 id="emp2FormTitle">Новый сотрудник</h3>
            <input id="emp2FullName" placeholder="ФИО после регистрации или для правки" />
            <input id="emp2Position" placeholder="Должность" />
            <input id="emp2Restaurant" placeholder="Ресторан" />
            <input id="emp2Phone" placeholder="Телефон" />
            <input id="emp2Birth" type="date" />
            <input id="emp2Timesheet" placeholder="Имя в табеле, если отличается" />
            <div class="admin-actions">
              <button id="emp2Create" class="action-btn add">Создать код</button>
              <button id="emp2Save" class="action-btn add" hidden>Сохранить</button>
              <button id="emp2Cancel" class="action-btn remove" hidden>Отмена</button>
            </div>
            <p id="emp2Status" class="employee-status"></p>
          </div>
          <div class="employee-v2-list-wrap">
            <input id="emp2Search" class="employee-v2-search" placeholder="Поиск по ФИО, должности, ресторану" />
            <div id="emp2Stats" class="klokr-result-preview"></div>
            <div id="emp2List" class="employee-v2-list"></div>
          </div>
        </div>
      </article>
    </section>
  `);
  emp2Bind();
}

function emp2Bind() {
  document.getElementById("emp2Refresh").onclick = emp2Load;
  document.getElementById("emp2Create").onclick = emp2Create;
  document.getElementById("emp2Save").onclick = emp2Save;
  document.getElementById("emp2Cancel").onclick = emp2Cancel;
  document.getElementById("emp2Search").oninput = event => {
    emp2State.query = event.target.value.toLowerCase();
    emp2Render();
  };
}

function emp2Values() {
  const name = document.getElementById("emp2FullName").value.trim().replace(/\s+/g, " ");
  return {
    full_name: name || "Ожидает регистрации",
    position: document.getElementById("emp2Position").value.trim(),
    restaurant: document.getElementById("emp2Restaurant").value.trim(),
    phone: document.getElementById("emp2Phone").value.trim(),
    birth_date: document.getElementById("emp2Birth").value || null,
    timesheet_name: document.getElementById("emp2Timesheet").value.trim(),
    updated_at: new Date().toISOString(),
  };
}

function emp2Fill(row) {
  emp2State.editingId = row.id;
  document.getElementById("emp2FormTitle").textContent = "Редактирование профиля";
  document.getElementById("emp2FullName").value = row.full_name === "Ожидает регистрации" ? "" : (row.full_name || "");
  document.getElementById("emp2Position").value = row.position || "";
  document.getElementById("emp2Restaurant").value = row.restaurant || "";
  document.getElementById("emp2Phone").value = row.phone || "";
  document.getElementById("emp2Birth").value = row.birth_date || "";
  document.getElementById("emp2Timesheet").value = row.timesheet_name || "";
  document.getElementById("emp2Create").hidden = true;
  document.getElementById("emp2Save").hidden = false;
  document.getElementById("emp2Cancel").hidden = false;
}

function emp2Cancel() {
  emp2State.editingId = null;
  document.getElementById("emp2FormTitle").textContent = "Новый сотрудник";
  ["emp2FullName", "emp2Position", "emp2Restaurant", "emp2Phone", "emp2Birth", "emp2Timesheet"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("emp2Create").hidden = false;
  document.getElementById("emp2Save").hidden = true;
  document.getElementById("emp2Cancel").hidden = true;
}

async function emp2Create() {
  const status = document.getElementById("emp2Status");
  const data = emp2Values();
  data.activation_code = emp2Code();
  data.activation_status = EMP_PENDING;
  data.created_by = Number(userId);
  data.created_at = new Date().toISOString();
  try {
    await supabaseWrite("employee_profiles", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) });
    status.innerHTML = `Код создан: <b>${emp2Escape(data.activation_code)}</b>`;
    emp2Cancel();
    await emp2Load();
  } catch (e) {
    status.textContent = "Не получилось создать сотрудника. Проверь SQL employee_profiles.";
  }
}

async function emp2Save() {
  const status = document.getElementById("emp2Status");
  if (!emp2State.editingId) return;
  try {
    await supabaseWrite(`employee_profiles?id=eq.${emp2State.editingId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(emp2Values()) });
    status.textContent = "Профиль сохранён.";
    emp2Cancel();
    await emp2Load();
    if (typeof renderApp === "function") await renderApp();
  } catch (e) {
    status.textContent = "Не получилось сохранить профиль.";
  }
}

async function emp2Archive(id) {
  if (!confirm("Архивировать сотрудника?")) return;
  await supabaseWrite(`employee_profiles?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ activation_status: EMP_ARCHIVED, updated_at: new Date().toISOString() }) });
  await emp2Load();
}

function emp2Copy(code) {
  navigator.clipboard?.writeText(code);
  document.getElementById("emp2Status").textContent = "Код скопирован: " + code;
}

function emp2Filtered() {
  const q = emp2State.query;
  if (!q) return emp2State.rows;
  return emp2State.rows.filter(row => [row.full_name, row.position, row.restaurant, row.phone, row.activation_code].join(" ").toLowerCase().includes(q));
}

function emp2Render() {
  emp2Build();
  const stats = document.getElementById("emp2Stats");
  const root = document.getElementById("emp2List");
  if (!stats || !root) return;
  const rows = emp2State.rows;
  const active = rows.filter(r => r.activation_status === EMP_ACTIVE).length;
  const pending = rows.filter(r => r.activation_status === EMP_PENDING).length;
  const archived = rows.filter(r => r.activation_status === EMP_ARCHIVED).length;
  stats.innerHTML = `<div><span>Всего</span><strong>${rows.length}</strong></div><div><span>Активны</span><strong>${active}</strong></div><div><span>Ожидают</span><strong>${pending}</strong></div><div><span>Архив</span><strong>${archived}</strong></div>`;
  root.innerHTML = emp2Filtered().map(row => {
    const isActive = row.activation_status === EMP_ACTIVE;
    const isArchived = row.activation_status === EMP_ARCHIVED;
    return `<article class="employee-v2-card ${isArchived ? "is-archived" : ""}">
      <div class="employee-v2-avatar">${emp2Escape(initials(row.full_name || "BK"))}</div>
      <div class="employee-v2-main">
        <strong>${emp2Escape(isActive ? row.full_name : (row.full_name === "Ожидает регистрации" ? "Ожидает ФИО" : row.full_name))}</strong>
        <span>${emp2Escape(row.position || "Должность не указана")} · ${emp2Escape(row.restaurant || "Ресторан не указан")}</span>
        <small>${isActive ? "активирован" : isArchived ? "архив" : "ожидает регистрации"}${row.telegram_id ? " · TG " + emp2Escape(row.telegram_id) : ""}</small>
      </div>
      <div class="employee-v2-actions">
        <code>${emp2Escape(row.activation_code || "—")}</code>
        <button class="tasks-refresh" onclick="emp2Copy('${emp2Escape(row.activation_code || "")}')">Копировать</button>
        <button class="tasks-refresh" onclick="emp2Fill(emp2State.rows.find(r=>r.id===${Number(row.id)}))">Править</button>
        ${isArchived ? "" : `<button class="task-delete-icon" onclick="emp2Archive(${Number(row.id)})">×</button>`}
      </div>
    </article>`;
  }).join("") || `<div class="shop-empty-card"><strong>Сотрудников пока нет</strong><span>Создай первый код регистрации.</span></div>`;
}

async function emp2Load() {
  if (!emp2IsRoot()) return;
  emp2Build();
  emp2State.rows = await supabaseFetch("employee_profiles?select=*&order=created_at.desc&limit=300").catch(() => []);
  emp2Render();
}

setTimeout(emp2Load, 800);
setTimeout(emp2Load, 2000);
setInterval(emp2Load, 30000);
