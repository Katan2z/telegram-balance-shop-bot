// BK8 Staff: employee sanitary certificate dates.
(function () {
  if (window.__bk8EmployeeMedicalLoaded) return;
  window.__bk8EmployeeMedicalLoaded = true;

  function esc(value) {
    if (typeof emp2Escape === "function") return emp2Escape(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function employeeState() {
    try {
      if (typeof emp2State !== "undefined") return emp2State;
    } catch (_) {}
    return window.emp2State || null;
  }

  function selectedEmployee() {
    const state = employeeState();
    return state?.rows?.find(item => Number(item.id) === Number(state.openedId)) || null;
  }

  function daysLeft(value) {
    if (!value) return "дата не указана";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${value}T00:00:00`);
    if (Number.isNaN(target.getTime())) return "дата не указана";
    const days = Math.ceil((target.getTime() - today.getTime()) / 86400000);
    if (days < 0) return `просрочено на ${Math.abs(days)} дн.`;
    if (days === 0) return "осталось 0 дней";
    return `осталось ${days} дней`;
  }

  function field(label, id, value) {
    return `<label class="employee-medical-field"><span>${esc(label)}</span><input id="${id}" type="date" value="${esc(value || "")}" /><small>${esc(daysLeft(value))}</small></label>`;
  }

  async function loadRecord(profileId) {
    return supabaseFetch(`employee_medical_records?employee_profile_id=eq.${Number(profileId)}&select=employee_profile_id,sanitary_certificate_expires_on,sanitary_minimum_expires_on,fluorography_expires_on,updated_at&limit=1`).then(rows => rows?.[0] || null);
  }

  async function saveRecord(profileId) {
    const status = document.getElementById("employeeMedicalStatus");
    const payload = {
      employee_profile_id: Number(profileId),
      sanitary_certificate_expires_on: document.getElementById("employeeMedicalCertificate")?.value || null,
      sanitary_minimum_expires_on: document.getElementById("employeeMedicalMinimum")?.value || null,
      fluorography_expires_on: document.getElementById("employeeMedicalFluoro")?.value || null,
      updated_at: new Date().toISOString(),
    };

    try {
      await supabaseWrite("employee_medical_records?on_conflict=employee_profile_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(payload),
      });
      if (status) status.textContent = "Даты сохранены.";
      await window.emp2ShowMedical();
    } catch (error) {
      if (status) status.textContent = "Не получилось сохранить. Проверь employee-medical-records.sql.";
    }
  }

  window.emp2ShowMedical = async function emp2ShowMedicalFinal() {
    const root = document.getElementById("emp2Subpanel");
    const employee = selectedEmployee();
    if (!root || !employee) return;

    root.innerHTML = `<div class="shop-empty-card"><strong>Сан справка</strong><span>Загружаю даты...</span></div>`;

    try {
      const record = await loadRecord(employee.id);
      root.innerHTML = `<div class="employee-admin-subcard employee-medical-card">
        <div class="employee-medical-head">
          <div class="employee-module-icon">🩺</div>
          <div><h3>Сан справка</h3><p>${esc(employee.full_name || "Сотрудник")}</p></div>
        </div>
        <div class="employee-medical-grid">
          ${field("Дата окончания санитарной справки", "employeeMedicalCertificate", record?.sanitary_certificate_expires_on)}
          ${field("Дата окончания санминимума", "employeeMedicalMinimum", record?.sanitary_minimum_expires_on)}
          ${field("Дата окончания флюорографии", "employeeMedicalFluoro", record?.fluorography_expires_on)}
        </div>
        <button id="employeeMedicalSave" class="action-btn add" type="button">Сохранить</button>
        <p id="employeeMedicalStatus" class="employee-status"></p>
      </div>`;

      document.getElementById("employeeMedicalSave").onclick = () => saveRecord(employee.id);
      ["employeeMedicalCertificate", "employeeMedicalMinimum", "employeeMedicalFluoro"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", event => {
          const small = event.target.parentElement?.querySelector("small");
          if (small) small.textContent = daysLeft(event.target.value);
        });
      });
    } catch (error) {
      root.innerHTML = `<div class="shop-empty-card"><strong>Сан справка</strong><span>Сначала выполни SQL из docs/employee-medical-records.sql.</span></div>`;
    }
  };
})();
