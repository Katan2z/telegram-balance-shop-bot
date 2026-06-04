const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

const user = tg?.initDataUnsafe?.user || null;
const userId = user ? String(user.id) : null;
const medal = ["🥇", "🥈", "🥉"];
const BOT_USERNAME = "bk8_shop_bot";
const ADMIN_IDS = ["818748106", "747818163", "5311640125"];
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

function normalizeData(data) {
  data.users = data.users || {};
  data.admin_ids = Array.from(new Set([...(data.admin_ids || []).map(String), ...ADMIN_IDS]));
  data.root_admin_ids = ADMIN_IDS;
  data.top_month = Object.entries(data.users)
    .map(([id, item]) => ({ user_id: id, name: item.name || "Сотрудник", amount: Number(item.balance || 0) }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return data;
}

async function loadSupabaseData() {
  const config = window.APP_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Supabase config missing");

  const response = await fetch(`${url}/rest/v1/users?select=telegram_id,username,first_name,last_name,balance,updated_at&order=balance.desc`, {
    cache: "no-store",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
    },
  });
  if (!response.ok) throw new Error("Supabase users unavailable");
  const rows = await response.json();
  const users = {};
  for (const row of rows) {
    const id = String(row.telegram_id);
    const balance = Number(row.balance || 0);
    users[id] = {
      name: userNameFromRow(row),
      balance,
      received_month: balance,
      received_total: balance,
    };
  }
  return normalizeData({ users, admin_ids: ADMIN_IDS, root_admin_ids: ADMIN_IDS, top_month: [] });
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

function ensureAdminTab() {
  const tabs = document.getElementById("tabs");
  if (!tabs.querySelector('[data-tab="admin"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="admin">Админка</button>');
    tabs.querySelector('[data-tab="admin"]').addEventListener("click", () => switchTab("admin"));
  }
}

function setupAdmin(data) {
  if (!isAdmin(data)) return;
  ensureAdminTab();

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

async function refreshData() {
  const data = await loadData();
  renderTop(data.top_month);
  renderHero(data.top_month);
  renderMyStats(data);
  setupAdmin(data);
}

async function main() {
  setText("userName", user ? `${user.first_name}` : "Спасибки");
  try {
    await refreshData();
    setInterval(() => refreshData().catch(() => {}), 5000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshData().catch(() => {});
    });
  } catch (error) {
    document.getElementById("topMonth").innerHTML = `<p>Нет данных.</p>`;
    document.getElementById("myStats").innerHTML = `<p>Нет данных.</p>`;
  }
}

main();
