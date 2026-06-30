// ============================
// CONFIGURACIÓN DE SUPABASE
// ============================
const supabaseUrl = 'https://dbherfalxtdpuekdquso.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGVyZmFseHRkcHVla2RxdXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY5NTgsImV4cCI6MjA5MzA2Mjk1OH0.ERCeSP2s_0LfPGL5FYy-dKbMIlyRt8Gvg8aZ47DgITA';

const db = window.supabase.createClient(supabaseUrl, supabaseKey);
const TARIFA = 14.50;


            // CONFIGURACIÓN SUPABASE (Asegúrate de tener tus credenciales)

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
    initCiclo();
    initFinanzas();
});

// ============================
// MÓDULO: CICLO
// ============================
async function initCiclo() {
    // Configuración de fechas iniciales
    const hoy = new Date();
    document.getElementById("ciclo-desde").value = toSQLDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    document.getElementById("ciclo-hasta").value = toSQLDate(hoy);

    document.getElementById("btn-filtrar-ciclo").addEventListener("click", renderCiclo);
    document.getElementById("form-soporte").addEventListener("submit", guardarSoporte);
    document.getElementById("btn-enviar-facturado").addEventListener("click", procesarEnvioFacturado);
    
    renderCiclo();
}

async function renderCiclo() {
    const desdeSQL = document.getElementById("ciclo-desde").value;
    const hastaSQL = document.getElementById("ciclo-hasta").value;

    document.getElementById("rango-badge").textContent = `${formatDate(desdeSQL)} al ${formatDate(hastaSQL)}`;

    const { data } = await db.from("soportes").select("*").gte("fecha", desdeSQL).lte("fecha", hastaSQL).order("fecha", { ascending: false });

    const agrupados = {};
    (data || []).forEach(item => {
        if (!agrupados[item.fecha]) agrupados[item.fecha] = { cantidad: 0, ids: [], precios: [], facturas: [] };
        agrupados[item.fecha].cantidad += item.cantidad;
        agrupados[item.fecha].ids.push(item.id);
        if (item.precio_servicio > 0) agrupados[item.fecha].precios.push(formatMoney(item.precio_servicio));
        if (item.num_factura && item.num_factura.trim() !== "") agrupados[item.fecha].facturas.push(item.num_factura);
    });

    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";
    
    Object.keys(agrupados).sort((a, b) => new Date(b) - new Date(a)).forEach(fecha => {
        const item = agrupados[fecha];
        tabla.innerHTML += `
            <tr>
                <td>${formatDate(fecha)}</td>
                <td><strong>${item.cantidad}</strong></td>
                <td>${item.precios.length > 0 ? item.precios.join(", ") : "-"}</td>
                <td>${item.facturas.length > 0 ? item.facturas.join(", ") : "-"}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-success" onclick="ajustarCantidad('${fecha}', 1)">+</button>
                        <button class="btn btn-outline-warning" onclick="ajustarCantidad('${fecha}', -1)">-</button>
                        <button class="btn btn-outline-info" onclick="enviarCorreoFecha('${fecha}')">📧</button>
                        <button class="btn btn-outline-danger" onclick="eliminarSoporteGrupo('${item.ids.join(',')}')">❌</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.ajustarCantidad = async function(fecha, cambio) {
    if (cambio > 0) {
        await db.from("soportes").insert([{ fecha: fecha, cantidad: 1, a_cobrar: false }]);
    } else {
        const { data } = await db.from("soportes").select("id").eq("fecha", fecha).limit(1);
        if (data?.length > 0) await db.from("soportes").delete().eq("id", data[0].id);
    }
    renderCiclo();
};

window.eliminarSoporteGrupo = async function(idsString) {
    if (!confirm("¿Eliminar todos los registros de esta fecha?")) return;
    const ids = idsString.split(',');
    await db.from("soportes").delete().in("id", ids);
    renderCiclo();
};

async function procesarEnvioFacturado() {
    const desde = document.getElementById("ciclo-desde").value;
    const hasta = document.getElementById("ciclo-hasta").value;
    const { data } = await db.from("soportes").select("*").gte("fecha", desde).lte("fecha", hasta);
    
    const facturados = data.filter(s => s.precio_servicio > 0 && s.num_factura?.trim() !== "");
    if (facturados.length === 0) return alert("No hay soportes facturados en este rango.");

    let cuerpo = `Detalle de Facturación (${desde} al ${hasta}):\n\n`;
    let total = 0;
    facturados.forEach(s => {
        cuerpo += `Fecha: ${s.fecha} | Factura: ${s.num_factura} | Precio: Q${s.precio_servicio}\n`;
        total += Number(s.precio_servicio);
    });
    cuerpo += `\nTotal: Q${total.toFixed(2)}`;

    window.location.href = `mailto:rorosco@grupoprinter.com?subject=${encodeURIComponent("Facturado (" + desde + " al " + hasta + ")")}&body=${encodeURIComponent(cuerpo)}`;
}

// ============================
// MÓDULO: FINANZAS
// ============================
function initFinanzas() {
    const filtro = document.getElementById("filtro-mes");
    filtro.innerHTML = Array.from({length: 12}, (_, i) => `<option value="${i}">${monthName(i)}</option>`).join("");
    filtro.value = new Date().getMonth();
    
    document.getElementById("form-finanza").addEventListener("submit", guardarMovimiento);
    filtro.addEventListener("change", renderFinanzas);
    
    // Lógica selector tipo
    document.getElementById("tipo").addEventListener("change", (e) => {
        const isPago = e.target.value === "pago_soportes";
        document.getElementById("descripcion").disabled = isPago;
        document.getElementById("periodo-movimiento").disabled = isPago;
        if(isPago) {
            document.getElementById("descripcion").value = "Comisiones por Soportes";
            document.getElementById("periodo-movimiento").value = "fin_mes";
        }
    });

    renderFinanzas();
}

async function guardarMovimiento(e) {
    e.preventDefault();
    const tipo = document.getElementById("tipo").value;
    const payload = {
        fecha: toSQLDate(new Date(new Date().getFullYear(), Number(document.getElementById("filtro-mes").value), tipo === "quincena" ? 15 : 30)),
        descripcion: document.getElementById("descripcion").value,
        monto: Number(document.getElementById("monto").value),
        tipo: tipo
    };
    await db.from("gastos").insert([payload]);
    renderFinanzas();
}

async function renderFinanzas() {
    const month = Number(document.getElementById("filtro-mes").value);
    const { data } = await db.from("gastos").select("*").gte("fecha", toSQLDate(new Date(2026, month, 1))).lte("fecha", toSQLDate(new Date(2026, month + 1, 0)));

    const tablaQ = document.getElementById("tabla-quincena");
    const tablaF = document.getElementById("tabla-finmes");
    tablaQ.innerHTML = tablaF.innerHTML = "";
    
    let totalQ = 0, totalF = 0;
    
    (data || []).forEach(mov => {
        const day = Number(mov.fecha.split("-")[2]);
        const isGasto = mov.tipo === "gasto";
        const val = isGasto ? -mov.monto : mov.monto;
        const row = `<tr><td>${mov.descripcion}</td><td class="text-end ${isGasto ? 'text-danger' : 'text-success'}">${formatMoney(val)}</td><td><button class="btn btn-sm btn-outline-danger" onclick="eliminarGasto(${mov.id})">❌</button></td></tr>`;
        
        if (day <= 15) { totalQ += val; tablaQ.innerHTML += row; }
        else { totalF += val; tablaF.innerHTML += row; }
    });
}

window.eliminarGasto = async (id) => {
    await db.from("gastos").delete().eq("id", id);
    renderFinanzas();
};
