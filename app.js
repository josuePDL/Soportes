// Configuración de Supabase
const supabaseUrl = 'https://dbherfalxtdpuekdquso.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGVyZmFseHRkcHVla2RxdXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY5NTgsImV4cCI6MjA5MzA2Mjk1OH0.ERCeSP2s_0LfPGL5FYy-dKbMIlyRt8Gvg8aZ47DgITA';

const db = window.supabase.createClient(supabaseUrl, supabaseKey);
const TARIFA = 14.50;

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

function monthName(month) {
    const nombre = new Date(2025, month, 1).toLocaleString("es-GT", {
        month: "long"
    });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

// ============================
// CICLO
// ============================
function initCiclo() {
    document.getElementById("fecha").value = toSQLDate(new Date());

    document.getElementById("a-cobrar").addEventListener("change", (e) => {
        document
            .getElementById("bloque-cobro")
            .classList.toggle("d-none", e.target.value !== "true");
    });

    document
        .getElementById("form-soporte")
        .addEventListener("submit", guardarSoporte);

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

    renderCiclo();
    initMes(); // Actualiza gráfica y mes automáticamente
}

async function renderCiclo() {
    const range = getCycleRange();

    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", range.startSQL)
        .lte("fecha", range.endSQL)
        .order("fecha", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";

    let total = 0;

    (data || []).forEach(item => {
        total += item.cantidad;

        tabla.innerHTML += `
            <tr>
                <td>${formatDate(item.fecha)}</td>
                <td>${item.cantidad}</td>
                <td>${formatMoney(item.cantidad * TARIFA)}</td>
                <td>${item.a_cobrar ? "Sí" : "No"}</td>
                <td>${formatMoney(item.precio_servicio)}</td>
                <td>${item.num_factura || ""}</td>
                <td>
                    <button class="btn btn-danger btn-sm"
                        onclick="eliminarSoporte(${item.id})">
                        X
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById("total-soportes").textContent = total;
    document.getElementById("salario").textContent = formatMoney(total * TARIFA);

    document.getElementById("rango").textContent =
        `${formatDate(range.startSQL)} - ${formatDate(range.endSQL)}`;
}

window.eliminarSoporte = async function (id) {
    if (!confirm("¿Eliminar soporte?")) return;

    await db.from("soportes").delete().eq("id", id);
    renderCiclo();
    initMes(); 
};

// ============================
// MES (Gráfica y Selector)
// ============================
let chartMesInstance = null; 
let datosSoportesAnio = []; 

async function initMes() {
    const now = new Date();
    const currentYear = now.getFullYear();

    const h2Element = document.getElementById("nombre-mes");
    let selectMes = document.getElementById("filtro-mes-grafica");
    let mesSeleccionado = now.getMonth(); 

    if (h2Element && h2Element.tagName === "H2") {
        selectMes = document.createElement("select");
        selectMes.id = "filtro-mes-grafica";
        selectMes.className = "form-select form-select-lg mb-4 text-center fw-bold text-primary w-auto mx-auto";
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

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);

    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", toSQLDate(startOfYear))
        .lte("fecha", toSQLDate(endOfYear));

    if (error) {
        console.error(error);
        return;
    }

    datosSoportesAnio = data || [];

    actualizarTarjetasMes();
    renderGraficaMesAnual();
}

function actualizarTarjetasMes() {
    const selectMes = document.getElementById("filtro-mes-grafica");
    const selectedMonth = selectMes ? Number(selectMes.value) : new Date().getMonth();
    
    let totalSoportes = 0;

    datosSoportesAnio.forEach(row => {
        const [año, mes, dia] = row.fecha.split("-").map(Number);
        const recordMonth = mes - 1; 

        if (recordMonth === selectedMonth) {
            totalSoportes += row.cantidad;
        }
    });

    const soportesHtml = document.getElementById("total-soportes-mes");
    if (soportesHtml) soportesHtml.textContent = totalSoportes;
}

function renderGraficaMesAnual() {
    const soportesPorMes = new Array(12).fill(0);
    
    datosSoportesAnio.forEach(row => {
        const [año, mes, dia] = row.fecha.split("-").map(Number);
        const recordMonth = mes - 1;
        soportesPorMes[recordMonth] += row.cantidad;
    });

    const ctx = document.getElementById('grafica-mes').getContext('2d');
    
    if (chartMesInstance) {
        chartMesInstance.destroy();
    }

    const labelsMeses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    chartMesInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsMeses,
            datasets: [{
                label: 'Soportes Totales',
                data: soportesPorMes,
                backgroundColor: 'rgba(13, 110, 253, 0.7)', 
                borderColor: 'rgba(13, 110, 253, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 
                    }
                }
            }
        }
    });
}

// ============================
// FINANZAS (Cálculo automático de fecha)
// ============================
function initFinanzas() {
    const filtro = document.getElementById("filtro-mes");
    const now = new Date();

    filtro.innerHTML = ""; 
    for (let i = 0; i < 12; i++) {
        filtro.innerHTML += `
            <option value="${i}">${monthName(i)}</option>
        `;
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

    const mesSeleccionado = Number(document.getElementById("filtro-mes").value);
    const yearActual = new Date().getFullYear();
    
    let fechaCalculada;

    if (periodo === "quincena") {
        fechaCalculada = toSQLDate(new Date(yearActual, mesSeleccionado, 15));
    } else {
        fechaCalculada = toSQLDate(new Date(yearActual, mesSeleccionado + 1, 0));
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
        return {
            soportes: 0,
            comision: 0
        };
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
        <tr>
            <td><strong>Comisiones por Soportes (${ciclo.soportes})</strong></td>
            <td><strong>${formatMoney(ciclo.comision)}</strong></td>
            <td></td>
        </tr>
    `;

    totalF += ciclo.comision;

    (data || []).forEach(mov => {
        const day = Number(mov.fecha.split("-")[2]);
        const signed =
            mov.tipo === "gasto"
                ? -Number(mov.monto)
                : Number(mov.monto);

        const row = `
            <tr>
                <td>${mov.descripcion}</td>
                <td>${formatMoney(signed)}</td>
                <td>
                    <button class="btn btn-danger btn-sm"
                        onclick="eliminarGasto(${mov.id})">
                        X
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
        <tr>
            <td><strong>Total Neto</strong></td>
            <td><strong>${formatMoney(totalQ)}</strong></td>
            <td></td>
        </tr>
    `;

    tablaF.innerHTML += `
        <tr>
            <td><strong>Total Neto</strong></td>
            <td><strong>${formatMoney(totalF)}</strong></td>
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
