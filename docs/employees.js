const EMP_ARCHIVED = "archived";
const EMP_PENDING = "pending";
const EMP_ACTIVE = "active";
let emp2State = { rows: [], editingId: null, query: "", openedId: null };

function emp2Escape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function emp2ErrorText(error) {
  const text = String(error?.message || error || "Неизвестная ошибка");
  try { const parsed = JSON.parse(text); return parsed.message || parsed.details || parsed.hint || text; } catch (_) { return text; }
}

function emp2Code() { return "BK8-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function emp2IsRoot() { return Boolean(window.BK8Permissions?.can("manageEmployees")); }

function emp2Build() {
  if (!emp2IsRoot()) return;
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;
  const legacy = document.getElementById("tab-employees");
  if (legacy && !document.getElementById("emp2Refresh")) legacy.remove();
  if (!tabs.querySelector('[data-tab="employees"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="employees">Сотрудники</button>');
    tabs.querySelector('[data-tab="employees"]').onclick = () => switchTab("employees");
  }
  if (document.getElementById("tab-employees")) return;
  app.insertAdjacentHTML("beforeend", `<section class="tab-page" id="tab-employees"><article class="card employee-v2-panel"><div class="employee-v2-hero"><div><p class="label">BK8 Staff</p><h2>👥 Сотрудники</h2></div><button id="emp2Refresh" class="tasks-refresh">Обновить</button></div><div class="employee-v2-layout"><div class="employee-v2-form"><h3 id="emp2FormTitle">Новый сотрудник</h3><input id="emp2FullName" placeholder="ФИО" /><input id="emp2Position" placeholder="Должность" /><input id="emp2Phone" placeholder="Телефон" /><input id="emp2Birth" type="date" /><input id="emp2Timesheet" placeholder="Имя в табеле, если отличается" /><div class="admin-actions"><button id="emp2Create" class="action-btn add">Создать код</button><button id="emp2Save" class="action-btn add" hidden>Сохранить</button><button id="emp2Cancel" class="action-btn remove" hidden>Отмена</button></div><p id="emp2Status" class="employee-status"></p></div><div class="employee-v2-list-wrap"><input id="emp2Search" class="employee-v2-search" placeholder="Поиск" /><div id="emp2Stats" class="klokr-result-preview"></div><div id="emp2List" class="employee-v2-list"></div></div></div><div id="emp2Details"></div></article></section>`);
  emp2Bind();
}

function emp2Bind() {
  document.getElementById("emp2Refresh").onclick = emp2Load;
  document.getElementById("emp2Create").onclick = emp2Create;
  document.getElementById("emp2Save").onclick = emp2Save;
  document.getElementById("emp2Cancel").onclick = emp2Cancel;
  document.getElementById("emp2Search").oninput = event => { emp2State.query = event.target.value.toLowerCase(); emp2Render(); };
}

function emp2Values() {
  const name = document.getElementById("emp2FullName").value.trim().replace(/\s+/g, " ");
  return { full_name: name || "Ожидает регистрации", position: document.getElementById("emp2Position").value.trim(), restaurant: "", phone: document.getElementById("emp2Phone").value.trim(), birth_date: document.getElementById("emp2Birth").value || null, timesheet_name: document.getElementById("emp2Timesheet").value.trim(), updated_at: new Date().toISOString() };
}

function emp2Fill(row) {
  emp2State.editingId = row.id;
  document.getElementById("emp2FormTitle").textContent = "Редактирование";
  document.getElementById("emp2FullName").value = row.full_name === "Ожидает регистрации" ? "" : (row.full_name || "");
  document.getElementById("emp2Position").value = row.position || "";
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
  ["emp2FullName", "emp2Position", "emp2Phone", "emp2Birth", "emp2Timesheet"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("emp2Create").hidden = false;
  document.getElementById("emp2Save").hidden = true;
  document.getElementById("emp2Cancel").hidden = true;
}

async function emp2Create() {
  const status = document.getElementById("emp2Status");
  const data = emp2Values();
  data.activation_code = emp2Code();
  data.activation_status = EMP_PENDING;
  data.created_by = Number(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.userId || 818748106);
  data.created_at = new Date().toISOString();
  try { await supabaseWrite("employee_profiles", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) }); status.innerHTML = `Код создан: <b>${emp2Escape(data.activation_code)}</b>`; emp2Cancel(); await emp2Load(); }
  catch (e) { console.error(e); status.innerHTML = `Ошибка: ${emp2Escape(emp2ErrorText(e))}`; }
}

