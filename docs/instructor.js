function instructorEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const KLOKR_ITEMS = [
  { id: "standards", title: "Стандарты Burger King", text: "Знает ключевые стандарты сервиса, чистоты и внешнего вида." },
  { id: "safety", title: "Безопасность и санитария", text: "Соблюдает правила безопасности, перчатки, маркировку и чистоту станции." },
  { id: "products", title: "Продуктовые знания", text: "Понимает составы, сроки хранения и требования к качеству продукта." },
  { id: "station", title: "Работа на станции", text: "Уверенно выполняет операции на рабочем месте без лишних подсказок." },
  { id: "guest", title: "Гостевой опыт", text: "Общается спокойно, вежливо и помогает держать скорость обслуживания." },
  { id: "team", title: "Командность", text: "Слышит менеджера, помогает команде и корректно принимает обратную связь." },
];

let instructorState = {
  users: {},
  instructors: [],
  assessments: [],
  rootIds: new Set(),
};

function instructorFetch(path, options = {}) {
  const config = window.APP_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  if (!url || !key) return Promise.reject(new Error("Supabase config missing"));
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  }).then(async response => {
    if (!response.ok) throw new Error(await response.text());
    if (response.status === 204 || !response.headers.get("content-type")?.includes("application/json")) return null;
    return response.json();
  });
}

function instructorName(id) {
  return instructorState.users[String(id)]?.name || "Сотрудник";
}

function instructorIsRoot() {
  return Boolean(userId && instructorState.rootIds.has(String(userId)));
}

function instructorIsAllowed() {
  if (!userId) return false;
  if (instructorIsRoot()) return true;
  return instructorState.instructors.some(row => String(row.telegram_id) === String(userId));
}

