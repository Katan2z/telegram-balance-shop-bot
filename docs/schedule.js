const SCHEDULE_DAYS = [
  ["mon", "Понедельник"], ["tue", "Вторник"], ["wed", "Среда"],
  ["thu", "Четверг"], ["fri", "Пятница"], ["sat", "Суббота"], ["sun", "Воскресенье"],
];
const scheduleState = { weekStart: "", payload: null, weeks: [] };

function scheduleConfig() {
  const config = window.APP_CONFIG || {};
  return { url: String(config.SUPABASE_URL || "").replace(/\/$/, ""), key: config.SUPABASE_ANON_KEY || "" };
}

async function scheduleFetch(path, options = {}) {
  const config = scheduleConfig();
  if (!config.url || !config.key) throw new Error("Supabase config missing");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `Supabase ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function scheduleRpc(name, body) {
  return scheduleFetch(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

function scheduleEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function scheduleLocalDate(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function scheduleIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduleNextMonday(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isoDay = date.getDay() || 7;
  const daysUntilNextMonday = 8 - isoDay;
  date.setDate(date.getDate() + daysUntilNextMonday + (isoDay > 3 ? 7 : 0));
  return scheduleIso(date);
}

function scheduleAddDays(iso, days) {
  const date = scheduleLocalDate(iso);
  date.setDate(date.getDate() + days);
  return scheduleIso(date);
}

function scheduleDateText(iso, withYear = false) {
  return scheduleLocalDate(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", ...(withYear ? { year: "numeric" } : {}) });
}

function scheduleWeekText(iso) {
  return `${scheduleDateText(iso, true)} — ${scheduleDateText(scheduleAddDays(iso, 6), true)}`;
}

function scheduleBuildSection() {
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  if (!tabs || !app) return;
  if (!tabs.querySelector('[data-tab="schedule"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="schedule">Расписание</button>');
    tabs.querySelector('[data-tab="schedule"]').onclick = () => switchTab("schedule");
  }
  if (!document.getElementById("tab-schedule")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-schedule">
        <article class="card schedule-panel">
          <div class="schedule-hero"><div><small>BK8 STAFF</small><h2>📅 Расписание</h2><p>Возможности сотрудников и итоговое расписание по неделям.</p></div></div>
          <div class="schedule-week-controls" id="scheduleControls"></div>
          <div class="schedule-meta" id="scheduleMeta"></div>
          <p class="schedule-status" id="scheduleStatus"></p>
          <div id="scheduleContent"></div>
        </article>
      </section>`);
  }
}

function scheduleSetStatus(text, ok = false) {
  const node = document.getElementById("scheduleStatus");
  if (!node) return;
  node.textContent = text || "";
  node.style.color = ok ? "#2e8a55" : "#a82012";
}

function scheduleWeekOptions() {
  const all = new Map((scheduleState.weeks || []).map(week => [week.week_start, week]));
  if (scheduleState.weekStart && !all.has(scheduleState.weekStart)) all.set(scheduleState.weekStart, { week_start: scheduleState.weekStart, status: "collecting" });
  return [...all.values()].sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
}

function scheduleRenderControls() {
  const controls = document.getElementById("scheduleControls");
  const payload = scheduleState.payload;
  if (!controls || !payload) return;
  const options = scheduleWeekOptions().map(week => `<option value="${week.week_start}" ${week.week_start === scheduleState.weekStart ? "selected" : ""}>${scheduleEscape(scheduleWeekText(week.week_start))}${week.status === "published" ? " · опубликовано" : ""}</option>`).join("");
  controls.innerHTML = `
    <select id="scheduleWeekSelect" aria-label="Неделя">${options}</select>
    <button type="button" id="scheduleNextWeek">Следующая неделя</button>
    <button type="button" id="scheduleRefresh">Обновить</button>
    ${payload.is_admin ? '<button type="button" class="schedule-primary" id="scheduleSaveAll">Сохранить всё</button><button type="button" id="scheduleCopyAvailability">Перенести возможности</button><button type="button" class="schedule-publish" id="scheduleOpenInput">Открыть сотрудникам</button><button type="button" id="scheduleCloseInput">Закрыть сотрудникам</button><button type="button" class="schedule-publish" id="schedulePublish">Опубликовать</button><button type="button" id="scheduleExcel">Скачать Excel</button>' : ""}
  `;
  document.getElementById("scheduleWeekSelect").onchange = event => scheduleLoad(event.target.value);
  document.getElementById("scheduleNextWeek").onclick = () => scheduleLoad(scheduleNextMonday());
  document.getElementById("scheduleRefresh").onclick = () => scheduleLoad(scheduleState.weekStart);
  if (payload.is_admin) {
    document.getElementById("scheduleSaveAll").onclick = scheduleSaveAll;
    document.getElementById("scheduleCopyAvailability").onclick = scheduleCopyAvailability;
    document.getElementById("scheduleOpenInput").onclick = () => scheduleSetInputAccess(true);
    document.getElementById("scheduleCloseInput").onclick = () => scheduleSetInputAccess(false);
    document.getElementById("schedulePublish").onclick = schedulePublish;
    document.getElementById("scheduleExcel").onclick = scheduleExportExcel;
  }
}

