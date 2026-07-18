const myProfileState = { profile: null, userRow: null, timesheet: null };

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

function myProfileRender() {
  myProfileBuildSection();
  const root = document.getElementById("profileContent");
  if (!root) return;
  const profile = myProfileState.profile;
  const user = myProfileState.userRow || {};
  const balance = Number(user.balance || 0);
  const coins = Number(user.coins || 0);
  const hours = myProfileState.timesheet ? myProfileHoursText(myProfileState.timesheet.hours) : "—";

  if (!profile) {
    root.innerHTML = `<div class="profile-hero empty"><div class="profile-avatar">BK</div><div><p class="label">BK8 Staff</p><h2>Профиль не активирован</h2><p>Зарегистрируйся по коду приглашения.</p></div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar">${myProfileEscape(myProfileInitials(profile.full_name))}</div>
      <div class="profile-title"><p class="label">Мой профиль</p><h2>${myProfileEscape(profile.full_name || "Сотрудник")}</h2><span>${myProfileEscape(profile.position || "Должность не указана")}</span></div>
    </div>
    <div class="profile-stat-grid"><div><span>Спасибки</span><strong>${balance}</strong></div><div><span>Монетки</span><strong>${coins}</strong></div><div><span>КЛОКР</span><strong>—</strong></div><div><span>Часы</span><strong>${myProfileEscape(hours)}</strong></div></div>
    <div class="profile-roadmap employee-only"><div class="profile-roadmap-grid"><div>⭐ Спасибки</div><div>🪙 Монетки</div><div>🏆 КЛОКР</div><button type="button" onclick="myProfileShowHours()">🕒 Часы</button><div>🛒 Покупки</div></div></div>
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
    const rows = await myProfileFetch(`employee_timesheets?employee_profile_id=eq.${myProfileState.profile.id}&period=eq.current&select=hours,updated_at&limit=1`).catch(() => []);
    myProfileState.timesheet = rows?.[0] || null;
  } else {
    myProfileState.timesheet = null;
  }
  myProfileRender();
  myProfileAddHomeCard();
}
