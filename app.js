/* ================================================================
   CONFIGURACIÓN
   ================================================================ */

const API_URL = "https://script.google.com/macros/s/AKfycbx7goeSzbMiNWvCgsvlSJfptB76D12ChtSOz1HCNpK9URTp-3Hicbb_Ay6eccS__WXebA/exec";

const APP_CONFIG = Object.freeze({
  TIMEZONE: "America/Guatemala",
  LOCALE: "es-GT",
  META_SOPORTES: 100,
  TARIFA_SOPORTE: 14.5,
  CORREO_FACTURADOS: "rorosco@grupoprinter.com",
  MESES: Object.freeze([
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ])
});

const state = {
  cycle: null,
  supports: [],
  finances: [],
  supportPayment: null,
  chart: null,
  toast: null,
  editModal: null,
  busy: false,
  elements: {}
};

/* ================================================================
   UTILIDADES
   ================================================================ */

function $(id) {
  return document.getElementById(id);
}

function on(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

function isApiConfigured() {
  return (
    typeof API_URL === "string" &&
    /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(API_URL)
  );
}

function getTodayInGuatemala() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_CONFIG.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const values = {};
  parts.forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });
  return `${values.year}-${values.month}-${values.day}`;
}

function parseSqlDate(sqlDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sqlDate || ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function toSQLDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sqlFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(year, month, delta) {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1
  };
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidSqlDate(value) {
  const parts = parseSqlDate(value);
  if (!parts) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() + 1 === parts.month &&
    date.getUTCDate() === parts.day
  );
}

function formatDate(sqlDate, options = {}) {
  const parts = parseSqlDate(sqlDate);
  if (!parts) return "—";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const formatterOptions = { timeZone: "UTC" };
  if (options.day !== false) formatterOptions.day = options.day || "2-digit";
  if (options.month !== false) formatterOptions.month = options.month || "short";
  if (options.year !== false) formatterOptions.year = options.year || "numeric";
  if (options.weekday) formatterOptions.weekday = options.weekday;
  return new Intl.DateTimeFormat(APP_CONFIG.LOCALE, formatterOptions).format(date);
}

function formatCycleRange(desde, hasta) {
  const start = parseSqlDate(desde);
  const end = parseSqlDate(hasta);
  if (!start || !end) return "Rango no válido";

  const startYear = start.year === end.year ? false : "numeric";
  const startLabel = formatDate(desde, {
    day: "numeric",
    month: "short",
    year: startYear
  });
  const endLabel = formatDate(hasta, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  return `${startLabel} al ${endLabel}`;
}

function formatMoney(value) {
  const number = Number(value) || 0;
  const sign = number < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat(APP_CONFIG.LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(number));
  return `${sign}Q${formatted}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setLoading(active, message = "Cargando...") {
  const overlay = state.elements.loadingOverlay;
  setText(state.elements.loadingText, message);
  if (overlay) overlay.classList.toggle("d-none", !active);
  document.body.setAttribute("aria-busy", active ? "true" : "false");
}

function setButtonLoading(button, active, loadingText) {
  if (!button) return;
  if (active) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${escapeHtml(loadingText)}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function showToast(message, type = "success") {
  const toastElement = state.elements.toastElement;
  if (!toastElement) return;

  setText(state.elements.toastMessage, message);
  toastElement.classList.toggle("toast-error", type === "error");
  if (state.elements.toastIcon) {
    state.elements.toastIcon.className =
      type === "error"
        ? "bi bi-exclamation-circle-fill"
        : "bi bi-check-circle-fill";
  }

  if (state.toast) state.toast.show();
}

function mostrarError(error, fallback = "No se pudo completar la operación.") {
  const message = error instanceof Error && error.message ? error.message : fallback;
  console.error(error);
  showToast(message, "error");
}

async function runBusyTask(message, task) {
  if (state.busy) return;
  state.busy = true;
  setLoading(true, message);
  try {
    return await task();
  } finally {
    state.busy = false;
    setLoading(false);
  }
}

function emptyTableRow(colspan, message, icon = "bi-inbox") {
  return `
    <tr>
      <td colspan="${colspan}">
        <div class="table-state">
          <i class="bi ${icon}" aria-hidden="true"></i>
          <span>${escapeHtml(message)}</span>
        </div>
      </td>
    </tr>
  `;
}

/* ================================================================
   API
   ================================================================ */

async function parseApiResponse(response) {
  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch (error) {
    if (/<!doctype|<html/i.test(text)) {
      throw new Error(
        "Google Apps Script devolvió una página en lugar de JSON. Revisa que el Web App esté publicado para cualquier usuario."
      );
    }
    throw new Error("La API devolvió una respuesta que no se pudo interpretar.");
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Error HTTP ${response.status}.`);
  }
  return payload.data;
}

async function apiGet(action, params = {}) {
  if (!isApiConfigured()) {
    throw new Error("Configura API_URL en app.js antes de consultar datos.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  url.searchParams.set("_", String(Date.now()));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow"
  });
  return parseApiResponse(response);
}

async function apiPost(action, data = {}) {
  if (!isApiConfigured()) {
    throw new Error("Configura API_URL en app.js antes de guardar datos.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    body: JSON.stringify({ action, ...data })
  });
  return parseApiResponse(response);
}

/* ================================================================
   INICIALIZACIÓN
   ================================================================ */

