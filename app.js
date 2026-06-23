// ============================
// CONFIGURACIÓN DE SUPABASE
// ============================
const supabaseUrl = 'https://dbherfalxtdpuekdquso.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGVyZmFseHRkcHVla2RxdXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY5NTgsImV4cCI6MjA5MzA2Mjk1OH0.ERCeSP2s_0LfPGL5FYy-dKbMIlyRt8Gvg8aZ47DgITA';

const db = window.supabase.createClient(supabaseUrl, supabaseKey);
const TARIFA = 14.50;

// Estado global
let fechaReferenciaCiclo = new Date();
let chartMesInstance = null;
let datosSoportesAnioActual = [];
let datosSoportesAnioAnterior = [];

// ============================
// INICIALIZADOR
// ============================
document.addEventListener("DOMContentLoaded", () => {
    initCiclo();
    initMes();
    initFinanzas();
});

// ============================
// UTILIDADES
// ============================
function formatDate(date) {
    if (!date) return "";
    if (typeof date === "string" && date.includes("-")) {
        const [y, m, d] = date.split("-");
        return `${d}/${m}/${y}`;
    }
    return "";
}

function formatMoney(num) {
    return `Q${Number(num).toFixed(2)}`;
}

function toSQLDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSunday(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay() === 0;
}

