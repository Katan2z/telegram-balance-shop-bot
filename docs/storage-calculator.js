function storageFormatDate(date) {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function storageAddHours(date, hours) {
  return new Date(date.getTime() + Number(hours) * 60 * 60 * 1000);
}

function storageHoursText(hours) {
  if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return "—";
  const totalMinutes = Math.round(Number(hours) * 60);
  const days = Math.floor(totalMinutes / 1440);
  const remAfterDays = totalMinutes % 1440;
  const h = Math.floor(remAfterDays / 60);
  const m = remAfterDays % 60;
  const parts = [];
  if (days) parts.push(`${days} дн.`);
  if (h) parts.push(`${h} ч.`);
  if (m) parts.push(`${m} мин.`);
  return parts.join(" ") || "0 мин.";
}

function storageSafeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function storageClean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === " - ") return "";
  return text;
}

function storageParseHours(text) {
  const value = storageClean(text).toLowerCase().replaceAll(",", ".");
  if (!value || value.includes("согласно")) return null;

  let total = 0;
  const dayMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:день|дня|дней|сутки|суток|сут)/);
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:час|часа|часов|ч\.?)/);
  const minuteMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:мин|минут|минуты)/);

  if (dayMatch) total += Number(dayMatch[1]) * 24;
  if (hourMatch) total += Number(hourMatch[1]);
  if (minuteMatch) total += Number(minuteMatch[1]) / 60;

  return total > 0 ? total : null;
}

function storageModeLabel(text, fallback) {
  return storageClean(text) || fallback || "—";
}

function storageModesForItem(item) {
  const modes = [];
  const hasDefrost = Boolean(item.defrostHours || item.defrostRaw || item.defrostType);

  if (hasDefrost) {
    const totalHours = item.prepHours || ((item.defrostHours || 0) + (item.storageHours || 0));
    if (totalHours) {
      modes.push({
        id: "defrost",
        title: "Дефрост / подготовка",
        short: "П/Т/Д",
        hours: totalHours,
        defrostHours: item.defrostHours || storageParseHours(item.defrostRaw),
        storageHours: item.storageHours,
        label: storageModeLabel(item.prepLabel, item.prepRaw),
        place: storageModeLabel(item.prepPlace, item.storageRaw),
      });
    }
  } else {
    const movedHours = storageParseHours(item.prepRaw) || item.prepHours;
    if (movedHours) {
      modes.push({
        id: "moved",
        title: "Перемещено в пэн / тубу",
        short: "ТД",
        hours: movedHours,
        label: storageModeLabel(item.prepRaw, "ТД"),
        place: storageModeLabel(item.storageRaw, item.prepPlace),
      });
    }

    const openedHours = storageParseHours(item.prepLabel);
    if (openedHours) {
      modes.push({
        id: "opened",
        title: "Вскрытый сливс / упаковка",
        short: "ТД",
        hours: openedHours,
        label: storageModeLabel(item.prepLabel, "ТД"),
        place: storageModeLabel(item.prepPlace, "—"),
      });
    }
  }

  const productionHours = storageParseHours(item.productionLabel) || item.productionHours;
  if (productionHours) {
    modes.push({
      id: "production",
      title: "Производство / на борту",
      short: "ТД",
      hours: productionHours,
      label: storageModeLabel(item.productionLabel, "ТД"),
      place: storageModeLabel(item.productionPlace, "—"),
    });
  }

  return modes;
}

