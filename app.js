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
const formatDate = (date) =>
    new Date(date + "T00:00:00").toLocaleDateString("es-GT", {
        month: "short",
        day: "numeric"
    });

const formatMoney = (amount) => `Q${Number(amount).toFixed(2)}`;
const toSQLDate = (date) => date.toISOString().split("T")[0];

const monthName = (idx) => [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
][idx];

// ============================
// INICIO
// ============================
document.addEventListener("DOMContentLoaded", () => {
    initCiclo();
    initFinanzas();
    renderEstadisticas();

    document.getElementById("a-cobrar").addEventListener("change", function () {
        document
            .getElementById("bloque-cobro")
            .classList.toggle("d-none", this.value !== "true");
    });
});

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

// ============================
// CICLO
// ============================
async function initCiclo() {
    const ciclo = obtenerCicloActual();

    document.getElementById("fecha").value = toSQLDate(new Date());
    document.getElementById("ciclo-desde").value = toSQLDate(ciclo.desde);
    document.getElementById("ciclo-hasta").value = toSQLDate(ciclo.hasta);

    document.getElementById("btn-filtrar-ciclo")
        .addEventListener("click", () => {
            renderCiclo();
            renderEstadisticas();
        });

    document.getElementById("form-soporte")
        .addEventListener("submit", guardarSoporte);

    document.getElementById("btn-enviar-facturado")
        .addEventListener("click", procesarEnvioFacturado);

    document.getElementById("btn-ciclo-anterior")
        .addEventListener("click", cicloAnterior);

    document.getElementById("btn-ciclo-siguiente")
        .addEventListener("click", cicloSiguiente);

    renderCiclo();
}

function cicloAnterior() {
    const desde = new Date(document.getElementById("ciclo-desde").value + "T00:00:00");
    const nuevoDesde = new Date(desde.getFullYear(), desde.getMonth() - 1, 16);
    const nuevoHasta = new Date(desde.getFullYear(), desde.getMonth(), 15);

    document.getElementById("ciclo-desde").value = toSQLDate(nuevoDesde);
    document.getElementById("ciclo-hasta").value = toSQLDate(nuevoHasta);

    renderCiclo();
    renderEstadisticas();
}

function cicloSiguiente() {
    const desde = new Date(document.getElementById("ciclo-desde").value + "T00:00:00");
    const nuevoDesde = new Date(desde.getFullYear(), desde.getMonth() + 1, 16);
    const nuevoHasta = new Date(desde.getFullYear(), desde.getMonth() + 2, 15);

    document.getElementById("ciclo-desde").value = toSQLDate(nuevoDesde);
    document.getElementById("ciclo-hasta").value = toSQLDate(nuevoHasta);

    renderCiclo();
    renderEstadisticas();
}

async function guardarSoporte(e) {
    e.preventDefault();

    const fecha = document.getElementById("fecha").value;
    const cantidad = Number(document.getElementById("cantidad").value);
    const aCobrar = document.getElementById("a-cobrar").value === "true";

    let precio = 0;
    let factura = "";

    if (aCobrar) {
        precio = Number(document.getElementById("precio-servicio").value);
        factura = document.getElementById("num-factura").value;
    }

    const payload = {
        fecha,
        cantidad,
        a_cobrar: aCobrar,
        precio_servicio: precio,
        num_factura: factura
    };

    const { error } = await db.from("soportes").insert([payload]);

    if (error) {
        console.error(error);
        alert("Error guardando soporte");
        return;
    }

    document.getElementById("form-soporte").reset();
    document.getElementById("fecha").value = toSQLDate(new Date());

    renderCiclo();
    renderEstadisticas();
}

async function renderCiclo() {
    const desdeSQL = document.getElementById("ciclo-desde").value;
    const hastaSQL = document.getElementById("ciclo-hasta").value;

    document.getElementById("rango-badge").textContent =
        `${formatDate(desdeSQL)} al ${formatDate(hastaSQL)}`;

    const { data } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", desdeSQL)
        .lte("fecha", hastaSQL)
        .order("fecha", { ascending: false });

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

        if (item.precio_servicio > 0) {
            agrupados[item.fecha].precios.push(formatMoney(item.precio_servicio));
        }

        if (item.num_factura) {
            agrupados[item.fecha].facturas.push(item.num_factura);
        }
    });

    const tabla = document.getElementById("tabla-soportes");
    tabla.innerHTML = "";
    Object.keys(agrupados)
        .sort((a, b) => new Date(b) - new Date(a))
        .forEach(fecha => {
            const item = agrupados[fecha];

            tabla.innerHTML += `
                <tr>
                    <td>${formatDate(fecha)}</td>
                    <td><strong>${item.cantidad}</strong></td>
                    <td>${item.precios.length ? item.precios.join(", ") : "-"}</td>
                    <td>${item.facturas.length ? item.facturas.join(", ") : "-"}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-success" onclick="ajustarCantidad('${fecha}',1)">+</button>
                            <button class="btn btn-outline-warning" onclick="ajustarCantidad('${fecha}',-1)">-</button>
                            <button class="btn btn-outline-danger" onclick="eliminarSoporteGrupo('${item.ids.join(",")}')">❌</button>
                        </div>
                    </td>
                </tr>
            `;
        });
}

