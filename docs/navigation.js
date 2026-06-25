const PRIMARY_TABS = new Set(["home", "rating", "shop"]);
let navOrganizing = false;

function setupCompactNavigation() {
  const tabs = document.getElementById("tabs");
  if (!tabs || navOrganizing) return;
  navOrganizing = true;

  let wrap = document.getElementById("tabMoreWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "tabMoreWrap";
    wrap.className = "tab-more-wrap";
    wrap.innerHTML = `
      <button class="tab tab-more-button" type="button">Ещё</button>
      <div class="tab-more-menu" id="tabMoreMenu"></div>
    `;
    tabs.appendChild(wrap);
    wrap.querySelector(".tab-more-button").addEventListener("click", event => {
      event.stopPropagation();
      wrap.classList.toggle("open");
    });
  }

  const menu = document.getElementById("tabMoreMenu");
  const buttons = Array.from(tabs.querySelectorAll(".tab[data-tab]")).filter(button => !button.classList.contains("tab-more-button"));

  for (const button of buttons) {
    const tabName = button.dataset.tab;
    if (PRIMARY_TABS.has(tabName)) {
      if (button.parentElement === menu) tabs.insertBefore(button, wrap);
    } else {
      if (button.parentElement !== menu) menu.appendChild(button);
    }
  }

  const hasActiveInside = Boolean(menu.querySelector(".tab.active"));
  wrap.querySelector(".tab-more-button")?.classList.toggle("active", hasActiveInside);
  navOrganizing = false;
}

document.addEventListener("click", event => {
  const wrap = document.getElementById("tabMoreWrap");
  if (wrap && !wrap.contains(event.target)) wrap.classList.remove("open");
});

document.addEventListener("click", event => {
  if (event.target.closest("#tabMoreMenu .tab")) {
    document.getElementById("tabMoreWrap")?.classList.remove("open");
    setTimeout(setupCompactNavigation, 0);
  }
});

const navObserver = new MutationObserver(() => setTimeout(setupCompactNavigation, 0));
const navStart = () => {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  setupCompactNavigation();
  navObserver.observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
};

document.addEventListener("DOMContentLoaded", navStart);
setTimeout(navStart, 300);
setTimeout(setupCompactNavigation, 1200);
setInterval(setupCompactNavigation, 3000);