function scheduleRenderMeta() {
  const meta = document.getElementById("scheduleMeta");
  const week = scheduleState.payload?.week;
  if (!meta || !week) return;
  const deadline = new Date(week.submission_deadline).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const employeeOpen = scheduleState.payload.employee_can_submit ?? (week.status === "collecting" && Date.now() <= new Date(week.submission_deadline).getTime());
  const accessText = week.employee_input_override === true ? "🟢 Открыто админом" : week.employee_input_override === false ? "🔒 Закрыто админом" : employeeOpen ? "🟢 Приём открыт автоматически" : "🔒 Приём закрыт автоматически";
  meta.innerHTML = `<span>Неделя: ${scheduleEscape(scheduleWeekText(week.week_start))}</span><span>Приём до: ${scheduleEscape(deadline)} МСК</span><span>${accessText}</span>${week.status === "published" ? "<span>✅ Опубликовано</span>" : ""}`;
}

function scheduleDayLabel(key, index) {
  return `${SCHEDULE_DAYS[index][1]}<small>${scheduleDateText(scheduleAddDays(scheduleState.weekStart, index))}</small>`;
}

function scheduleEmployeeMarkup(entry) {
  const values = entry.availability || {};
  const disabled = scheduleState.payload.can_submit ? "" : "disabled";
  return `<div class="schedule-employee-form">
    ${SCHEDULE_DAYS.map(([key, label], index) => `<label class="schedule-day-card"><strong>${label}</strong><small>${scheduleDateText(scheduleAddDays(scheduleState.weekStart, index), true)}</small><textarea data-schedule-day="${key}" ${disabled} placeholder="Например: после 16:00">${scheduleEscape(values[key] || "")}</textarea>${entry.final_schedule?.[key] ? `<small>Итог: ${scheduleEscape(entry.final_schedule[key])}</small>` : ""}</label>`).join("")}
    <label class="schedule-day-card schedule-comment-card"><strong>Комментарий</strong><textarea id="scheduleEmployeeComment" ${disabled} placeholder="Комментарий к возможностям">${scheduleEscape(entry.comment || "")}</textarea></label>
    ${scheduleState.payload.can_submit ? '<button type="button" class="schedule-primary" id="scheduleEmployeeSave">Сохранить возможности</button>' : ""}
  </div>`;
}

function scheduleAdminMarkup(entries) {
  return `<div class="schedule-table-wrap"><table class="schedule-table"><thead><tr><th>Сотрудник</th>${SCHEDULE_DAYS.map(([, label], index) => `<th>${label}<br><small>${scheduleDateText(scheduleAddDays(scheduleState.weekStart, index))}</small></th>`).join("")}<th>Комментарий</th><th>Ознакомлен<br>(роспись)</th><th></th></tr></thead><tbody>
    ${entries.map(entry => `<tr data-schedule-profile="${entry.employee_profile_id}"><td><strong>${scheduleEscape(entry.employee_name)}</strong><small>${entry.submitted_at ? "Возможности заполнены" : "Не заполнено"}</small></td>${SCHEDULE_DAYS.map(([key]) => `<td><textarea data-final-day="${key}" placeholder="Смена или выходной">${scheduleEscape(entry.final_schedule?.[key] || "")}</textarea>${entry.availability?.[key] ? `<small class="schedule-availability">Может: ${scheduleEscape(entry.availability[key])}</small>` : ""}</td>`).join("")}<td><textarea class="schedule-comment" data-final-comment>${scheduleEscape(entry.comment || "")}</textarea></td><td class="schedule-signature"></td><td class="schedule-row-actions"><button type="button" data-save-row>Сохранить</button></td></tr>`).join("")}
  </tbody></table></div>`;
}