function storageBuildCalculator() {
  const tabs = document.getElementById("tabs");
  const app = document.querySelector("main.app");
  const items = window.STORAGE_ITEMS || [];
  if (!tabs || !app || !items.length) return;

  if (!tabs.querySelector('[data-tab="storage"]')) {
    tabs.insertAdjacentHTML("beforeend", '<button class="tab" data-tab="storage">Сроки</button>');
    tabs.querySelector('[data-tab="storage"]').addEventListener("click", () => switchTab("storage"));
  }

  if (!document.getElementById("tab-storage")) {
    app.insertAdjacentHTML("beforeend", `
      <section class="tab-page" id="tab-storage">
        <article class="card storage-panel">
          <h2>⏱️ Калькулятор сроков</h2>
          <div class="admin-form">
            <label>Поиск продукта</label>
            <input id="storageSearch" type="text" placeholder="Например: булочки" />
            <label>Продукт</label>
            <select id="storageProduct"></select>
            <label>Режим</label>
            <select id="storageMode"></select>
            <label>Дата и время старта</label>
            <input id="storageStart" type="datetime-local" />
            <button id="storageCalculate" class="action-btn add">Рассчитать</button>
            <div id="storageResult" class="list storage-result"></div>
          </div>
        </article>
      </section>
    `);
  }

  const search = document.getElementById("storageSearch");
  const product = document.getElementById("storageProduct");
  const mode = document.getElementById("storageMode");
  const start = document.getElementById("storageStart");
  const result = document.getElementById("storageResult");
  const calculate = document.getElementById("storageCalculate");

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  if (!start.value) start.value = now.toISOString().slice(0, 16);

  function filteredItems() {
    const q = search.value.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => item.name.toLowerCase().includes(q));
  }

  function renderProducts(keepValue = true) {
    const previous = keepValue ? product.value : "";
    const rows = filteredItems();
    product.innerHTML = rows.map(item => `<option value="${items.indexOf(item)}">${storageSafeText(item.name)}</option>`).join("");
    if (previous && [...product.options].some(option => option.value === previous)) product.value = previous;
    renderModes();
  }

  function renderModes(keepValue = true) {
    const item = items[Number(product.value)];
    const previous = keepValue ? mode.value : "";
    const modes = item ? storageModesForItem(item) : [];
    mode.innerHTML = modes.map(m => `<option value="${storageSafeText(m.id)}">${storageSafeText(m.title)}</option>`).join("");
    if (previous && [...mode.options].some(option => option.value === previous)) mode.value = previous;
  }

  function selectedMode(item) {
    return storageModesForItem(item).find(m => m.id === mode.value);
  }

  function calculateResult() {
    const item = items[Number(product.value)];
    const startDate = new Date(start.value);
    if (!item || !start.value || Number.isNaN(startDate.getTime())) {
      result.innerHTML = `<p>Выбери продукт и дату/время старта.</p>`;
      return;
    }

    renderModes(true);
    const currentMode = selectedMode(item);
    if (!currentMode) {
      result.innerHTML = `<p>Для этого продукта нет доступного срока в таблице.</p>`;
      return;
    }

    if (currentMode.id === "defrost") {
      const readyDate = currentMode.defrostHours ? storageAddHours(startDate, currentMode.defrostHours) : null;
      const endDate = storageAddHours(startDate, currentMode.hours);
      result.innerHTML = `
        <div class="rank">
          <div class="rank-medal">П</div>
          <div>
            <strong>${storageSafeText(item.name)}</strong>
            <span>Старт: ${storageFormatDate(startDate)}</span>
          </div>
        </div>
        ${readyDate ? `
        <div class="rank">
          <div class="rank-medal">Т</div>
          <div>
            <strong>Готово к использованию</strong>
            <span>${storageFormatDate(readyDate)}</span>
          </div>
        </div>` : ""}
        <div class="rank">
          <div class="rank-medal">Д</div>
          <div>
            <strong>Окончание срока</strong>
            <span>${storageFormatDate(endDate)}</span>
          </div>
        </div>
        <p><b>Общий срок:</b> ${storageHoursText(currentMode.hours)}</p>
        ${currentMode.defrostHours ? `<p><b>Дефрост:</b> ${storageHoursText(currentMode.defrostHours)} ${storageSafeText(item.defrostType || "")}</p>` : ""}
        ${currentMode.storageHours ? `<p><b>Хранение после дефроста:</b> ${storageHoursText(currentMode.storageHours)}</p>` : ""}
        <p><b>Маркировка:</b> ${storageSafeText(currentMode.label)}</p>
        <p><b>Место:</b> ${storageSafeText(currentMode.place)}</p>
      `;
      return;
    }

    const endDate = storageAddHours(startDate, currentMode.hours);
    result.innerHTML = `
      <div class="rank">
        <div class="rank-medal">${storageSafeText(currentMode.short)}</div>
        <div>
          <strong>${storageSafeText(item.name)}</strong>
          <span>Годно до: ${storageFormatDate(endDate)}</span>
        </div>
      </div>
      <p><b>Режим:</b> ${storageSafeText(currentMode.title)}</p>
      <p><b>Срок:</b> ${storageHoursText(currentMode.hours)}</p>
      <p><b>Маркировка:</b> ${storageSafeText(currentMode.label)}</p>
      <p><b>Место:</b> ${storageSafeText(currentMode.place)}</p>
    `;
  }

  search.addEventListener("input", () => {
    renderProducts(false);
    calculateResult();
  });
  calculate.addEventListener("click", calculateResult);
  product.addEventListener("change", () => {
    renderModes(false);
    calculateResult();
  });
  mode.addEventListener("change", calculateResult);
  start.addEventListener("change", calculateResult);

  renderProducts(false);
  calculateResult();
}

storageBuildCalculator();
