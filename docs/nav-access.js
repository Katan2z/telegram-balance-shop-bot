function navAllowedAction(name) {
  const section = document.getElementById(`tab-${name}`);
  if (!section) return false;
  if (["admin", "managers", "tasks", "instructor"].includes(name)) {
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

function loadEmployeeRegistrationScripts() {
  ["employee-core.js?v=1", "employee-activate.js?v=1", "employee-admin.js?v=1", "employee-loader.js?v=1"].forEach(src => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    document.body.appendChild(script);
  });
}

setTimeout(navCleanQuickActions, 400);
setTimeout(navCleanQuickActions, 1200);
setInterval(navCleanQuickActions, 2000);
setTimeout(loadEmployeeRegistrationScripts, 900);
