// BK8 Staff: employees section access is controlled by BK8Permissions.
(function () {
  if (window.__bk8EmployeeAccessBridgeLoaded) return;
  window.__bk8EmployeeAccessBridgeLoaded = true;

  async function ensurePermissions() {
    if (!window.BK8Permissions) return null;
    if (!window.BK8Permissions.state.loaded) await window.BK8Permissions.load();
    return window.BK8Permissions;
  }

  function addEmployeesTab() {
    const tabs = document.getElementById("tabs");
    if (!tabs || tabs.querySelector('[data-tab="employees"]')) return;

    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="employees">Сотрудники</button>');
    tabs.querySelector('[data-tab="employees"]').addEventListener("click", () => switchTab("employees"));
  }

  function addEmployeesQuickAction() {
    const grid = document.querySelector("#quickActionsCard .quick-actions-grid");
    if (!grid || grid.querySelector('[data-nav-action="employees"]')) return;

    grid.insertAdjacentHTML("beforeend", `
      <button class="nav-action" type="button" data-nav-action="employees">
        <span>👥</span>
        <strong>Сотрудники</strong>
        <small>Профили и коды</small>
      </button>
    `);

    grid.querySelector('[data-nav-action="employees"]').onclick = () => {
      switchTab("employees");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  async function openEmployeesSection() {
    const permissions = await ensurePermissions();
    if (!permissions?.can("manageEmployees")) return;
    if (typeof employeeInjectStyle !== "function" || typeof employeeBuildSection !== "function") return;

    addEmployeesTab();

    employeeInjectStyle();
    employeeBuildSection({ root_admin_ids: [permissions.currentUserId] });

    if (typeof employeeLoad === "function") await employeeLoad();
    addEmployeesQuickAction();
    if (typeof setupSimpleNavigation === "function") setupSimpleNavigation();
  }

  setTimeout(openEmployeesSection, 700);
  setTimeout(openEmployeesSection, 1800);
  setTimeout(openEmployeesSection, 3500);
  setInterval(openEmployeesSection, 5000);
})();
