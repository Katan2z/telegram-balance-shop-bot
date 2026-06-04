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

function normalizeData(data) {
  data.users = data.users || {};
  data.admin_ids = Array.from(new Set([...(data.admin_ids || []).map(String), ...ROOT_ADMIN_IDS]));
  data.root_admin_ids = Array.from(new Set([...(data.root_admin_ids || []).map(String), ...ROOT_ADMIN_IDS]));

  const existingTop = new Map((data.top_month || []).map(item => [String(item.user_id), Number(item.amount || 0)]));
  for (const [id, item] of Object.entries(data.users)) {
    const balance = Number(item.balance || 0);
    const topAmount = existingTop.get(String(id));
    if (topAmount !== undefined && topAmount > balance) item.balance = topAmount;
    item.received_month = Number(item.balance || 0);
  }

  data.top_month = Object.entries(data.users)
    .map(([id, item]) => ({ user_id: id, name: item.name || "Сотрудник", amount: Number(item.balance || 0) }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return data;
}

async function loadData() {
  try {
    const response = await fetch(`${RAW_DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Raw data unavailable");
    return normalizeData(await response.json());
  } catch (error) {
    const response = await fetch(`public-data.json?v=${Date.now()}`, { cache: "no-store" });
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

function renderMyStats(data) {
  const root = document.getElementById("myStats");
  const publicUser = userId ? data.users?.[userId] : null;
  if (!userId || !publicUser) {
    root.innerHTML = `<p>Нет данных. Открой приложение через Telegram и нажми /start у бота.</p>`;
    setText("balance", 0);
    return;
  }
  const rank = getUserRank(data, userId);
  const balance = Number(publicUser.balance || 0);
  const total = Number(publicUser.received_total || balance || 0);
  setText("balance", balance);
  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile"><small>Баланс</small><strong>${balance}</strong><span>доступно</span></div>
      <div class="stat-tile"><small>Место</small><strong>${rank ? `#${rank}` : "—"}</strong><span>в рейтинге</span></div>
      <div class="stat-tile"><small>Результат</small><strong>${balance}</strong><span>сейчас</span></div>
      <div class="stat-tile"><small>Всего</small><strong>${total}</strong><span>за всё время</span></div>
    </div>
  `;
}

function isAdmin(data) {
  return Boolean(userId && data.admin_ids && data.admin_ids.map(String).includes(userId));
}

function ensureAdminTabs() {
  const tabs = document.getElementById("tabs");
  if (!tabs.querySelector('[data-tab="admin"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="admin">Админка</button>');
    tabs.querySelector('[data-tab="admin"]').addEventListener("click", () => switchTab("admin"));
  }
  if (!tabs.querySelector('[data-tab="managers"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="managers">Менеджеры</button>');
    tabs.querySelector('[data-tab="managers"]').addEventListener("click", () => switchTab("managers"));
  }
}

function setupAdmin(data) {
  if (!isAdmin(data)) return;
  ensureAdminTabs();

  const select = document.getElementById("adminUser");
  select.innerHTML = Object.entries(data.users || {}).map(([id, item]) => {
    const label = `${item.name || "Сотрудник"} · баланс ${item.balance || 0}`;
    return `<option value="${htmlEscape(id)}">${htmlEscape(label)}</option>`;
  }).join("");

  const amountInput = document.getElementById("adminAmount");
  const status = document.getElementById("adminStatus");

  function sendChange(direction) {
    const targetUserId = select.value;
    const amount = Number(amountInput.value || 0);
    if (!targetUserId || !amount || amount <= 0) {
      status.textContent = "Укажи сотрудника и сумму";
      return;
    }
    const realAmount = direction * amount;
    status.textContent = "Открываю бота для подтверждения";
    openBotDeepLink(`admin_${targetUserId}_${realAmount}`);
  }

  document.getElementById("adminAdd").onclick = () => sendChange(1);
  document.getElementById("adminRemove").onclick = () => sendChange(-1);
}

function setupManagers(data) {
  if (!isAdmin(data)) return;
  const select = document.getElementById("managerUser");
  const status = document.getElementById("managerStatus");
  const managersList = document.getElementById("managersList");
  const adminIds = new Set((data.admin_ids || []).map(String));
  const rootAdminIds = new Set((data.root_admin_ids || []).map(String));

  select.innerHTML = Object.entries(data.users || {}).map(([id, item]) => {
    const role = adminIds.has(String(id)) ? " · менеджер" : "";
    return `<option value="${htmlEscape(id)}">${htmlEscape((item.name || "Сотрудник") + role)}</option>`;
  }).join("");

  document.getElementById("managerAdd").onclick = () => {
    const targetUserId = select.value;
    if (!targetUserId) {
      status.textContent = "Выбери сотрудника";
      return;
    }
    status.textContent = "Открываю бота для выдачи прав";
    openBotDeepLink(`manager_add_${targetUserId}`);
  };

  document.getElementById("managerRemove").onclick = () => {
    const targetUserId = select.value;
    if (!targetUserId) {
      status.textContent = "Выбери сотрудника";
      return;
    }
    if (rootAdminIds.has(String(targetUserId))) {
      status.textContent = "Главного админа нельзя убрать из приложения";
      return;
    }
    status.textContent = "Открываю бота для снятия прав";
    openBotDeepLink(`manager_remove_${targetUserId}`);
  };

  const managerRows = Object.entries(data.users || {})
    .filter(([id]) => adminIds.has(String(id)))
    .map(([id, item]) => `
      <div class="rank manager-row">
        ${avatar(item.name)}
        <div>
          <strong>${htmlEscape(item.name || "Сотрудник")}</strong>
          <span>ID: ${htmlEscape(id)}${rootAdminIds.has(String(id)) ? " · главный админ" : " · менеджер"}</span>
        </div>
      </div>
    `).join("");

  managersList.innerHTML = managerRows || `<p>Менеджеров пока нет.</p>`;
}

async function refreshData() {
  const data = await loadData();
  renderTop(data.top_month);
  renderHero(data.top_month);
  renderMyStats(data);
  setupAdmin(data);
  setupManagers(data);
}

async function main() {
  setText("userName", user ? `${user.first_name}` : "Спасибки");
  try {
    await refreshData();
    setInterval(() => refreshData().catch(() => {}), 10000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshData().catch(() => {});
    });
  } catch (error) {
    document.getElementById("topMonth").innerHTML = `<p>Нет данных.</p>`;
    document.getElementById("myStats").innerHTML = `<p>Нет данных.</p>`;
  }
}

main();
