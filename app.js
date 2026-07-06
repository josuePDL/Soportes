// ============================
// CONFIGURACIÓN SUPABASE
// ============================
const db = supabase.createClient(
    'https://dbherfalxtdpuekdquso.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGVyZmFseHRkcHVla2RxdXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY5NTgsImV4cCI6MjA5MzA2Mjk1OH0.ERCeSP2s_0LfPGL5FYy-dKbMIlyRt8Gvg8aZ47DgITA'
);

// ============================
// FIX CICLO + ESTADISTICAS + FINANZAS
// ============================

function moneyGT(amount) {
    if (typeof formatMoney === "function") return formatMoney(amount);

    return `Q${Number(amount || 0).toLocaleString("es-GT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function sqlDate(date) {
    if (typeof toSQLDate === "function") return toSQLDate(date);
    return date.toISOString().split("T")[0];
}

function getMostrarTotalSoportes() {
    const valor = localStorage.getItem("mostrarTotalSoportes");
    return valor === null ? true : valor === "true";
}

function setMostrarTotalSoportes(valor) {
    localStorage.setItem("mostrarTotalSoportes", valor ? "true" : "false");
}

// ============================
// INICIO GENERAL
// ============================
function iniciarSistema() {
    if (document.getElementById("ciclo-desde") && document.getElementById("ciclo-hasta")) {
        initCiclo();
    }

    if (document.getElementById("seccion-finanzas")) {
        initFinanzas();
    }

    if (typeof renderCiclo === "function") renderCiclo();
    if (typeof renderEstadisticas === "function") renderEstadisticas();
    if (typeof renderFinanzas === "function") renderFinanzas();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarSistema);
} else {
    iniciarSistema();
}

// ============================
// CICLO
// ============================
function initCiclo() {
    const desdeInput = document.getElementById("ciclo-desde");
    const hastaInput = document.getElementById("ciclo-hasta");

    if (!desdeInput || !hastaInput) return;

    if (!desdeInput.value || !hastaInput.value) {
        const hoy = new Date();
        const year = hoy.getFullYear();
        const month = hoy.getMonth();

        let desde;
        let hasta;

        if (hoy.getDate() >= 16) {
            desde = new Date(year, month, 16);
            hasta = new Date(year, month + 1, 15);
        } else {
            desde = new Date(year, month - 1, 16);
            hasta = new Date(year, month, 15);
        }

        desdeInput.value = sqlDate(desde);
        hastaInput.value = sqlDate(hasta);
    }

    const btnFiltrar = document.getElementById("btn-filtrar-ciclo");

    if (btnFiltrar) {
        btnFiltrar.onclick = () => {
            renderCiclo();
            renderEstadisticas();
            renderFinanzas();
        };
    }
}

window.cicloAnterior = () => {
    const desdeInput = document.getElementById("ciclo-desde");
    const hastaInput = document.getElementById("ciclo-hasta");

    const desde = new Date(desdeInput.value + "T00:00:00");
    const hasta = new Date(hastaInput.value + "T00:00:00");

    desde.setMonth(desde.getMonth() - 1);
    hasta.setMonth(hasta.getMonth() - 1);

    desdeInput.value = sqlDate(desde);
    hastaInput.value = sqlDate(hasta);

    renderCiclo();
    renderEstadisticas();
    renderFinanzas();
};

window.cicloSiguiente = () => {
    const desdeInput = document.getElementById("ciclo-desde");
    const hastaInput = document.getElementById("ciclo-hasta");

    const desde = new Date(desdeInput.value + "T00:00:00");
    const hasta = new Date(hastaInput.value + "T00:00:00");

    desde.setMonth(desde.getMonth() + 1);
    hasta.setMonth(hasta.getMonth() + 1);

    desdeInput.value = sqlDate(desde);
    hastaInput.value = sqlDate(hasta);

    renderCiclo();
    renderEstadisticas();
    renderFinanzas();
};

// ============================
// ESTADISTICAS
// ============================
async function renderEstadisticas() {
    const desde = document.getElementById("ciclo-desde")?.value;
    const hasta = document.getElementById("ciclo-hasta")?.value;

    if (!desde || !hasta) return;

    const { data: soportes } = await db
        .from("soportes")
        .select("cantidad, a_cobrar")
        .gte("fecha", desde)
        .lte("fecha", hasta);

    let totalRealizados = 0;
    let totalACobrar = 0;

    (soportes || []).forEach(s => {
        const cantidad = Number(s.cantidad || 0);

        totalRealizados += cantidad;

        if (s.a_cobrar) {
            totalACobrar += cantidad;
        }
    });

    const totalDinero = totalRealizados * 14.50;

    const idsTotal = [
        "total-soportes",
        "soportes-realizados",
        "estadistica-total-soportes"
    ];

    const idsDinero = [
        "total-dinero-soportes",
        "monto-total-soportes",
        "total-ciclo"
    ];

    const idsCobrar = [
        "total-a-cobrar",
        "soportes-a-cobrar"
    ];

    idsTotal.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = totalRealizados;
    });

    idsDinero.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = moneyGT(totalDinero);
    });

    idsCobrar.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = totalACobrar;
    });
}

// ============================
// FINANZAS
// ============================
function initFinanzas() {
    const filtro = document.getElementById("filtro-mes");

    if (filtro && filtro.options.length === 0) {
        const meses = [
            "Enero", "Febrero", "Marzo", "Abril",
            "Mayo", "Junio", "Julio", "Agosto",
            "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];

        filtro.innerHTML = meses
            .map((mes, i) => `<option value="${i}">${mes}</option>`)
            .join("");

        filtro.value = new Date().getMonth();
    }

    const form = document.getElementById("form-finanza");

    if (form) {
        form.onsubmit = guardarMovimiento;
    }

    if (filtro) {
        filtro.onchange = renderFinanzas;
    }

    crearCheckboxSoportes();
}

function crearCheckboxSoportes() {
    if (document.getElementById("check-total-soportes")) return;

    const tablaFinMes = document.getElementById("tabla-finmes");
    if (!tablaFinMes) return;

    const contenedor = tablaFinMes.closest(".section-box");
    if (!contenedor) return;

    const div = document.createElement("div");
    div.className = "form-check form-switch mb-3";

    div.innerHTML = `
        <input class="form-check-input" type="checkbox" id="check-total-soportes">
        <label class="form-check-label fw-bold" for="check-total-soportes">
            Mostrar y sumar Total Soportes
        </label>
    `;

    contenedor.insertBefore(div, contenedor.querySelector("table"));

    const check = document.getElementById("check-total-soportes");

    check.checked = getMostrarTotalSoportes();

    check.addEventListener("change", e => {
        setMostrarTotalSoportes(e.target.checked);
        renderFinanzas();
    });
}

async function guardarMovimiento(e) {
    e.preventDefault();

    const tipo = document.getElementById("tipo").value;
    const periodo = document.getElementById("periodo-movimiento").value;
    const mes = Number(document.getElementById("filtro-mes").value);
    const year = new Date().getFullYear();

    const payload = {
        fecha: sqlDate(new Date(year, mes, periodo === "quincena" ? 15 : 30)),
        descripcion: document.getElementById("descripcion").value,
        monto: Number(document.getElementById("monto").value),
        tipo
    };

    await db.from("gastos").insert([payload]);

    document.getElementById("form-finanza").reset();
    renderFinanzas();
}

async function renderFinanzas() {
    const filtro = document.getElementById("filtro-mes");
    const tablaQ = document.getElementById("tabla-quincena");
    const tablaF = document.getElementById("tabla-finmes");

    if (!filtro || !tablaQ || !tablaF) return;

    const month = Number(filtro.value);
    const year = new Date().getFullYear();

    const { data } = await db
        .from("gastos")
        .select("*")
        .gte("fecha", sqlDate(new Date(year, month, 1)))
        .lte("fecha", sqlDate(new Date(year, month + 1, 0)));

    const desde = document.getElementById("ciclo-desde")?.value;
    const hasta = document.getElementById("ciclo-hasta")?.value;

    let cantidadSoportes = 0;

    if (desde && hasta) {
        const { data: soportes } = await db
            .from("soportes")
            .select("cantidad")
            .gte("fecha", desde)
            .lte("fecha", hasta);

        (soportes || []).forEach(s => {
            cantidadSoportes += Number(s.cantidad || 0);
        });
    }

    const totalSoportes = cantidadSoportes * 14.50;

    tablaQ.innerHTML = "";
    tablaF.innerHTML = "";

    let totalIngresosQ = 0;
    let totalGastosQ = 0;
    let totalIngresosF = 0;
    let totalGastosF = 0;

    const quincena = [];
    const finMes = [];

    (data || []).forEach(mov => {
        const day = Number(mov.fecha.split("-")[2]);

        if (day <= 15) {
            quincena.push(mov);
        } else {
            finMes.push(mov);
        }
    });

    function renderTabla(lista, tabla, esQuincena) {
        const ingresos = lista.filter(x => x.tipo === "ingreso");
        const pagoSoportes = lista.filter(x => x.tipo === "pago_soportes");
        const planillas = lista.filter(x => x.tipo === "planilla");
        const gastos = lista.filter(x => x.tipo === "gasto");

        const ordenados = [
            ...ingresos,
            ...pagoSoportes,
            ...planillas,
            ...gastos
        ];

        ordenados.forEach(mov => {
            const isGasto = mov.tipo === "gasto";
            const monto = Number(mov.monto || 0);

            if (esQuincena) {
                if (isGasto) totalGastosQ += monto;
                else totalIngresosQ += monto;
            } else {
                if (isGasto) totalGastosF += monto;
                else totalIngresosF += monto;
            }

            tabla.innerHTML += `
                <tr>
                    <td>${mov.descripcion}</td>
                    <td class="text-end ${isGasto ? 'text-danger' : 'text-success'} fw-bold">
                        ${isGasto ? "-" : "+"}${moneyGT(monto)}
                    </td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarGasto(${mov.id})">
                            X
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    renderTabla(quincena, tablaQ, true);
    renderTabla(finMes, tablaF, false);

    if (getMostrarTotalSoportes()) {
        totalIngresosF += totalSoportes;

        tablaF.innerHTML += `
            <tr class="table-info">
                <td>
                    <strong>Total Soportes (${cantidadSoportes} x Q14.50)</strong>
                </td>
                <td class="text-end text-success fw-bold">
                    +${moneyGT(totalSoportes)}
                </td>
                <td></td>
            </tr>
        `;
    }

    const balanceQ = totalIngresosQ - totalGastosQ;
    const balanceF = totalIngresosF - totalGastosF;

    tablaQ.innerHTML += `
        <tr class="table-dark">
            <td><strong>Total</strong></td>
            <td class="text-end fw-bold">${moneyGT(balanceQ)}</td>
            <td></td>
        </tr>
    `;

    tablaF.innerHTML += `
        <tr class="table-dark">
            <td><strong>Total</strong></td>
            <td class="text-end fw-bold">${moneyGT(balanceF)}</td>
            <td></td>
        </tr>
    `;
}

window.eliminarGasto = async (id) => {
    await db.from("gastos").delete().eq("id", id);
    renderFinanzas();
};
