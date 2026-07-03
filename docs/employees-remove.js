async function emp2RemoveHard(id) {
  if (!confirm("Убрать сотрудника из списка полностью?")) return;
  try {
    await supabaseWrite(`employee_profiles?id=eq.${Number(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (window.emp2State) window.emp2State.openedId = null;
    if (typeof emp2Load === "function") await emp2Load();
  } catch (error) {
    alert("Не получилось убрать сотрудника.");
    console.error(error);
  }
}

function emp2AddRemoveButton() {
  const grid = document.querySelector("#emp2Details .employee-admin-grid");
  if (!grid || grid.querySelector("[data-emp-remove]")) return;
  const id = window.emp2State?.openedId;
  if (!id) return;
  grid.insertAdjacentHTML("beforeend", `<button data-emp-remove onclick="emp2RemoveHard(${Number(id)})">🗑️ Удалить</button>`);
}

setInterval(emp2AddRemoveButton, 700);
