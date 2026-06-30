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

// ... (Mantén tu configuración de Supabase, TARIFA, y funciones de utilidades) ...

// Actualización de renderCiclo con los nuevos botones
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

    // LÓGICA DE AGRUPACIÓN (Ahora recolecta facturas y precios)
    const agrupados = {};
    (data || []).forEach(item => {
        if (!agrupados[item.fecha]) {
            agrupados[item.fecha] = { 
                cantidad: 0, 
                ids: [], 
                precios: [], 
                facturas: [] 
            };
        }
        agrupados[item.fecha].cantidad += item.cantidad;
        agrupados[item.fecha].ids.push(item.id);
        
        // Solo guardamos si tienen valor
        if (item.precio_servicio > 0) agrupados[item.fecha].precios.push(formatMoney(item.precio_servicio));
        if (item.num_factura && item.num_factura.trim() !== "") agrupados[item.fecha].facturas.push(item.num_factura);
    });

    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";
    let totalGlobal = 0;

    // Renderizar filas
    Object.keys(agrupados).sort((a, b) => new Date(b) - new Date(a)).forEach(fecha => {
        const item = agrupados[fecha];
        totalGlobal += item.cantidad;
        
        // Unir precios y facturas con comas si hay varios
        const listaPrecios = item.precios.length > 0 ? item.precios.join(", ") : "-";
        const listaFacturas = item.facturas.length > 0 ? item.facturas.join(", ") : "-";
        
        tabla.innerHTML += `
            <tr>
                <td>${formatDate(fecha)}</td>
                <td><strong>${item.cantidad}</strong></td>
                <td>${listaPrecios}</td>
                <td>${listaFacturas}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-success" onclick="ajustarCantidad('${fecha}', 1)">+</button>
                        <button class="btn btn-outline-warning" onclick="ajustarCantidad('${fecha}', -1)">-</button>
                        <button class="btn btn-outline-danger" onclick="eliminarSoporteGrupo('${item.ids.join(',')}')">❌</button>
                    </div>
                </td>
            </tr>
        `;
    });

    document.getElementById("total-soportes").textContent = totalGlobal;
}

// NUEVA FUNCIÓN: Sumar o Restar cantidad
window.ajustarCantidad = async function(fecha, cambio) {
    if (cambio > 0) {
        // Agregar uno nuevo
        await db.from("soportes").insert([{ fecha: fecha, cantidad: 1, a_cobrar: false }]);
    } else {
        // Buscar uno existente y borrarlo
        const { data } = await db.from("soportes").select("id").eq("fecha", fecha).limit(1);
        if (data && data.length > 0) {
            await db.from("soportes").delete().eq("id", data[0].id);
        }
    }
    renderCiclo();
    initMes();
    renderFinanzas();
};

// NUEVA FUNCIÓN: Correo filtrado
document.getElementById("btn-enviar-facturado").addEventListener("click", procesarEnvioFacturado);

// Añade esta nueva función en tu app.js
async function procesarEnvioFacturado() {
    const desdeSQL = document.getElementById("ciclo-desde").value;
    const hastaSQL = document.getElementById("ciclo-hasta").value;

    // 1. Obtener todos los datos del rango actual
    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", desdeSQL)
        .lte("fecha", hastaSQL);

    if (error) { alert("Error al obtener datos: " + error.message); return; }

    // 2. Filtrar: solo los que tienen factura y precio > 0
    const facturados = data.filter(s => s.precio_servicio > 0 && s.num_factura && s.num_factura.trim() !== "");

    if (facturados.length === 0) {
        alert("No hay soportes con factura y precio en este periodo.");
        return;
    }

    // 3. Crear el cuerpo del correo
    let total = 0;
    let cuerpo = `Detalle de Facturación (${desdeSQL} al ${hastaSQL}):\n\n`;
    
    facturados.forEach(s => {
        cuerpo += `Fecha: ${s.fecha} | Factura: ${s.num_factura} | Cantidad: ${s.cantidad} | Precio: Q${s.precio_servicio}\n`;
        total += (s.cantidad * s.precio_servicio);
    });
    

    // 4. Abrir cliente de correo
    const mailtoLink = `mailto:rorosco@grupoprinter.com?subject=${encodeURIComponent("Facturado (" + desdeSQL + " al " + hastaSQL + ")")}&body=${encodeURIComponent(cuerpo)}`;
    window.location.href = mailtoLink;
}
// ... (El resto de tus funciones initMes, renderFinanzas, etc. se mantienen igual)

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
// MÓDULO: FINANZAS
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

    // Lógica inteligente para el formulario
    document.getElementById("tipo").addEventListener("change", function(e) {
        const esSoporte = e.target.value === "pago_soportes";
        const descInput = document.getElementById("descripcion");
        const periodoInput = document.getElementById("periodo-movimiento");

        if (esSoporte) {
            descInput.value = "Comisiones por Soportes";
            descInput.disabled = true; // Bloquea la descripción
            periodoInput.value = "fin_mes";
            periodoInput.disabled = true; // Bloquea el periodo (solo fin de mes)
        } else {
            descInput.value = "";
            descInput.disabled = false;
            periodoInput.disabled = false;
        }
    });

    renderFinanzas();
}

