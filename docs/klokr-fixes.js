// KLOKR fixes: do not reset an active assessment form and make history visible for everyone.
let klokrFormDirty = false;

function klokrMarkDirty(event) {
  const target = event.target;
  if (!target) return;
  if (
    target.closest?.("#klokrItems") ||
    target.id === "klokrGeneralComment" ||
    target.id === "klokrEmployee"
  ) {
    klokrFormDirty = true;
  }
}

document.addEventListener("input", klokrMarkDirty, true);
document.addEventListener("change", klokrMarkDirty, true);

function klokrResetDirty() {
  klokrFormDirty = false;
}

if (typeof instructorLoad === "function") {
  instructorLoad = async function instructorLoadStable() {
    await instructorLoadBase();
    if (!instructorIsAllowed()) return;
    instructorBuildSection();

    if (!klokrFormDirty) {
      instructorRenderEmployeeSelect();
      instructorRenderPositionSwitch();
      instructorRenderItems();
      instructorUpdatePreview();
    } else {
      instructorRenderPositionSwitch();
      instructorUpdatePreview();
    }

    await instructorLoadAssessments();
    instructorRenderHistory();

    const saveBtn = document.getElementById("klokrSave");
    const refreshBtn = document.getElementById("instructorRefresh");
    if (saveBtn) saveBtn.onclick = instructorSaveAssessment;
    if (refreshBtn) refreshBtn.onclick = async () => {
      klokrResetDirty();
      await instructorLoad();
    };
  };
}

if (typeof instructorSaveAssessment === "function") {
  const originalInstructorSaveAssessment = instructorSaveAssessment;
  instructorSaveAssessment = async function instructorSaveAssessmentStable() {
    await originalInstructorSaveAssessment();
    klokrResetDirty();
  };
}

function klokrPublicUserName(id, fallback = "Сотрудник") {
  const user = klokrHistoryState.users[String(id)];
  if (!user) return fallback;
  if (user.first_name) return user.first_name;
  if (user.username) return `@${user.username}`;
  return fallback;
}

if (typeof klokrHistoryBuildSection === "function") {
  const originalBuild = klokrHistoryBuildSection;
  klokrHistoryBuildSection = function klokrHistoryBuildPublicSection() {
    originalBuild();
    const title = document.querySelector("#tab-my-klokr .my-klokr-hero h2");
    const copy = document.querySelector("#tab-my-klokr .my-klokr-hero p:not(.instructor-kicker)");
    const tab = document.querySelector('[data-tab="my-klokr"]');
    const kicker = document.querySelector("#tab-my-klokr .instructor-kicker");
    if (title) title.textContent = "📋 История КЛОКР";
    if (copy) copy.textContent = "Общая история проверок команды: позиция, результат, инструктор, комментарии и детализация по пунктам.";
    if (tab) tab.textContent = "КЛОКР";
    if (kicker) kicker.textContent = "Развитие команды";
  };
}

if (typeof klokrHistoryRenderSummary === "function") {
  klokrHistoryRenderSummary = function klokrHistoryRenderPublicSummary() {
    const root = document.getElementById("myKlokrSummary");
    if (!root) return;
    const items = klokrHistoryState.assessments || [];
    const avg = items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.percent || 0), 0) / items.length) : 0;
    const best = items.length ? Math.max(...items.map(item => Number(item.percent || 0))) : 0;
    const people = new Set(items.map(item => String(item.employee_id || "")).filter(Boolean)).size;
    root.innerHTML = `
      <div><span>Проверок</span><strong>${items.length}</strong></div>
      <div><span>Сотрудников</span><strong>${people}</strong></div>
      <div><span>Средний</span><strong>${avg}%</strong></div>
      <div><span>Лучший</span><strong>${best}%</strong></div>
    `;
  };
}

if (typeof klokrHistoryRender === "function") {
  klokrHistoryRender = function klokrHistoryRenderPublic() {
    klokrHistoryBuildSection();
    klokrHistoryRenderSummary();
    const root = document.getElementById("myKlokrHistory");
    if (!root) return;
    const items = klokrHistoryState.assessments || [];
    root.innerHTML = items.map(item => {
      const position = klokrHistoryPosition(item);
      const comment = klokrHistoryCleanComment(item.comment);
      const instructor = klokrPublicUserName(item.instructor_id, "Инструктор");
      const employee = klokrPublicUserName(item.employee_id, "Сотрудник");
      return `
        <article class="my-klokr-card">
          <div class="my-klokr-score">${Number(item.percent || 0)}%</div>
          <div class="my-klokr-body">
            <div class="my-klokr-topline">
              <strong>${klokrHistoryEscape(employee)}</strong>
              <span>${klokrHistoryEscape(klokrHistoryDate(item.created_at))}</span>
            </div>
            <p>${klokrHistoryEscape(position)} · ${Number(item.total_score || 0)}/${Number(item.max_score || 0)} баллов · Инструктор: ${klokrHistoryEscape(instructor)}</p>
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
  };
}

if (typeof klokrHistoryLoad === "function") {
  klokrHistoryLoad = async function klokrHistoryLoadPublic() {
    if (!userId) return;
    klokrHistoryBuildSection();
    const assessments = await klokrHistoryFetch("klokr_assessments?select=*&order=created_at.desc&limit=100").catch(() => []);
    const ids = [...new Set((assessments || [])
      .flatMap(item => [item.employee_id, item.instructor_id])
      .filter(Boolean)
      .map(String))];
    let users = {};
    if (ids.length) {
      const rows = await klokrHistoryFetch(`users?telegram_id=in.(${ids.join(",")})&select=telegram_id,username,first_name,last_name`).catch(() => []);
      users = Object.fromEntries((rows || []).map(row => [String(row.telegram_id), row]));
    }
    klokrHistoryState.assessments = assessments || [];
    klokrHistoryState.users = users;
    klokrHistoryRender();
    const refresh = document.getElementById("myKlokrRefresh");
    if (refresh) refresh.onclick = () => klokrHistoryLoad().catch(() => {});
  };
}

setTimeout(() => {
  if (typeof instructorLoad === "function") instructorLoad().catch(() => {});
  if (typeof klokrHistoryLoad === "function") klokrHistoryLoad().catch(() => {});
}, 300);
