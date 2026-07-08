// BK8 Staff: final clean view for current employee hours.
(function () {
  function escapeText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hoursText(value) {
    if (typeof myProfileHoursText === "function") return myProfileHoursText(value);
    const n = Number(value || 0);
    if (!n) return "—";
    return (Number.isInteger(n) ? String(n) : String(n).replace(".", ",")) + " ч.";
  }

  function dateText(value) {
    if (typeof myProfileDateText === "function") return myProfileDateText(value);
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 16).replace("T", " ");
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  window.myProfileShowHours = function myProfileShowHoursFinal() {
    const root = document.getElementById("profileActionContent");
    if (!root) return;

    const timesheet = window.myProfileState?.timesheet;
    if (!timesheet) {
      root.innerHTML = `
        <div class="profile-action-card profile-hours-card is-empty">
          <div class="profile-hours-icon">🕒</div>
          <div>
            <h3>Часы</h3>
            <strong>—</strong>
            <p>Табель ещё не загружен</p>
          </div>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="profile-action-card profile-hours-card">
        <div class="profile-hours-icon">🕒</div>
        <div>
          <h3>Часы</h3>
          <strong>${escapeText(hoursText(timesheet.hours))}</strong>
          <p>Актуальный табель</p>
          <small>Обновлено: ${escapeText(dateText(timesheet.updated_at))}</small>
        </div>
      </div>
    `;
  };
})();