async function guardarMovimiento(e) {
    e.preventDefault();

    const tipo = document.getElementById("tipo").value;
    // Si los campos están bloqueados, tomamos su valor predeterminado
    const descripcion = tipo === "pago_soportes" ? "Comisiones por Soportes" : document.getElementById("descripcion").value;
    const periodo = tipo === "pago_soportes" ? "fin_mes" : document.getElementById("periodo-movimiento").value;
    const monto = Number(document.getElementById("monto").value);

    const mesSeleccionado = Number(document.getElementById("filtro-mes").value);
    const yearActual = new Date().getFullYear();
    let fechaCalculada = (periodo === "quincena") 
        ? toSQLDate(new Date(yearActual, mesSeleccionado, 15)) 
        : toSQLDate(new Date(yearActual, mesSeleccionado + 1, 0));

    const payload = { fecha: fechaCalculada, descripcion, monto, tipo };

    const { error } = await db.from("gastos").insert([payload]);
    if (error) { alert(error.message); return; }

    document.getElementById("monto").value = "";
    if (tipo !== "pago_soportes") {
        document.getElementById("descripcion").value = "";
    }

    renderFinanzas();
}

async function renderFinanzas() {
    const month = Number(document.getElementById("filtro-mes").value);
    const year = new Date().getFullYear();

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);

    const { data, error } = await db
        .from("gastos").select("*").gte("fecha", toSQLDate(start)).lte("fecha", toSQLDate(end)).order("fecha", { ascending: true });

    if (error) { console.error(error); return; }

    const tablaQ = document.getElementById("tabla-quincena");
    const tablaF = document.getElementById("tabla-finmes");

    tablaQ.innerHTML = ""; 
    tablaF.innerHTML = "";

    let totalQ = 0, totalF = 0;
    let ingresosQ = [], gastosQ = [], ingresosF = [], gastosF = [];

    // Fila puramente informativa (Ya NO suma automáticamente al total)
    const ciclo = await calcularComisionCiclo(month);
    const filaInfoSoportes = `
        <tr class="table-secondary text-muted">
            <td colspan="3" class="text-center">
                <small><em>Calculado por sistema: ${ciclo.soportes} soportes realizados (Aprox. ${formatMoney(ciclo.comision)})</em></small>
            </td>
        </tr>
    `;

    (data || []).forEach(mov => {
        const day = Number(mov.fecha.split("-")[2]);
        const isGasto = mov.tipo === "gasto";
        const isPagoSoportes = mov.tipo === "pago_soportes";
        const signed = isGasto ? -Number(mov.monto) : Number(mov.monto);
        const textClass = isGasto ? "text-danger" : "text-success";
        
        // Si es el pago de soportes real, lo resaltamos
        const bgClass = isPagoSoportes ? "table-primary fw-bold" : "";

        const fila = `
            <tr class="${bgClass}">
                <td>${mov.descripcion}</td>
                <td class="text-end ${textClass}">${formatMoney(signed)}</td>
                <td class="text-center"><button class="btn btn-outline-danger btn-sm p-0 px-2" onclick="eliminarGasto(${mov.id})">❌</button></td>
            </tr>
        `;

        if (day <= 15) { 
            totalQ += signed; 
            if (isGasto) gastosQ.push(fila); else ingresosQ.push(fila); 
        } else { 
            totalF += signed; 
            // Aseguramos que el pago de soportes quede siempre hasta arriba en ingresos
            if (isPagoSoportes) ingresosF.unshift(fila); 
            else if (isGasto) gastosF.push(fila); 
            else ingresosF.push(fila); 
        }
    });

    // Ensamblaje Quincena
    tablaQ.innerHTML = ingresosQ.join("") + gastosQ.join("") + `
        <tr class="table-light">
            <td><strong class="fs-5">Total Neto</strong></td>
            <td class="text-end"><strong class="fs-5 ${totalQ < 0 ? 'text-danger' : 'text-success'}">${formatMoney(totalQ)}</strong></td>
            <td></td>
        </tr>
    `;

    // Ensamblaje Fin de Mes (Info del sistema -> Pago Real -> Ingresos extras -> Gastos)
    tablaF.innerHTML = filaInfoSoportes + ingresosF.join("") + gastosF.join("") + `
        <tr class="table-light">
            <td><strong class="fs-5">Total Neto</strong></td>
            <td class="text-end"><strong class="fs-5 ${totalF < 0 ? 'text-danger' : 'text-success'}">${formatMoney(totalF)}</strong></td>
            <td></td>
        </tr>
    `;
}

window.eliminarGasto = async function (id) {
    if (!confirm("¿Eliminar movimiento?")) return;
    const { error } = await db.from("gastos").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    renderFinanzas();
};
