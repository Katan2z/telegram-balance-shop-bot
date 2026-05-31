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
  if (!response.ok) throw new Error("Данные временно недоступны");
  return response.json();
}

function getUserRank(data, currentUserId) {
  const rows = Object.entries(data.users || {})
    .map(([id, item]) => ({ id, amount: Number(item.received_month || 0) }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const index = rows.findIndex(row => row.id === currentUserId);
  return index >= 0 ? index + 1 : null;
}

function renderTop(items) {
  const root = document.getElementById("topMonth");
  if (!items || items.length === 0) {
    root.innerHTML = `<p>Рейтинг пока пуст.</p>`;
    return;
  }
  root.innerHTML = items.slice(0, 3).map((item, index) => `
    <div class="rank rank-${index + 1}">
      <div class="rank-medal">${medal[index] || "🏅"}</div>
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
    root.innerHTML = `<p>Пока не определён.</p>`;
    return;
  }
  root.innerHTML = `
    <div class="hero-person">
      <div class="hero-avatar">👑</div>
      <strong>${htmlEscape(hero.name || "Сотрудник")}</strong>
      <span>${Number(hero.amount || 0)} спасибок</span>
      <div class="progress"><i style="width:${Math.min(100, Number(hero.amount || 0))}%"></i></div>
    </div>
  `;
}

function renderProducts(products) {
  const root = document.getElementById("products");
  const activeProducts = (products || []).filter(product => product.active !== false);
  if (activeProducts.length === 0) {
    root.innerHTML = `<p>Магазин пуст.</p>`;
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
  if (!userId || !publicUser) {
    root.innerHTML = `<p>Нет данных.</p>`;
    return;
  }
  const rank = getUserRank(data, userId);
  setText("balance", Number(publicUser.balance || 0));
  root.innerHTML = `
    <div class="stat-row"><strong>${Number(publicUser.received_month || 0)}</strong><span>за месяц</span></div>
    <div class="stat-row"><strong>${Number(publicUser.received_total || 0)}</strong><span>за всё время</span></div>
    <div class="stat-row"><strong>${rank ? `#${rank}` : "—"}</strong><span>место</span></div>
    <div class="stat-row"><strong>${Number(publicUser.balance || 0)}</strong><span>баланс</span></div>
  `;
}

async function main() {
  setText("userName", user ? `${user.first_name}` : "Спасибки");
  try {
    const data = await loadData();
    renderTop(data.top_month);
    renderHero(data.top_month);
    renderProducts(data.products);
    renderMyStats(data);
  } catch (error) {
    document.getElementById("topMonth").innerHTML = `<p>Нет данных.</p>`;
    document.getElementById("myStats").innerHTML = `<p>Нет данных.</p>`;
    document.getElementById("products").innerHTML = `<p>Нет данных.</p>`;
  }
}

main();
