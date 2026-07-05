// BK8 Staff: make the Employees section available to managers too.
(function () {
  if (window.__managerEmployeesAccessLoadedV2) return;
  window.__managerEmployeesAccessLoadedV2 = true;

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  const currentUserId = tgUser ? String(tgUser.id) : null;
  const ROOT_ADMIN_IDS = ["818748106"];

  function getSupabaseConfig() {
    const cfg = window.APP_CONFIG || {};
    return {
      url: String(cfg.SUPABASE_URL || "").replace(/\/$/, ""),
      key: cfg.SUPABASE_ANON_KEY || "",
    };
  }

  async function readSupabase(path) {
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) return [];
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      cache: "no-store",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    });
    if (!response.ok) return [];
    return response.json();
  }

  async function isManagerOrRoot() {
    if (!currentUserId) return false;
    if (ROOT_ADMIN_IDS.includes(currentUserId)) return true;
    const rows = await readSupabase(`managers?telegram_id=eq.${encodeURIComponent(currentUserId)}&select=telegram_id&limit=1`);
    return rows.some(row => String(row.telegram_id) === currentUserId);
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

  async function openEmployeesForManager() {
    const allowed = await isManagerOrRoot();
    if (!allowed) return;
    if (typeof employeeInjectStyle !== "function" || typeof employeeBuildSection !== "function") return;

    addEmployeesTab();

    const fakeRootData = {
      root_admin_ids: currentUserId ? [currentUserId] : [],
    };
    employeeInjectStyle();
    employeeBuildSection(fakeRootData);

    if (typeof employeeLoad === "function") await employeeLoad();
    addEmployeesQuickAction();
    if (typeof setupSimpleNavigation === "function") setupSimpleNavigation();
  }

  setTimeout(openEmployeesForManager, 700);
  setTimeout(openEmployeesForManager, 1800);
  setTimeout(openEmployeesForManager, 3500);
  setInterval(openEmployeesForManager, 5000);
})();