function cacheElements() {
  state.elements = {
    loadingOverlay: $("loading-overlay"),
    loadingText: $("loading-text"),
    configAlert: $("api-config-alert"),
    toastElement: $("app-toast"),
    toastMessage: $("toast-message"),
    toastIcon: $("toast-icon"),
    cycleLabel: $("ciclo-label"),
    cyclePayment: $("ciclo-pago"),
    filterFrom: $("filtro-desde"),
    filterTo: $("filtro-hasta"),
    formCycle: $("form-filtro-ciclo"),
    previousCycle: $("btn-ciclo-anterior"),
    nextCycle: $("btn-ciclo-siguiente"),
    supportForm: $("form-soporte"),
    supportDate: $("soporte-fecha"),
    supportQuantity: $("soporte-cantidad"),
    billingFields: $("campos-factura"),
    supportPrice: $("soporte-precio"),
    supportInvoice: $("soporte-factura"),
    saveSupportButton: $("btn-guardar-soporte"),
    supportsBody: $("soportes-body"),
    supportsSubtitle: $("soportes-subtitle"),
    sendInvoicedButton: $("btn-enviar-facturado"),
    statCompleted: $("stat-realizados"),
    statRemaining: $("stat-faltantes"),
    statRemainingCopy: $("stat-faltantes-copy"),
    statPercentage: $("stat-porcentaje"),
    statGoalStatus: $("stat-meta-estado"),
    statsCycleBadge: $("stats-cycle-badge"),
    supportsChart: $("soportes-chart"),
    financeFilterForm: $("form-filtro-finanzas"),
    financeMonth: $("finanzas-mes"),
    financeYear: $("finanzas-anio"),
    financeForm: $("form-finanzas"),
    movementDate: $("movimiento-fecha"),
    movementPeriod: $("movimiento-periodo"),
    movementDescription: $("movimiento-descripcion"),
    movementAmount: $("movimiento-monto"),
    movementType: $("movimiento-tipo"),
    saveMovementButton: $("btn-guardar-movimiento"),
    financePeriodLabel: $("finanzas-periodo-label"),
    financeIncome: $("finanzas-ingresos"),
    financeExpenses: $("finanzas-gastos"),
    financeTotal: $("finanzas-total"),
    supportPaymentCard: $("pago-soportes-card"),
    supportPaymentRange: $("pago-soportes-rango"),
    supportPaymentCalculation: $("pago-soportes-calculo"),
    supportPaymentTotal: $("pago-soportes-total"),
    supportPaymentDate: $("pago-soportes-fecha"),
    supportPaymentStatus: $("pago-soportes-estado"),
    addSupportPaymentButton: $("btn-agregar-pago-soportes"),
    fortnightBody: $("finanzas-quincena-body"),
    monthEndBody: $("finanzas-fin-mes-body"),
    fortnightTotal: $("total-quincena"),
    monthEndTotal: $("total-fin-mes"),
    editModalElement: $("editar-soportes-modal"),
    editModalDate: $("editar-soportes-date"),
    editSupportsList: $("editar-soportes-list")
  };
}

function setupBootstrap() {
  if (typeof bootstrap === "undefined") return;
  if (state.elements.toastElement) {
    state.toast = bootstrap.Toast.getOrCreateInstance(state.elements.toastElement, {
      delay: 3800
    });
  }
  if (state.elements.editModalElement) {
    state.editModal = bootstrap.Modal.getOrCreateInstance(state.elements.editModalElement);
  }
}

function setupFinanceSelectors(today) {
  const parts = parseSqlDate(today);
  if (!parts) return;

  if (state.elements.financeMonth) {
    state.elements.financeMonth.innerHTML = APP_CONFIG.MESES.map(
      (month, index) => `<option value="${index + 1}">${month}</option>`
    ).join("");
    state.elements.financeMonth.value = String(parts.month);
  }

  if (state.elements.financeYear) {
    const startYear = 2025;
    const endYear = Math.max(2027, parts.year + 3);
    const years = [];
    for (let year = startYear; year <= endYear; year += 1) years.push(year);
    state.elements.financeYear.innerHTML = years
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("");
    state.elements.financeYear.value = String(parts.year);
  }
}

function bindEvents() {
  on(state.elements.previousCycle, "click", () => changeCycle(-1));
  on(state.elements.nextCycle, "click", () => changeCycle(1));
  on(state.elements.formCycle, "submit", handleCycleFilter);
  on(state.elements.supportForm, "submit", handleSupportSubmit);
  on(state.elements.supportsBody, "click", handleSupportTableClick);
  on(state.elements.sendInvoicedButton, "click", processInvoicedEmail);
  on(state.elements.financeFilterForm, "submit", handleFinanceFilter);
  on(state.elements.financeForm, "submit", handleFinanceSubmit);
  on(state.elements.addSupportPaymentButton, "click", handleSupportPayment);
  on(state.elements.fortnightBody, "click", handleFinanceTableClick);
  on(state.elements.monthEndBody, "click", handleFinanceTableClick);
  on(state.elements.editSupportsList, "change", handleEditSupportChange);
  on(state.elements.editSupportsList, "submit", handleEditSupportSubmit);

  document.querySelectorAll('input[name="a-cobrar"]').forEach((input) => {
    on(input, "change", toggleBillingFields);
  });

  document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
    on(link, "click", () => {
      const collapseElement = $("main-navigation");
      if (
        collapseElement &&
        collapseElement.classList.contains("show") &&
        typeof bootstrap !== "undefined"
      ) {
        bootstrap.Collapse.getOrCreateInstance(collapseElement).hide();
      }
    });
  });
}

