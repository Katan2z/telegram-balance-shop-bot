function instructorEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const KLOKR_ITEMS = [
  { id: "k_uniform", category: "Кухня · практика", title: "Стандарты внешнего вида и униформы соответствуют", text: "Грязная униформа/фартук −1, порванная обувь −1, пирсинг/серьги/накладные ресницы/ногти −2, нет бейджика −1, головной убор неправильный или отсутствует −1, нет фартука −1.", max: 2 },
  { id: "k_hands", category: "Кухня · практика", title: "Правила мытья рук", text: "Нет отметки / не помыл раз в час −2, не помыл после аллергенов −2, не помыл после касания себя/пола/мусорки −1 за каждый случай.", max: 2 },
  { id: "k_gloves", category: "Кухня · практика", title: "Перчатки используются согласно стандартам", text: "Нет: −2.", max: 2 },
  { id: "k_transition_hands", category: "Кухня · практика", title: "Мытьё рук при переходе с позиции на позицию", text: "Нарушены правила: −2.", max: 2 },
  { id: "k_sandwich_sequence", category: "Кухня · практика", title: "Сандвичи готовятся в верной последовательности", text: "Нет: −1 за каждый случай.", max: 4 },
  { id: "k_grams", category: "Кухня · практика", title: "Граммовки соблюдаются", text: "Нет: −1 за каждый случай.", max: 3 },
  { id: "k_proteins_tongs", category: "Кухня · практика", title: "Протеины накладываются с использованием щипцов", text: "Нет: −1 за каждый случай.", max: 2 },
  { id: "k_timers_position", category: "Кухня · практика", title: "Таймеры на позиции актуальные", text: "Включая дезу. Нет: −2.", max: 2 },
  { id: "k_prep_tempering", category: "Кухня · практика", title: "Овощи и продукты заготавливаются и темперируются своевременно", text: "Таймеры не просрочены. Нет: −1 за каждый случай.", max: 1 },
  { id: "k_product_standard", category: "Кухня · практика", title: "Продукты соответствуют стандартам", text: "Заветрено, порвано и т.п.: −1.", max: 1 },
  { id: "k_product_timers", category: "Кухня · практика", title: "Таймеры на продукцию выставляются верно", text: "Нет: −1 за каждый случай.", max: 2 },
  { id: "k_phu_quantity_timers", category: "Кухня · практика", title: "Количество и электронные таймеры в PHU соответствуют стандартам", text: "Нет: −1 за каждый случай.", max: 2 },
  { id: "k_fryer_transport", category: "Кухня · практика", title: "ГП на фритюре транспортируется согласно стандартам", text: "Нет: −1.", max: 1 },
  { id: "k_clean_position", category: "Кухня · практика", title: "Позиция содержится в чистоте", text: "Нет: −2.", max: 2 },

  { id: "s_uniform", category: "Прилавок · практика", title: "Стандарты внешнего вида и униформы соответствуют", text: "Грязная униформа/фартук −1, порванная обувь −1, пирсинг/серьги/накладные ресницы/ногти −2, нет бейджика −1, головной убор неправильный или отсутствует −1, нет фартука −1.", max: 2 },
  { id: "s_hands", category: "Прилавок · практика", title: "Правила мытья рук", text: "Нет отметки / не помыл раз в час −2, не помыл после аллергенов −2, не помыл после касания себя/пола/мусорки −1 за каждый случай.", max: 2 },
  { id: "s_gloves", category: "Прилавок · практика", title: "Перчатки используются согласно стандартам", text: "Нет: −2.", max: 2 },
  { id: "s_transition_hands", category: "Прилавок · практика", title: "Мытьё рук при переходе с позиции на позицию", text: "Нарушены правила: −2.", max: 2 },
  { id: "s_cash_order", category: "Прилавок · практика", title: "Заказ на кассе принимается со всеми подсказками", text: "Приветствие −1, допы −1, перевод на комбо −1, треугольник продаж −1.", max: 4 },
  { id: "s_timers_position", category: "Прилавок · практика", title: "Таймеры на позиции актуальные", text: "Включая дезу. Нет: −2.", max: 2 },
  { id: "s_order_accuracy", category: "Прилавок · практика", title: "Заказы собираются точно", text: "Нет: −1 за каждый случай.", max: 3 },
  { id: "s_here_takeaway", category: "Прилавок · практика", title: "Заказы на месте и с собой собираются верно", text: "Нет: −1 за каждый случай.", max: 1 },
  { id: "s_clean_position", category: "Прилавок · практика", title: "Позиция содержится в чистоте", text: "Нет: −2.", max: 2 },
  { id: "s_friendly", category: "Прилавок · практика", title: "Сотрудник дружелюбен", text: "Желает приятного аппетита и хорошего дня. Нет: −2.", max: 2 },
  { id: "s_guest_reaction", category: "Прилавок · практика", title: "Реакция на гостя до 5 секунд", text: "Нет: −1.", max: 1 },

  { id: "t_wash_hands", category: "Теория", title: "Как правильно мыть руки?", text: "Нет: −2.", max: 2 },
  { id: "t_phu_quantity", category: "Теория", title: "Количество в PHU: 3 вида продукции", text: "Нет: −2.", max: 2 },
  { id: "t_allergen", category: "Теория", title: "Для чего какая аллергенная посуда", text: "Нет: −1.", max: 1 },
  { id: "t_greeting_sales", category: "Теория", title: "Как приветствовать гостя, треугольник продаж, допы", text: "Нет: −1 за каждый случай.", max: 3 },
  { id: "t_new_items", category: "Теория", title: "3 вопроса по новинкам", text: "Нет: −1 за каждый случай.", max: 3 },
  { id: "t_bonus", category: "Теория", title: "За что мы получаем премию", text: "Нет: −1.", max: 1 },
  { id: "t_motivation", category: "Теория", title: "Какие есть виды мотивации", text: "Пункт из таблицы без баллов — можно оставить комментарий.", max: 0 },
];

