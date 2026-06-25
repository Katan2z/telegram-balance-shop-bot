function instructorEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const KLOKR_POSITION_LABELS = {
  kitchen: "Кухня",
  service: "Сервис",
};

const KLOKR_ITEMS = [
  { id: "k_uniform", position: "kitchen", category: "Кухня · практика", title: "Внешний вид и форма", text: "Форма чистая и целая, обувь подходит для работы, есть бейдж, головной убор и фартук. Без украшений, пирсинга, накладных ногтей, ресниц и других нарушений стандарта.", max: 2 },
  { id: "k_hands", position: "kitchen", category: "Кухня · практика", title: "Мытьё рук по стандарту", text: "Руки моются по графику, после аллергенов, после касания лица, пола, мусора и при любом загрязнении. Отметки актуальные.", max: 2 },
  { id: "k_gloves", position: "kitchen", category: "Кухня · практика", title: "Перчатки используются правильно", text: "Сотрудник надевает и меняет перчатки по стандарту, не работает с продуктом без нужной защиты.", max: 2 },
  { id: "k_transition_hands", position: "kitchen", category: "Кухня · практика", title: "Переход между позициями", text: "При переходе на другую позицию сотрудник соблюдает гигиену: моет руки и меняет перчатки, если это требуется стандартом.", max: 2 },
  { id: "k_sandwich_sequence", position: "kitchen", category: "Кухня · практика", title: "Сборка сандвичей", text: "Сандвичи собираются в правильной последовательности, по стандартной сборке и без лишних движений.", max: 4 },
  { id: "k_grams", position: "kitchen", category: "Кухня · практика", title: "Граммовки и порции", text: "Соусы, овощи, сыры и остальные ингредиенты кладутся в нужном количестве. Нет недовеса или перебора.", max: 3 },
  { id: "k_proteins_tongs", position: "kitchen", category: "Кухня · практика", title: "Работа с протеинами", text: "Протеины перекладываются только нужими щипцами или инструментом. Нет контакта руками или неправильным инвентарём.", max: 2 },
  { id: "k_timers_position", position: "kitchen", category: "Кухня · практика", title: "Таймеры на позиции", text: "Все таймеры на позиции актуальны, включая дезраствор. Просроченных или невыставленных таймеров нет.", max: 2 },
  { id: "k_prep_tempering", position: "kitchen", category: "Кухня · практика", title: "Заготовки и темперирование", text: "Овощи и продукты подготовлены вовремя, темперируются правильно, просроченных таймеров нет.", max: 1 },
  { id: "k_product_standard", position: "kitchen", category: "Кухня · практика", title: "Качество продуктов", text: "Продукты выглядят по стандарту: не заветрены, не порваны, без лишней влаги, брака и следов неправильного хранения.", max: 1 },
  { id: "k_product_timers", position: "kitchen", category: "Кухня · практика", title: "Таймеры на продукцию", text: "На готовую продукцию и заготовки выставлены корректные сроки. Таймер соответствует продукту и времени приготовления/открытия.", max: 2 },
  { id: "k_phu_quantity_timers", position: "kitchen", category: "Кухня · практика", title: "PHU: количество и таймеры", text: "Количество продукции в PHU соответствует стандарту, электронные таймеры выставлены и не просрочены.", max: 2 },
  { id: "k_fryer_transport", position: "kitchen", category: "Кухня · практика", title: "Фритюр и транспортировка ГП", text: "Готовая продукция с фритюра переносится по стандарту: аккуратно, безопасно, без нарушения качества и санитарии.", max: 1 },
  { id: "k_clean_position", position: "kitchen", category: "Кухня · практика", title: "Чистота позиции", text: "Рабочая зона чистая и организованная. Нет мусора, лишней продукции, грязного инвентаря и хаоса на станции.", max: 2 },

  { id: "s_uniform", position: "service", category: "Сервис · практика", title: "Внешний вид и форма", text: "Форма чистая и целая, обувь подходит для работы, есть бейдж, головной убор и фартук. Внешний вид соответствует стандарту для работы с гостями.", max: 2 },
  { id: "s_hands", position: "service", category: "Сервис · практика", title: "Мытьё рук по стандарту", text: "Руки моются по графику и после всех ситуаций, где это требуется: касание лица, мусора, пола, переход между задачами, работа с аллергенами.", max: 2 },
  { id: "s_gloves", position: "service", category: "Сервис · практика", title: "Перчатки используются правильно", text: "Сотрудник использует перчатки там, где это требуется, и меняет их при переходе между задачами или загрязнении.", max: 2 },
  { id: "s_transition_hands", position: "service", category: "Сервис · практика", title: "Переход между задачами", text: "При переходе с позиции на позицию сотрудник не нарушает гигиену: моет руки и меняет перчатки по стандарту.", max: 2 },
  { id: "s_cash_order", position: "service", category: "Сервис · практика", title: "Приём заказа на кассе", text: "Есть приветствие, уточнение заказа, предложение допов, перевод на комбо и применение треугольника продаж без давления на гостя.", max: 4 },
  { id: "s_timers_position", position: "service", category: "Сервис · практика", title: "Таймеры на позиции", text: "Таймеры на позиции актуальны, включая дезраствор. Нет просроченных или забытых таймеров.", max: 2 },
  { id: "s_order_accuracy", position: "service", category: "Сервис · практика", title: "Точность сборки заказа", text: "Заказы собираются внимательно: все позиции, напитки, соусы, салфетки и упаковка соответствуют заказу гостя.", max: 3 },
  { id: "s_here_takeaway", position: "service", category: "Сервис · практика", title: "На месте / с собой", text: "Сотрудник правильно определяет формат заказа и использует нужную упаковку для зала или навынос.", max: 1 },
  { id: "s_clean_position", position: "service", category: "Сервис · практика", title: "Чистота позиции", text: "Касса, зона выдачи и рабочая поверхность чистые и аккуратные. Нет лишнего мусора, грязного инвентаря и хаоса.", max: 2 },
  { id: "s_friendly", position: "service", category: "Сервис · практика", title: "Дружелюбие и финальный контакт", text: "Сотрудник общается спокойно и доброжелательно, желает приятного аппетита или хорошего дня.", max: 2 },
  { id: "s_guest_reaction", position: "service", category: "Сервис · практика", title: "Реакция на гостя до 5 секунд", text: "Гость быстро замечен: сотрудник реагирует взглядом, приветствием или фразой ожидания в течение 5 секунд.", max: 1 },

  { id: "t_wash_hands", position: "theory", category: "Теория", title: "Как правильно мыть руки", text: "Сотрудник может объяснить порядок мытья рук, когда это нужно делать и почему это важно для безопасности продукта.", max: 2 },
  { id: "t_phu_quantity", position: "theory", category: "Теория", title: "Количество продукции в PHU", text: "Сотрудник знает количество минимум по трём видам продукции и понимает, зачем соблюдать загрузку PHU.", max: 2 },
  { id: "t_allergen", position: "theory", category: "Теория", title: "Аллергенная посуда и инвентарь", text: "Сотрудник понимает, какая посуда и инвентарь используются для аллергенов и как избежать перекрёстного контакта.", max: 1 },
  { id: "t_greeting_sales", position: "theory", category: "Теория", title: "Приветствие, допы и продажи", text: "Сотрудник знает приветствие, логику предложения допов, перевод на комбо и треугольник продаж.", max: 3 },
  { id: "t_new_items", position: "theory", category: "Теория", title: "Новинки меню", text: "Сотрудник отвечает на три вопроса по актуальным новинкам: состав, особенности, как предложить гостю.", max: 3 },
  { id: "t_bonus", position: "theory", category: "Теория", title: "Премия и показатели", text: "Сотрудник понимает, за какие показатели команда получает премию и как его работа влияет на результат смены.", max: 1 },
  { id: "t_motivation", position: "theory", category: "Теория", title: "Виды мотивации", text: "Сотрудник знает, какие виды мотивации есть в ресторане. Пункт можно использовать как комментарий без баллов.", max: 0 },
];

