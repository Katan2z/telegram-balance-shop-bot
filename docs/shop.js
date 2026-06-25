function shopEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shopConfig() {
  const config = window.APP_CONFIG || {};
  return {
    url: String(config.SUPABASE_URL || "").replace(/\/$/, ""),
    key: config.SUPABASE_ANON_KEY || "",
  };
}

async function shopFetch(path, options = {}) {
  const config = shopConfig();
  if (!config.url || !config.key) throw new Error("Supabase config missing");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204 || !response.headers.get("content-type")?.includes("application/json")) return null;
  return response.json();
}

let shopState = { items: [], receipts: [], coins: 0 };

function shopBuildSection() {
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;

  if (!tabs.querySelector('[data-tab="shop"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="shop">Магазин</button>');
    tabs.querySelector('[data-tab="shop"]').addEventListener("click", () => switchTab("shop"));
  }

  if (!document.getElementById("tab-shop")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-shop">
        <article class="card shop-panel">
          <div class="shop-head">
            <div>
              <h2>🛍️ Магазин</h2>
              <p class="muted">Покупай за монетки. Чек действует 6 часов.</p>
            </div>
            <div class="shop-balance"><span>🪙 Монетки</span><strong id="shopCoins">0</strong></div>
          </div>
          <p id="shopStatus" class="shop-status"></p>
          <div id="shopGrid" class="shop-grid"></div>
          <div class="shop-receipts">
            <h3>🎟️ Мои активные чеки</h3>
            <div id="shopReceipts"></div>
          </div>
        </article>
      </section>
    `);
  }
}

function shopFormatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return `${time}, ${day}`;
}

function shopPhoto(item) {
  if (item.image_url) return `<img src="${shopEscape(item.image_url)}" alt="${shopEscape(item.title)}" loading="lazy" />`;
  return item.emoji || "🎁";
}

function shopRender() {
  shopBuildSection();
  const coins = document.getElementById("shopCoins");
  const grid = document.getElementById("shopGrid");
  const receipts = document.getElementById("shopReceipts");
  if (!grid || !receipts) return;
  if (coins) coins.textContent = shopState.coins;

  grid.innerHTML = shopState.items.map(item => {
    const price = Number(item.price_coins || 0);
    const canBuy = shopState.coins >= price;
    return `
      <article class="shop-card">
        <div class="shop-photo">${shopPhoto(item)}</div>
        <div class="shop-body">
          <h3>${shopEscape(item.title)}</h3>
          ${item.description ? `<p>${shopEscape(item.description)}</p>` : ""}
          <div class="shop-price">🪙 ${price}</div>
          <button class="shop-buy" data-shop-buy="${item.id}" ${canBuy ? "" : "disabled"}>${canBuy ? "Купить" : "Не хватает монеток"}</button>
        </div>
      </article>
    `;
  }).join("") || `<p class="shop-empty">Товары пока не добавлены.</p>`;

  const activeReceipts = shopState.receipts.filter(item => new Date(item.expires_at).getTime() > Date.now());
  receipts.innerHTML = activeReceipts.map(item => `
    <article class="shop-receipt">
      <strong>${shopEscape(item.item_title)}</strong>
      <div class="shop-code">${shopEscape(item.receipt_code)}</div>
      <span>Действителен до ${shopEscape(shopFormatTime(item.expires_at))}</span>
      <span>Стоимость: ${Number(item.price_coins || 0)} монеток</span>
    </article>
  `).join("") || `<p class="shop-empty">Активных чеков пока нет.</p>`;

  document.querySelectorAll("[data-shop-buy]").forEach(button => {
    button.onclick = () => shopBuy(Number(button.dataset.shopBuy));
  });
}

async function shopLoad() {
  if (!userId) return;
  shopBuildSection();
  const [items, users, receipts] = await Promise.all([
    shopFetch("shop_items?is_active=eq.true&select=*&order=sort_order.asc,id.asc"),
    shopFetch(`users?telegram_id=eq.${userId}&select=coins&limit=1`),
    shopFetch(`shop_purchases?user_id=eq.${userId}&status=eq.active&select=*&order=created_at.desc&limit=10`),
  ]);
  shopState.items = items || [];
  shopState.coins = Number(users?.[0]?.coins || 0);
  shopState.receipts = receipts || [];
  shopRender();
}

async function shopBuy(itemId) {
  const status = document.getElementById("shopStatus");
  try {
    if (status) status.textContent = "Покупаем...";
    const result = await shopFetch("rpc/purchase_shop_item", {
      method: "POST",
      body: JSON.stringify({ p_user_id: Number(userId), p_item_id: Number(itemId) }),
    });
    if (status) status.textContent = `Покупка готова. Чек: ${result?.receipt_code || "создан"}`;
    await shopLoad();
    if (typeof renderApp === "function") await renderApp();
  } catch (error) {
    if (status) status.textContent = "Не получилось купить. Возможно, не хватает монеток или не выполнен SQL магазина.";
  }
}

shopBuildSection();
shopLoad().catch(() => {});
setInterval(() => shopLoad().catch(() => {}), 15000);
