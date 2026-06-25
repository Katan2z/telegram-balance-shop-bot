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
          <div class="shop-hero">
            <div class="shop-hero-copy">
              <p class="shop-kicker">BK Rewards</p>
              <h2><span>Магазин</span> наград</h2>
              <p class="muted">Забирай бонусы за монетки. Электронный чек действует 6 часов — просто покажи его менеджеру.</p>
              <div class="shop-benefits" aria-label="Преимущества магазина">
                <span>⚡ быстро</span>
                <span>🎟️ чек в приложении</span>
                <span>👑 для команды</span>
              </div>
            </div>
            <div class="shop-balance-card">
              <span>Твой баланс</span>
              <strong id="shopCoins">0</strong>
              <small>монеток</small>
            </div>
          </div>
          <div class="shop-toolbar">
            <div>
              <p class="shop-toolbar-label">Витрина</p>
              <h3>Выбери награду</h3>
            </div>
            <div id="shopSummary" class="shop-summary"></div>
          </div>
          <p id="shopStatus" class="shop-status"></p>
          <div id="shopGrid" class="shop-grid"></div>
          <div class="shop-receipts">
            <div class="shop-receipts-head">
              <div>
                <p class="shop-toolbar-label">После покупки</p>
                <h3>Активные чеки</h3>
              </div>
              <span id="shopReceiptsCount" class="shop-count">0</span>
            </div>
            <div id="shopReceipts" class="shop-receipts-grid"></div>
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
  return `<span>${shopEscape(item.emoji || "🎁")}</span>`;
}

function shopAffordText(price) {
  const diff = price - shopState.coins;
  if (diff <= 0) return "Можно забрать сейчас";
  return `Ещё ${diff} 🪙 до награды`;
}

function shopRender() {
  shopBuildSection();
  const coins = document.getElementById("shopCoins");
  const summary = document.getElementById("shopSummary");
  const grid = document.getElementById("shopGrid");
  const receipts = document.getElementById("shopReceipts");
  const receiptsCount = document.getElementById("shopReceiptsCount");
  if (!grid || !receipts) return;
  if (coins) coins.textContent = shopState.coins;

  const affordableCount = shopState.items.filter(item => shopState.coins >= Number(item.price_coins || 0)).length;
  if (summary) {
    summary.innerHTML = `
      <span>${shopState.items.length} наград</span>
      <strong>${affordableCount} доступно</strong>
    `;
  }

  grid.innerHTML = shopState.items.map((item, index) => {
    const price = Number(item.price_coins || 0);
    const canBuy = shopState.coins >= price;
    const progress = price > 0 ? Math.min(100, Math.round((shopState.coins / price) * 100)) : 100;
    return `
      <article class="shop-card reward-card ${index === 0 ? "shop-card-featured" : ""} ${canBuy ? "is-affordable" : "is-locked"}">
        <div class="shop-photo reward-photo">
          ${shopPhoto(item)}
          <div class="shop-card-badge">${canBuy ? "Доступно" : "Копим"}</div>
        </div>
        <div class="shop-body reward-body">
          <div class="reward-topline">
            <h3>${shopEscape(item.title)}</h3>
            <div class="shop-price">🪙 ${price}</div>
          </div>
          ${item.description ? `<p>${shopEscape(item.description)}</p>` : ""}
          <div class="shop-progress" aria-label="Прогресс до покупки">
            <span style="width:${progress}%"></span>
          </div>
          <div class="shop-card-meta">
            <span>${shopAffordText(price)}</span>
            <small>${progress}%</small>
          </div>
          <button class="shop-buy" data-shop-buy="${item.id}" ${canBuy ? "" : "disabled"}>${canBuy ? "Забрать награду" : "Не хватает монеток"}</button>
        </div>
      </article>
    `;
  }).join("") || `
    <div class="shop-empty shop-empty-card">
      <strong>Витрина скоро откроется</strong>
      <span>Награды пока не добавлены, но место уже выглядит дорого.</span>
    </div>
  `;

  const activeReceipts = shopState.receipts.filter(item => new Date(item.expires_at).getTime() > Date.now());
  if (receiptsCount) receiptsCount.textContent = activeReceipts.length;
  receipts.innerHTML = activeReceipts.map(item => `
    <article class="shop-receipt reward-receipt">
      <div class="receipt-done">✓</div>
      <small>Чек на награду</small>
      <strong>${shopEscape(item.item_title)}</strong>
      <div class="shop-code">${shopEscape(item.receipt_code)}</div>
      <span>Действителен до ${shopEscape(shopFormatTime(item.expires_at))}</span>
      <span>Стоимость: 🪙 ${Number(item.price_coins || 0)}</span>
      <em>Покажи этот чек менеджеру.</em>
    </article>
  `).join("") || `
    <div class="shop-empty shop-empty-card">
      <strong>Чеков пока нет</strong>
      <span>Заберёшь награду — здесь появится красивый код для менеджера.</span>
    </div>
  `;

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
    if (status) status.textContent = "Оформляем награду...";
    const result = await shopFetch("rpc/purchase_shop_item", {
      method: "POST",
      body: JSON.stringify({ p_user_id: Number(userId), p_item_id: Number(itemId) }),
    });
    if (status) status.textContent = `🎉 Награда оформлена. Чек: ${result?.receipt_code || "создан"}`;
    await shopLoad();
    if (typeof renderApp === "function") await renderApp();
  } catch (error) {
    if (status) status.textContent = "Не получилось оформить. Возможно, не хватает монеток.";
  }
}

shopBuildSection();
shopLoad().catch(() => {});
setInterval(() => shopLoad().catch(() => {}), 15000);
