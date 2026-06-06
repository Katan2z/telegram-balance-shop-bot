const CLOSING_CATEGORIES = ["Заготовки", "Борт", "Прилавок"];

function closingTodayKey(now = new Date()) {
  const local = new Date(now);
  if (local.getHours() < 16) local.setDate(local.getDate() - 1);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function closingDisplayDate(key) {
  const [y, m, d] = key.split("-");
  return `${d}.${m}`;
}

function closingEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function closingUserName(user) {
  return user?.name || "Сотрудник";
}

function closingNowText() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function closingSupabaseConfig() {
  const config = window.APP_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Supabase config missing");
  return { url, key };
}

async function closingFetch(path, options = {}) {
  const { url, key } = closingSupabaseConfig();
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

function closingBuildSection() {
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app || !window.CLOSING_ITEMS?.length) return;

  if (!tabs.querySelector('[data-tab="closing"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="closing">Закрытие</button>');
    tabs.querySelector('[data-tab="closing"]').addEventListener("click", () => switchTab("closing"));
  }

  if (!document.getElementById("tab-closing")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-closing">
        <article class="card closing-panel">
          <h2>✅ Закрытие смены</h2>
          <div class="closing-top">
            <div class="closing-date-card">
              <small>Рабочий день</small>
              <strong id="closingWorkday">—</strong>
              <span>Сброс после 16:00</span>
            </div>
            <div class="closing-progress-card">
              <small>Прогресс</small>
              <strong id="closingProgress">0/0</strong>
              <div class="closing-progress"><i id="closingProgressBar"></i></div>
            </div>
          </div>

          <div class="closing-people">
            <label>Кто на закрытии</label>
            <select id="closingEmployee"></select>
            <button id="closingAssign" class="action-btn add">+ Добавить сотрудника</button>
            <div id="closingAssignees" class="closing-assignees"></div>
          </div>

          <div id="closingCategories" class="closing-categories"></div>
          <p id="closingStatus" class="admin-status"></p>
        </article>
      </section>
    `);
  }
}

let closingState = {
  workday: closingTodayKey(),
  users: {},
  checks: {},
  assignees: new Set(),
};

function closingUserOptions(users) {
  return Object.entries(users || {}).map(([id, user]) => {
    const name = closingUserName(user);
    return `<option value="${closingEscape(id)}">${closingEscape(name)}</option>`;
  }).join("");
}

function closingRenderAssignees() {
  const root = document.getElementById("closingAssignees");
  if (!root) return;
  const ids = [...closingState.assignees];
  if (!ids.length) {
    root.innerHTML = `<p>Пока никто не выбран.</p>`;
    return;
  }
  root.innerHTML = ids.map(id => `
    <button class="closing-person" data-remove-assignee="${closingEscape(id)}">
      <span>${closingEscape(initials(closingUserName(closingState.users[id])))}</span>
      <strong>${closingEscape(closingUserName(closingState.users[id]))}</strong>
      <small>×</small>
    </button>
  `).join("");
  root.querySelectorAll("[data-remove-assignee]").forEach(btn => {
    btn.onclick = () => closingRemoveAssignee(btn.dataset.removeAssignee);
  });
}

function closingRenderItems() {
  const root = document.getElementById("closingCategories");
  const status = document.getElementById("closingStatus");
  if (!root) return;

  const total = window.CLOSING_ITEMS.length;
  const done = window.CLOSING_ITEMS.filter(item => closingState.checks[item.key]?.checked).length;
  document.getElementById("closingWorkday").textContent = closingDisplayDate(closingState.workday);
  document.getElementById("closingProgress").textContent = `${done}/${total}`;
  document.getElementById("closingProgressBar").style.width = `${total ? Math.round(done / total * 100) : 0}%`;

  root.innerHTML = CLOSING_CATEGORIES.map(category => {
    const items = window.CLOSING_ITEMS.filter(item => item.category === category);
    const categoryDone = items.filter(item => closingState.checks[item.key]?.checked).length;
    return `
      <section class="closing-category">
        <div class="closing-category-head">
          <h3>${closingEscape(category)}</h3>
          <span>${categoryDone}/${items.length}</span>
        </div>
        <div class="closing-list">
          ${items.map(item => {
            const check = closingState.checks[item.key] || {};
            const checkedBy = check.checked_by ? closingUserName(closingState.users[String(check.checked_by)]) : "";
            const checkedAt = check.checked_at ? new Date(check.checked_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
            return `
              <label class="closing-item ${check.checked ? "checked" : ""}">
                <input type="checkbox" data-closing-key="${closingEscape(item.key)}" ${check.checked ? "checked" : ""} />
                <span class="closing-box"></span>
                <span class="closing-text">
                  <strong>${closingEscape(item.title)}</strong>
                  ${checkedBy ? `<small>Отметил: ${closingEscape(checkedBy)} · ${closingEscape(checkedAt)}</small>` : ""}
                </span>
              </label>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");

  root.querySelectorAll("[data-closing-key]").forEach(input => {
    input.onchange = () => closingToggleItem(input.dataset.closingKey, input.checked);
  });
  if (status && !status.textContent) status.textContent = "";
}

function closingRenderAll() {
  const select = document.getElementById("closingEmployee");
  if (select) {
    const previous = select.value;
    select.innerHTML = closingUserOptions(closingState.users);
    if (previous && [...select.options].some(option => option.value === previous)) select.value = previous;
    else if (userId && [...select.options].some(option => option.value === userId)) select.value = userId;
  }
  closingRenderAssignees();
  closingRenderItems();
}

async function closingLoadUsers() {
  const rows = await supabaseFetch("users?select=telegram_id,username,first_name,last_name,balance&order=first_name.asc");
  const users = {};
  for (const row of rows) {
    const id = String(row.telegram_id);
    users[id] = { name: userNameFromRow(row), balance: Number(row.balance || 0) };
  }
  closingState.users = users;
}

async function closingLoadData() {
  closingState.workday = closingTodayKey();
  await closingLoadUsers();
  const [checks, assignments] = await Promise.all([
    closingFetch(`closing_checks?workday=eq.${closingState.workday}&select=item_key,checked,checked_by,checked_at`),
    closingFetch(`closing_assignments?workday=eq.${closingState.workday}&select=user_id,assigned_at,assigned_by`),
  ]);
  closingState.checks = {};
  for (const row of checks || []) {
    closingState.checks[row.item_key] = row;
  }
  closingState.assignees = new Set((assignments || []).map(row => String(row.user_id)));
  closingRenderAll();
}

async function closingAddAssignee() {
  const select = document.getElementById("closingEmployee");
  const status = document.getElementById("closingStatus");
  const selected = select?.value;
  if (!selected) return;
  try {
    await closingFetch("closing_assignments?on_conflict=workday,user_id", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        workday: closingState.workday,
        user_id: Number(selected),
        assigned_by: userId ? Number(userId) : null,
      }),
    });
    closingState.assignees.add(String(selected));
    closingRenderAssignees();
    status.textContent = `Добавлен: ${closingUserName(closingState.users[selected])}`;
  } catch (error) {
    status.textContent = "Не получилось добавить сотрудника. Проверь SQL для закрытия.";
  }
}

async function closingRemoveAssignee(id) {
  const status = document.getElementById("closingStatus");
  try {
    await closingFetch(`closing_assignments?workday=eq.${closingState.workday}&user_id=eq.${id}`, { method: "DELETE" });
    closingState.assignees.delete(String(id));
    closingRenderAssignees();
    status.textContent = `Убран: ${closingUserName(closingState.users[id])}`;
  } catch (error) {
    status.textContent = "Не получилось убрать сотрудника.";
  }
}

async function closingToggleItem(key, checked) {
  const status = document.getElementById("closingStatus");
  const currentUser = userId ? Number(userId) : null;
  const now = new Date().toISOString();
  const payload = {
    workday: closingState.workday,
    item_key: key,
    checked: Boolean(checked),
    checked_by: checked ? currentUser : null,
    checked_at: checked ? now : null,
  };
  closingState.checks[key] = payload;
  closingRenderItems();
  try {
    await closingFetch("closing_checks?on_conflict=workday,item_key", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(payload),
    });
    status.textContent = checked ? `Отмечено в ${closingNowText()}` : `Снята отметка в ${closingNowText()}`;
  } catch (error) {
    status.textContent = "Не получилось сохранить галочку. Проверь SQL для закрытия.";
    await closingLoadData().catch(() => {});
  }
}

function closingInit() {
  closingBuildSection();
  const btn = document.getElementById("closingAssign");
  if (btn) btn.onclick = closingAddAssignee;
  closingLoadData().catch(() => {
    const status = document.getElementById("closingStatus");
    if (status) status.textContent = "Раздел готов, но нужны таблицы Supabase для сохранения.";
  });
  setInterval(() => {
    const newKey = closingTodayKey();
    if (newKey !== closingState.workday) closingLoadData().catch(() => {});
  }, 60000);
  setInterval(() => closingLoadData().catch(() => {}), 10000);
}

closingInit();
