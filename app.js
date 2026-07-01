// ============================
// CONFIGURACIÓN SUPABASE
// ============================
const db = supabase.createClient(
    'https://dbherfalxtdpuekdquso.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGVyZmFseHRkcHVla2RxdXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODY5NTgsImV4cCI6MjA5MzA2Mjk1OH0.ERCeSP2s_0LfPGL5FYy-dKbMIlyRt8Gvg8aZ47DgITA'
);

let graficaMes = null;

// ============================
// UTILIDADES
// ============================
const formatDate = (date) => new Date(date + "T00:00:00").toLocaleDateString("es-GT", { month: "short", day: "numeric" });
const formatMoney = (amount) => `Q${Number(amount).toFixed(2)}`;
const toSQLDate = (date) => date.toISOString().split("T")[0];
const monthName = (idx) => ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][idx];

// ============================
// INICIALIZACIÓN
// ============================
document.addEventListener("DOMContentLoaded", () => {
    initCiclo();
    initFinanzas();
    renderEstadisticas();

    document.getElementById("a-cobrar").addEventListener("change", function () {
        document.getElementById("bloque-cobro").classList.toggle("d-none", this.value !== "true");
    });
});

// ============================
// LÓGICA DE CICLO
// ============================
function obtenerCicloActual() {
    const hoy = new Date();
    let desde, hasta;
    if (hoy.getDate() >= 16) {
        desde = new Date(hoy.getFullYear(), hoy.getMonth(), 16);
        hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 15);
    } else {
        desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 16);
        hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 15);
    }
    return { desde, hasta };
}

async function initCiclo() {
    const ciclo = obtenerCicloActual();
    document.getElementById("fecha").value = toSQLDate(new Date());
    document.getElementById("ciclo-desde").value = toSQLDate(ciclo.desde);
    document.getElementById("ciclo-hasta").value = toSQLDate(ciclo.hasta);

    document.getElementById("btn-filtrar-ciclo").addEventListener("click", () => { renderCiclo(); renderEstadisticas(); });
    document.getElementById("form-soporte").addEventListener("submit", guardarSoporte);
    document.getElementById("btn-enviar-facturado").addEventListener("click", procesarEnvioFacturado);
    document.getElementById("btn-ciclo-anterior").addEventListener("click", () => desplazarCiclo(-1));
    document.getElementById("btn-ciclo-siguiente").addEventListener("click", () => desplazarCiclo(1));
    renderCiclo();
}

function desplazarCiclo(direccion) {
    const desde = new Date(document.getElementById("ciclo-desde").value + "T00:00:00");
    const nuevoDesde = new Date(desde.getFullYear(), desde.getMonth() + direccion, 16);
    const nuevoHasta = new Date(desde.getFullYear(), desde.getMonth() + direccion + 1, 15);
    document.getElementById("ciclo-desde").value = toSQLDate(nuevoDesde);
    document.getElementById("ciclo-hasta").value = toSQLDate(nuevoHasta);
    renderCiclo();
    renderEstadisticas();
}

async function guardarSoporte(e) {
    e.preventDefault();
    const payload = {
        fecha: document.getElementById("fecha").value,
        cantidad: Number(document.getElementById("cantidad").value),
        a_cobrar: document.getElementById("a-cobrar").value === "true",
        precio_servicio: document.getElementById("a-cobrar").value === "true" ? Number(document.getElementById("precio-servicio").value) : 0,
        num_factura: document.getElementById("a-cobrar").value === "true" ? document.getElementById("num-factura").value : "",
        liquidado: false
    };
    await db.from("soportes").insert([payload]);
    document.getElementById("form-soporte").reset();
    renderCiclo();
    renderEstadisticas();
}

async function renderCiclo() {
    const desdeSQL = document.getElementById("ciclo-desde").value;
    const hastaSQL = document.getElementById("ciclo-hasta").value;
    document.getElementById("rango-badge").textContent = `${formatDate(desdeSQL)} al ${formatDate(hastaSQL)}`;

    const { data } = await db.from("soportes").select("*").gte("fecha", desdeSQL).lte("fecha", hastaSQL).order("fecha", { ascending: false });
    
    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";
    (data || []).forEach(item => {
        tabla.innerHTML += `<tr><td>${formatDate(item.fecha)}</td><td>${item.cantidad}</td><td>${item.precio_servicio > 0 ? formatMoney(item.precio_servicio) : '-'}</td><td>${item.num_factura || '-'}</td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarSoporte(${item.id})">❌</button></td></tr>`;
    });
}

// ============================
// LÓGICA DE FINANZAS Y ESTADÍSTICAS
// ============================
async function renderEstadisticas() {
    const desde = document.getElementById("ciclo-desde").value;
    const hasta = document.getElementById("ciclo-hasta").value;
    document.getElementById("nombre-mes").textContent = `Ciclo: ${formatDate(desde)} - ${formatDate(hasta)}`;

    const { data } = await db.from("soportes").select("*").gte("fecha", desde).lte("fecha", hasta);
    
    let total = 0;
    const porDia = {};
    (data || []).forEach(s => {
        total += Number(s.cantidad);
        porDia[s.fecha] = (porDia[s.fecha] || 0) + Number(s.cantidad);
    });

    document.getElementById("total-soportes-mes").textContent = total;
    renderFinanzas(desde, hasta);
}

async function renderFinanzas(desde, hasta) {
    const { data: gastos } = await db.from("gastos").select("*").gte("fecha", desde).lte("fecha", hasta);
    const { data: soportes } = await db.from("soportes").select("*").gte("fecha", desde).lte("fecha", hasta).eq("liquidado", false);

    const totalSoportes = soportes.reduce((acc, s) => acc + (Number(s.precio_servicio) || 0), 0);
    const cantSoportes = soportes.reduce((acc, s) => acc + (Number(s.cantidad) || 0), 0);

    const tablaF = document.getElementById("tabla-finmes");
    tablaF.innerHTML = `<tr><td><strong>Soportes ciclo (${cantSoportes})</strong></td><td class="text-success fw-bold">+${formatMoney(totalSoportes)}</td>
    <td><button class="btn btn-sm btn-outline-warning" onclick="liquidarCiclo()">✅</button></td></tr>`;
    
    // Aquí renderizarías el resto de tus gastos...
}

window.liquidarCiclo = async () => {
    const desde = document.getElementById("ciclo-desde").value;
    const hasta = document.getElementById("ciclo-hasta").value;
    await db.from("soportes").update({ liquidado: true }).gte("fecha", desde).lte("fecha", hasta).eq("liquidado", false);
    renderFinanzas(desde, hasta);
};

window.eliminarSoporte = async (id) => {
    await db.from("soportes").delete().eq("id", id);
    renderCiclo(); renderEstadisticas();
};
