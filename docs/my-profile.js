const myProfileState = { profile: null, userRow: null, timesheet: null, medical: null, pvv: null, klokr: [], purchases: [] };

function myProfileUserId() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return tgUser?.id ? String(tgUser.id) : "";
}

function myProfileIsRoot() {
  return myProfileUserId() === "818748106";
}

function myProfileEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function myProfileInitials(name) {
  const text = String(name || "BK8").trim();
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function myProfileConfig() {
  const config = window.APP_CONFIG || {};
  return { url: String(config.SUPABASE_URL || "").replace(/\/$/, ""), key: config.SUPABASE_ANON_KEY || "" };
}

async function myProfileFetch(path, options = {}) {
  const config = myProfileConfig();
  if (!config.url || !config.key) throw new Error("Supabase config missing");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    cache: "no-store",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.text().then(text => text ? JSON.parse(text) : null);
}

function myProfileHoursText(value) {
  const n = Number(value || 0);
  if (!n) return "—";
  return (Number.isInteger(n) ? String(n) : String(n).replace(".", ",")) + " ч.";
}

function myProfileDateText(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16).replace("T", " ");
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function myProfileBuildSection() {
  const app = document.querySelector("main.app");
  const tabs = document.getElementById("tabs");
  if (!app || !tabs) return;
  if (!tabs.querySelector('[data-tab="profile"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="profile">Профиль</button>');
    tabs.querySelector('[data-tab="profile"]').onclick = () => typeof switchTab === "function" ? switchTab("profile") : null;
  }
  if (!document.getElementById("tab-profile")) {
    app.insertAdjacentHTML("beforeend", `<section class="tab-page" id="tab-profile"><article class="card profile-panel"><div id="profileContent"></div></article></section>`);
  }
}

function myProfileAddHomeCard() {
  const home = document.getElementById("tab-home");
  if (!home || document.querySelector('[data-nav-action="profile"]')) return;
  const grid = document.querySelector("#quickActionsCard .quick-actions-grid");
  if (grid) {
    grid.insertAdjacentHTML("afterbegin", `<button class="nav-action" type="button" data-nav-action="profile" onclick="typeof navSwitch==='function'?navSwitch('profile'):typeof switchTab==='function'?switchTab('profile'):null"><span>👤</span><strong>Мой профиль</strong><small>Кабинет</small></button>`);
  }
}

function myProfileShowHours() {
  const root = document.getElementById("profileActionContent");
  if (!root) return;
  const t = myProfileState.timesheet;
  if (!t) {
    root.innerHTML = `<div class="profile-action-card"><h3>🕒 Часы</h3><p>Табель ещё не загружен.</p></div>`;
    return;
  }
  root.innerHTML = `<div class="profile-action-card"><h3>🕒 Часы</h3><span>Отработано:</span><strong>${myProfileEscape(myProfileHoursText(t.hours))}</strong><span>Последнее обновление:</span><p>${myProfileEscape(myProfileDateText(t.updated_at))}</p></div>`;
}

function myProfileShowBalance(kind) {
  const root = document.getElementById("profileActionContent");
  const isCoins = kind === "coins";
  const value = Number(myProfileState.userRow?.[isCoins ? "coins" : "balance"] || 0);
  root.innerHTML = `<div class="profile-action-card"><h3>${isCoins ? "🪙 Монетки" : "⭐ Спасибки"}</h3><strong>${value}</strong><p>${isCoins ? "Доступно для покупок в магазине." : "Текущий баланс за этот месяц."}</p></div>`;
}

function myProfileShowMedical() {
  const root = document.getElementById("profileActionContent");
  const record = myProfileState.medical || {};
  const fields = [["sanitary_certificate_expires_on", "Санитарная справка"], ["sanitary_minimum_expires_on", "Санминимум"], ["fluorography_expires_on", "Флюорография"]];
  root.innerHTML = `<div class="profile-action-card"><h3>🩺 Сан справка</h3><div class="profile-medical-grid">${fields.map(([key, label]) => {
    const days = emp2MedicalDaysLeft(record[key]);
    const status = days === null ? "Дата не указана" : emp2MedicalStatus(days).text;
    const className = days !== null && days <= 0 ? "is-expired" : days !== null && days <= 30 ? "is-warning" : "";
    return `<div class="profile-medical-item ${className}"><span>${myProfileEscape(label)}</span><strong>${myProfileEscape(record[key] || "—")}</strong><small>${myProfileEscape(status)}</small></div>`;
  }).join("")}</div></div>`;
}

async function myProfileShowPvv() {
  const root = document.getElementById("profileActionContent");
  const documentRow = myProfileState.pvv;
  if (!documentRow) { root.innerHTML = `<div class="profile-action-card"><h3>📄 Бланк ПВВ</h3><p>Бланк ещё не загружен.</p></div>`; return; }
  root.innerHTML = `<div class="profile-action-card"><h3>📄 Бланк ПВВ</h3><p>Подготавливаю просмотр…</p></div>`;
  try {
    const signedUrl = await emp2PvvSignedUrl(documentRow.storage_path);
    const preview = documentRow.mime_type === "application/pdf" ? `<iframe class="employee-pvv-pdf" src="${myProfileEscape(signedUrl)}#toolbar=1&navpanes=0&view=FitH" title="Бланк ПВВ"></iframe>` : `<img class="employee-pvv-image" src="${myProfileEscape(signedUrl)}" alt="Бланк ПВВ">`;
    root.innerHTML = `<div class="profile-action-card"><div class="employee-pvv-head"><h3>📄 Бланк ПВВ</h3><a class="tasks-refresh employee-pvv-open" href="${myProfileEscape(signedUrl)}" target="_blank" rel="noopener">Открыть отдельно</a></div><div class="employee-pvv-preview">${preview}</div><p>${myProfileEscape(documentRow.file_name)}</p></div>`;
  } catch (error) { root.innerHTML = `<div class="profile-action-card"><h3>📄 Бланк ПВВ</h3><p>Не удалось открыть документ.</p></div>`; }
}

async function myProfileShowKlokr() {
  const root = document.getElementById("profileActionContent");
  const rows = myProfileState.klokr || [];
  const ids = [...new Set(rows.map(row => row.instructor_id).filter(Boolean).map(String))];
  const users = ids.length ? await myProfileFetch(`users?telegram_id=in.(${ids.join(",")})&select=telegram_id,first_name,username`).catch(() => []) : [];
  const names = new Map(users.map(user => [String(user.telegram_id), user.first_name || (user.username ? `@${user.username}` : "Инструктор")]));
  root.innerHTML = `<div class="profile-action-card employee-history-card"><h3>🏆 КЛОКР</h3><div class="employee-history-list">${rows.map(row => `<article class="employee-klokr-entry"><div class="employee-history-score">${Number(row.percent || 0)}%</div><div><div class="employee-history-title"><strong>${myProfileEscape(emp2KlokrPosition(row))}</strong><time>${myProfileEscape(emp2HistoryDate(row.created_at))}</time></div><p>${Number(row.total_score || 0)}/${Number(row.max_score || 0)} баллов · ${myProfileEscape(names.get(String(row.instructor_id)) || "—")}</p>${emp2KlokrComment(row.comment) ? `<blockquote>${myProfileEscape(emp2KlokrComment(row.comment))}</blockquote>` : ""}</div></article>`).join("") || `<div class="employee-history-empty">Проверок пока нет.</div>`}</div></div>`;
}

function myProfileShowPurchases() {
  const root = document.getElementById("profileActionContent");
  const rows = myProfileState.purchases || [];
  root.innerHTML = `<div class="profile-action-card employee-history-card"><h3>🛒 Покупки</h3><div class="employee-history-list">${rows.map(row => {
    const status = emp2PurchaseStatus(row);
    return `<article class="employee-purchase-entry"><div><div class="employee-history-title"><strong>${myProfileEscape(row.item_title || "Покупка")}</strong><time>${myProfileEscape(emp2HistoryDate(row.created_at))}</time></div><p>Код: <code>${myProfileEscape(row.receipt_code || "—")}</code> · 🪙 ${Number(row.price_coins || 0)}</p></div><b class="employee-purchase-status ${status.className}">${myProfileEscape(status.text)}</b></article>`;
  }).join("") || `<div class="employee-history-empty">Покупок пока нет.</div>`}</div></div>`;
}

function myProfileRender() {
  myProfileBuildSection();
  const root = document.getElementById("profileContent");
  if (!root) return;
  const profile = myProfileState.profile;
  const user = myProfileState.userRow || {};
  const balance = Number(user.balance || 0);
  const coins = Number(user.coins || 0);
  const hours = myProfileState.timesheet ? myProfileHoursText(myProfileState.timesheet.hours) : "—";
  const klokrAverage = myProfileState.klokr.length ? Math.round(myProfileState.klokr.reduce((sum, row) => sum + Number(row.percent || 0), 0) / myProfileState.klokr.length) + "%" : "—";

  if (!profile) {
    root.innerHTML = `<div class="profile-hero empty"><div class="profile-avatar">BK</div><div><p class="label">BK8 Staff</p><h2>Профиль не активирован</h2><p>Зарегистрируйся по коду приглашения.</p></div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar">${myProfileEscape(myProfileInitials(profile.full_name))}</div>
      <div class="profile-title"><p class="label">Мой профиль</p><h2>${myProfileEscape(profile.full_name || "Сотрудник")}</h2><span>${myProfileEscape(profile.position || "Должность не указана")}</span></div>
    </div>
    <div class="profile-stat-grid"><div><span>Спасибки</span><strong>${balance}</strong></div><div><span>Монетки</span><strong>${coins}</strong></div><div><span>КЛОКР</span><strong>${myProfileEscape(klokrAverage)}</strong></div><div><span>Часы</span><strong>${myProfileEscape(hours)}</strong></div></div>
    <div class="profile-roadmap employee-only"><div class="profile-roadmap-grid"><button type="button" onclick="myProfileShowBalance('balance')">⭐ Спасибки</button><button type="button" onclick="myProfileShowBalance('coins')">🪙 Монетки</button><button type="button" onclick="myProfileShowKlokr()">🏆 КЛОКР</button><button type="button" onclick="myProfileShowHours()">🕒 Часы</button><button type="button" onclick="myProfileShowPurchases()">🛒 Покупки</button><button type="button" onclick="myProfileShowMedical()">🩺 Сан справка</button><button type="button" onclick="myProfileShowPvv()">📄 Бланк ПВВ</button></div></div>
    <div id="profileActionContent"></div>`;
}

async function myProfileLoad() {
  const id = myProfileUserId();
  myProfileBuildSection();
  myProfileAddHomeCard();
  if (!id) { myProfileRender(); return; }
  const [profiles, users] = await Promise.all([
    myProfileFetch(`employee_profiles?telegram_id=eq.${encodeURIComponent(id)}&select=*&limit=1`).catch(() => []),
    myProfileFetch(`users?telegram_id=eq.${encodeURIComponent(id)}&select=telegram_id,balance,coins&limit=1`).catch(() => []),
  ]);
  myProfileState.profile = profiles?.[0] || null;
  myProfileState.userRow = users?.[0] || null;
  if (myProfileState.profile?.id) {
    const [timesheets, medical, pvv, klokr, purchases] = await Promise.all([
      myProfileFetch(`employee_timesheets?employee_profile_id=eq.${myProfileState.profile.id}&period=eq.current&select=hours,updated_at&limit=1`).catch(() => []),
      myProfileFetch(`employee_medical_records?employee_profile_id=eq.${myProfileState.profile.id}&select=*&limit=1`).catch(() => []),
      myProfileFetch(`employee_pvv_documents?employee_profile_id=eq.${myProfileState.profile.id}&select=*&limit=1`).catch(() => []),
      myProfileFetch(`klokr_assessments?employee_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=100`).catch(() => []),
      myProfileFetch(`shop_purchases?user_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=100`).catch(() => []),
    ]);
    myProfileState.timesheet = timesheets?.[0] || null;
    myProfileState.medical = medical?.[0] || null;
    myProfileState.pvv = pvv?.[0] || null;
    myProfileState.klokr = klokr || [];
    myProfileState.purchases = purchases || [];
  } else {
    myProfileState.timesheet = null;
    myProfileState.medical = null;
    myProfileState.pvv = null;
    myProfileState.klokr = [];
    myProfileState.purchases = [];
  }
  myProfileRender();
  myProfileAddHomeCard();
}