function monthName(month) {
    const nombre = new Date(2025, month, 1).toLocaleString("es-GT", { month: "long" });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function getCycleRange(date = new Date()) {
    let start;
    let end;
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();

    if (d >= 16) {
        start = new Date(y, m, 16);
        end = new Date(y, m + 1, 15);
    } else {
        start = new Date(y, m - 1, 16);
        end = new Date(y, m, 15);
    }

    return {
        start,
        end,
        startSQL: toSQLDate(start),
        endSQL: toSQLDate(end)
    };
}

// ============================
// CICLO
// ============================
function initCiclo() {
    document.getElementById("fecha").value = toSQLDate(new Date());

    document.getElementById("a-cobrar").addEventListener("change", (e) => {
        document.getElementById("bloque-cobro")
            .classList.toggle("d-none", e.target.value !== "true");
    });

    document.getElementById("form-soporte")
        .addEventListener("submit", guardarSoporte);

    const range = getCycleRange(fechaReferenciaCiclo);
    document.getElementById("ciclo-desde").value = range.startSQL;
    document.getElementById("ciclo-hasta").value = range.endSQL;

    document.getElementById("btn-ciclo-anterior")
        .addEventListener("click", () => {
            fechaReferenciaCiclo.setMonth(fechaReferenciaCiclo.getMonth() - 1);
            const r = getCycleRange(fechaReferenciaCiclo);
            document.getElementById("ciclo-desde").value = r.startSQL;
            document.getElementById("ciclo-hasta").value = r.endSQL;
            renderCiclo();
        });

    document.getElementById("btn-ciclo-siguiente")
        .addEventListener("click", () => {
            fechaReferenciaCiclo.setMonth(fechaReferenciaCiclo.getMonth() + 1);
            const r = getCycleRange(fechaReferenciaCiclo);
            document.getElementById("ciclo-desde").value = r.startSQL;
            document.getElementById("ciclo-hasta").value = r.endSQL;
            renderCiclo();
        });

    document.getElementById("btn-filtrar-ciclo")
        .addEventListener("click", renderCiclo);

    renderCiclo();
}

async function guardarSoporte(e) {
    e.preventDefault();

    const fecha = document.getElementById("fecha").value;
    const cantidad = Number(document.getElementById("cantidad").value);
    const cobrar = document.getElementById("a-cobrar").value === "true";

    if (isSunday(fecha)) {
        alert("No se permiten registros en domingo.");
        return;
    }

    const payload = {
        fecha,
        cantidad,
        a_cobrar: cobrar,
        precio_servicio: cobrar
            ? Number(document.getElementById("precio-servicio").value)
            : 0,
        num_factura: cobrar
            ? document.getElementById("num-factura").value
            : ""
    };

    const { error } = await db.from("soportes").insert([payload]);

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById("form-soporte").reset();
    document.getElementById("fecha").value = toSQLDate(new Date());
    document.getElementById("bloque-cobro").classList.add("d-none");

    renderCiclo();
    initMes();
    renderFinanzas();
}

async function renderCiclo() {
    const desdeSQL = document.getElementById("ciclo-desde").value;
    const hastaSQL = document.getElementById("ciclo-hasta").value;

    document.getElementById("rango-badge").textContent = `${formatDate(desdeSQL)} al ${formatDate(hastaSQL)}`;

    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", desdeSQL)
        .lte("fecha", hastaSQL)
        .order("fecha", { ascending: false });

    if (error) { console.error(error); return; }

    // LÓGICA DE AGRUPACIÓN POR FECHA
    const agrupados = {};
    (data || []).forEach(item => {
        if (!agrupados[item.fecha]) {
            agrupados[item.fecha] = { cantidad: 0, ids: [] };
        }
        agrupados[item.fecha].cantidad += item.cantidad;
        agrupados[item.fecha].ids.push(item.id);
    });

    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";
    let totalGlobal = 0;

    // Renderizar filas únicas por fecha
    Object.keys(agrupados).sort((a, b) => new Date(b) - new Date(a)).forEach(fecha => {
        const item = agrupados[fecha];
        totalGlobal += item.cantidad;
        
        tabla.innerHTML += `
            <tr>
                <td class="text-nowrap">${formatDate(fecha)}</td>
                <td><strong>${item.cantidad}</strong></td>
                <td class="text-secondary">Agrupado</td>
                <td>-</td>
                <td>-</td>
                <td>
                    <button class="btn btn-outline-danger btn-sm" onclick="eliminarSoporteGrupo('${item.ids.join(',')}')">❌</button>
                </td>
            </tr>
        `;
    });

    document.getElementById("total-soportes").textContent = totalGlobal;
    document.getElementById("rango").textContent = `${formatDate(desdeSQL)} - ${formatDate(hastaSQL)}`;
}

window.eliminarSoporteGrupo = async function (idsString) {
    if (!confirm("¿Eliminar todos los soportes de esta fecha?")) return;
    
    const ids = idsString.split(',');
    for (const id of ids) {
        await db.from("soportes").delete().eq("id", id);
    }
    renderCiclo();
    initMes();
    renderFinanzas();
};

// ============================
// ESTADÍSTICAS DEL MES
// ============================
async function initMes() {
    const now = new Date();
    const currentYear = now.getFullYear();

    const h2Element = document.getElementById("nombre-mes");
    let selectMes = document.getElementById("filtro-mes-grafica");
    let mesSeleccionado = now.getMonth();

    if (h2Element && h2Element.tagName === "H2") {
        selectMes = document.createElement("select");
        selectMes.id = "filtro-mes-grafica";
        selectMes.className =
            "form-select form-select-lg mb-4 text-center fw-bold text-primary w-auto mx-auto";
        h2Element.replaceWith(selectMes);
    } else if (selectMes) {
        mesSeleccionado = Number(selectMes.value);
    }

    if (selectMes) {
        selectMes.innerHTML = "";
        for (let i = 0; i < 12; i++) {
            selectMes.innerHTML += `<option value="${i}">${monthName(i)}</option>`;
        }
        selectMes.value = mesSeleccionado;
        selectMes.removeEventListener("change", actualizarTarjetasMes);
        selectMes.addEventListener("change", actualizarTarjetasMes);
    }

    const startOfLastYear = new Date(currentYear - 1, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);

    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", toSQLDate(startOfLastYear))
        .lte("fecha", toSQLDate(endOfYear));

    if (error) {
        console.error(error);
        return;
    }

    datosSoportesAnioActual = [];
    datosSoportesAnioAnterior = [];

    (data || []).forEach(row => {
        const rowYear = Number(row.fecha.split("-")[0]);

        if (rowYear === currentYear) {
            datosSoportesAnioActual.push(row);
        } else if (rowYear === currentYear - 1) {
            datosSoportesAnioAnterior.push(row);
        }
    });

    actualizarTarjetasMes();
    renderGraficaMesAnual();
}

function actualizarTarjetasMes() {
    const selectMes = document.getElementById("filtro-mes-grafica");
    const selectedMonth = selectMes
        ? Number(selectMes.value)
        : new Date().getMonth();

    let totalSoportes = 0;
    let totalSoportesAnterior = 0;
    const META = 100;

    datosSoportesAnioActual.forEach(row => {
        const mes = Number(row.fecha.split("-")[1]) - 1;
        if (mes === selectedMonth) totalSoportes += row.cantidad;
    });

    datosSoportesAnioAnterior.forEach(row => {
        const mes = Number(row.fecha.split("-")[1]) - 1;
        if (mes === selectedMonth) totalSoportesAnterior += row.cantidad;
    });

    const soportesHtml = document.getElementById("total-soportes-mes");
    if (soportesHtml) soportesHtml.textContent = totalSoportes;

    const comparacionHtml = document.getElementById("comparacion-mes");
    if (comparacionHtml) {
        const diferencia = totalSoportes - totalSoportesAnterior;

        if (diferencia > 0) {
            comparacionHtml.innerHTML = `↑ +${diferencia} vs año pasado`;
            comparacionHtml.className = "badge bg-success mt-2 fs-6";
        } else if (diferencia < 0) {
            comparacionHtml.innerHTML = `↓ ${diferencia} vs año pasado`;
            comparacionHtml.className = "badge bg-danger mt-2 fs-6";
        } else {
            comparacionHtml.innerHTML = `= Igual al año pasado`;
            comparacionHtml.className = "badge bg-secondary mt-2 fs-6";
        }
    }

        const tarjetaMeta = document.getElementById("tarjeta-meta");
    const tituloMeta = document.getElementById("titulo-meta");
    const faltantesHtml = document.getElementById("total-faltantes-mes");

    if (faltantesHtml && tarjetaMeta && tituloMeta) {
        const faltantes = META - totalSoportes;

        if (faltantes > 0) {
            tituloMeta.textContent = `Faltan para la Meta (${META})`;
            faltantesHtml.textContent = faltantes;
            tarjetaMeta.className =
                "p-4 text-center h-100 border rounded shadow-sm bg-white border-warning-subtle d-flex flex-column justify-content-center align-items-center";
            faltantesHtml.className = "display-4 text-warning mb-0 fw-bold";
        } else {
            tituloMeta.textContent = "¡Meta Mensual Lograda! 🎉";
            faltantesHtml.textContent = `+${Math.abs(faltantes)}`;
            tarjetaMeta.className =
                "p-4 text-center h-100 border rounded shadow-sm bg-success-subtle border-success d-flex flex-column justify-content-center align-items-center";
            faltantesHtml.className = "display-4 text-success mb-0 fw-bold";
        }
    }
}

function renderGraficaMesAnual() {
    const currentYear = new Date().getFullYear();
    const soportesPorMesActual = new Array(12).fill(0);
    const soportesPorMesAnterior = new Array(12).fill(0);

    datosSoportesAnioActual.forEach(row => {
        const mes = Number(row.fecha.split("-")[1]) - 1;
        soportesPorMesActual[mes] += row.cantidad;
    });

    datosSoportesAnioAnterior.forEach(row => {
        const mes = Number(row.fecha.split("-")[1]) - 1;
        soportesPorMesAnterior[mes] += row.cantidad;
    });

    const ctx = document.getElementById("grafica-mes").getContext("2d");

    if (chartMesInstance) chartMesInstance.destroy();

    const labelsMeses = [
        "Ene","Feb","Mar","Abr","May","Jun",
        "Jul","Ago","Sep","Oct","Nov","Dic"
    ];

    chartMesInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labelsMeses,
            datasets: [
                {
                    label: `Año Actual (${currentYear})`,
                    data: soportesPorMesActual,
                    backgroundColor: "rgba(13,110,253,0.2)",
                    borderColor: "rgba(13,110,253,1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                },
                {
                    label: `Año Anterior (${currentYear - 1})`,
                    data: soportesPorMesAnterior,
                    backgroundColor: "transparent",
                    borderColor: "rgba(108,117,125,0.7)",
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    position: "top"
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// ============================
// FINANZAS
// ============================
function initFinanzas() {
    const filtro = document.getElementById("filtro-mes");
    const now = new Date();

    filtro.innerHTML = "";

    for (let i = 0; i < 12; i++) {
        filtro.innerHTML += `<option value="${i}">${monthName(i)}</option>`;
    }

    filtro.value = now.getMonth();

    const formFinanzas = document.getElementById("form-finanza");

    formFinanzas.removeEventListener("submit", guardarMovimiento);
    formFinanzas.addEventListener("submit", guardarMovimiento);

    filtro.removeEventListener("change", renderFinanzas);
    filtro.addEventListener("change", renderFinanzas);

    renderFinanzas();
}

async function guardarMovimiento(e) {
    e.preventDefault();

    const descripcion = document.getElementById("descripcion").value;
    const monto = Number(document.getElementById("monto").value);
    const tipo = document.getElementById("tipo").value;
    const periodo = document.getElementById("periodo-movimiento").value;

    const mesSeleccionado = Number(
        document.getElementById("filtro-mes").value
    );

    const yearActual = new Date().getFullYear();
    let fechaCalculada;

    if (periodo === "quincena") {
        fechaCalculada = toSQLDate(
            new Date(yearActual, mesSeleccionado, 15)
        );
    } else {
        fechaCalculada = toSQLDate(
            new Date(yearActual, mesSeleccionado + 1, 0)
        );
    }

    const payload = {
        fecha: fechaCalculada,
        descripcion,
        monto,
        tipo
    };

    const { error } = await db.from("gastos").insert([payload]);

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById("descripcion").value = "";
    document.getElementById("monto").value = "";

    renderFinanzas();
}

async function calcularComisionCiclo(selectedMonth) {
    const year = new Date().getFullYear();
    let start;
    let end;

    if (selectedMonth === 0) {
        start = new Date(year - 1, 11, 16);
        end = new Date(year, 0, 15);
    } else {
        start = new Date(year, selectedMonth - 1, 16);
        end = new Date(year, selectedMonth, 15);
    }

    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", toSQLDate(start))
        .lte("fecha", toSQLDate(end));

    if (error) {
        console.error(error);
        return { soportes: 0, comision: 0 };
    }

    let totalSoportes = 0;

    (data || []).forEach(item => {
        totalSoportes += item.cantidad;
    });

    return {
        soportes: totalSoportes,
        comision: totalSoportes * TARIFA
    };
}

async function renderFinanzas() {
    const month = Number(document.getElementById("filtro-mes").value);
    const year = new Date().getFullYear();

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);

    const { data, error } = await db
        .from("gastos")
        .select("*")
        .gte("fecha", toSQLDate(start))
        .lte("fecha", toSQLDate(end))
        .order("fecha", { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    const tablaQ = document.getElementById("tabla-quincena");
    const tablaF = document.getElementById("tabla-finmes");

    tablaQ.innerHTML = "";
    tablaF.innerHTML = "";

    let totalQ = 0;
    let totalF = 0;

    const ciclo = await calcularComisionCiclo(month);

    tablaF.innerHTML += `
        <tr class="table-primary">
            <td><strong>Soportes Realizados (${ciclo.soportes})</strong></td>
            <td class="text-end"><strong>${formatMoney(ciclo.comision)}</strong></td>
            <td></td>
        </tr>
    `;

    totalF += ciclo.comision;

    (data || []).forEach(mov => {
        const day = Number(mov.fecha.split("-")[2]);
        const isGasto = mov.tipo === "gasto";
        const signed = isGasto
            ? -Number(mov.monto)
            : Number(mov.monto);

        const textClass = isGasto
            ? "text-danger"
            : "text-success";

        const row = `
            <tr>
                <td>${mov.descripcion}</td>
                <td class="text-end ${textClass}">
                    ${formatMoney(signed)}
                </td>
                <td class="text-center">
                    <button
                        class="btn btn-outline-danger btn-sm p-0 px-2"
                        onclick="eliminarGasto(${mov.id})"
                    >
                        ❌
                    </button>
                </td>
            </tr>
        `;

        if (day <= 15) {
            tablaQ.innerHTML += row;
            totalQ += signed;
        } else {
            tablaF.innerHTML += row;
            totalF += signed;
        }
    });

    tablaQ.innerHTML += `
        <tr class="table-light">
            <td><strong class="fs-5">Total Neto</strong></td>
            <td class="text-end">
                <strong class="fs-5 ${totalQ < 0 ? "text-danger" : "text-success"}">
                    ${formatMoney(totalQ)}
                </strong>
            </td>
            <td></td>
        </tr>
    `;

    tablaF.innerHTML += `
        <tr class="table-light">
            <td><strong class="fs-5">Total Neto</strong></td>
            <td class="text-end">
                <strong class="fs-5 ${totalF < 0 ? "text-danger" : "text-success"}">
                    ${formatMoney(totalF)}
                </strong>
            </td>
            <td></td>
        </tr>
    `;
}

window.eliminarGasto = async function (id) {
    if (!confirm("¿Eliminar movimiento?")) return;

    const { error } = await db
        .from("gastos")
        .delete()
        .eq("id", id);

    if (error) {
        alert(error.message);
        return;
    }

    renderFinanzas();
};