async function initializeApp() {
  cacheElements();
  setupBootstrap();
  bindEvents();

  const today = getTodayInGuatemala();
  if (state.elements.supportDate) state.elements.supportDate.value = today;
  if (state.elements.movementDate) state.elements.movementDate.value = today;
  setupFinanceSelectors(today);
  setCycle(getCycleForDate(today), false);
  toggleBillingFields();

  const configured = isApiConfigured();
  if (state.elements.configAlert) {
    state.elements.configAlert.classList.toggle("d-none", configured);
  }

  if (!configured) {
    state.supports = [];
    state.finances = [];
    renderSupports();
    renderStatistics();
    renderFinance();
    renderSupportPayment();
    return;
  }

  await loadInitialData();
}

async function loadInitialData() {
  setLoading(true, "Cargando dashboard...");
  try {
    const results = await Promise.allSettled([loadSupports(), loadFinances()]);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) mostrarError(rejected.reason, "No se pudo cargar todo el dashboard.");
  } finally {
    setLoading(false);
  }
}

/* ================================================================
   CICLOS
   ================================================================ */

function getCycleForDate(sqlDate) {
  const parts = parseSqlDate(sqlDate);
  if (!parts) throw new Error("La fecha del ciclo no es válida.");

  let startYear = parts.year;
  let startMonth = parts.month;
  let endYear = parts.year;
  let endMonth = parts.month;

  if (parts.day >= 16) {
    const next = shiftMonth(parts.year, parts.month, 1);
    endYear = next.year;
    endMonth = next.month;
  } else {
    const previous = shiftMonth(parts.year, parts.month, -1);
    startYear = previous.year;
    startMonth = previous.month;
  }

  return buildCycle(
    sqlFromParts(startYear, startMonth, 16),
    sqlFromParts(endYear, endMonth, 15)
  );
}

function buildCycle(desde, hasta) {
  const end = parseSqlDate(hasta);
  return {
    desde,
    hasta,
    fechaPago: end
      ? sqlFromParts(end.year, end.month, lastDayOfMonth(end.year, end.month))
      : ""
  };
}

function setCycle(cycle, reload = true) {
  const changed =
    !state.cycle ||
    state.cycle.desde !== cycle.desde ||
    state.cycle.hasta !== cycle.hasta;
  state.cycle = cycle;
  if (changed) state.supports = [];
  state.supportPayment = createLocalSupportPayment();
  if (state.elements.filterFrom) state.elements.filterFrom.value = cycle.desde;
  if (state.elements.filterTo) state.elements.filterTo.value = cycle.hasta;
  renderCycleHeader();
  renderSupportPayment();

  if (reload && isApiConfigured()) {
    runBusyTask("Cargando ciclo...", async () => {
      try {
        await loadSupports();
      } catch (error) {
        mostrarError(error);
      }
    });
  }
}

function renderCycleHeader() {
  if (!state.cycle) return;
  const label = formatCycleRange(state.cycle.desde, state.cycle.hasta);
  setText(state.elements.cycleLabel, label);
  setText(
    state.elements.cyclePayment,
    `Pago de referencia: ${formatDate(state.cycle.fechaPago, {
      day: "numeric",
      month: "short",
      year: "numeric"
    })} · Q${APP_CONFIG.TARIFA_SOPORTE.toFixed(2)} por soporte`
  );
  setText(state.elements.statsCycleBadge, label);
  setText(state.elements.supportsSubtitle, `${label} · registros agrupados por fecha`);
}

function changeCycle(delta) {
  if (!state.cycle || state.busy) return;
  const currentStart = parseSqlDate(state.cycle.desde);
  if (!currentStart) return;
  const shifted = shiftMonth(currentStart.year, currentStart.month, delta);
  const start = sqlFromParts(shifted.year, shifted.month, 16);
  setCycle(getCycleForDate(start));
}

function handleCycleFilter(event) {
  event.preventDefault();
  const from = state.elements.filterFrom?.value || "";
  const to = state.elements.filterTo?.value || "";

  if (!isValidSqlDate(from) || !isValidSqlDate(to)) {
    mostrarError(new Error("Selecciona un rango de fechas válido."));
    return;
  }
  if (from > to) {
    mostrarError(new Error("La fecha Desde no puede ser posterior a Hasta."));
    return;
  }

  setCycle(buildCycle(from, to));
}

/* ================================================================
   SOPORTES
   ================================================================ */

async function loadSupports() {
  if (!state.cycle) return;
  try {
    const data = await apiGet("listarSoportes", {
      desde: state.cycle.desde,
      hasta: state.cycle.hasta
    });
    state.supports = Array.isArray(data) ? data : [];
    renderSupports();
    renderStatistics();
    await loadSupportPaymentStatus();
  } catch (error) {
    state.supports = [];
    renderSupports("No se pudieron cargar los soportes.");
    renderStatistics();
    throw error;
  }
}

function toggleBillingFields() {
  const selected = document.querySelector('input[name="a-cobrar"]:checked');
  const isBillable = selected?.value === "Sí";
  if (state.elements.billingFields) {
    state.elements.billingFields.classList.toggle("d-none", !isBillable);
  }
  if (state.elements.supportPrice) state.elements.supportPrice.disabled = !isBillable;
  if (state.elements.supportInvoice) state.elements.supportInvoice.disabled = !isBillable;
}

