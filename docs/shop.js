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
let shopAdminState = { isAdmin: false, receipts: [], users: {} };

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
          <div id="shopAdminReceiptsWrap" class="shop-admin-receipts" hidden>
            <div class="shop-receipts-head">
              <div>
                <p class="shop-toolbar-label">Для админов</p>
                <h3>Проверка чеков</h3>
              </div>
              <button id="shopAdminRefresh" class="tasks-refresh" type="button">Обновить</button>
            </div>
            <p id="shopAdminStatus" class="shop-status"></p>
            <div id="shopAdminReceipts" class="shop-receipts-grid"></div>
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
  shopAdminLoad().catch(() => {});
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

function shopAdminUserName(id) {
  const user = shopAdminState.users[String(id)];
  if (!user) return `ID ${id}`;
  if (user.first_name) return user.first_name;
  if (user.username) return `@${user.username}`;
  return `ID ${id}`;
}

async function shopAdminIsAllowed() {
  if (!userId) return false;
  const rootIds = typeof ROOT_ADMIN_IDS !== "undefined" ? ROOT_ADMIN_IDS.map(String) : ["818748106", "747818163", "5311640125"];
  if (rootIds.includes(String(userId))) return true;
  const managers = await shopFetch(`managers?telegram_id=eq.${userId}&select=telegram_id&limit=1`).catch(() => []);
  return Boolean(managers?.length);
}

function shopAdminRender() {
  const wrap = document.getElementById("shopAdminReceiptsWrap");
  const root = document.getElementById("shopAdminReceipts");
  const refresh = document.getElementById("shopAdminRefresh");
  if (!wrap || !root) return;
  wrap.hidden = !shopAdminState.isAdmin;
  if (!shopAdminState.isAdmin) return;

  const active = shopAdminState.receipts.filter(item => new Date(item.expires_at).getTime() > Date.now());
  root.innerHTML = active.map(item => `
    <article class="shop-receipt reward-receipt admin-receipt-card">
      <div class="receipt-done">🎟️</div>
      <small>Проверить чек</small>
      <strong>${shopEscape(item.item_title)}</strong>
      <div class="shop-code">${shopEscape(item.receipt_code)}</div>
      <span>Сотрудник: ${shopEscape(shopAdminUserName(item.user_id))}</span>
      <span>До: ${shopEscape(shopFormatTime(item.expires_at))}</span>
      <span>Стоимость: 🪙 ${Number(item.price_coins || 0)}</span>
      <button class="shop-buy admin-confirm-receipt" data-confirm-receipt="${item.id}">Подтвердить выдачу</button>
    </article>
  `).join("") || `
    <div class="shop-empty shop-empty-card">
      <strong>Активных чеков нет</strong>
      <span>Когда сотрудник купит награду, чек появится здесь.</span>
    </div>
  `;
  document.querySelectorAll("[data-confirm-receipt]").forEach(button => {
    button.onclick = () => shopAdminConfirmReceipt(Number(button.dataset.confirmReceipt));
  });
  if (refresh) refresh.onclick = () => shopAdminLoad(true).catch(() => {});
}

async function shopAdminLoad(force = false) {
  shopBuildSection();
  if (!userId) return;
  if (!force && shopAdminState.isAdmin === false) {
    shopAdminState.isAdmin = await shopAdminIsAllowed();
  }
  if (!shopAdminState.isAdmin) {
    shopAdminRender();
    return;
  }
  const receipts = await shopFetch("shop_purchases?status=eq.active&select=*&order=created_at.desc&limit=100").catch(() => []);
  const userIds = [...new Set((receipts || []).map(item => item.user_id).filter(Boolean).map(String))];
  let users = {};
  if (userIds.length) {
    const rows = await shopFetch(`users?telegram_id=in.(${userIds.join(",")})&select=telegram_id,username,first_name,last_name`).catch(() => []);
    users = Object.fromEntries((rows || []).map(row => [String(row.telegram_id), row]));
  }
  shopAdminState.receipts = receipts || [];
  shopAdminState.users = users;
  shopAdminRender();
}

async function shopAdminConfirmReceipt(id) {
  const status = document.getElementById("shopAdminStatus");
  const receipt = shopAdminState.receipts.find(item => Number(item.id) === Number(id));
  if (!receipt) return;
  if (!confirm(`Выдать награду по чеку ${receipt.receipt_code}?`)) return;
  try {
    if (status) status.textContent = "Подтверждаем чек...";
    await shopFetch(`shop_purchases?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "redeemed" }),
    });
    if (status) status.textContent = "✅ Чек подтверждён. Награда выдана.";
    await shopAdminLoad(true);
    await shopLoad();
  } catch (error) {
    if (status) status.textContent = "Не получилось подтвердить чек. Проверь права Supabase для shop_purchases.";
  }
}

function shopAdminInjectStyle() {
  if (document.getElementById("shopAdminStyle")) return;
  document.head.insertAdjacentHTML("beforeend", `<style id="shopAdminStyle">
    .shop-admin-receipts{margin-top:24px;padding-top:6px}.admin-receipt-card{border-style:solid}.admin-confirm-receipt{margin-top:14px;width:100%}
  </style>`);
}

shopAdminInjectStyle();
shopBuildSection();
shopLoad().catch(() => {});
setInterval(() => shopLoad().catch(() => {}), 15000);