let instructorState = {
  users: {},
  managers: [],
  instructors: [],
  assessments: [],
  rootIds: new Set(),
  adminIds: new Set(),
  selectedPosition: "kitchen",
};

function instructorCurrentItems() {
  return KLOKR_ITEMS.filter(item => item.position === instructorState.selectedPosition || item.position === "theory");
}

function instructorMaxScore() {
  return instructorCurrentItems().reduce((sum, item) => sum + Number(item.max || 0), 0);
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
              <p>Оценка проводится на одной позиции за смену: кухня или сервис. Теория добавляется к любой проверке автоматически.</p>
            </div>
            <div class="instructor-score-card">
              <span>Максимум</span>
              <strong id="klokrMaxScore">${instructorMaxScore()}</strong>
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
            <label>Позиция проверки</label>
            <div class="klokr-position-switch" id="klokrPositionSwitch">
              <button type="button" data-klokr-position="kitchen">🍔 Кухня</button>
              <button type="button" data-klokr-position="service">🤝 Сервис</button>
            </div>
            <p class="klokr-position-hint" id="klokrPositionHint"></p>
            <div id="klokrItems" class="klokr-items"></div>
            <label>Общий комментарий</label>
            <textarea id="klokrGeneralComment" placeholder="Итог по смене: что получилось хорошо и что подтянуть в следующий раз"></textarea>
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

function instructorRenderPositionSwitch() {
  document.querySelectorAll("[data-klokr-position]").forEach(button => {
    const active = button.dataset.klokrPosition === instructorState.selectedPosition;
    button.classList.toggle("active", active);
    button.onclick = () => {
      instructorState.selectedPosition = button.dataset.klokrPosition;
      instructorRenderPositionSwitch();
      instructorRenderItems();
      instructorUpdatePreview();
    };
  });
  const hint = document.getElementById("klokrPositionHint");
  if (hint) {
    const position = KLOKR_POSITION_LABELS[instructorState.selectedPosition] || "позиция";
    hint.textContent = `Сейчас оценивается: ${position}. В форму включена практика по этой позиции + общий блок теории.`;
  }
  const maxScore = document.getElementById("klokrMaxScore");
  if (maxScore) maxScore.textContent = instructorMaxScore();
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
  root.innerHTML = instructorCurrentItems().map((item, index) => {
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
  instructorRenderPositionSwitch();
}

function instructorCollectAssessment() {
  const items = instructorCurrentItems().map(item => {
    const max = Number(item.max || 0);
    const score = max > 0 ? Number(document.querySelector(`input[name="score_${item.id}"]:checked`)?.value || 0) : 0;
    const comment = document.querySelector(`[data-klokr-comment="${item.id}"]`)?.value.trim() || "";
    return { id: item.id, position: item.position, category: item.category || "", title: item.title, score, max, comment };
  });
  const total = items.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const max = items.reduce((sum, item) => sum + Number(item.max || 0), 0);
  const percent = max > 0 ? Math.round((total / max) * 100) : 0;
  return { position: instructorState.selectedPosition, position_label: KLOKR_POSITION_LABELS[instructorState.selectedPosition], items, total, max, percent };
}

function instructorUpdatePreview() {
  const root = document.getElementById("klokrPreview");
  if (!root) return;
  const result = instructorCollectAssessment();
  root.innerHTML = `
    <div><span>Позиция</span><strong>${instructorEscape(result.position_label)}</strong></div>
    <div><span>Итог</span><strong>${result.total}/${result.max}</strong></div>
    <div><span>Процент</span><strong>${result.percent}%</strong></div>
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
        comment: `[${result.position_label}] ${generalComment}`.trim(),
        created_at: new Date().toISOString(),
      }),
    });
    if (status) status.textContent = `КЛОКР сохранён: ${result.position_label}, ${result.percent}%.`;
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

function instructorAssessmentPosition(item) {
  const first = Array.isArray(item.items) ? item.items.find(row => row.position === "kitchen" || row.position === "service") : null;
  if (first?.position) return KLOKR_POSITION_LABELS[first.position] || "КЛОКР";
  const comment = String(item.comment || "");
  if (comment.includes("[Кухня]")) return "Кухня";
  if (comment.includes("[Сервис]")) return "Сервис";
  return "КЛОКР";
}

function instructorRenderHistory() {
  const root = document.getElementById("klokrHistory");
  if (!root) return;
  root.innerHTML = instructorState.assessments.map((item, index) => {
    const employee = instructorName(item.employee_id);
    const instructor = instructorName(item.instructor_id);
    const position = instructorAssessmentPosition(item);
    return `
      <article class="klokr-history-card rank-${index + 1}">
        <div class="klokr-percent">${Number(item.percent || 0)}%</div>
        <div>
          <strong>${instructorEscape(employee)}</strong>
          <span>${instructorEscape(position)} · ${Number(item.total_score || 0)}/${Number(item.max_score || 0)} баллов · ${instructorEscape(instructorFormatDate(item.created_at))}</span>
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
  instructorRenderPositionSwitch();
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
