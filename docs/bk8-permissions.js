// BK8 Staff: single source of truth for frontend roles and permissions.
(function () {
  if (window.BK8Permissions) return;

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  const currentUserId = tgUser ? String(tgUser.id) : null;
  const ROOT_ADMIN_IDS = ["818748106"];

  const state = {
    loaded: false,
    roles: {
      rootAdmin: false,
      manager: false,
      instructor: false,
      employee: Boolean(currentUserId),
    },
  };

  function supabaseConfig() {
    const config = window.APP_CONFIG || {};
    return {
      url: String(config.SUPABASE_URL || "").replace(/\/$/, ""),
      key: config.SUPABASE_ANON_KEY || "",
    };
  }

  async function supabaseRows(path) {
    const config = supabaseConfig();
    if (!config.url || !config.key) return [];

    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      cache: "no-store",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
    });

    if (!response.ok) return [];
    return response.json();
  }

  async function exists(table) {
    if (!currentUserId) return false;
    const rows = await supabaseRows(`${table}?telegram_id=eq.${encodeURIComponent(currentUserId)}&select=telegram_id&limit=1`);
    return rows.some(row => String(row.telegram_id) === currentUserId);
  }

  async function load() {
    if (!currentUserId) {
      state.loaded = true;
      return state;
    }

    const rootAdmin = ROOT_ADMIN_IDS.includes(currentUserId);
    const [manager, instructor] = await Promise.all([
      rootAdmin ? Promise.resolve(false) : exists("managers"),
      rootAdmin ? Promise.resolve(false) : exists("instructors"),
    ]);

    state.roles.rootAdmin = rootAdmin;
    state.roles.manager = rootAdmin || manager;
    state.roles.instructor = rootAdmin || manager || instructor;
    state.roles.employee = true;
    state.loaded = true;

    document.dispatchEvent(new CustomEvent("bk8:permissions-ready", { detail: state }));
    return state;
  }

  function hasRole(role) {
    return Boolean(state.roles[role]);
  }

  function can(permission) {
    const rules = {
      manageSystemRoles: () => hasRole("rootAdmin"),
      manageManagers: () => hasRole("rootAdmin"),
      manageEmployees: () => hasRole("rootAdmin") || hasRole("manager"),
      manageEmployeeDocuments: () => hasRole("rootAdmin") || hasRole("manager"),
      manageTimesheets: () => hasRole("rootAdmin") || hasRole("manager"),
      managePurchases: () => hasRole("rootAdmin") || hasRole("manager"),
      manageRewards: () => hasRole("rootAdmin") || hasRole("manager"),
      useInstructorTools: () => hasRole("rootAdmin") || hasRole("manager") || hasRole("instructor"),
      viewOwnProfile: () => hasRole("employee"),
    };

    return Boolean(rules[permission]?.());
  }

  window.BK8Permissions = {
    currentUserId,
    rootAdminIds: ROOT_ADMIN_IDS,
    state,
    load,
    hasRole,
    can,
  };

  load();
})();