window.ajustarCantidad = async (fecha, cambio) => {
    if (cambio > 0) {
        await db.from("soportes").insert([{ fecha, cantidad: 1, a_cobrar: false }]);
    } else {
        const { data } = await db
            .from("soportes")
            .select("id")
            .eq("fecha", fecha)
            .limit(1);

        if (data?.length) {
            await db.from("soportes").delete().eq("id", data[0].id);
        }
    }

    renderCiclo();
    renderEstadisticas();
};

window.eliminarSoporteGrupo = async (idsString) => {
    if (!confirm("¿Eliminar registros?")) return;
    await db.from("soportes").delete().in("id", idsString.split(","));
    renderCiclo();
    renderEstadisticas();
};

async function procesarEnvioFacturado() {
    const desde = document.getElementById("ciclo-desde").value;
    const hasta = document.getElementById("ciclo-hasta").value;

    const { data } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta);

    const facturados = (data || []).filter(
        s => s.precio_servicio > 0 && s.num_factura
    );

    if (!facturados.length) {
        alert("No hay facturados");
        return;
    }

    let total = 0;
    let cuerpo = "";

    facturados.forEach(s => {
        cuerpo += `${s.fecha} | ${s.num_factura} | Q${s.precio_servicio}\n`;
        total += Number(s.precio_servicio);
    });

    cuerpo += `\nTotal: Q${total.toFixed(2)}`;

    window.location.href =
        `mailto:rorosco@grupoprinter.com?subject=Facturado&body=${encodeURIComponent(cuerpo)}`;
}

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

    renderFinanzas();
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
        if (day <= 15) quincena.push(mov);
        else finMes.push(mov);
    });

    function renderTabla(lista, tabla, esQuincena = true) {
        const ingresos = lista.filter(x => x.tipo === "ingreso");
        const planillas = lista.filter(x => x.tipo === "planilla");
        const gastos = lista.filter(x => x.tipo === "gasto");

        const ordenados = [
            ...ingresos,
            ...planillas,
            ...gastos
        ];

        ordenados.forEach(mov => {
            const isGasto = mov.tipo === "gasto";
            const monto = Number(mov.monto);

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
                        ${isGasto ? '-' : '+'}${formatMoney(monto)}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarGasto(${mov.id})">❌</button>
                    </td>
                </tr>
            `;
        });
    }

    renderTabla(quincena, tablaQ, true);
    renderTabla(finMes, tablaF, false);

    const balanceQ = totalIngresosQ - totalGastosQ;
    const balanceF = totalIngresosF - totalGastosF;

    tablaQ.innerHTML += `
        <tr class="table-dark">
            <td><strong>Total</strong></td>
            <td class="text-end fw-bold">${formatMoney(balanceQ)}</td>
            <td></td>
        </tr>
    `;

    tablaF.innerHTML += `
        <tr class="table-dark">
            <td><strong>Total</strong></td>
            <td class="text-end fw-bold">${formatMoney(balanceF)}</td>
            <td></td>
        </tr>
    `;
}

window.eliminarGasto = async (id) => {
    await db.from("gastos").delete().eq("id", id);
    renderFinanzas();
};

// ============================
// ESTADÍSTICAS
// ============================
async function renderEstadisticas() {
    const desdeSQL = document.getElementById("ciclo-desde").value;
    const hastaSQL = document.getElementById("ciclo-hasta").value;

    document.getElementById("nombre-mes").textContent =
        `${formatDate(desdeSQL)} al ${formatDate(hastaSQL)}`;

    const { data, error } = await db
        .from("soportes")
        .select("*")
        .gte("fecha", desdeSQL)
        .lte("fecha", hastaSQL);

    if (error) {
        console.error(error);
        return;
    }

    let totalSoportes = 0;
    const soportesPorDia = {};

    (data || []).forEach(item => {
        totalSoportes += Number(item.cantidad || 0);
        soportesPorDia[item.fecha] =
            (soportesPorDia[item.fecha] || 0) + Number(item.cantidad || 0);
    });

    const meta = 100;
    const faltantes = Math.max(meta - totalSoportes, 0);

    document.getElementById("total-soportes-mes").textContent = totalSoportes;
    document.getElementById("total-faltantes-mes").textContent = faltantes;
    document.getElementById("comparacion-mes").textContent =
        totalSoportes >= meta ? "Meta alcanzada ✅" : `Te faltan ${faltantes}`;

    const fechasOrdenadas = Object.keys(soportesPorDia)
        .sort((a, b) => new Date(a) - new Date(b));

    const labels = fechasOrdenadas.map(f => formatDate(f));
    const valores = fechasOrdenadas.map(f => soportesPorDia[f]);

    if (graficaMes) graficaMes.destroy();

    const ctx = document.getElementById("grafica-mes");

    graficaMes = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Soportes por día",
                data: valores,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}
