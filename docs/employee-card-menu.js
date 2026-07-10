// BK8 Staff: final employee card navigation.
(function () {
  if (window.__bk8EmployeeCardMenuLoaded) return;
  window.__bk8EmployeeCardMenuLoaded = true;

  function esc(value) {
    if (typeof emp2Escape === "function") return emp2Escape(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selectedEmployee() {
    return window.emp2State?.rows?.find(item => Number(item.id) === Number(window.emp2State?.openedId)) || null;
  }

  function subpanel() {
    return document.getElementById("emp2Subpanel");
  }

  function showPlaceholder(icon, title, text) {
    const root = subpanel();
    if (!root) return;
    root.innerHTML = `<div class="employee-admin-subcard employee-module-placeholder"><div class="employee-module-icon">${icon}</div><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>`;
  }

  window.emp2ShowProfile = function emp2ShowProfileFinal() {
    const row = selectedEmployee();
    if (!row) return;
    if (typeof emp2Fill === "function") emp2Fill(row);
    showPlaceholder("👤", "Профиль", "Данные сотрудника открыты в форме редактирования выше.");
    document.getElementById("emp2FormTitle")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  window.emp2ShowMedical = function emp2ShowMedical() {
    showPlaceholder("🩺", "Сан справка", "Следующим шагом добавим даты санитарной справки, санминимума и флюорографии.");
  };

  window.emp2ShowPvv = function emp2ShowPvv() {
    showPlaceholder("📄", "Бланк ПВВ", "Здесь будет загрузка и просмотр скана без сроков действия.");
  };

  window.emp2ShowKlokr = function emp2ShowKlokr() {
    showPlaceholder("🏆", "КЛОКР", "Оценки сотрудника будут подключены отдельным модулем.");
  };

  window.emp2ShowPurchases = function emp2ShowPurchases() {
    showPlaceholder("🛒", "Покупки", "Раздел подготовлен. Логику покупок добавим позже.");
  };

  window.emp2ShowSettings = function emp2ShowSettings() {
    showPlaceholder("⚙️", "Настройки", "Здесь будут только настройки конкретного сотрудника.");
  };

  window.emp2ShowTimesheet = async function emp2ShowCurrentTimesheet(profileId) {
    const root = subpanel();
    if (!root) return;
    root.innerHTML = `<div class="shop-empty-card"><strong>Табель</strong><span>Загружаю актуальные часы...</span></div>`;
    try {
      const rows = await supabaseFetch(`employee_timesheets?employee_profile_id=eq.${Number(profileId)}&period=eq.current&select=hours,updated_at&limit=1`);
      const row = rows?.[0];
      if (!row) {
        root.innerHTML = `<div class="employee-admin-subcard employee-current-hours"><div class="employee-module-icon">🕒</div><div><h3>Табель</h3><strong>—</strong><p>Табель ещё не загружен.</p></div></div>`;
        return;
      }
      const hours = Number(row.hours || 0);
      const hoursText = (Number.isInteger(hours) ? String(hours) : String(hours).replace(".", ",")) + " ч.";
      const updated = row.updated_at ? new Date(row.updated_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
      root.innerHTML = `<div class="employee-admin-subcard employee-current-hours"><div class="employee-module-icon">🕒</div><div><h3>Табель</h3><strong>${esc(hoursText)}</strong><p>Актуальные часы</p><small>Обновлено: ${esc(updated)}</small></div></div>`;
    } catch (error) {
      root.innerHTML = `<div class="shop-empty-card"><strong>Табель</strong><span>Не удалось загрузить актуальные часы.</span></div>`;
    }
  };

  window.emp2DeleteEmployee = async function emp2DeleteEmployee(id) {
    const row = selectedEmployee();
    const name = row?.full_name || "сотрудника";
    if (!confirm(`Удалить ${name}? Это действие нельзя отменить.`)) return;
    try {
      await supabaseWrite(`employee_profiles?id=eq.${Number(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      window.emp2State.openedId = null;
      if (typeof emp2Load === "function") await emp2Load();
    } catch (error) {
      const root = subpanel();
      if (root) root.innerHTML = `<div class="shop-empty-card"><strong>Не удалось удалить сотрудника</strong><span>${esc(error?.message || error)}</span></div>`;
    }
  };

  window.emp2RenderDetails = function emp2RenderDetailsFinal() {
    const root = document.getElementById("emp2Details");
    if (!root) return;
    const row = selectedEmployee();
    if (!row) {
      root.innerHTML = "";
      return;
    }

    const name = row.full_name === "Ожидает регистрации" ? "Ожидает ФИО" : row.full_name;
    const avatarText = typeof initials === "function" ? initials(name || "BK") : String(name || "BK").slice(0, 2).toUpperCase();

    root.innerHTML = `<article class="employee-admin-card">
      <div class="employee-admin-head">
        <div class="employee-v2-avatar big">${esc(avatarText)}</div>
        <div><p class="label">Карточка сотрудника</p><h3>${esc(name || "Сотрудник")}</h3><span>${esc(row.position || "Должность не указана")}</span></div>
      </div>
      <div class="employee-admin-grid employee-final-menu">
        <button onclick="emp2ShowProfile()"><span>👤</span><strong>Профиль</strong></button>
        <button onclick="emp2ShowMedical()"><span>🩺</span><strong>Сан справка</strong></button>
        <button onclick="emp2ShowPvv()"><span>📄</span><strong>Бланк ПВВ</strong></button>
        <button onclick="emp2ShowTimesheet(${Number(row.id)})"><span>🕒</span><strong>Табель</strong></button>
        <button onclick="emp2ShowKlokr()"><span>🏆</span><strong>КЛОКР</strong></button>
        <button onclick="emp2ShowPurchases()"><span>🛒</span><strong>Покупки</strong></button>
        <button onclick="emp2ShowSettings()"><span>⚙️</span><strong>Настройки</strong></button>
        <button class="employee-delete-action" onclick="emp2DeleteEmployee(${Number(row.id)})"><span>🗑</span><strong>Удалить сотрудника</strong></button>
      </div>
      <div class="profile-info-grid">
        <div><span>Телефон</span><strong>${esc(row.phone || "—")}</strong></div>
        <div><span>Дата рождения</span><strong>${esc(row.birth_date || "—")}</strong></div>
        <div><span>Telegram</span><strong>${esc(row.telegram_id || "не привязан")}</strong></div>
        <div><span>Код</span><strong>${esc(row.activation_code || "—")}</strong></div>
      </div>
      <div id="emp2Subpanel"></div>
    </article>`;
  };

  setTimeout(() => {
    if (window.emp2State?.openedId && typeof window.emp2RenderDetails === "function") window.emp2RenderDetails();
  }, 500);
})();
