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
            <select id="storageMode">
              <option value="prep">Подготовка / дефрост / вскрытие</option>
              <option value="production">Производство / на борту</option>
            </select>
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
    product.innerHTML = rows.map((item, index) => `<option value="${items.indexOf(item)}">${storageSafeText(item.name)}</option>`).join("");
    if (previous && [...product.options].some(option => option.value === previous)) product.value = previous;
  }

  function calculateResult() {
    const item = items[Number(product.value)];
    const startDate = new Date(start.value);
    if (!item || !start.value || Number.isNaN(startDate.getTime())) {
      result.innerHTML = `<p>Выбери продукт и дату/время старта.</p>`;
      return;
    }

    if (mode.value === "production") {
      if (!item.productionHours) {
        result.innerHTML = `<p>Для этого продукта нет срока в блоке производства.</p>`;
        return;
      }
      const endDate = storageAddHours(startDate, item.productionHours);
      result.innerHTML = `
        <div class="rank">
          <div class="rank-medal">ТД</div>
          <div>
            <strong>${storageSafeText(item.name)}</strong>
            <span>Годно до: ${storageFormatDate(endDate)}</span>
          </div>
        </div>
        <p><b>Срок:</b> ${storageHoursText(item.productionHours)}</p>
        <p><b>Маркировка:</b> ${storageSafeText(item.productionLabel || "—")}</p>
        <p><b>Место:</b> ${storageSafeText(item.productionPlace || "—")}</p>
      `;
      return;
    }

    const totalHours = item.prepHours || ((item.defrostHours || 0) + (item.storageHours || 0));
    if (!totalHours) {
      result.innerHTML = `<p>Для этого продукта нет срока в блоке подготовки.</p>`;
      return;
    }

    const readyDate = item.defrostHours ? storageAddHours(startDate, item.defrostHours) : null;
    const endDate = storageAddHours(startDate, totalHours);
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
      <p><b>Общий срок:</b> ${storageHoursText(totalHours)}</p>
      ${item.defrostHours ? `<p><b>Дефрост:</b> ${storageHoursText(item.defrostHours)} ${storageSafeText(item.defrostType || "")}</p>` : ""}
      ${item.storageHours ? `<p><b>Хранение после дефроста:</b> ${storageHoursText(item.storageHours)}</p>` : ""}
      <p><b>Маркировка:</b> ${storageSafeText(item.prepLabel || item.prepRaw || "—")}</p>
      <p><b>Место:</b> ${storageSafeText(item.prepPlace || item.storageRaw || "—")}</p>
    `;
  }

  search.addEventListener("input", () => renderProducts(false));
  calculate.addEventListener("click", calculateResult);
  product.addEventListener("change", calculateResult);
  mode.addEventListener("change", calculateResult);
  start.addEventListener("change", calculateResult);

  renderProducts(false);
  calculateResult();
}

storageBuildCalculator();
