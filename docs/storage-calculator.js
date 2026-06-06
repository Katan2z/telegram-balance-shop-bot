function storageFormatDate(date) {
  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayMonth = date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${time}, ${dayMonth}`;
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

function storageTemperingHours(text) {
  const value = storageClean(text).toLowerCase().replaceAll(",", ".");
  if (!value || !value.includes("выдерж")) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:час|часа|часов|ч\.?)/);
  return match ? Number(match[1]) : 1;
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
        badge: "П/Т/Д",
        hours: totalHours,
        defrostHours: item.defrostHours || storageParseHours(item.defrostRaw),
        storageHours: item.storageHours,
        temperingHours: storageTemperingHours(item.prepLabel),
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
        badge: "ТД",
        hours: movedHours,
        temperingHours: storageTemperingHours(item.prepRaw),
        label: storageModeLabel(item.prepRaw, "ТД"),
        place: storageModeLabel(item.storageRaw, item.prepPlace),
      });
    }
    const openedHours = storageParseHours(item.prepLabel);
    if (openedHours) {
      modes.push({
        id: "opened",
        title: "Вскрытый сливс / упаковка",
        badge: "ТД",
        hours: openedHours,
        temperingHours: storageTemperingHours(item.prepLabel),
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
      badge: "ТД",
      hours: productionHours,
      temperingHours: storageTemperingHours(item.productionLabel),
      label: storageModeLabel(item.productionLabel, "ТД"),
      place: storageModeLabel(item.productionPlace, "—"),
    });
  }
  return modes;
}

function storageDetail(label, value) {
  const cleanValue = storageClean(value);
  if (!cleanValue) return "";
  return `<div class="storage-detail"><span>${storageSafeText(label)}</span><strong>${storageSafeText(cleanValue)}</strong></div>`;
}

function storageDateRow(label, value, kind = "") {
  return `
    <div class="storage-date ${kind}" style="padding:10px 12px;">
      <small>${storageSafeText(label)}</small>
      <strong style="font-size:clamp(17px, 2.2vw, 23px); line-height:1.05; white-space:nowrap;">${storageSafeText(value)}</strong>
    </div>
  `;
}

function storageModeCard(item, mode, startDate) {
  const endDate = storageAddHours(startDate, mode.hours);
  const readyDate = mode.id === "defrost" && mode.defrostHours ? storageAddHours(startDate, mode.defrostHours) : null;
  const temperingDate = mode.temperingHours ? storageAddHours(startDate, mode.temperingHours) : null;
  const usefulLabel = temperingDate ? "Можно использовать с" : "Годно до";
  const usefulDate = temperingDate || endDate;

  return `
    <div class="storage-mode-card storage-${storageSafeText(mode.id)}">
      <div class="storage-mode-head">
        <div>
          <small>${storageSafeText(mode.title)}</small>
          <strong>${storageHoursText(mode.hours)}</strong>
        </div>
        <span>${storageSafeText(mode.badge)}</span>
      </div>

      ${storageDateRow("Старт", storageFormatDate(startDate), "start")}
      ${temperingDate ? storageDateRow("Темперирование до", storageFormatDate(temperingDate), "ready") : ""}
      ${readyDate ? storageDateRow("Можно использовать с", storageFormatDate(readyDate), "ready") : ""}
      ${storageDateRow("Годно до", storageFormatDate(endDate), "expire")}

      <div class="storage-details">
        ${mode.temperingHours ? storageDetail("Выдержка", storageHoursText(mode.temperingHours)) : ""}
        ${mode.defrostHours ? storageDetail("Дефрост", `${storageHoursText(mode.defrostHours)} ${item.defrostType || ""}`) : ""}
        ${mode.storageHours ? storageDetail("После дефроста", storageHoursText(mode.storageHours)) : ""}
        ${storageDetail("Маркировка", mode.label)}
        ${storageDetail("Место", mode.place)}
      </div>
    </div>
  `;
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
          <div class="admin-form storage-form">
            <label>Поиск продукта</label>
            <input id="storageSearch" type="text" placeholder="Например: булочки" />
            <label>Продукт</label>
            <select id="storageProduct"></select>
            <label>Дата и время старта</label>
            <input id="storageStart" type="datetime-local" />
            <div id="storageResult" class="storage-result"></div>
          </div>
        </article>
      </section>
    `);
  }
  const search = document.getElementById("storageSearch");
  const product = document.getElementById("storageProduct");
  const start = document.getElementById("storageStart");
  const result = document.getElementById("storageResult");
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
    calculateResult();
  }
  function calculateResult() {
    const item = items[Number(product.value)];
    const startDate = new Date(start.value);
    if (!item || !start.value || Number.isNaN(startDate.getTime())) {
      result.innerHTML = `<p>Выбери продукт и дату/время старта.</p>`;
      return;
    }
    const modes = storageModesForItem(item);
    if (!modes.length) {
      result.innerHTML = `<p>Для этого продукта нет доступного срока в таблице.</p>`;
      return;
    }
    result.innerHTML = `
      <div class="storage-summary">
        <small>Старт</small>
        <strong>${storageFormatDate(startDate)}</strong>
        <span>${storageSafeText(item.name)}</span>
      </div>
      <div class="storage-modes-grid">
        ${modes.map(mode => storageModeCard(item, mode, startDate)).join("")}
      </div>
    `;
  }
  search.addEventListener("input", () => renderProducts(false));
  product.addEventListener("change", calculateResult);
  start.addEventListener("change", calculateResult);
  renderProducts(false);
}

storageBuildCalculator();
