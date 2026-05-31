const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

const user = tg?.initDataUnsafe?.user || null;
const userId = user ? String(user.id) : null;
const medal = ["🥇", "🥈", "🥉"];

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

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
  document.querySelectorAll(".tab-page").forEach(page => page.classList.toggle("active", page.id === `tab-${tabName}`));
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

async function loadData() {
  const response = await fetch(`public-data.json?v=${Date.now()}`);
  if (!response.ok) throw new Error("Не удалось загрузить данные");
  return response.json();
}

function getUserRank(data, currentUserId) {
  const rows = Object.entries(data.users || {})
    .map(([id, item]) => ({ id, amount: Number(item.received_month || 0) }))
    .sort((a, b) => b.amount - a.amount);
  const index = rows.findIndex(row => row.id === currentUserId);
  return index >= 0 ? index + 1 : null;
}

function renderTop(items) {
  const root = document.getElementById("topMonth");
  if (!items || items.length === 0) {
    root.innerHTML = `<p>Пока никто не получил спасибки в этом месяце. Будь первым героем смены!</p>`;
    return;
  }
  root.innerHTML = items.slice(0, 3).map((item, index) => `
    <div class="rank rank-${index + 1}">
      <div class="rank-medal">${medal[index] || "🏅"}</div>
      <div>
        <strong>${htmlEscape(item.name || "Сотрудник")}</strong>
        <span>${Number(item.amount || 0)} спасибок за месяц</span>
      </div>
    </div>
  `).join("");
}

function renderHero(items) {
  const root = document.getElementById("heroMonth");
  const hero = items?.[0];
  if (!hero) {
    root.innerHTML = `<p>Герой месяца пока не определён. Начисли первые спасибки через админку.</p>`;
    return;
  }
  root.innerHTML = `
    <div class="hero-person">
      <div class="hero-avatar">👑</div>
      <strong>${htmlEscape(hero.name || "Сотрудник")}</strong>
      <span>${Number(hero.amount || 0)} спасибок за месяц</span>
      <div class="progress"><i style="width:${Math.min(100, Number(hero.amount || 0))}%"></i></div>
    </div>
  `;
}

function renderProducts(products) {
  const root = document.getElementById("products");
  const activeProducts = (products || []).filter(product => product.active !== false);
  if (activeProducts.length === 0) {
    root.innerHTML = `<p>Магазин пока пуст. Скоро тут появятся вкусные призы.</p>`;
    return;
  }
  root.innerHTML = activeProducts.map(product => `
    <div class="product">
      <strong>${htmlEscape(product.name)}</strong>
      <span>${htmlEscape(product.description || "")}</span>
      <div class="pill">${Number(product.price || 0)} спасибок</div>
    </div>
  `).join("");
}

function renderMyStats(data) {
  const root = document.getElementById("myStats");
  const publicUser = userId ? data.users?.[userId] : null;
  if (!userId) {
    root.innerHTML = `<p>Открой приложение из Telegram, чтобы увидеть личную статистику.</p>`;
    return;
  }
  if (!publicUser) {
    root.innerHTML = `<p>Ты пока не в базе. Напиши боту /start или получи первые спасибки.</p>`;
    return;
  }
  const rank = getUserRank(data, userId);
  setText("balance", Number(publicUser.balance || 0));
  root.innerHTML = `
    <div class="stat-row"><strong>${Number(publicUser.received_month || 0)}</strong><span>получено за месяц</span></div>
    <div class="stat-row"><strong>${Number(publicUser.received_total || 0)}</strong><span>получено за всё время</span></div>
    <div class="stat-row"><strong>${rank ? `#${rank}` : "—"}</strong><span>место в рейтинге месяца</span></div>
    <div class="stat-row"><strong>${Number(publicUser.balance || 0)}</strong><span>можно потратить в магазине</span></div>
  `;
}

function renderAdmin(data) {
  const root = document.getElementById("adminStats");
  if (!data.stats) return;
  root.innerHTML = `
    <div class="stat-row"><strong>${Number(data.stats.users_count || 0)}</strong><span>пользователей</span></div>
    <div class="stat-row"><strong>${Number(data.stats.transactions_count || 0)}</strong><span>операций</span></div>
    <div class="stat-row"><strong>${Number(data.stats.total_given_month || 0)}</strong><span>выдано за месяц</span></div>
    <div class="stat-row"><strong>${htmlEscape(data.month || "")}</strong><span>текущий период</span></div>
  `;
}

async function main() {
  setText("userName", user ? `${user.first_name} · ${user.id}` : "Открыто вне Telegram");
  try {
    const data = await loadData();
    renderTop(data.top_month);
    renderHero(data.top_month);
    renderProducts(data.products);
    renderMyStats(data);
    renderAdmin(data);
  } catch (error) {
    document.getElementById("topMonth").innerHTML = `<p>Не удалось загрузить статистику.</p>`;
    document.getElementById("myStats").innerHTML = `<p>${htmlEscape(error.message)}</p>`;
    document.getElementById("products").innerHTML = `<p>Попробуй обновить приложение.</p>`;
  }
}

main();
