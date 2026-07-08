// BK8 Staff permissions
// One place for role checks and manager-level access.
(function () {
  if (window.BK8Permissions) return;

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  const currentUserId = tgUser ? String(tgUser.id) : null;
  const ROOT_ADMIN_IDS = ["818748106"];

  const state = {
    loaded: false,
    rootAdminIds: ROOT_ADMIN_IDS,
    managerIds: [],
    instructorIds: [],
  };

  function supabaseConfig() {
    const cfg = window.APP_CONFIG || {};
    return {
      url: String(cfg.SUPABASE_URL || "").replace(/\/$/, ""),
      key: cfg.SUPABASE_ANON_KEY || "",
    };
  }

  async function supabaseRead(path) {
    const cfg = supabaseConfig();
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

  async function load() {
    const [managers, instructors] = await Promise.all([
      supabaseRead("managers?select=telegram_id"),
      supabaseRead("instructors?select=telegram_id").catch(() => []),
    ]);

    state.managerIds = (managers || []).map(row => String(row.telegram_id));
    state.instructorIds = (instructors || []).map(row => String(row.telegram_id));
    state.loaded = true;
    return state;
  }

  function has(idList, id = currentUserId) {
    return Boolean(id && idList.map(String).includes(String(id)));
  }

  function isRootAdmin(id = currentUserId) {
    return has(state.rootAdminIds, id);
  }

  function isManager(id = currentUserId) {
    return has(state.managerIds, id);
  }

  function isAdmin(id = currentUserId) {
    return isRootAdmin(id) || isManager(id);
  }

  function isInstructor(id = currentUserId) {
    return isAdmin(id) || has(state.instructorIds, id);
  }

  function can(permission) {
    const rules = {
      manageManagers: isRootAdmin,
      manageEmployees: isAdmin,
      manageEmployeeDocuments: isAdmin,
      manageTimesheets: isAdmin,
      managePurchases: isAdmin,
      manageKlokr: isInstructor,
      viewOwnProfile: () => Boolean(currentUserId),
    };
    return Boolean(rules[permission]?.());
  }

  function expose() {
    window.BK8Permissions = {
      state,
      currentUserId,
      load,
      can,
      isRootAdmin,
      isManager,
      isAdmin,
      isInstructor,
    };
  }

  expose();
})();
