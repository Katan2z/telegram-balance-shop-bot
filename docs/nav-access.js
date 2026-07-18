function navAllowedAction(name) {
  const section = document.getElementById(`tab-${name}`);
  if (!section) return false;
  if (["admin", "managers", "tasks", "instructor", "employees", "profile"].includes(name)) {
    return Boolean(document.querySelector(`#tabs .tab[data-tab="${name}"]`));
  }
  return true;
}

function navCleanQuickActions() {
  document.querySelectorAll("[data-nav-action]").forEach(button => {
    const name = button.dataset.navAction;
    if (!navAllowedAction(name)) button.remove();
  });
  const grid = document.querySelector("#quickActionsCard .quick-actions-grid");
  const card = document.getElementById("quickActionsCard");
  if (card && grid && !grid.children.length) card.remove();
}

function loadScriptOnce(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = resolve;
    document.body.appendChild(script);
  });
}

function loadStyleOnce(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

async function initializeAccess() {
  const permissions = window.BK8Permissions;
  if (permissions && !permissions.state.loaded) await permissions.load();
  navCleanQuickActions();
  document.dispatchEvent(new CustomEvent("bk8:app-ready"));
  window.dispatchEvent(new CustomEvent("bk8:app-ready"));
  if (permissions?.can("manageEmployees")) window.dispatchEvent(new CustomEvent("bk8:employees-ready"));
  if (typeof myProfileLoad === "function") myProfileLoad().catch(() => {});
  if (typeof setupSimpleNavigation === "function") setupSimpleNavigation();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAccess, { once: true });
else initializeAccess();