function instructorBuildSection() {
  if (!userId || !instructorIsAllowed()) return;
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;

  if (!tabs.querySelector('[data-tab="instructor"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="instructor">Инструктор</button>');
    tabs.querySelector('[data-tab="instructor"]').addEventListener("click", () => switchTab("instructor"));
  }

  if (!document.getElementById("tab-instructor")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-instructor">
        <article class="card instructor-panel">
          <div class="instructor-hero">
            <div>
              <p class="instructor-kicker">Обучение команды</p>
              <h2>🧑‍🏫 КЛОКР</h2>
              <p>Проверка знаний сотрудников: оценка по пунктам, комментарии инструктора и общий результат.</p>
            </div>
            <div class="instructor-score-card">
              <span>Максимум</span>
              <strong>${KLOKR_ITEMS.length * 2}</strong>
              <small>баллов</small>
            </div>
          </div>

          <div id="instructorManage" class="instructor-manage"></div>

          <div class="instructor-form-card">
            <div class="instructor-title-row">
              <div>
                <p class="instructor-kicker">Новая проверка</p>
                <h3>Оценить сотрудника</h3>
              </div>
              <button id="instructorRefresh" class="tasks-refresh">Обновить</button>
            </div>
            <label>Сотрудник</label>
            <select id="klokrEmployee"></select>
            <div id="klokrItems" class="klokr-items"></div>
            <label>Общий комментарий</label>
            <textarea id="klokrGeneralComment" placeholder="Что получилось хорошо, что подтянуть на следующей смене"></textarea>
            <div class="klokr-result-preview" id="klokrPreview"></div>
            <button id="klokrSave" class="action-btn add">Сохранить КЛОКР</button>
            <p id="klokrStatus" class="admin-status"></p>
          </div>

          <div class="instructor-history">
            <div class="instructor-title-row">
              <div>
                <p class="instructor-kicker">Результаты</p>
                <h3>Лучшие проверки</h3>
              </div>
            </div>
            <div id="klokrHistory" class="klokr-history-grid"></div>
          </div>
        </article>
      </section>
    `);
  }
}

async function instructorLoadBase() {
  const rootIds = typeof ROOT_ADMIN_IDS !== "undefined" ? ROOT_ADMIN_IDS.map(String) : [];
  instructorState.rootIds = new Set(rootIds);
  const [usersRows, instructorRows] = await Promise.all([
    instructorFetch("users?select=telegram_id,username,first_name,last_name,balance&order=first_name.asc"),
    instructorFetch("instructors?select=telegram_id,created_by,created_at&order=created_at.desc").catch(() => []),
  ]);
  const users = {};
  for (const row of usersRows || []) {
    const id = String(row.telegram_id);
    users[id] = { name: userNameFromRow(row), balance: Number(row.balance || 0) };
  }
  instructorState.users = users;
  instructorState.instructors = instructorRows || [];
}

function instructorRenderManage() {
  const root = document.getElementById("instructorManage");
  if (!root) return;
  if (!instructorIsRoot()) {
    root.innerHTML = "";
    return;
  }
  const instructorSet = new Set(instructorState.instructors.map(row => String(row.telegram_id)));
  const options = Object.entries(instructorState.users)
    .map(([id, item]) => `<option value="${instructorEscape(id)}">${instructorEscape(item.name)} — ${instructorEscape(id)}</option>`)
    .join("");
  root.innerHTML = `
    <div class="instructor-role-card">
      <div>
        <p class="instructor-kicker">Роль</p>
        <h3>Инструкторы</h3>
      </div>
      <select id="instructorUserSelect">${options}</select>
      <div class="admin-actions">
        <button id="instructorAdd" class="action-btn add">+ Дать роль</button>
        <button id="instructorRemove" class="action-btn remove">− Забрать</button>
      </div>
      <div class="instructor-list">
        ${[...instructorSet].map(id => `<div><strong>${instructorEscape(instructorName(id))}</strong><span>${instructorEscape(id)}</span></div>`).join("") || `<p>Инструкторов пока нет.</p>`}
      </div>
      <p id="instructorRoleStatus" class="admin-status"></p>
    </div>
  `;
  document.getElementById("instructorAdd").onclick = () => instructorSetRole(true);
  document.getElementById("instructorRemove").onclick = () => instructorSetRole(false);
}

function instructorRenderEmployeeSelect() {
  const select = document.getElementById("klokrEmployee");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = Object.entries(instructorState.users)
    .map(([id, item]) => `<option value="${instructorEscape(id)}">${instructorEscape(item.name)} — ${Number(item.balance || 0)} спасибок</option>`)
    .join("");
  if (previous && [...select.options].some(option => option.value === previous)) select.value = previous;
}

function instructorRenderItems() {
  const root = document.getElementById("klokrItems");
  if (!root) return;
  root.innerHTML = KLOKR_ITEMS.map((item, index) => `
    <article class="klokr-item" data-klokr-item="${instructorEscape(item.id)}">
      <div class="klokr-item-head">
        <div class="klokr-number">${index + 1}</div>
        <div>
          <strong>${instructorEscape(item.title)}</strong>
          <span>${instructorEscape(item.text)}</span>
        </div>
      </div>
      <div class="klokr-score-row">
        <label><input type="radio" name="score_${item.id}" value="0"> 0</label>
        <label><input type="radio" name="score_${item.id}" value="1"> 1</label>
        <label><input type="radio" name="score_${item.id}" value="2" checked> 2</label>
      </div>
      <textarea data-klokr-comment="${instructorEscape(item.id)}" placeholder="Комментарий по пункту"></textarea>
    </article>
  `).join("");
  root.querySelectorAll("input, textarea").forEach(input => input.addEventListener("input", instructorUpdatePreview));
}

function instructorCollectAssessment() {
  const items = KLOKR_ITEMS.map(item => {
    const score = Number(document.querySelector(`input[name="score_${item.id}"]:checked`)?.value || 0);
    const comment = document.querySelector(`[data-klokr-comment="${item.id}"]`)?.value.trim() || "";
    return { id: item.id, title: item.title, score, max: 2, comment };
  });
  const total = items.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const max = items.reduce((sum, item) => sum + Number(item.max || 0), 0);
  const percent = max > 0 ? Math.round((total / max) * 100) : 0;
  return { items, total, max, percent };
}

function instructorUpdatePreview() {
  const root = document.getElementById("klokrPreview");
  if (!root) return;
  const result = instructorCollectAssessment();
  root.innerHTML = `
    <div><span>Итог</span><strong>${result.total}/${result.max}</strong></div>
    <div><span>Процент</span><strong>${result.percent}%</strong></div>
    <div><span>Статус</span><strong>${result.percent >= 85 ? "Отлично" : result.percent >= 65 ? "Норм" : "Нужна тренировка"}</strong></div>
  `;
}

async function instructorSetRole(add) {
  const status = document.getElementById("instructorRoleStatus");
  const select = document.getElementById("instructorUserSelect");
  const target = select?.value;
  if (!target) {
    if (status) status.textContent = "Выбери сотрудника.";
    return;
  }
  try {
    if (add) {
      await instructorFetch("instructors?on_conflict=telegram_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ telegram_id: Number(target), created_by: userId ? Number(userId) : null, created_at: new Date().toISOString() }),
      });
      if (status) status.textContent = "Инструктор добавлен.";
    } else {
      await instructorFetch(`instructors?telegram_id=eq.${target}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      if (status) status.textContent = "Роль инструктора снята.";
    }
    await instructorLoad();
    if (typeof renderApp === "function") await renderApp();
  } catch (error) {
    if (status) status.textContent = "Не получилось обновить роль. Проверь SQL для instructors.";
  }
}