async function handleSupportSubmit(event) {
  event.preventDefault();
  if (state.busy) return;

  const date = state.elements.supportDate?.value || "";
  const quantity = Number(state.elements.supportQuantity?.value);
  const billable =
    document.querySelector('input[name="a-cobrar"]:checked')?.value || "No";

  if (!isValidSqlDate(date)) {
    mostrarError(new Error("Selecciona una fecha válida."));
    return;
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    mostrarError(new Error("La cantidad debe ser un entero mayor que cero."));
    return;
  }

  const payload = {
    fecha: date,
    cantidad: quantity,
    aCobrar: billable,
    precioServicio: billable === "Sí" ? Number(state.elements.supportPrice?.value) : "",
    numeroFactura: billable === "Sí" ? state.elements.supportInvoice?.value.trim() : ""
  };

  setButtonLoading(state.elements.saveSupportButton, true, "Guardando...");
  try {
    await runBusyTask("Guardando soporte...", async () => {
      await apiPost("guardarSoporte", payload);
      state.elements.supportQuantity.value = "1";
      const noRadio = $("cobrar-no");
      if (noRadio) noRadio.checked = true;
      if (state.elements.supportInvoice) state.elements.supportInvoice.value = "";
      toggleBillingFields();
      await loadSupports();
      showToast("Soporte guardado correctamente.");
    });
  } catch (error) {
    mostrarError(error, "No se pudo guardar el soporte.");
  } finally {
    setButtonLoading(state.elements.saveSupportButton, false);
  }
}

