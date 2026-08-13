const feedbackState = { loaded: false, items: [] };

function feedbackConfig() {
  const config = window.APP_CONFIG || {};
  return { url: String(config.SUPABASE_URL || "").replace(/\/$/, ""), key: config.SUPABASE_ANON_KEY || "" };
}

async function feedbackRpc(name, body) {
  const config = feedbackConfig();
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || "Не удалось выполнить запрос");
  return result;
}

function feedbackEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function feedbackBuildSection() {
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;
  if (!tabs.querySelector('[data-tab="feedback"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="feedback">Жалобы и предложения</button>');
    tabs.querySelector('[data-tab="feedback"]').onclick = () => switchTab("feedback");
  }
  if (document.getElementById("tab-feedback")) return;
  app.insertAdjacentHTML("beforeend", `
    <section class="tab-page" id="tab-feedback">
      <article class="card feedback-panel">
        <div class="feedback-head"><div><small>BK8 STAFF</small><h2>Жалобы и предложения</h2><p>Напишите, что в боте неудобно или что стоит добавить.</p></div></div>
        <form id="feedbackForm" class="feedback-form">
          <select id="feedbackKind" aria-label="Тип обращения"><option value="suggestion">Предложение</option><option value="complaint">Жалоба</option><option value="problem">Ошибка в боте</option></select>
          <textarea id="feedbackMessage" maxlength="2000" required placeholder="Опишите всё своими словами"></textarea>
          <button type="submit">Отправить менеджерам</button>
        </form>
        <p id="feedbackStatus" class="feedback-status"></p>
        <section id="feedbackManagerView" hidden><div class="feedback-list-head"><h3>Все обращения</h3><button id="feedbackRefresh" type="button">Обновить</button></div><div id="feedbackList" class="feedback-list"></div></section>
      </article>
    </section>`);
  document.getElementById("feedbackForm").onsubmit = feedbackSubmit;
  document.getElementById("feedbackRefresh").onclick = feedbackLoadManagerList;
}

function feedbackSetStatus(text, ok = false) {
  const node = document.getElementById("feedbackStatus");
  if (!node) return;
  node.textContent = text || "";
  node.classList.toggle("ok", ok);
}

async function feedbackSubmit(event) {
  event.preventDefault();
  const message = document.getElementById("feedbackMessage").value.trim();
  if (!message) return feedbackSetStatus("Напишите текст обращения.");
  try {
    feedbackSetStatus("Отправляем...");
    await feedbackRpc("feedback_submit", { p_actor_id: Number(window.userId), p_kind: document.getElementById("feedbackKind").value, p_message: message });
    event.target.reset();
    feedbackSetStatus("Спасибо! Менеджеры увидят ваше обращение.", true);
    if (window.BK8Permissions?.isAdmin()) await feedbackLoadManagerList();
  } catch (error) { feedbackSetStatus(error.message); }
}

function feedbackRenderManagerList() {
  const list = document.getElementById("feedbackList");
  if (!list) return;
  if (!feedbackState.items.length) return void (list.innerHTML = '<p class="feedback-empty">Обращений пока нет.</p>');
  const kindNames = { suggestion: "Предложение", complaint: "Жалоба", problem: "Ошибка" };
  list.innerHTML = feedbackState.items.map(item => `<article class="feedback-item">
    <div><span>${feedbackEscape(kindNames[item.kind] || item.kind)}</span><time>${feedbackEscape(new Date(item.created_at).toLocaleString("ru-RU"))}</time></div>
    <strong>${feedbackEscape(item.employee_name)}</strong>
    <p>${feedbackEscape(item.message)}</p>
  </article>`).join("");
}

async function feedbackLoadManagerList() {
  if (!window.BK8Permissions?.isAdmin()) return;
  try {
    feedbackState.items = await feedbackRpc("feedback_list", { p_actor_id: Number(window.userId) }) || [];
    feedbackRenderManagerList();
  } catch (error) { feedbackSetStatus(error.message); }
}

async function feedbackStart() {
  feedbackBuildSection();
  const permissions = window.BK8Permissions;
  if (!permissions?.state?.loaded) await permissions?.load?.();
  if (permissions?.isAdmin()) {
    document.getElementById("feedbackManagerView").hidden = false;
    await feedbackLoadManagerList();
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", feedbackStart, { once: true }); else feedbackStart();