async function emp2Save() {
  const status = document.getElementById("emp2Status");
  if (!emp2State.editingId) return;
  try { await supabaseWrite(`employee_profiles?id=eq.${emp2State.editingId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(emp2Values()) }); status.textContent = "Сохранено."; emp2Cancel(); await emp2Load(); if (typeof renderApp === "function") await renderApp(); }
  catch (e) { console.error(e); status.innerHTML = `Ошибка: ${emp2Escape(emp2ErrorText(e))}`; }
}

async function emp2Archive(id) { if (!confirm("Архивировать сотрудника?")) return; await supabaseWrite(`employee_profiles?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return:minimal" }, body: JSON.stringify({ activation_status: EMP_ARCHIVED, updated_at: new Date().toISOString() }) }); await emp2Load(); }
function emp2Copy(code) { navigator.clipboard?.writeText(code); document.getElementById("emp2Status").textContent = "Код скопирован: " + code; }
function emp2Open(id) { emp2State.openedId = Number(id); emp2RenderDetails(); document.getElementById("emp2Details")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function emp2Filtered() { const q = emp2State.query; if (!q) return emp2State.rows; return emp2State.rows.filter(row => [row.full_name, row.position, row.phone, row.activation_code].join(" ").toLowerCase().includes(q)); }

async function emp2ShowTimesheet(profileId) {
  const root = document.getElementById("emp2Subpanel");
  if (!root) return;
  root.innerHTML = `<div class="shop-empty-card"><strong>Табель</strong><span>Загружаю часы...</span></div>`;
  try {
    const rows = await supabaseFetch(`employee_timesheets?employee_profile_id=eq.${Number(profileId)}&select=period,hours,source_file,updated_at&order=period.desc&limit=24`);
    if (!rows?.length) { root.innerHTML = `<div class="shop-empty-card"><strong>Табель</strong><span>Пока нет загруженных часов.</span></div>`; return; }
    root.innerHTML = `<div class="employee-admin-subcard"><h3>🕒 Табель</h3><div class="employee-v2-list">${rows.map(row => `<div class="employee-row"><div><strong>${emp2Escape(row.period || "—")}</strong><span>${emp2Escape(row.source_file || "")}</span></div><code>${Number(row.hours || 0).toString().replace('.', ',')} ч.</code></div>`).join("")}</div></div>`;
  } catch (e) {
    root.innerHTML = `<div class="shop-empty-card"><strong>Табель</strong><span>Нет таблицы employee_timesheets. Запусти SQL из docs/employee-timesheets.sql</span></div>`;
  }
}

function emp2RenderDetails() {
  const root = document.getElementById("emp2Details");
  if (!root) return;
  const row = emp2State.rows.find(item => Number(item.id) === Number(emp2State.openedId));
  if (!row) { root.innerHTML = ""; return; }
  const name = row.full_name === "Ожидает регистрации" ? "Ожидает ФИО" : row.full_name;
  root.innerHTML = `<article class="employee-admin-card"><div class="employee-admin-head"><div class="employee-v2-avatar big">${emp2Escape(initials(name || "BK"))}</div><div><p class="label">Карточка</p><h3>${emp2Escape(name || "Сотрудник")}</h3><span>${emp2Escape(row.position || "Должность не указана")}</span></div></div><div class="employee-admin-grid"><button onclick="emp2Fill(emp2State.rows.find(r=>r.id===${Number(row.id)}))">👤 Профиль</button><button>🩺 Сан справка</button><button>📄 Бланк ПВВ</button><button onclick="emp2ShowTimesheet(${Number(row.id)})">🕒 Табель</button><button>🏆 КЛОКР</button><button>🛒 Покупки</button><button>⚙️ Настройки</button></div><div class="profile-info-grid"><div><span>Телефон</span><strong>${emp2Escape(row.phone || "—")}</strong></div><div><span>Дата рождения</span><strong>${emp2Escape(row.birth_date || "—")}</strong></div><div><span>Telegram</span><strong>${emp2Escape(row.telegram_id || "не привязан")}</strong></div><div><span>Код</span><strong>${emp2Escape(row.activation_code || "—")}</strong></div></div><div id="emp2Subpanel"></div></article>`;
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
  root.innerHTML = emp2Filtered().map(row => { const isActive = row.activation_status === EMP_ACTIVE; const isArchived = row.activation_status === EMP_ARCHIVED; const name = isActive ? row.full_name : (row.full_name === "Ожидает регистрации" ? "Ожидает ФИО" : row.full_name); return `<article class="employee-v2-card ${isArchived ? "is-archived" : ""}"><div class="employee-v2-avatar">${emp2Escape(initials(name || "BK"))}</div><div class="employee-v2-main" onclick="emp2Open(${Number(row.id)})"><strong>${emp2Escape(name || "Сотрудник")}</strong><span>${emp2Escape(row.position || "Должность не указана")}</span><small>${isActive ? "активирован" : isArchived ? "архив" : "ожидает регистрации"}${row.telegram_id ? " · TG " + emp2Escape(row.telegram_id) : ""}</small></div><div class="employee-v2-actions"><code>${emp2Escape(row.activation_code || "—")}</code><button class="tasks-refresh" onclick="emp2Open(${Number(row.id)})">Открыть</button><button class="tasks-refresh" onclick="emp2Copy('${emp2Escape(row.activation_code || "")}')">Копировать</button>${isArchived ? "" : `<button class="task-delete-icon" onclick="emp2Archive(${Number(row.id)})">×</button>`}</div></article>`; }).join("") || `<div class="shop-empty-card"><strong>Сотрудников пока нет</strong><span>Создай первый код регистрации.</span></div>`;
  emp2RenderDetails();
}

async function emp2Load() { if (!window.BK8Permissions?.can("manageEmployees")) return; emp2Build(); emp2State.rows = await supabaseFetch("employee_profiles?select=*&order=created_at.desc&limit=300").catch(() => []); emp2Render(); }
window.emp2State = emp2State;
let emp2Initialization = null;
async function emp2Initialize() {
  if (emp2Initialization) return emp2Initialization;
  emp2Initialization = (async () => {
    const permissions = window.BK8Permissions;
    if (permissions && !permissions.state.loaded) await permissions.load();
    if (!permissions?.can("manageEmployees")) return;
    await emp2Load();
    await emp2LoadMedicalAlerts();
  })().catch(error => {
    emp2Initialization = null;
    console.error("Employee module initialization failed", error);
  });
  return emp2Initialization;
}
window.addEventListener("bk8:employees-ready", emp2Initialize, { once: true });
document.addEventListener("bk8:permissions-ready", emp2Initialize, { once: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", emp2Initialize, { once: true });
else emp2Initialize();

function emp2Selected() { return emp2State.rows.find(row => Number(row.id) === Number(emp2State.openedId)); }
function emp2Panel(html) { const root = document.getElementById("emp2Subpanel"); if (root) root.innerHTML = html; }
function emp2Placeholder(icon, title) { emp2Panel(`<div class="employee-admin-subcard"><div class="employee-module-icon">${icon}</div><h3>${emp2Escape(title)}</h3></div>`); }
function emp2ShowProfile() { const row = emp2Selected(); if (row) emp2Fill(row); }
function emp2ShowPvv() { emp2Placeholder("📄", "Бланк ПВВ"); }
function emp2ShowKlokr() { emp2Placeholder("🏆", "КЛОКР"); }
function emp2ShowPurchases() { emp2Placeholder("🛒", "Покупки"); }
function emp2ShowSettings() { emp2Placeholder("⚙️", "Настройки"); }

const EMP2_MEDICAL_WARNING_DAYS = 30;
const emp2MedicalFields = [
  ["sanitary_certificate_expires_on", "Санитарная справка"],
  ["sanitary_minimum_expires_on", "Санминимум"],
  ["fluorography_expires_on", "Флюорография"],
];

function emp2MedicalDaysLeft(value) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function emp2MedicalStatus(days) {
  if (days < 0) return { className: "is-expired", text: `Просрочено на ${Math.abs(days)} дн.` };
  if (days === 0) return { className: "is-expired", text: "Истекает сегодня" };
  return { className: "is-warning", text: `Осталось ${days} дн.` };
}

function emp2EnsureMedicalAlertsCard() {
  if (!window.BK8Permissions?.can("manageEmployeeDocuments")) return null;
  const grid = document.querySelector("#tab-home .grid");
  if (!grid) return null;
  let card = document.getElementById("employeeMedicalAlertsCard");
  if (!card) {
    grid.insertAdjacentHTML("afterbegin", `<article class="card employee-medical-alerts" id="employeeMedicalAlertsCard"><div class="employee-medical-alerts-head"><div><p class="label">Контроль документов</p><h2>🩺 Сан справки</h2></div><button class="tasks-refresh" id="employeeMedicalAlertsRefresh" type="button">Обновить</button></div><div id="employeeMedicalAlertsList" class="employee-medical-alerts-list"><p class="muted">Загрузка…</p></div></article>`);
    card = document.getElementById("employeeMedicalAlertsCard");
    document.getElementById("employeeMedicalAlertsRefresh").onclick = () => emp2LoadMedicalAlerts().catch(() => {});
  }
  return card;
}

async function emp2LoadMedicalAlerts() {
  if (!emp2EnsureMedicalAlertsCard()) return;
  const root = document.getElementById("employeeMedicalAlertsList");
  const [profiles, records] = await Promise.all([
    supabaseFetch("employee_profiles?activation_status=eq.active&select=id,full_name"),
    supabaseFetch("employee_medical_records?select=employee_profile_id,sanitary_certificate_expires_on,sanitary_minimum_expires_on,fluorography_expires_on"),
  ]);
  const names = new Map((profiles || []).map(profile => [Number(profile.id), profile.full_name || "Сотрудник"]));
  const alerts = [];
  (records || []).forEach(record => emp2MedicalFields.forEach(([key, label]) => {
    if (!names.has(Number(record.employee_profile_id))) return;
    const days = emp2MedicalDaysLeft(record[key]);
    if (days === null || days > EMP2_MEDICAL_WARNING_DAYS) return;
    alerts.push({ profileId: Number(record.employee_profile_id), name: names.get(Number(record.employee_profile_id)) || "Сотрудник", label, date: record[key], days });
  }));
  alerts.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "ru"));
  if (!alerts.length) {
    root.innerHTML = `<div class="employee-medical-alerts-ok"><strong>Всё в порядке</strong><span>В ближайшие ${EMP2_MEDICAL_WARNING_DAYS} дней документы не истекают.</span></div>`;
    return;
  }
  root.innerHTML = alerts.map(alert => {
    const status = emp2MedicalStatus(alert.days);
    return `<button class="employee-medical-alert ${status.className}" type="button" onclick="emp2OpenFromMedicalAlert(${alert.profileId})"><span><strong>${emp2Escape(alert.name)}</strong><small>${emp2Escape(alert.label)} · до ${emp2Escape(alert.date)}</small></span><b>${emp2Escape(status.text)}</b></button>`;
  }).join("");
}

function emp2OpenFromMedicalAlert(profileId) {
  if (typeof switchTab === "function") switchTab("employees");
  emp2Open(profileId);
  emp2ShowMedical().catch(() => {});
}

async function emp2ShowMedical() {
  const row = emp2Selected();
  if (!row) return;
  const records = await supabaseFetch(`employee_medical_records?employee_profile_id=eq.${Number(row.id)}&select=*&limit=1`).catch(() => []);
  const record = records?.[0] || {};
  const field = (label, id, value) => {
    const days = emp2MedicalDaysLeft(value);
    const status = days === null ? "Дата не указана" : emp2MedicalStatus(days).text;
    return `<label class="employee-medical-field"><span>${label}</span><input id="${id}" type="date" value="${emp2Escape(value || "")}"><small>${emp2Escape(status)}</small></label>`;
  };
  emp2Panel(`<div class="employee-admin-subcard employee-medical-card"><h3>🩺 Сан справка</h3><div class="employee-medical-grid">
    ${field("Санитарная справка до", "medicalCertificate", record.sanitary_certificate_expires_on)}
    ${field("Санминимум до", "medicalMinimum", record.sanitary_minimum_expires_on)}
    ${field("Флюорография до", "medicalFluoro", record.fluorography_expires_on)}
  </div><button id="medicalSave" class="action-btn add">Сохранить</button><p id="medicalStatus" class="employee-status"></p></div>`);
  document.getElementById("medicalSave").onclick = async () => {
    await supabaseWrite("employee_medical_records?on_conflict=employee_profile_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ employee_profile_id: Number(row.id), sanitary_certificate_expires_on: document.getElementById("medicalCertificate").value || null, sanitary_minimum_expires_on: document.getElementById("medicalMinimum").value || null, fluorography_expires_on: document.getElementById("medicalFluoro").value || null, updated_at: new Date().toISOString() }) });
    document.getElementById("medicalStatus").textContent = "Сохранено.";
    await emp2LoadMedicalAlerts();
  };
  ["medicalCertificate", "medicalMinimum", "medicalFluoro"].forEach(id => {
    document.getElementById(id).onchange = event => {
      const days = emp2MedicalDaysLeft(event.target.value);
      event.target.parentElement.querySelector("small").textContent = days === null ? "Дата не указана" : emp2MedicalStatus(days).text;
    };
  });
}

async function emp2ShowTimesheet(profileId) {
  const rows = await supabaseFetch(`employee_timesheets?employee_profile_id=eq.${Number(profileId)}&period=eq.current&select=hours,updated_at&limit=1`).catch(() => []);
  const row = rows?.[0];
  const hours = row ? `${Number(row.hours || 0).toString().replace(".", ",")} ч.` : "—";
  emp2Panel(`<div class="employee-admin-subcard employee-current-hours"><h3>🕒 Табель</h3><strong>${emp2Escape(hours)}</strong><p>Актуальные часы</p></div>`);
}

async function emp2DeleteEmployee(id) {
  const row = emp2Selected();
  if (!confirm(`Удалить ${row?.full_name || "сотрудника"}?`)) return;
  await supabaseWrite(`employee_profiles?id=eq.${Number(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  emp2State.openedId = null;
  await emp2Load();
}

emp2RenderDetails = function () {
  const root = document.getElementById("emp2Details");
  const row = emp2Selected();
  if (!root || !row) { if (root) root.innerHTML = ""; return; }
  root.innerHTML = `<article class="employee-admin-card"><div class="employee-admin-head"><div class="employee-v2-avatar big">${emp2Escape(initials(row.full_name || "BK"))}</div><div><p class="label">Карточка сотрудника</p><h3>${emp2Escape(row.full_name || "Сотрудник")}</h3><span>${emp2Escape(row.position || "Должность не указана")}</span></div></div>
  <div class="employee-admin-grid employee-final-menu"><button onclick="emp2ShowProfile()">👤 Профиль</button><button onclick="emp2ShowMedical()">🩺 Сан справка</button><button onclick="emp2ShowPvv()">📄 Бланк ПВВ</button><button onclick="emp2ShowTimesheet(${Number(row.id)})">🕒 Табель</button><button onclick="emp2ShowKlokr()">🏆 КЛОКР</button><button onclick="emp2ShowPurchases()">🛒 Покупки</button><button onclick="emp2ShowSettings()">⚙️ Настройки</button><button class="employee-delete-action" onclick="emp2DeleteEmployee(${Number(row.id)})">🗑 Удалить сотрудника</button></div><div id="emp2Subpanel"></div></article>`;
};
