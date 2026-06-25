(function () {
  function ready() {
    const actions = document.querySelector("#tab-admin .admin-actions");
    const select = document.getElementById("adminUser");
    const amount = document.getElementById("adminAmount");
    const status = document.getElementById("adminStatus");
    if (!actions || !select || !amount || document.getElementById("adminRewardTestAdjust")) return;

    const button = document.createElement("button");
    button.id = "adminRewardTestAdjust";
    button.className = "action-btn remove";
    button.type = "button";
    button.textContent = "− Тестовые монетки";
    button.onclick = () => {
      const value = Math.abs(Number(amount.value || 0));
      if (!select.value || !value) {
        if (status) status.textContent = "Выбери сотрудника и количество.";
        return;
      }
      openBotDeepLink(`reward_test_${select.value}_${value}`);
    };
    actions.appendChild(button);
  }

  setInterval(ready, 1000);
  document.addEventListener("DOMContentLoaded", ready);
})();