let instructorState = {
  users: {},
  managers: [],
  instructors: [],
  assessments: [],
  rootIds: new Set(),
  adminIds: new Set(),
};

function instructorMaxScore() {
  return KLOKR_ITEMS.reduce((sum, item) => sum + Number(item.max || 0), 0);
}

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

function instructorIsAllowed() {
  if (!userId) return false;
  const id = String(userId);
  if (instructorState.adminIds.has(id)) return true;
  return instructorState.instructors.some(row => String(row.telegram_id) === id);
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
              <p>Проверка знаний сотрудников по листу: кухня, прилавок и теория. Каждый пункт можно оценить и прокомментировать.</p>
            </div>
            <div class="instructor-score-card">
              <span>Максимум</span>
              <strong>${instructorMaxScore()}</strong>
              <small>баллов</small>
            </div>
          </div>

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
  const [usersRows, managerRows, instructorRows] = await Promise.all([
    instructorFetch("users?select=telegram_id,username,first_name,last_name,balance&order=first_name.asc"),
    instructorFetch("managers?select=telegram_id").catch(() => []),
    instructorFetch("instructors?select=telegram_id,created_by,created_at&order=created_at.desc").catch(() => []),
  ]);
  const users = {};
  for (const row of usersRows || []) {
    const id = String(row.telegram_id);
    users[id] = { name: userNameFromRow(row), balance: Number(row.balance || 0) };
  }
  const managerIds = (managerRows || []).map(row => String(row.telegram_id));
  instructorState.users = users;
  instructorState.managers = managerRows || [];
  instructorState.instructors = instructorRows || [];
  instructorState.adminIds = new Set([...rootIds, ...managerIds]);
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

function instructorScoreInputs(item) {
  const max = Number(item.max || 0);
  if (max <= 0) return `<div class="klokr-score-row no-score"><span>Без баллов</span></div>`;
  return `
    <div class="klokr-score-row" style="grid-template-columns: repeat(${max + 1}, 1fr)">
      ${Array.from({ length: max + 1 }, (_, score) => `
        <label><input type="radio" name="score_${item.id}" value="${score}" ${score === max ? "checked" : ""}> ${score}</label>
      `).join("")}
    </div>
  `;
}

function instructorRenderItems() {
  const root = document.getElementById("klokrItems");
  if (!root) return;
  let lastCategory = "";
  root.innerHTML = KLOKR_ITEMS.map((item, index) => {
    const category = item.category || "КЛОКР";
    const categoryHtml = category !== lastCategory ? `<div class="klokr-category">${instructorEscape(category)}</div>` : "";
    lastCategory = category;
    return `
      ${categoryHtml}
      <article class="klokr-item" data-klokr-item="${instructorEscape(item.id)}">
        <div class="klokr-item-head">
          <div class="klokr-number">${index + 1}</div>
          <div>
            <strong>${instructorEscape(item.title)}</strong>
            <span>${instructorEscape(item.text)}</span>
            <small>Максимум: ${Number(item.max || 0)} баллов</small>
          </div>
        </div>
        ${instructorScoreInputs(item)}
        <textarea data-klokr-comment="${instructorEscape(item.id)}" placeholder="Комментарий по пункту"></textarea>
      </article>
    `;
  }).join("");
  root.querySelectorAll("input, textarea").forEach(input => input.addEventListener("input", instructorUpdatePreview));
}

function instructorCollectAssessment() {
  const items = KLOKR_ITEMS.map(item => {
    const max = Number(item.max || 0);
    const score = max > 0 ? Number(document.querySelector(`input[name="score_${item.id}"]:checked`)?.value || 0) : 0;
    const comment = document.querySelector(`[data-klokr-comment="${item.id}"]`)?.value.trim() || "";
    return { id: item.id, category: item.category || "", title: item.title, score, max, comment };
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
          <span>${Number(item.total_score || 0)}/${Number(item.max_score || instructorMaxScore())} баллов · ${instructorEscape(instructorFormatDate(item.created_at))}</span>
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
