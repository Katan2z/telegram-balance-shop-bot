// BK8 Staff: allow managers to manage employee registration codes without granting root-only rights.
(function () {
  if (window.__managerEmployeesAccessLoaded) return;
  window.__managerEmployeesAccessLoaded = true;

  function canManageEmployees(data) {
    return typeof isAdmin === "function" && isAdmin(data);
  }

  const originalEnsureAdminTabs = window.ensureAdminTabs;
  window.ensureAdminTabs = function ensureAdminTabsWithEmployees(data) {
    if (typeof originalEnsureAdminTabs === "function") originalEnsureAdminTabs(data);
    if (!canManageEmployees(data)) return;

    const tabs = document.getElementById("tabs");
    if (!tabs || tabs.querySelector('[data-tab="employees"]')) return;

    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="employees">Сотрудники</button>');
    tabs.querySelector('[data-tab="employees"]').addEventListener("click", () => switchTab("employees"));
  };

  window.setupEmployees = async function setupEmployeesForAdminsAndManagers(data) {
    if (!canManageEmployees(data)) return;

    employeeInjectStyle();

    const originalRootAdminIds = data.root_admin_ids || [];
    const shouldTemporarilyAllowBuild = typeof isRootAdmin === "function" && !isRootAdmin(data);

    if (shouldTemporarilyAllowBuild && userId) {
      data.root_admin_ids = Array.from(new Set([...originalRootAdminIds.map(String), String(userId)]));
    }

    employeeBuildSection(data);
    data.root_admin_ids = originalRootAdminIds;

    await employeeLoad();
  };

  if (typeof renderApp === "function") {
    setTimeout(renderApp, 0);
  }
})();
