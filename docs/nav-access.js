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
  if (window.__employeeScriptsLoading) return;
  window.__employeeScriptsLoading = true;
  const scripts = ["employee-core.js?v=2", "employee-activate.js?v=2", "employee-admin.js?v=2", "employee-loader.js?v=2"];
  let chain = Promise.resolve();
  scripts.forEach(src => {
    chain = chain.then(() => new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
    }));
  });
}

setTimeout(navCleanQuickActions, 400);
setTimeout(navCleanQuickActions, 1200);
setInterval(navCleanQuickActions, 2000);
setTimeout(loadEmployeeRegistrationScripts, 500);