function scheduleRender() {
  scheduleBuildSection();
  scheduleRenderControls();
  scheduleRenderMeta();
  const content = document.getElementById("scheduleContent");
  const entries = scheduleState.payload?.entries || [];
  if (!content) return;
  if (!entries.length) content.innerHTML = '<div class="schedule-empty">Для этого пользователя нет активного профиля сотрудника.</div>';
  else content.innerHTML = scheduleState.payload.is_admin ? scheduleAdminMarkup(entries) : scheduleEmployeeMarkup(entries[0]);
  document.getElementById("scheduleEmployeeSave")?.addEventListener("click", scheduleSaveEmployee);
  document.querySelectorAll("[data-save-row]").forEach(button => button.onclick = () => scheduleSaveAdminRow(button.closest("tr")));
  if (typeof setupSimpleNavigation === "function") setupSimpleNavigation();
}

function scheduleValuesFrom(root, selector) {
  return Object.fromEntries(SCHEDULE_DAYS.map(([key]) => [key, root.querySelector(`${selector}[data-schedule-day="${key}"], ${selector}[data-final-day="${key}"]`)?.value.trim() || ""]));
}

async function scheduleSaveEmployee() {
  const entry = scheduleState.payload.entries[0];
  const content = document.getElementById("scheduleContent");
  try {
    scheduleSetStatus("Сохраняем возможности...");
    await scheduleRpc("schedule_save_entry", { p_actor_id: Number(userId), p_week_start: scheduleState.weekStart, p_employee_profile_id: Number(entry.employee_profile_id), p_mode: "availability", p_values: scheduleValuesFrom(content, "textarea"), p_comment: document.getElementById("scheduleEmployeeComment")?.value.trim() || "" });
    scheduleSetStatus("Возможности сохранены.", true);
    await scheduleLoad(scheduleState.weekStart, false);
  } catch (error) { scheduleSetStatus(error.message); }
}

function scheduleAdminRowData(row) {
  return { profileId: Number(row.dataset.scheduleProfile), values: scheduleValuesFrom(row, "textarea"), comment: row.querySelector("[data-final-comment]")?.value.trim() || "" };
}

async function scheduleSaveAdminRow(row, reload = true) {
  const data = scheduleAdminRowData(row);
  await scheduleRpc("schedule_save_entry", { p_actor_id: Number(userId), p_week_start: scheduleState.weekStart, p_employee_profile_id: data.profileId, p_mode: "final", p_values: data.values, p_comment: data.comment });
  if (reload) { scheduleSetStatus("Строка сохранена.", true); await scheduleLoad(scheduleState.weekStart, false); }
}

async function scheduleSaveAll() {
  try {
    scheduleSetStatus("Сохраняем расписание...");
    const rows = [...document.querySelectorAll("[data-schedule-profile]")];
    for (const row of rows) await scheduleSaveAdminRow(row, false);
    scheduleSetStatus("Все строки сохранены.", true);
    await scheduleLoad(scheduleState.weekStart, false);
  } catch (error) { scheduleSetStatus(error.message); }
}

function scheduleCopyAvailability() {
  for (const entry of scheduleState.payload.entries || []) {
    const row = document.querySelector(`[data-schedule-profile="${entry.employee_profile_id}"]`);
    if (!row) continue;
    for (const [key] of SCHEDULE_DAYS) {
      const field = row.querySelector(`[data-final-day="${key}"]`);
      if (field && !field.value.trim()) field.value = entry.availability?.[key] || "";
    }
  }
  scheduleSetStatus("Возможности перенесены в пустые ячейки. Нажми «Сохранить всё».", true);
}

async function schedulePublish() {
  try {
    await scheduleSaveAll();
    await scheduleRpc("schedule_publish_week", { p_actor_id: Number(userId), p_week_start: scheduleState.weekStart });
    scheduleSetStatus("Расписание опубликовано.", true);
    await scheduleLoad(scheduleState.weekStart);
  } catch (error) { scheduleSetStatus(error.message); }
}

