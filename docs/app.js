const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

const user = tg?.initDataUnsafe?.user || null;
const userId = user ? String(user.id) : null;
const medal = ["🥇", "🥈", "🥉"];
const BOT_USERNAME = "bk8_shop_bot";
const ROOT_ADMIN_IDS = ["818748106"];
const RAW_DATA_URL = "https://raw.githubusercontent.com/Katan2z/telegram-balance-shop-bot/main/docs/public-data.json";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name) {
  const text = String(name || "Сотрудник").trim();
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function avatar(name, className = "") {
  return `<div class="avatar ${className}">${htmlEscape(initials(name))}</div>`;
}

function openBotDeepLink(payload) {
  const link = `https://t.me/${BOT_USERNAME}?start=${payload}`;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(link);
  else window.location.href = link;
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
  document.querySelectorAll(".tab-page").forEach(page => page.classList.toggle("active", page.id === `tab-${tabName}`));
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

function userNameFromRow(row) {
  if (row.first_name) return row.first_name;
  if (row.username) return `@${row.username}`;
  return "Сотрудник";
}

function profileNameFromRow(row) {
  const name = String(row?.full_name || "").trim();
  if (!name || name === "Ожидает регистрации") return "";
  return name;
}

function supabaseConfig() {
  const config = window.APP_CONFIG || {};
  return {
    url: String(config.SUPABASE_URL || "").replace(/\/$/, ""),
    key: config.SUPABASE_ANON_KEY || "",
  };
}

async function supabaseFetch(path) {
  const config = supabaseConfig();
  if (!config.url || !config.key) throw new Error("Supabase config missing");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    cache: "no-store",
    headers: {
      "apikey": config.key,
      "Authorization": `Bearer ${config.key}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${path}`);
  return response.json();
}

async function supabaseWrite(path, options = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.key) throw new Error("Supabase config missing");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "apikey": config.key,
      "Authorization": `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204 || !response.headers.get("content-type")?.includes("application/json")) return null;
  return response.json();
}

function normalizeData(data) {
  data.users = data.users || {};
  data.admin_ids = Array.from(new Set([...(data.admin_ids || []).map(String), ...ROOT_ADMIN_IDS]));
  data.root_admin_ids = Array.from(new Set([...(data.root_admin_ids || []).map(String), ...ROOT_ADMIN_IDS]));
  data.instructor_ids = Array.from(new Set([...(data.instructor_ids || []).map(String), ...data.admin_ids.map(String)]));
  data.klokr_top = data.klokr_top || [];
  data.top_month = Object.entries(data.users)
    .map(([id, item]) => ({ user_id: id, name: item.name || "Сотрудник", amount: Number(item.balance || 0) }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return data;
}

function preserveSelectValue(select, html) {
  if (!select) return;
  const previousValue = select.value;
  select.innerHTML = html;
  if (previousValue && [...select.options].some(option => option.value === previousValue)) {
    select.value = previousValue;
  }
}

async function loadSupabaseData() {
  const [usersRows, managerRows, instructorRows, klokrRows, profileRows] = await Promise.all([
    supabaseFetch("users?select=telegram_id,username,first_name,last_name,balance,coins,updated_at&order=balance.desc"),
    supabaseFetch("managers?select=telegram_id,created_by,created_at"),
    supabaseFetch("instructors?select=telegram_id,created_by,created_at").catch(() => []),
    supabaseFetch("klokr_assessments?select=id,employee_id,instructor_id,total_score,max_score,percent,created_at&order=percent.desc,created_at.desc&limit=3").catch(() => []),
    supabaseFetch("employee_profiles?activation_status=eq.active&select=telegram_id,full_name,position,restaurant").catch(() => []),
  ]);

  const profilesByTelegram = Object.fromEntries((profileRows || [])
    .filter(row => row.telegram_id)
    .map(row => [String(row.telegram_id), row]));

  const users = {};
  for (const row of usersRows) {
    const id = String(row.telegram_id);
    const balance = Number(row.balance || 0);
    const coins = Number(row.coins || 0);
    const profileName = profileNameFromRow(profilesByTelegram[id]);
    users[id] = {
      name: profileName || userNameFromRow(row),
      profile_name: profileName,
      balance,
      coins,
      received_month: balance,
      received_total: balance,
    };
  }

  const managerIds = managerRows.map(row => String(row.telegram_id));
  const instructorIds = (instructorRows || []).map(row => String(row.telegram_id));
  const adminIds = [...ROOT_ADMIN_IDS, ...managerIds];
  const klokrTop = (klokrRows || []).map(row => ({
    id: row.id,
    user_id: String(row.employee_id),
    instructor_id: row.instructor_id ? String(row.instructor_id) : null,
    name: users[String(row.employee_id)]?.name || "Сотрудник",
    instructor_name: users[String(row.instructor_id)]?.name || "Инструктор",
    total_score: Number(row.total_score || 0),
    max_score: Number(row.max_score || 0),
    percent: Number(row.percent || 0),
    created_at: row.created_at,
  }));

  return normalizeData({
    users,
    managers: managerRows,
    instructors: instructorRows || [],
    instructor_ids: [...instructorIds, ...adminIds],
    admin_ids: adminIds,
    root_admin_ids: ROOT_ADMIN_IDS,
    top_month: [],
    klokr_top: klokrTop,
  });
}

async function loadData() {
  try {
    return await loadSupabaseData();
  } catch (supabaseError) {
    const response = await fetch(`${RAW_DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Данные временно недоступны");
    return normalizeData(await response.json());
  }
}

function getUserRank(data, currentUserId) {
  const rows = Object.entries(data.users || {})
    .map(([id, item]) => ({ id, amount: Number(item.balance || 0) }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const index = rows.findIndex(row => row.id === currentUserId);
  return index >= 0 ? index + 1 : null;
}

function renderTop(items) {
  const root = document.getElementById("topMonth");
  if (!items || items.length === 0) {
    root.innerHTML = `<p>Рейтинг пока пуст. Начисли первые спасибки — и тут появятся герои.</p>`;
    return;
  }
  root.innerHTML = items.slice(0, 3).map((item, index) => `
    <div class="rank rank-${index + 1}">
      <div class="rank-medal">${medal[index] || "🏅"}</div>
      ${avatar(item.name)}
      <div>
        <strong>${htmlEscape(item.name || "Сотрудник")}</strong>
        <span>${Number(item.amount || 0)} спасибок</span>
      </div>
    </div>
  `).join("");
}

function renderHero(items) {
  const root = document.getElementById("heroMonth");
  const hero = items?.[0];
  if (!hero) {
    root.innerHTML = `<p>Пока не определён. Герой появится после первого начисления.</p>`;
    return;
  }
  const amount = Number(hero.amount || 0);
  root.innerHTML = `
    <div class="hero-person">
      ${avatar(hero.name, "hero-avatar")}
      <strong>${htmlEscape(hero.name || "Сотрудник")}</strong>
      <span>👑 ${amount} спасибок</span>
      <div class="progress"><i style="width:${Math.min(100, Math.max(8, amount))}%"></i></div>
    </div>
  `;
}

function renderKlokrTop(items) {
  const root = document.getElementById("klokrTopHome");
  if (!root) return;
  if (!items || items.length === 0) {
    root.innerHTML = `<p>Пока нет проверок. Лучшие результаты КЛОКР появятся здесь после первой оценки.</p>`;
    return;
  }
  root.innerHTML = items.slice(0, 3).map((item, index) => `
    <div class="klokr-home-row">
      <div class="klokr-home-medal">${medal[index] || "🏅"}</div>
      <div>
        <strong>${htmlEscape(item.name || "Сотрудник")}</strong>
        <span>${Number(item.total_score || 0)}/${Number(item.max_score || 0)} баллов · ${htmlEscape(item.instructor_name || "Инструктор")}</span>
      </div>
      <div class="klokr-home-percent">${Number(item.percent || 0)}%</div>
    </div>
  `).join("");
}

function renderMyStats(data) {
  const root = document.getElementById("myStats");
  const publicUser = userId ? data.users?.[userId] : null;
  if (!userId || !publicUser) {
    root.innerHTML = `<p>Нет данных. Открой приложение через Telegram и нажми /start у бота.</p>`;
    setText("balance", 0);
    setText("coinsBalance", 0);
    return;
  }
  setText("userName", publicUser.name || user?.first_name || user?.username || "Сотрудник");
  const rank = getUserRank(data, userId);
  const balance = Number(publicUser.balance || 0);
  const coins = Number(publicUser.coins || 0);
  setText("balance", balance);
  setText("coinsBalance", coins);
  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile"><small>Спасибки</small><strong>${balance}</strong><span>за этот месяц</span></div>
      <div class="stat-tile"><small>Монетки</small><strong>${coins}</strong><span>для магазина</span></div>
      <div class="stat-tile"><small>Место</small><strong>${rank ? `#${rank}` : "—"}</strong><span>в рейтинге</span></div>
      <div class="stat-tile"><small>Курс</small><strong>5:1</strong><span>монетки сверху</span></div>
    </div>
  `;
}

function isAdmin(data) {
  return Boolean(userId && data.admin_ids && data.admin_ids.map(String).includes(userId));
}

function isRootAdmin(data) {
  return Boolean(userId && data.root_admin_ids && data.root_admin_ids.map(String).includes(userId));
}

function ensureAdminTabs(data) {
  const tabs = document.getElementById("tabs");
  if (!tabs.querySelector('[data-tab="admin"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="admin">Админка</button>');
    tabs.querySelector('[data-tab="admin"]').addEventListener("click", () => switchTab("admin"));
  }
  if (isRootAdmin(data) && !tabs.querySelector('[data-tab="managers"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="managers">Менеджеры</button>');
    tabs.querySelector('[data-tab="managers"]').addEventListener("click", () => switchTab("managers"));
  }
}

function setupAdmin(data) {
  if (!isAdmin(data)) return;
  ensureAdminTabs(data);
  const select = document.getElementById("adminUser");
  const amount = document.getElementById("adminAmount");
  const status = document.getElementById("adminStatus");
  const options = Object.entries(data.users).map(([id, item]) => `<option value="${id}">${htmlEscape(item.name)} — ${Number(item.balance || 0)} спасибок</option>`).join("");
  preserveSelectValue(select, options);

  document.getElementById("adminAdd").onclick = () => {
    const value = Math.abs(Number(amount.value || 0));
    if (!select.value || !value) {
      status.textContent = "Выбери сотрудника и сумму.";
      return;
    }
    openBotDeepLink(`admin_${select.value}_${value}`);
  };

  document.getElementById("adminRemove").onclick = () => {
    const value = Math.abs(Number(amount.value || 0));
    if (!select.value || !value) {
      status.textContent = "Выбери сотрудника и сумму.";
      return;
    }
    openBotDeepLink(`admin_${select.value}_${-value}`);
  };

  setupManagers(data);
}

function setupManagers(data) {
  if (!isRootAdmin(data)) return;
  const select = document.getElementById("managerUser");
  const status = document.getElementById("managerStatus");
  const list = document.getElementById("managersList");
  const options = Object.entries(data.users).map(([id, item]) => `<option value="${id}">${htmlEscape(item.name)} — ${id}</option>`).join("");
  preserveSelectValue(select, options);

  const managerSet = new Set((data.managers || []).map(row => String(row.telegram_id)));
  list.innerHTML = [...managerSet].map(id => {
    const item = data.users[id] || { name: "Сотрудник" };
    return `<div class="manager-row"><strong>${htmlEscape(item.name)}</strong><span>${id}</span></div>`;
  }).join("") || `<p>Менеджеров пока нет.</p>`;

  document.getElementById("managerAdd").onclick = () => {
    if (!select.value) {
      status.textContent = "Выбери сотрудника.";
      return;
    }
    openBotDeepLink(`manager_add_${select.value}`);
  };

  document.getElementById("managerRemove").onclick = () => {
    if (!select.value) {
      status.textContent = "Выбери сотрудника.";
      return;
    }
    openBotDeepLink(`manager_remove_${select.value}`);
  };

  setupInstructorRoles(data);
}

function setupInstructorRoles(data) {
  if (!isRootAdmin(data)) return;
  const panel = document.querySelector("#tab-managers .managers-panel");
  if (!panel) return;
  let root = document.getElementById("instructorRolesManager");
  if (!root) {
    panel.insertAdjacentHTML("beforeend", `
      <div class="instructor-role-card" id="instructorRolesManager">
        <div>
          <p class="instructor-kicker">Роль</p>
          <h3>Инструкторы</h3>
          <p class="muted">Админы уже считаются инструкторами автоматически. Здесь выдаём роль обычным сотрудникам.</p>
        </div>
        <label>Сотрудник</label>
        <select id="instructorUserSelect"></select>
        <div class="admin-actions">
          <button id="instructorAdd" class="action-btn add">+ Дать инструктора</button>
          <button id="instructorRemove" class="action-btn remove">− Забрать</button>
        </div>
        <div id="instructorsList" class="instructor-list"></div>
        <p id="instructorRoleStatus" class="admin-status"></p>
      </div>
    `);
    root = document.getElementById("instructorRolesManager");
  }

  const instructorSelect = document.getElementById("instructorUserSelect");
  preserveSelectValue(instructorSelect, Object.entries(data.users).map(([id, item]) => `<option value="${id}">${htmlEscape(item.name)} — ${id}</option>`).join(""));

  const adminSet = new Set((data.admin_ids || []).map(String));
  const explicitInstructorSet = new Set((data.instructors || []).map(row => String(row.telegram_id)));
  const instructorsList = document.getElementById("instructorsList");
  instructorsList.innerHTML = [
    ...[...adminSet].map(id => ({ id, type: "админ" })),
    ...[...explicitInstructorSet].filter(id => !adminSet.has(id)).map(id => ({ id, type: "инструктор" })),
  ].map(item => {
    const user = data.users[item.id] || { name: "Сотрудник" };
    return `<div><strong>${htmlEscape(user.name)}</strong><span>${htmlEscape(item.type)} · ${htmlEscape(item.id)}</span></div>`;
  }).join("") || `<p>Инструкторов пока нет.</p>`;

  document.getElementById("instructorAdd").onclick = () => changeInstructorRole(true);
  document.getElementById("instructorRemove").onclick = () => changeInstructorRole(false);
}

async function changeInstructorRole(add) {
  const status = document.getElementById("instructorRoleStatus");
  const target = document.getElementById("instructorUserSelect")?.value;
  if (!target) {
    if (status) status.textContent = "Выбери сотрудника.";
    return;
  }
  try {
    if (add) {
      await supabaseWrite("instructors?on_conflict=telegram_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ telegram_id: Number(target), created_by: userId ? Number(userId) : null, created_at: new Date().toISOString() }),
      });
      if (status) status.textContent = "Роль инструктора выдана.";
    } else {
      await supabaseWrite(`instructors?telegram_id=eq.${target}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      if (status) status.textContent = "Роль инструктора снята. Если это админ — доступ к КЛОКР всё равно останется.";
    }
    await renderApp();
    if (typeof instructorLoad === "function") await instructorLoad();
  } catch (error) {
    if (status) status.textContent = "Не получилось обновить роль. Проверь SQL для таблицы instructors.";
  }
}

async function renderApp() {
  try {
    const data = await loadData();
    renderMyStats(data);
    renderTop(data.top_month);
    renderHero(data.top_month);
    renderKlokrTop(data.klokr_top);
    setupAdmin(data);
  } catch (error) {
    setText("userName", "Не удалось загрузить данные");
  }
}

if (user) setText("userName", user.first_name || user.username || "Сотрудник");
renderApp();
setInterval(renderApp, 10000);