async function instructorSaveAssessment() {
  const status = document.getElementById("klokrStatus");
  const employeeId = document.getElementById("klokrEmployee")?.value;
  if (!employeeId) {
    if (status) status.textContent = "Выбери сотрудника.";
    return;
  }
  const result = instructorCollectAssessment();
  const generalComment = document.getElementById("klokrGeneralComment")?.value.trim() || "";
  try {
    await instructorFetch("klokr_assessments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        employee_id: Number(employeeId),
        instructor_id: userId ? Number(userId) : null,
        total_score: result.total,
        max_score: result.max,
        percent: result.percent,
        items: result.items,
        comment: generalComment,
        created_at: new Date().toISOString(),
      }),
    });
    if (status) status.textContent = `КЛОКР сохранён: ${result.percent}%.`;
    document.getElementById("klokrGeneralComment").value = "";
    document.querySelectorAll("[data-klokr-comment]").forEach(item => item.value = "");
    await instructorLoad();
    if (typeof renderApp === "function") await renderApp();
  } catch (error) {
    if (status) status.textContent = "Не получилось сохранить КЛОКР. Скорее всего, нужна SQL-таблица.";
  }
}

async function instructorLoadAssessments() {
  instructorState.assessments = await instructorFetch("klokr_assessments?select=*&order=percent.desc,created_at.desc&limit=20").catch(() => []);
}

function instructorFormatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function instructorRenderHistory() {
  const root = document.getElementById("klokrHistory");
  if (!root) return;
  root.innerHTML = instructorState.assessments.map((item, index) => {
    const employee = instructorName(item.employee_id);
    const instructor = instructorName(item.instructor_id);
    return `
      <article class="klokr-history-card rank-${index + 1}">
        <div class="klokr-percent">${Number(item.percent || 0)}%</div>
        <div>
          <strong>${instructorEscape(employee)}</strong>
          <span>${Number(item.total_score || 0)}/${Number(item.max_score || KLOKR_ITEMS.length * 2)} баллов · ${instructorEscape(instructorFormatDate(item.created_at))}</span>
          <small>Инструктор: ${instructorEscape(instructor)}</small>
        </div>
      </article>
    `;
  }).join("") || `<p class="instructor-empty">Проверок пока нет. Первый КЛОКР будет тут — и на главной тоже.</p>`;
}

async function instructorLoad() {
  await instructorLoadBase();
  if (!instructorIsAllowed()) return;
  instructorBuildSection();
  instructorRenderManage();
  instructorRenderEmployeeSelect();
  instructorRenderItems();
  instructorUpdatePreview();
  await instructorLoadAssessments();
  instructorRenderHistory();

  const saveBtn = document.getElementById("klokrSave");
  const refreshBtn = document.getElementById("instructorRefresh");
  if (saveBtn) saveBtn.onclick = instructorSaveAssessment;
  if (refreshBtn) refreshBtn.onclick = () => instructorLoad().catch(() => {});
}

instructorLoad().catch(() => {});
setInterval(() => instructorLoad().catch(() => {}), 20000);