async function scheduleSetInputAccess(open) {
  try {
    scheduleSetStatus(open ? "Открываем заполнение сотрудникам..." : "Закрываем заполнение сотрудникам...");
    await scheduleRpc("schedule_set_input_access", { p_actor_id: Number(userId), p_week_start: scheduleState.weekStart, p_open: Boolean(open) });
    scheduleSetStatus(open ? "Заполнение открыто для сотрудников." : "Заполнение закрыто для сотрудников.", true);
    await scheduleLoad(scheduleState.weekStart);
  } catch (error) { scheduleSetStatus(error.message); }
}

function scheduleCellFill(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("отпуск")) return "FF35B9E8";
  if (value.includes("выходн")) return "FFFF4D4D";
  return value ? "FFFFFFFF" : "FFFFD6B3";
}

async function scheduleExportExcel() {
  if (!window.ExcelJS) return scheduleSetStatus("Библиотека Excel ещё загружается. Попробуй через несколько секунд.");
  try {
    scheduleSetStatus("Формируем Excel...");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "BK8 Staff";
    const sheet = workbook.addWorksheet("Расписание", { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .3, bottom: .3, header: .1, footer: .1 } } });
    sheet.mergeCells("A1:K1");
    sheet.getCell("A1").value = `Расписание с ${scheduleDateText(scheduleState.weekStart, true)} по ${scheduleDateText(scheduleAddDays(scheduleState.weekStart, 6), true)}`;
    sheet.getCell("A1").font = { bold: true, size: 15 };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8C9E8" } };
    sheet.getRow(1).height = 26;
    sheet.addRow(["№", "Сотрудник", ...SCHEDULE_DAYS.map(([, label], index) => `${label}\n${scheduleDateText(scheduleAddDays(scheduleState.weekStart, index))}`), "Комментарий", "Ознакомлен\n(роспись)"]);
    const header = sheet.getRow(2); header.height = 38; header.font = { bold: true }; header.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
    (scheduleState.payload.entries || []).forEach((entry, index) => {
      const values = entry.final_schedule || {};
      const row = sheet.addRow([index + 1, entry.employee_name, ...SCHEDULE_DAYS.map(([key]) => values[key] || ""), entry.comment || "", ""]);
      row.height = 34; row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      row.getCell(2).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      SCHEDULE_DAYS.forEach(([,], dayIndex) => { row.getCell(dayIndex + 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: scheduleCellFill(row.getCell(dayIndex + 3).value) } }; });
    });
    sheet.columns = [{ width: 5 }, { width: 27 }, ...SCHEDULE_DAYS.map(() => ({ width: 18 })), { width: 25 }, { width: 20 }];
    const lastRow = sheet.rowCount;
    for (let row = 1; row <= lastRow; row += 1) for (let column = 1; column <= 11; column += 1) sheet.getCell(row, column).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    sheet.views = [{ state: "frozen", ySplit: 2, xSplit: 2 }];
    sheet.pageSetup.printArea = `A1:K${lastRow}`;
    sheet.pageSetup.printTitlesRow = "1:2";
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Расписание_${scheduleState.weekStart}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    scheduleSetStatus("Excel скачан.", true);
  } catch (error) { console.error(error); scheduleSetStatus(`Не получилось создать Excel: ${error.message}`); }
}

async function scheduleLoad(weekStart = scheduleNextMonday(), refreshWeeks = true) {
  scheduleBuildSection();
  if (!window.userId) return;
  scheduleState.weekStart = weekStart;
  scheduleSetStatus("Загружаем расписание...");
  try {
    scheduleState.payload = await scheduleRpc("schedule_get_week", { p_actor_id: Number(userId), p_week_start: weekStart });
    if (refreshWeeks) scheduleState.weeks = await scheduleRpc("schedule_list_weeks", { p_actor_id: Number(userId) });
    scheduleSetStatus(""); scheduleRender();
  } catch (error) {
    scheduleSetStatus(error.message);
    const content = document.getElementById("scheduleContent"); if (content) content.innerHTML = '<div class="schedule-empty">Расписание станет доступно после применения SQL-миграции.</div>';
  }
}

function scheduleStart() {
  scheduleBuildSection();
  const permissions = window.BK8Permissions;
  const ready = permissions?.state?.loaded ? Promise.resolve() : permissions?.load?.() || Promise.resolve();
  ready.then(() => scheduleLoad()).catch(error => scheduleSetStatus(error.message));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleStart, { once: true }); else scheduleStart();
