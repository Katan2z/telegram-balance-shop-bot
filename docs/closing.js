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
          <div class="closing-title-row">
            <h2>✅ Закрытие смены</h2>
            <button id="closingHistoryButton" class="closing-history-button">📜 История</button>
          </div>
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
          <div id="closingHistoryPanel" class="closing-history-panel hidden">
            <div class="closing-history-head">
              <div>
                <small>Архив закрытий</small>
                <strong>История</strong>
              </div>
              <button id="closingHistoryClose" class="closing-history-close">×</button>
            </div>
            <div id="closingHistoryContent" class="closing-history-content">
              <p>Загрузка истории...</p>
            </div>
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
  assignees: {},
  historyOpen: false,
  historySelectedDay: null,
};

function closingUserOptions(users) {
  return Object.entries(users || {}).map(([id, user]) => {
    const name = closingUserName(user);
    return `<option value="${closingEscape(id)}">${closingEscape(name)}</option>`;
  }).join("");
}

function closingCategoryAssignees(category) {
  if (!closingState.assignees[category]) closingState.assignees[category] = new Set();
  return closingState.assignees[category];
}

function closingRenderAssignees(category) {
  const root = document.querySelector(`[data-category-assignees="${CSS.escape(category)}"]`);
  if (!root) return;
  const ids = [...closingCategoryAssignees(category)];
  if (!ids.length) {
    root.innerHTML = `<p>Пока никто не выбран.</p>`;
    return;
  }
  root.innerHTML = ids.map(id => `
    <button class="closing-person" data-remove-category="${closingEscape(category)}" data-remove-assignee="${closingEscape(id)}">
      <span>${closingEscape(initials(closingUserName(closingState.users[id])))}</span>
      <strong>${closingEscape(closingUserName(closingState.users[id]))}</strong>
      <small>×</small>
    </button>
  `).join("");
  root.querySelectorAll("[data-remove-assignee]").forEach(btn => {
    btn.onclick = () => closingRemoveAssignee(btn.dataset.removeCategory, btn.dataset.removeAssignee);
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

        <div class="closing-people closing-people-category">
          <label>Ответственные за раздел</label>
          <select data-category-select="${closingEscape(category)}">${closingUserOptions(closingState.users)}</select>
          <button class="action-btn add" data-category-assign="${closingEscape(category)}">+ Добавить в ${closingEscape(category)}</button>
          <div data-category-assignees="${closingEscape(category)}" class="closing-assignees"></div>
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
  root.querySelectorAll("[data-category-assign]").forEach(btn => {
    btn.onclick = () => closingAddAssignee(btn.dataset.categoryAssign);
  });
  CLOSING_CATEGORIES.forEach(category => {
    const select = root.querySelector(`[data-category-select="${CSS.escape(category)}"]`);
    if (select && userId && [...select.options].some(option => option.value === userId)) select.value = userId;
    closingRenderAssignees(category);
  });
  if (status && !status.textContent) status.textContent = "";
}

function closingRenderAll() {
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
    closingFetch(`closing_assignments?workday=eq.${closingState.workday}&select=category,user_id,assigned_at,assigned_by`),
  ]);
  closingState.checks = {};
  for (const row of checks || []) {
    closingState.checks[row.item_key] = row;
  }
  closingState.assignees = {};
  for (const category of CLOSING_CATEGORIES) closingState.assignees[category] = new Set();
  for (const row of assignments || []) {
    const category = row.category || "Общее";
    if (!closingState.assignees[category]) closingState.assignees[category] = new Set();
    closingState.assignees[category].add(String(row.user_id));
  }
  closingRenderAll();
}

function closingUniqueWorkdays(rows) {
  return [...new Set((rows || []).map(row => row.workday).filter(Boolean))].slice(0, 10);
}

async function closingLoadHistory() {
  const panel = document.getElementById("closingHistoryPanel");
  const content = document.getElementById("closingHistoryContent");
  if (!panel || !content) return;
  panel.classList.remove("hidden");
  closingState.historyOpen = true;
  content.innerHTML = `<p>Загрузка истории...</p>`;

  try {
    const historyRows = await closingFetch("closing_checks?select=workday&order=workday.desc&limit=300");
    let workdays = closingUniqueWorkdays(historyRows);
    if (!workdays.includes(closingState.workday)) workdays.unshift(closingState.workday);
    workdays = [...new Set(workdays)].slice(0, 14);
    const selected = closingState.historySelectedDay && workdays.includes(closingState.historySelectedDay)
      ? closingState.historySelectedDay
      : workdays[0];
    closingState.historySelectedDay = selected;

    content.innerHTML = `
      <div class="closing-history-picker">
        <label>Выбери дату закрытия</label>
        <select id="closingHistorySelect">
          ${workdays.map(day => `<option value="${closingEscape(day)}" ${day === selected ? "selected" : ""}>${closingEscape(closingDisplayDate(day))}</option>`).join("")}
        </select>
      </div>
      <div id="closingHistoryDetail" class="closing-history-detail">
        <p>Загрузка закрытия...</p>
      </div>
    `;

    const select = document.getElementById("closingHistorySelect");
    if (select) {
      select.onchange = () => {
        closingState.historySelectedDay = select.value;
        closingLoadHistoryDay(select.value).catch(() => {});
      };
    }
    await closingLoadHistoryDay(selected);
  } catch (error) {
    content.innerHTML = `<p>Не получилось загрузить историю. Проверь таблицы Supabase.</p>`;
  }
}

