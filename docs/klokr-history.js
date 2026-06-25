function klokrHistoryEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function klokrHistoryFetch(path) {
  const config = window.APP_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  if (!url || !key) return Promise.reject(new Error("Supabase config missing"));
  return fetch(`${url}/rest/v1/${path}`, {
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  }).then(async response => {
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  });
}

const KLOKR_HISTORY_POSITIONS = {
  kitchen: "Кухня",
  service: "Сервис",
};

let klokrHistoryState = { assessments: [], users: {} };

function klokrHistoryPosition(item) {
  const first = Array.isArray(item.items) ? item.items.find(row => row.position === "kitchen" || row.position === "service") : null;
  if (first?.position) return KLOKR_HISTORY_POSITIONS[first.position] || "КЛОКР";
  const comment = String(item.comment || "");
  if (comment.includes("[Кухня]")) return "Кухня";
  if (comment.includes("[Сервис]")) return "Сервис";
  return "КЛОКР";
}

function klokrHistoryCleanComment(comment) {
  return String(comment || "").replace(/^\[(Кухня|Сервис)\]\s*/i, "").trim();
}

function klokrHistoryDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function klokrHistoryUserName(id) {
  const user = klokrHistoryState.users[String(id)];
  if (!user) return "Инструктор";
  if (user.first_name) return user.first_name;
  if (user.username) return `@${user.username}`;
  return "Инструктор";
}

function klokrHistoryBuildSection() {
  if (!userId) return;
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;

  if (!tabs.querySelector('[data-tab="my-klokr"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="my-klokr">Мои КЛОКР</button>');
    tabs.querySelector('[data-tab="my-klokr"]').addEventListener("click", () => switchTab("my-klokr"));
  }

  if (!document.getElementById("tab-my-klokr")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-my-klokr">
        <article class="card my-klokr-panel">
          <div class="my-klokr-hero">
            <div>
              <p class="instructor-kicker">Моё развитие</p>
              <h2>📋 Мои КЛОКР</h2>
              <p>Здесь хранятся твои проверки за смены: позиция, итог, комментарии инструктора и детали по пунктам.</p>
            </div>
            <button id="myKlokrRefresh" class="tasks-refresh">Обновить</button>
          </div>
          <div id="myKlokrSummary" class="klokr-result-preview"></div>
          <div id="myKlokrHistory" class="my-klokr-list"></div>
        </article>
      </section>
    `);
  }
}

function klokrHistoryRenderSummary() {
  const root = document.getElementById("myKlokrSummary");
  if (!root) return;
  const items = klokrHistoryState.assessments || [];
  const avg = items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.percent || 0), 0) / items.length) : 0;
  const best = items.length ? Math.max(...items.map(item => Number(item.percent || 0))) : 0;
  root.innerHTML = `
    <div><span>Проверок</span><strong>${items.length}</strong></div>
    <div><span>Средний</span><strong>${avg}%</strong></div>
    <div><span>Лучший</span><strong>${best}%</strong></div>
  `;
}

function klokrHistoryDetails(item) {
  const rows = Array.isArray(item.items) ? item.items : [];
  if (!rows.length) return `<p class="my-klokr-muted">Детализация по пунктам не сохранена.</p>`;
  return `
    <details class="my-klokr-details">
      <summary>Показать пункты проверки</summary>
      <div class="my-klokr-points">
        ${rows.map(row => `
          <div class="my-klokr-point">
            <div>
              <strong>${klokrHistoryEscape(row.title || "Пункт")}</strong>
              <span>${klokrHistoryEscape(row.category || "")}</span>
              ${row.comment ? `<em>${klokrHistoryEscape(row.comment)}</em>` : ""}
            </div>
            <b>${Number(row.score || 0)}/${Number(row.max || 0)}</b>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function klokrHistoryRender() {
  klokrHistoryBuildSection();
  klokrHistoryRenderSummary();
  const root = document.getElementById("myKlokrHistory");
  if (!root) return;
  const items = klokrHistoryState.assessments || [];
  root.innerHTML = items.map(item => {
    const position = klokrHistoryPosition(item);
    const comment = klokrHistoryCleanComment(item.comment);
    const instructor = klokrHistoryUserName(item.instructor_id);
    return `
      <article class="my-klokr-card">
        <div class="my-klokr-score">${Number(item.percent || 0)}%</div>
        <div class="my-klokr-body">
          <div class="my-klokr-topline">
            <strong>${klokrHistoryEscape(position)}</strong>
            <span>${klokrHistoryEscape(klokrHistoryDate(item.created_at))}</span>
          </div>
          <p>${Number(item.total_score || 0)}/${Number(item.max_score || 0)} баллов · Инструктор: ${klokrHistoryEscape(instructor)}</p>
          ${comment ? `<blockquote>${klokrHistoryEscape(comment)}</blockquote>` : ""}
          ${klokrHistoryDetails(item)}
        </div>
      </article>
    `;
  }).join("") || `
    <div class="shop-empty-card">
      <strong>КЛОКР пока нет</strong>
      <span>Когда инструктор проведёт проверку, она появится здесь.</span>
    </div>
  `;
}

async function klokrHistoryLoad() {
  if (!userId) return;
  klokrHistoryBuildSection();
  const assessments = await klokrHistoryFetch(`klokr_assessments?employee_id=eq.${userId}&select=*&order=created_at.desc&limit=30`).catch(() => []);
  const instructorIds = [...new Set((assessments || []).map(item => item.instructor_id).filter(Boolean).map(String))];
  let users = {};
  if (instructorIds.length) {
    const rows = await klokrHistoryFetch(`users?telegram_id=in.(${instructorIds.join(",")})&select=telegram_id,username,first_name,last_name`).catch(() => []);
    users = Object.fromEntries((rows || []).map(row => [String(row.telegram_id), row]));
  }
  klokrHistoryState.assessments = assessments || [];
  klokrHistoryState.users = users;
  klokrHistoryRender();
  const refresh = document.getElementById("myKlokrRefresh");
  if (refresh) refresh.onclick = () => klokrHistoryLoad().catch(() => {});
}

klokrHistoryLoad().catch(() => {});
setInterval(() => klokrHistoryLoad().catch(() => {}), 20000);
