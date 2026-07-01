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
async function initCiclo() {
    const hoy = new Date();
    const desde = hoy.getDate() >= 16 ? new Date(hoy.getFullYear(), hoy.getMonth(), 16) : new Date(hoy.getFullYear(), hoy.getMonth() - 1, 16);
    const hasta = hoy.getDate() >= 16 ? new Date(hoy.getFullYear(), hoy.getMonth() + 1, 15) : new Date(hoy.getFullYear(), hoy.getMonth(), 15);
    
    document.getElementById("fecha").value = toSQLDate(new Date());
    document.getElementById("ciclo-desde").value = toSQLDate(desde);
    document.getElementById("ciclo-hasta").value = toSQLDate(hasta);

    document.getElementById("btn-filtrar-ciclo").addEventListener("click", () => { renderCiclo(); renderEstadisticas(); });
    document.getElementById("form-soporte").addEventListener("submit", guardarSoporte);
    renderCiclo();
}

async function guardarSoporte(e) {
    e.preventDefault();
    const aCobrar = document.getElementById("a-cobrar").value === "true";
    const payload = {
        fecha: document.getElementById("fecha").value,
        cantidad: Number(document.getElementById("cantidad").value),
        a_cobrar: aCobrar,
        precio_servicio: aCobrar ? Number(document.getElementById("precio-servicio").value) : 0,
        num_factura: aCobrar ? document.getElementById("num-factura").value : ""
    };
    await db.from("soportes").insert([payload]);
    renderCiclo();
    renderEstadisticas();
}

async function renderCiclo() {
    const desde = document.getElementById("ciclo-desde").value;
    const hasta = document.getElementById("ciclo-hasta").value;
    document.getElementById("rango-badge").textContent = `${formatDate(desde)} al ${formatDate(hasta)}`;

    const { data } = await db.from("soportes").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false });
    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";
    (data || []).forEach(item => {
        tabla.innerHTML += `<tr><td>${formatDate(item.fecha)}</td><td>${item.cantidad}</td><td>${item.precio_servicio > 0 ? formatMoney(item.precio_servicio) : '-'}</td>
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
    let total = data.reduce((acc, s) => acc + Number(s.cantidad), 0);
    document.getElementById("total-soportes-mes").textContent = total;
    
    renderFinanzas(desde, hasta);
}

async function renderFinanzas(desde, hasta) {
    const { data: soportes } = await db.from("soportes").select("*").gte("fecha", desde).lte("fecha", hasta);
    const totalSoportes = soportes.reduce((acc, s) => acc + (Number(s.precio_servicio) || 0), 0);
    const cantSoportes = soportes.reduce((acc, s) => acc + (Number(s.cantidad) || 0), 0);

    const tablaF = document.getElementById("tabla-finmes");
    // Fila que muestra el total del ciclo y permite borrarla para "quitarla" de la vista
    tablaF.innerHTML = `
        <tr class="table-info">
            <td><strong>Total Ciclo (${cantSoportes} soportes)</strong></td>
            <td class="text-end fw-bold text-success">+${formatMoney(totalSoportes)}</td>
            <td><button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove()">❌</button></td>
        </tr>`;
}

window.eliminarSoporte = async (id) => {
    await db.from("soportes").delete().eq("id", id);
    renderCiclo(); 
    renderEstadisticas();
};