async function closingLoadHistoryDay(day) {
  const detail = document.getElementById("closingHistoryDetail");
  if (!detail || !day) return;
  detail.innerHTML = `<p>Загрузка закрытия...</p>`;
  const [checks, assignments] = await Promise.all([
    closingFetch(`closing_checks?workday=eq.${day}&select=item_key,checked,checked_by,checked_at`),
    closingFetch(`closing_assignments?workday=eq.${day}&select=category,user_id,assigned_at,assigned_by`),
  ]);
  detail.innerHTML = closingHistoryCard(day, checks || [], assignments || []);
}

function closingHistoryCard(day, checks, assignments) {
  const checkMap = {};
  for (const row of checks) checkMap[row.item_key] = row;
  const total = window.CLOSING_ITEMS.length;
  const done = window.CLOSING_ITEMS.filter(item => checkMap[item.key]?.checked).length;
  const percent = total ? Math.round(done / total * 100) : 0;

  const assignedByCategory = {};
  for (const category of CLOSING_CATEGORIES) assignedByCategory[category] = [];
  for (const row of assignments) {
    const category = row.category || "Общее";
    if (!assignedByCategory[category]) assignedByCategory[category] = [];
    assignedByCategory[category].push(String(row.user_id));
  }

  const categoryHtml = CLOSING_CATEGORIES.map(category => {
    const items = window.CLOSING_ITEMS.filter(item => item.category === category);
    const categoryDone = items.filter(item => checkMap[item.key]?.checked).length;
    const names = (assignedByCategory[category] || []).map(id => closingUserName(closingState.users[id])).join(", ") || "не назначены";
    return `
      <div class="closing-history-category">
        <div>
          <strong>${closingEscape(category)}</strong>
          <span>${closingEscape(names)}</span>
        </div>
        <em>${categoryDone}/${items.length}</em>
      </div>
    `;
  }).join("");

  const doneItems = window.CLOSING_ITEMS
    .filter(item => checkMap[item.key]?.checked)
    .map(item => {
      const row = checkMap[item.key];
      const who = row.checked_by ? closingUserName(closingState.users[String(row.checked_by)]) : "Сотрудник";
      const at = row.checked_at ? new Date(row.checked_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
      return `<li>${closingEscape(item.title)} <span>${closingEscape(who)} ${closingEscape(at)}</span></li>`;
    }).join("");

  return `
    <section class="closing-history-card closing-history-modal">
      <div class="closing-history-card-head">
        <div>
          <small>Закрытие</small>
          <strong>${closingEscape(closingDisplayDate(day))}</strong>
        </div>
        <span>${done}/${total}</span>
      </div>
      <div class="closing-progress history"><i style="width:${percent}%"></i></div>
      <div class="closing-history-categories">${categoryHtml}</div>
      ${doneItems ? `<ul class="closing-history-list">${doneItems}</ul>` : `<p>Выполненных пунктов пока нет.</p>`}
    </section>
  `;
}

function closingCloseHistory() {
  const panel = document.getElementById("closingHistoryPanel");
  if (panel) panel.classList.add("hidden");
  closingState.historyOpen = false;
}

async function closingAddAssignee(category) {
  const select = document.querySelector(`[data-category-select="${CSS.escape(category)}"]`);
  const status = document.getElementById("closingStatus");
  const selected = select?.value;
  if (!selected) return;
  try {
    await closingFetch("closing_assignments?on_conflict=workday,category,user_id", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        workday: closingState.workday,
        category,
        user_id: Number(selected),
        assigned_by: userId ? Number(userId) : null,
      }),
    });
    closingCategoryAssignees(category).add(String(selected));
    closingRenderAssignees(category);
    status.textContent = `${category}: добавлен ${closingUserName(closingState.users[selected])}`;
  } catch (error) {
    status.textContent = "Не получилось добавить сотрудника. Запусти обновлённый SQL для закрытия.";
  }
}

async function closingRemoveAssignee(category, id) {
  const status = document.getElementById("closingStatus");
  try {
    await closingFetch(`closing_assignments?workday=eq.${closingState.workday}&category=eq.${encodeURIComponent(category)}&user_id=eq.${id}`, { method: "DELETE" });
    closingCategoryAssignees(category).delete(String(id));
    closingRenderAssignees(category);
    status.textContent = `${category}: убран ${closingUserName(closingState.users[id])}`;
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
    if (closingState.historyOpen && closingState.historySelectedDay) closingLoadHistoryDay(closingState.historySelectedDay).catch(() => {});
  } catch (error) {
    status.textContent = "Не получилось сохранить галочку. Проверь SQL для закрытия.";
    await closingLoadData().catch(() => {});
  }
}

function closingInit() {
  closingBuildSection();
  const historyButton = document.getElementById("closingHistoryButton");
  const historyClose = document.getElementById("closingHistoryClose");
  if (historyButton) historyButton.onclick = closingLoadHistory;
  if (historyClose) historyClose.onclick = closingCloseHistory;
  closingLoadData().catch(() => {
    const status = document.getElementById("closingStatus");
    if (status) status.textContent = "Раздел готов, но нужны таблицы Supabase для сохранения.";
  });
  setInterval(() => {
    const newKey = closingTodayKey();
    if (newKey !== closingState.workday) closingLoadData().catch(() => {});
  }, 60000);
  setInterval(() => {
    closingLoadData().catch(() => {});
    if (closingState.historyOpen && closingState.historySelectedDay) closingLoadHistoryDay(closingState.historySelectedDay).catch(() => {});
  }, 10000);
}

closingInit();