function groupSupportsByDate() {
  const groups = new Map();
  state.supports.forEach((record) => {
    const date = record.Fecha;
    if (!groups.has(date)) {
      groups.set(date, { date, quantity: 0, records: [] });
    }
    const group = groups.get(date);
    group.quantity += Number(record.Cantidad) || 0;
    group.records.push(record);
  });
  return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function renderSupports(errorMessage = "") {
  const body = state.elements.supportsBody;
  if (!body) return;

  if (errorMessage) {
    body.innerHTML = emptyTableRow(5, errorMessage, "bi-exclamation-triangle");
    return;
  }

  const groups = groupSupportsByDate();
  if (!groups.length) {
    body.innerHTML = emptyTableRow(
      5,
      "Aún no hay soportes en este ciclo. Registra el primero desde el formulario.",
      "bi-headset"
    );
    return;
  }

  body.innerHTML = groups
    .map((group) => {
      const billable = group.records.filter((record) => record.ACobrar === "Sí");
      const prices = billable.length
        ? billable
            .map(
              (record) =>
                `<span class="data-tag">${escapeHtml(formatMoney(record.PrecioServicio))}</span>`
            )
            .join("")
        : '<span class="empty-mark">—</span>';
      const invoices = billable.length
        ? billable
            .map((record) =>
              record.NumeroFactura
                ? `<span class="data-tag"><i class="bi bi-receipt" aria-hidden="true"></i>${escapeHtml(record.NumeroFactura)}</span>`
                : '<span class="data-tag invoice-pending">Pendiente</span>'
            )
            .join("")
        : '<span class="empty-mark">—</span>';

      return `
        <tr>
          <td>
            <div class="date-cell">
              <strong>${escapeHtml(
                formatDate(group.date, {
                  day: "numeric",
                  month: "long",
                  year: false
                })
              )}</strong>
              <span>${group.records.length} registro${group.records.length === 1 ? "" : "s"}</span>
            </div>
          </td>
          <td><span class="quantity-pill">${group.quantity}</span></td>
          <td><div class="tag-list">${prices}</div></td>
          <td><div class="tag-list">${invoices}</div></td>
          <td class="text-end">
            <div class="row-actions">
              <button class="btn action-button" type="button" data-action="add" data-date="${group.date}" title="Sumar un soporte" aria-label="Sumar un soporte el ${group.date}">
                <i class="bi bi-plus-lg" aria-hidden="true"></i>
              </button>
              <button class="btn action-button" type="button" data-action="subtract" data-date="${group.date}" title="Restar un soporte" aria-label="Restar un soporte el ${group.date}">
                <i class="bi bi-dash-lg" aria-hidden="true"></i>
              </button>
              <button class="btn action-button" type="button" data-action="edit" data-date="${group.date}" title="Editar facturas" aria-label="Editar registros del ${group.date}">
                <i class="bi bi-pencil" aria-hidden="true"></i>
              </button>
              <button class="btn action-button action-delete" type="button" data-action="delete" data-date="${group.date}" title="Eliminar fecha" aria-label="Eliminar soportes del ${group.date}">
                <i class="bi bi-trash3" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function handleSupportTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || state.busy) return;
  const { action, date } = button.dataset;
  if (!date) return;

  if (action === "edit") {
    openEditSupports(date);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(
      `¿Estás seguro? Se eliminarán todos los soportes del ${formatDate(date, {
        day: "numeric",
        month: "long",
        year: "numeric"
      })}.`
    );
    if (!confirmed) return;
  }

  const actionMap = {
    add: ["sumarSoporte", "Sumando soporte...", "Soporte sumado."],
    subtract: ["restarSoporte", "Restando soporte...", "Soporte restado."],
    delete: ["eliminarSoportes", "Eliminando soportes...", "Soportes eliminados."]
  };
  const selected = actionMap[action];
  if (!selected) return;

  try {
    await runBusyTask(selected[1], async () => {
      await apiPost(selected[0], { fecha: date });
      await loadSupports();
      showToast(selected[2]);
    });
  } catch (error) {
    mostrarError(error);
  }
}

function openEditSupports(date) {
  const records = state.supports.filter((record) => record.Fecha === date);
  if (!records.length || !state.elements.editSupportsList) return;

  state.elements.editSupportsList.dataset.date = date;
  setText(
    state.elements.editModalDate,
    formatDate(date, { day: "numeric", month: "long", year: "numeric" })
  );

  state.elements.editSupportsList.innerHTML = records
    .map((record, index) => {
      const isBillable = record.ACobrar === "Sí";
      return `
        <form class="edit-support-item" data-support-id="${escapeHtml(record.ID)}" novalidate>
          <div class="edit-support-item-header">
            <strong>Registro ${index + 1}</strong>
            <span>ID ${escapeHtml(record.ID.slice(0, 8))}</span>
          </div>
          <div class="edit-support-grid">
            <div>
              <label class="form-label" for="edit-qty-${index}">Cantidad</label>
              <input id="edit-qty-${index}" class="form-control" data-field="cantidad" type="number" min="1" step="1" value="${Number(record.Cantidad) || 1}" required>
            </div>
            <div>
              <label class="form-label" for="edit-billable-${index}">A cobrar</label>
              <select id="edit-billable-${index}" class="form-select" data-field="aCobrar">
                <option value="No"${isBillable ? "" : " selected"}>No</option>
                <option value="Sí"${isBillable ? " selected" : ""}>Sí</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="edit-price-${index}">Precio</label>
              <select id="edit-price-${index}" class="form-select" data-field="precioServicio"${isBillable ? "" : " disabled"}>
                <option value="175"${Number(record.PrecioServicio) === 175 ? " selected" : ""}>Q175</option>
                <option value="310"${Number(record.PrecioServicio) === 310 ? " selected" : ""}>Q310</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="edit-invoice-${index}">Factura</label>
              <input id="edit-invoice-${index}" class="form-control" data-field="numeroFactura" type="text" maxlength="100" value="${escapeHtml(record.NumeroFactura)}" placeholder="Opcional"${isBillable ? "" : " disabled"}>
            </div>
            <div class="edit-save-shell">
              <button class="btn btn-primary" type="submit">
                <i class="bi bi-check2" aria-hidden="true"></i> Guardar
              </button>
            </div>
          </div>
        </form>
      `;
    })
    .join("");

  if (state.editModal) state.editModal.show();
}

function handleEditSupportChange(event) {
  const select = event.target.closest('select[data-field="aCobrar"]');
  if (!select) return;
  const form = select.closest("form[data-support-id]");
  if (!form) return;
  const isBillable = select.value === "Sí";
  const price = form.querySelector('[data-field="precioServicio"]');
  const invoice = form.querySelector('[data-field="numeroFactura"]');
  if (price) price.disabled = !isBillable;
  if (invoice) {
    invoice.disabled = !isBillable;
    if (!isBillable) invoice.value = "";
  }
}

async function handleEditSupportSubmit(event) {
  const form = event.target.closest("form[data-support-id]");
  if (!form) return;
  event.preventDefault();
  if (state.busy) return;

  const quantity = Number(form.querySelector('[data-field="cantidad"]')?.value);
  const billable = form.querySelector('[data-field="aCobrar"]')?.value || "No";
  if (!Number.isInteger(quantity) || quantity <= 0) {
    mostrarError(new Error("La cantidad debe ser un entero mayor que cero."));
    return;
  }

  const payload = {
    id: form.dataset.supportId,
    cantidad: quantity,
    aCobrar: billable,
    precioServicio:
      billable === "Sí"
        ? Number(form.querySelector('[data-field="precioServicio"]')?.value)
        : "",
    numeroFactura:
      billable === "Sí"
        ? form.querySelector('[data-field="numeroFactura"]')?.value.trim() || ""
        : ""
  };
  const date = state.elements.editSupportsList?.dataset.date;

  try {
    await runBusyTask("Actualizando soporte...", async () => {
      await apiPost("actualizarSoporte", payload);
      await loadSupports();
      if (date) openEditSupports(date);
      showToast("Soporte actualizado.");
    });
  } catch (error) {
    mostrarError(error, "No se pudo actualizar el soporte.");
  }
}

/* ================================================================
   FACTURACIÓN
   ================================================================ */

function processInvoicedEmail() {
  const invoiced = state.supports
    .filter(
      (record) =>
        record.ACobrar === "Sí" && String(record.NumeroFactura || "").trim()
    )
    .sort((a, b) => a.Fecha.localeCompare(b.Fecha));

  if (!invoiced.length) {
    mostrarError(
      new Error("No hay soportes con número de factura en el ciclo seleccionado.")
    );
    return;
  }

  const lines = ["FACTURADOS", ""];
  invoiced.forEach((record) => {
    lines.push(
      formatDate(record.Fecha, { day: "2-digit", month: "2-digit", year: "numeric" }),
      `Factura: ${record.NumeroFactura}`,
      `Cantidad: ${Number(record.Cantidad) || 0}`,
      formatMoney(record.PrecioServicio),
      ""
    );
  });

  const total = invoiced.reduce(
    (sum, record) => sum + (Number(record.PrecioServicio) || 0),
    0
  );
  lines.push("Total facturado:", formatMoney(total));

  const subject = `Facturados · ${formatCycleRange(
    state.cycle.desde,
    state.cycle.hasta
  )}`;
  const mailto = `mailto:${APP_CONFIG.CORREO_FACTURADOS}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(lines.join("\n"))}`;
  window.location.href = mailto;
}

/* ================================================================
   ESTADÍSTICAS
   ================================================================ */

function renderStatistics() {
  const total = state.supports.reduce(
    (sum, record) => sum + (Number(record.Cantidad) || 0),
    0
  );
  const remaining = Math.max(0, APP_CONFIG.META_SOPORTES - total);
  const percentage = Math.round((total / APP_CONFIG.META_SOPORTES) * 100);
  const reached = total >= APP_CONFIG.META_SOPORTES;

  setText(state.elements.statCompleted, String(total));
  setText(state.elements.statRemaining, String(remaining));
  setText(
    state.elements.statRemainingCopy,
    reached ? "Meta alcanzada ✅" : "Continúa avanzando"
  );
  setText(state.elements.statPercentage, `${percentage}%`);
  setText(state.elements.statGoalStatus, reached ? "Meta alcanzada ✅" : "En progreso");
  renderSupportsChart();
}

/* ================================================================
   PAGO DE SOPORTES
   ================================================================ */

function isCompleteSupportCycle(cycle = state.cycle) {
  if (!cycle || !isValidSqlDate(cycle.desde) || !isValidSqlDate(cycle.hasta)) {
    return false;
  }
  try {
    const expected = getCycleForDate(cycle.desde);
    return expected.desde === cycle.desde && expected.hasta === cycle.hasta;
  } catch (error) {
    return false;
  }
}

function createLocalSupportPayment() {
  const quantity = state.supports.reduce(
    (sum, record) => sum + (Number(record.Cantidad) || 0),
    0
  );
  return {
    desde: state.cycle?.desde || "",
    hasta: state.cycle?.hasta || "",
    fechaPago: state.cycle?.fechaPago || "",
    cantidadSoportes: quantity,
    tarifa: APP_CONFIG.TARIFA_SOPORTE,
    montoCalculado:
      Math.round(quantity * APP_CONFIG.TARIFA_SOPORTE * 100) / 100,
    registrado: false,
    movimientoId: "",
    montoRegistrado: 0,
    cantidadRegistrada: 0,
    cicloCompleto: isCompleteSupportCycle(),
    error: ""
  };
}

async function loadSupportPaymentStatus() {
  const localPayment = createLocalSupportPayment();
  state.supportPayment = localPayment;

  if (!localPayment.cicloCompleto || !isApiConfigured()) {
    renderSupportPayment();
    return;
  }

  try {
    const data = await apiGet("obtenerPagoSoportes", {
      desde: state.cycle.desde,
      hasta: state.cycle.hasta
    });
    state.supportPayment = {
      ...localPayment,
      ...data,
      cicloCompleto: true,
      error: ""
    };
  } catch (error) {
    console.error(error);
    state.supportPayment = {
      ...localPayment,
      error: error instanceof Error ? error.message : "No se pudo consultar el pago."
    };
  }
  renderSupportPayment();
}

function renderSupportPayment() {
  const payment = state.supportPayment || createLocalSupportPayment();
  const card = state.elements.supportPaymentCard;
  const button = state.elements.addSupportPaymentButton;
  const registeredChanged =
    payment.registrado &&
    (Number(payment.montoRegistrado) !== Number(payment.montoCalculado) ||
      Number(payment.cantidadRegistrada) !== Number(payment.cantidadSoportes));

  setText(
    state.elements.supportPaymentRange,
    payment.desde && payment.hasta
      ? formatCycleRange(payment.desde, payment.hasta)
      : "Selecciona un ciclo"
  );
  setText(
    state.elements.supportPaymentCalculation,
    `${Number(payment.cantidadSoportes) || 0} soporte${
      Number(payment.cantidadSoportes) === 1 ? "" : "s"
    } × ${formatMoney(payment.tarifa || APP_CONFIG.TARIFA_SOPORTE)}`
  );
  setText(
    state.elements.supportPaymentTotal,
    formatMoney(payment.montoCalculado || 0)
  );
  setText(
    state.elements.supportPaymentDate,
    payment.fechaPago
      ? `Se registra el ${formatDate(payment.fechaPago, {
          day: "numeric",
          month: "long",
          year: "numeric"
        })}`
      : "Se registra al final del mes."
  );

  if (card) {
    card.classList.toggle("is-registered", Boolean(payment.registrado));
    card.classList.toggle(
      "is-unavailable",
      !payment.cicloCompleto || Boolean(payment.error)
    );
  }

  if (button) {
    const unavailable =
      !isApiConfigured() ||
      !payment.cicloCompleto ||
      Boolean(payment.error) ||
      Number(payment.cantidadSoportes) <= 0 ||
      (payment.registrado && !registeredChanged);
    button.disabled = unavailable;
    button.innerHTML = payment.registrado
      ? registeredChanged
        ? '<i class="bi bi-arrow-repeat" aria-hidden="true"></i> Actualizar pago'
        : '<i class="bi bi-check2-circle" aria-hidden="true"></i> Ya agregado'
      : '<i class="bi bi-plus-circle" aria-hidden="true"></i> Sumar a Finanzas';
  }

  let status = "Se agrega únicamente cuando tú lo decidas.";
  if (!isApiConfigured()) {
    status = "Conecta Google Apps Script para poder registrar el pago.";
  } else if (!payment.cicloCompleto) {
    status = "Selecciona un ciclo completo del día 16 al día 15.";
  } else if (payment.error) {
    status = payment.error;
  } else if (Number(payment.cantidadSoportes) <= 0) {
    status = "Todavía no hay soportes para calcular este pago.";
  } else if (payment.registrado && registeredChanged) {
    status = `El ciclo cambió. Actualiza el ingreso de ${formatMoney(
      payment.montoRegistrado
    )} a ${formatMoney(payment.montoCalculado)}.`;
  } else if (payment.registrado) {
    status = `Pago agregado a Fin de Mes por ${formatMoney(
      payment.montoRegistrado
    )}.`;
  }
  setText(state.elements.supportPaymentStatus, status);
}

async function handleSupportPayment() {
  if (state.busy) return;
  const payment = state.supportPayment || createLocalSupportPayment();
  if (!payment.cicloCompleto) {
    mostrarError(new Error("Selecciona un ciclo completo del día 16 al día 15."));
    return;
  }
  if (Number(payment.cantidadSoportes) <= 0) {
    mostrarError(new Error("No hay soportes en este ciclo para sumar."));
    return;
  }

  const updating = Boolean(payment.registrado);
  const actionText = updating ? "actualizará" : "agregará";
  const confirmed = window.confirm(
    `Se ${actionText} ${formatMoney(payment.montoCalculado)} por ${
      payment.cantidadSoportes
    } soporte${payment.cantidadSoportes === 1 ? "" : "s"} en Fin de Mes, con fecha ${formatDate(
      payment.fechaPago,
      { day: "numeric", month: "long", year: "numeric" }
    )}. ¿Deseas continuar?`
  );
  if (!confirmed) return;

  try {
    await runBusyTask(updating ? "Actualizando pago..." : "Agregando pago...", async () => {
      const result = await apiPost("registrarPagoSoportes", {
        desde: payment.desde,
        hasta: payment.hasta,
        actualizar: updating
      });

      if (result?.pago) {
        state.supportPayment = {
          ...payment,
          ...result.pago,
          cicloCompleto: true,
          error: ""
        };
      }

      const paymentDate = parseSqlDate(payment.fechaPago);
      if (paymentDate) {
        ensureYearOption(paymentDate.year);
        state.elements.financeMonth.value = String(paymentDate.month);
        state.elements.financeYear.value = String(paymentDate.year);
      }
      await loadFinances();
      await loadSupportPaymentStatus();
      showToast(updating ? "Pago de soportes actualizado." : "Pago de soportes agregado.");
    });
  } catch (error) {
    mostrarError(error, "No se pudo registrar el pago de soportes.");
  } finally {
    renderSupportPayment();
  }
}

/* ================================================================
   FINANZAS
   ================================================================ */

async function loadFinances() {
  const month = Number(state.elements.financeMonth?.value);
  const year = Number(state.elements.financeYear?.value);
  try {
    const data = await apiGet("listarFinanzas", { mes: month, anio: year });
    state.finances = Array.isArray(data) ? data : [];
    renderFinance();
  } catch (error) {
    state.finances = [];
    renderFinance("No se pudieron cargar los movimientos.");
    throw error;
  }
}

function financeTypeOrder(type) {
  return {
    "Ingreso Extra": 0,
    "Pago Planilla": 1,
    "Pago Soportes": 2,
    Gasto: 3
  }[type] ?? 4;
}

function sortFinances(records) {
  return [...records].sort((a, b) => {
    const typeDifference = financeTypeOrder(a.Tipo) - financeTypeOrder(b.Tipo);
    if (typeDifference !== 0) return typeDifference;
    return `${b.Fecha}${b.CreadoEn}`.localeCompare(`${a.Fecha}${a.CreadoEn}`);
  });
}

function renderFinance(errorMessage = "") {
  const month = Number(state.elements.financeMonth?.value) || 1;
  const year = Number(state.elements.financeYear?.value) || new Date().getUTCFullYear();
  setText(
    state.elements.financePeriodLabel,
    `${APP_CONFIG.MESES[month - 1]} ${year}`
  );

  const income = state.finances
    .filter((record) => record.Tipo !== "Gasto")
    .reduce((sum, record) => sum + (Number(record.Monto) || 0), 0);
  const expenses = state.finances
    .filter((record) => record.Tipo === "Gasto")
    .reduce((sum, record) => sum + (Number(record.Monto) || 0), 0);
  const balance = income - expenses;

  setText(state.elements.financeIncome, `+${formatMoney(income)}`);
  setText(state.elements.financeExpenses, `-${formatMoney(expenses)}`);
  setText(state.elements.financeTotal, formatMoney(balance));

  const fortnight = state.finances.filter((record) => record.Periodo === "Quincena");
  const monthEnd = state.finances.filter((record) => record.Periodo === "Fin de Mes");
  renderFinancePanel(
    fortnight,
    state.elements.fortnightBody,
    state.elements.fortnightTotal,
    errorMessage
  );
  renderFinancePanel(
    monthEnd,
    state.elements.monthEndBody,
    state.elements.monthEndTotal,
    errorMessage
  );
}

function renderFinancePanel(records, body, totalElement, errorMessage) {
  if (!body) return;
  const total = records.reduce((sum, record) => {
    const amount = Number(record.Monto) || 0;
    return sum + (record.Tipo === "Gasto" ? -amount : amount);
  }, 0);
  setText(totalElement, formatMoney(total));

  if (errorMessage) {
    body.innerHTML = emptyTableRow(3, errorMessage, "bi-exclamation-triangle");
    return;
  }
  if (!records.length) {
    body.innerHTML = emptyTableRow(3, "No hay movimientos en este periodo.", "bi-wallet2");
    return;
  }

  body.innerHTML = sortFinances(records)
    .map((record) => {
      const isExpense = record.Tipo === "Gasto";
      const movementDetail =
        record.Tipo === "Pago Soportes"
          ? `${Number(record.CantidadSoportes) || 0} soportes × ${formatMoney(
              record.TarifaSoporte || APP_CONFIG.TARIFA_SOPORTE
            )} · ${formatDate(record.Fecha, {
              day: "numeric",
              month: "short",
              year: "numeric"
            })}`
          : `${record.Tipo} · ${formatDate(record.Fecha, {
              day: "numeric",
              month: "short",
              year: "numeric"
            })}`;
      return `
        <tr>
          <td>
            <div class="movement-description">
              <strong>${escapeHtml(record.Descripcion)}</strong>
              <span>${escapeHtml(movementDetail)}</span>
            </div>
          </td>
          <td class="text-end">
            <span class="${isExpense ? "money-expense" : "money-income"}">
              ${isExpense ? "-" : "+"}${escapeHtml(formatMoney(record.Monto))}
            </span>
          </td>
          <td class="text-end">
            <button class="btn delete-movement" type="button" data-movement-id="${escapeHtml(record.ID)}" title="Eliminar movimiento" aria-label="Eliminar ${escapeHtml(record.Descripcion)}">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function handleFinanceFilter(event) {
  event.preventDefault();
  if (state.busy || !isApiConfigured()) return;
  runBusyTask("Cargando finanzas...", async () => {
    try {
      await loadFinances();
    } catch (error) {
      mostrarError(error);
    }
  });
}

async function handleFinanceSubmit(event) {
  event.preventDefault();
  if (state.busy) return;

  const date = state.elements.movementDate?.value || "";
  const description = state.elements.movementDescription?.value.trim() || "";
  const amount = Number(state.elements.movementAmount?.value);
  const period = state.elements.movementPeriod?.value || "";
  const type = state.elements.movementType?.value || "";

  if (!isValidSqlDate(date)) {
    mostrarError(new Error("Selecciona una fecha válida."));
    return;
  }
  if (!description) {
    mostrarError(new Error("La descripción es obligatoria."));
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    mostrarError(new Error("El monto debe ser mayor que cero."));
    return;
  }
  if (!["Quincena", "Fin de Mes"].includes(period)) {
    mostrarError(new Error("Selecciona un periodo válido."));
    return;
  }
  if (!["Gasto", "Ingreso Extra", "Pago Planilla"].includes(type)) {
    mostrarError(new Error("Selecciona un tipo válido."));
    return;
  }

  setButtonLoading(state.elements.saveMovementButton, true, "Guardando...");
  try {
    await runBusyTask("Guardando movimiento...", async () => {
      await apiPost("guardarMovimiento", {
        fecha: date,
        descripcion: description,
        monto: amount,
        periodo: period,
        tipo: type
      });

      const dateParts = parseSqlDate(date);
      ensureYearOption(dateParts.year);
      state.elements.financeMonth.value = String(dateParts.month);
      state.elements.financeYear.value = String(dateParts.year);
      state.elements.movementDescription.value = "";
      state.elements.movementAmount.value = "";
      await loadFinances();
      showToast("Movimiento guardado correctamente.");
    });
  } catch (error) {
    mostrarError(error, "No se pudo guardar el movimiento.");
  } finally {
    setButtonLoading(state.elements.saveMovementButton, false);
  }
}

function ensureYearOption(year) {
  const select = state.elements.financeYear;
  if (!select || !year) return;
  const exists = Array.from(select.options).some(
    (option) => Number(option.value) === Number(year)
  );
  if (!exists) {
    const option = new Option(String(year), String(year));
    select.add(option);
    const options = Array.from(select.options).sort(
      (a, b) => Number(a.value) - Number(b.value)
    );
    select.innerHTML = "";
    options.forEach((item) => select.add(item));
  }
}

async function handleFinanceTableClick(event) {
  const button = event.target.closest("button[data-movement-id]");
  if (!button || state.busy) return;
  const id = button.dataset.movementId;
  const confirmed = window.confirm("¿Deseas eliminar este movimiento?");
  if (!confirmed) return;

  try {
    await runBusyTask("Eliminando movimiento...", async () => {
      await apiPost("eliminarMovimiento", { id });
      await Promise.all([loadFinances(), loadSupportPaymentStatus()]);
      showToast("Movimiento eliminado.");
    });
  } catch (error) {
    mostrarError(error, "No se pudo eliminar el movimiento.");
  }
}

/* ================================================================
   GRÁFICAS
   ================================================================ */

function renderSupportsChart() {
  const canvas = state.elements.supportsChart;
  if (!canvas || typeof Chart === "undefined") return;

  const groups = groupSupportsByDate();
  const labels = groups.length
    ? groups.map((group) =>
        formatDate(group.date, { day: "numeric", month: "short", year: false })
      )
    : ["Sin datos"];
  const values = groups.length ? groups.map((group) => group.quantity) : [0];
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, "rgba(79, 70, 229, 0.95)");
  gradient.addColorStop(1, "rgba(99, 102, 241, 0.36)");

  if (state.chart) state.chart.destroy();
  state.chart = new Chart(context, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Soportes",
          data: values,
          backgroundColor: gradient,
          borderColor: "#4f46e5",
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          padding: 11,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label(contextValue) {
              return `${contextValue.parsed.y} soporte${
                contextValue.parsed.y === 1 ? "" : "s"
              }`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#64748b",
            font: { family: "Inter", size: 10, weight: 600 },
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(5, ...values),
          grid: { color: "rgba(226, 232, 240, 0.7)" },
          border: { display: false },
          ticks: {
            precision: 0,
            color: "#94a3b8",
            font: { family: "Inter", size: 10 }
          }
        }
      }
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
