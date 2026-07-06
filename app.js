// ============================
// CONFIGURACIÓN SUPABASE
// ============================
const db = supabase.createClient(
    'https://dbherfalxtdpuekdquso.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGVyZmFseHRkcHVla2RxdXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY5NTgsImV4cCI6MjA5MzA2Mjk1OH0.ERCeSP2s_0LfPGL5FYy-dKbMIlyRt8Gvg8aZ47DgITA'
);

// ============================
// VARIABLES GLOBALES
// ============================
const VALOR_SOPORTE = 14.50;
let mostrarTotalSoportes = true;

// ============================
// UTILIDADES
// ============================
function toSQLDate(date) {
    return date.toISOString().split("T")[0];
}

function formatMoney(amount) {
    return `Q${Number(amount || 0).toLocaleString("es-GT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function monthName(index) {
    const meses = [
        "Enero", "Febrero", "Marzo", "Abril",
        "Mayo", "Junio", "Julio", "Agosto",
        "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    return meses[index];
}

// ============================
// INICIO
// ============================
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("seccion-finanzas")) {
        initFinanzas();
    }

    if (document.getElementById("ciclo-desde") && document.getElementById("ciclo-hasta")) {
        initCiclo();
    }
});

// ============================
// CICLO
// ============================
function initCiclo() {
    const desdeInput = document.getElementById("ciclo-desde");
    const hastaInput = document.getElementById("ciclo-hasta");

    if (!desdeInput || !hastaInput) return;

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

    desdeInput.value = toSQLDate(desde);
    hastaInput.value = toSQLDate(hasta);

    const btnFiltrar = document.getElementById("btn-filtrar-ciclo");

    if (btnFiltrar) {
        btnFiltrar.addEventListener("click", () => {
            if (typeof renderCiclo === "function") renderCiclo();
            if (typeof renderEstadisticas === "function") renderEstadisticas();
            if (typeof renderFinanzas === "function") renderFinanzas();
        });
    }
}

window.cicloAnterior = () => {
    const desdeInput = document.getElementById("ciclo-desde");
    const hastaInput = document.getElementById("ciclo-hasta");

    const desde = new Date(desdeInput.value + "T00:00:00");
    const hasta = new Date(hastaInput.value + "T00:00:00");

    desde.setMonth(desde.getMonth() - 1);
    hasta.setMonth(hasta.getMonth() - 1);

    desdeInput.value = toSQLDate(desde);
    hastaInput.value = toSQLDate(hasta);

    if (typeof renderCiclo === "function") renderCiclo();
    if (typeof renderEstadisticas === "function") renderEstadisticas();
    if (typeof renderFinanzas === "function") renderFinanzas();
};

window.cicloSiguiente = () => {
    const desdeInput = document.getElementById("ciclo-desde");
    const hastaInput = document.getElementById("ciclo-hasta");

    const desde = new Date(desdeInput.value + "T00:00:00");
    const hasta = new Date(hastaInput.value + "T00:00:00");

    desde.setMonth(desde.getMonth() + 1);
    hasta.setMonth(hasta.getMonth() + 1);

    desdeInput.value = toSQLDate(desde);
    hastaInput.value = toSQLDate(hasta);

    if (typeof renderCiclo === "function") renderCiclo();
    if (typeof renderEstadisticas === "function") renderEstadisticas();
    if (typeof renderFinanzas === "function") renderFinanzas();
};

// ============================
// FINANZAS
// ============================
function initFinanzas() {
    const filtro = document.getElementById("filtro-mes");

    filtro.innerHTML = Array.from(
        { length: 12 },
        (_, i) => `<option value="${i}">${monthName(i)}</option>`
    ).join("");

    filtro.value = new Date().getMonth();

    document.getElementById("form-finanza")
        .addEventListener("submit", guardarMovimiento);

    filtro.addEventListener("change", renderFinanzas);

    crearCheckboxSoportes();
    renderFinanzas();
}

function crearCheckboxSoportes() {
    if (document.getElementById("check-total-soportes")) return;

    const tablaFinMes = document.getElementById("tabla-finmes");
    const contenedor = tablaFinMes.closest(".section-box");

    const div = document.createElement("div");
    div.className = "form-check form-switch mb-3";

    div.innerHTML = `
        <input class="form-check-input" type="checkbox" id="check-total-soportes" checked>
        <label class="form-check-label fw-bold" for="check-total-soportes">
            Mostrar y sumar Total Soportes
        </label>
    `;

    contenedor.insertBefore(div, contenedor.querySelector("table"));

    document.getElementById("check-total-soportes").addEventListener("change", e => {
        mostrarTotalSoportes = e.target.checked;
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
        fecha: toSQLDate(
            new Date(year, mes, periodo === "quincena" ? 15 : 30)
        ),
        descripcion: document.getElementById("descripcion").value,
        monto: Number(document.getElementById("monto").value),
        tipo
    };

    await db.from("gastos").insert([payload]);

    document.getElementById("form-finanza").reset();
    renderFinanzas();
}

async function renderFinanzas() {
    const month = Number(document.getElementById("filtro-mes").value);
    const year = new Date().getFullYear();

    const { data } = await db
        .from("gastos")
        .select("*")
        .gte("fecha", toSQLDate(new Date(year, month, 1)))
        .lte("fecha", toSQLDate(new Date(year, month + 1, 0)));

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

    const totalSoportes = cantidadSoportes * VALOR_SOPORTE;

    const tablaQ = document.getElementById("tabla-quincena");
    const tablaF = document.getElementById("tabla-finmes");

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

    function renderTabla(lista, tabla, esQuincena = true) {
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
                if (isGasto) {
                    totalGastosQ += monto;
                } else {
                    totalIngresosQ += monto;
                }
            } else {
                if (isGasto) {
                    totalGastosF += monto;
                } else {
                    totalIngresosF += monto;
                }
            }

            tabla.innerHTML += `
                <tr>
                    <td>${mov.descripcion}</td>
                    <td class="text-end ${isGasto ? 'text-danger' : 'text-success'} fw-bold">
                        ${isGasto ? '-' : '+'}${formatMoney(monto)}
                    </td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarGasto(${mov.id})">
                            ❌
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    renderTabla(quincena, tablaQ, true);
    renderTabla(finMes, tablaF, false);

    if (mostrarTotalSoportes) {
        totalIngresosF += totalSoportes;

        tablaF.innerHTML += `
            <tr class="table-info">
                <td>
                    <strong>Total Soportes (${cantidadSoportes} × Q14.50)</strong>
                </td>
                <td class="text-end text-success fw-bold">
                    +${formatMoney(totalSoportes)}
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
            <td class="text-end fw-bold">
                ${formatMoney(balanceQ)}
            </td>
            <td></td>
        </tr>
    `;

    tablaF.innerHTML += `
        <tr class="table-dark">
            <td><strong>Total</strong></td>
            <td class="text-end fw-bold">
                ${formatMoney(balanceF)}
            </td>
            <td></td>
        </tr>
    `;
}

window.eliminarGasto = async (id) => {
    await db.from("gastos").delete().eq("id", id);
    renderFinanzas();
};
