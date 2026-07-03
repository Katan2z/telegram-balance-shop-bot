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

function loadEmployeeRegistrationScripts() {
  if (window.__employeeScriptsLoading) return;
  window.__employeeScriptsLoading = true;
  const scripts = ["employee-core.js?v=5", "employee-activate.js?v=5", "employee-pin.js?v=1", "employee-admin.js?v=5", "employee-loader.js?v=5"];
  let chain = Promise.resolve();
  scripts.forEach(src => chain = chain.then(() => loadScriptOnce(src)));
}

function loadEmployeesSection() {
  loadStyleOnce("employees.css?v=3");
  loadScriptOnce("employees.js?v=3").then(() => {
    if (typeof emp2Load === "function") emp2Load();
    if (typeof setupSimpleNavigation === "function") setupSimpleNavigation();
  });
}

function loadMyProfileSection() {
  loadStyleOnce("my-profile.css?v=3");
  loadScriptOnce("my-profile.js?v=3").then(() => {
    if (typeof myProfileLoad === "function") myProfileLoad();
    if (typeof setupSimpleNavigation === "function") setupSimpleNavigation();
  });
}

function singleRestaurantCleanup() {
  ["employeeRestaurant", "empRestaurant"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.style.display = "none";
    }
  });
  document.querySelectorAll(".employee-v2-main span").forEach(el => {
    if (el.textContent.includes(" · ")) el.textContent = el.textContent.split(" · ")[0];
  });
}

setTimeout(navCleanQuickActions, 400);
setTimeout(navCleanQuickActions, 1200);
setInterval(navCleanQuickActions, 2000);
setTimeout(loadEmployeeRegistrationScripts, 500);
setTimeout(loadEmployeesSection, 700);
setTimeout(loadEmployeesSection, 2200);
setTimeout(loadMyProfileSection, 800);
setTimeout(loadMyProfileSection, 2400);
setInterval(singleRestaurantCleanup, 800);
