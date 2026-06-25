const PRIMARY_TABS = new Set(["home", "shop"]);
const QUICK_ACTIONS = [
  { tab: "rating", icon: "🏆", title: "Рейтинг", text: "Топ месяца" },
  { tab: "storage", icon: "⏱️", title: "Сроки", text: "Калькулятор хранения" },
  { tab: "closing", icon: "✅", title: "Закрытие", text: "Чек-лист смены" },
  { tab: "tasks", icon: "🧩", title: "Задачи", text: "Админские задачи" },
  { tab: "admin", icon: "👑", title: "Админка", text: "Спасибки и монетки" },
  { tab: "managers", icon: "🛡️", title: "Менеджеры", text: "Права доступа" },
];

function navLabelFor(tabName) {
  if (tabName === "home") return "Главная";
  if (tabName === "shop") return "Магазин";
  return tabName;
}

function navSwitch(tabName) {
  if (typeof switchTab === "function") switchTab(tabName);
  document.querySelectorAll(".nav-action").forEach(button => {
    button.classList.toggle("active", button.dataset.navAction === tabName);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupSimpleNavigation() {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;

  const buttons = Array.from(tabs.querySelectorAll(".tab[data-tab]")).filter(button => !button.classList.contains("nav-hidden-tab"));
  for (const button of buttons) {
    const tabName = button.dataset.tab;
    button.textContent = navLabelFor(tabName);
    if (PRIMARY_TABS.has(tabName)) {
      button.classList.remove("nav-hidden-tab");
      button.style.display = "";
    } else {
      button.classList.add("nav-hidden-tab");
      button.style.display = "none";
    }
  }

  const home = document.getElementById("tab-home");
  if (!home || document.getElementById("quickActionsCard")) return;

  const available = QUICK_ACTIONS.filter(action => document.getElementById(`tab-${action.tab}`));
  if (!available.length) return;

  home.insertAdjacentHTML("beforeend", `
    <article class="quick-actions-card" id="quickActionsCard">
      <div class="quick-actions-grid">
        ${available.map(action => `
          <button class="nav-action" type="button" data-nav-action="${action.tab}">
            <span>${action.icon}</span>
            <strong>${action.title}</strong>
            <small>${action.text}</small>
          </button>
        `).join("")}
      </div>
    </article>
  `);

  document.querySelectorAll("[data-nav-action]").forEach(button => {
    button.onclick = () => navSwitch(button.dataset.navAction);
  });
}

const navObserver = new MutationObserver(() => setTimeout(setupSimpleNavigation, 0));
const navStart = () => {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  setupSimpleNavigation();
  navObserver.observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
};

document.addEventListener("DOMContentLoaded", navStart);
setTimeout(navStart, 300);
setTimeout(setupSimpleNavigation, 1200);
setInterval(setupSimpleNavigation, 2500);
