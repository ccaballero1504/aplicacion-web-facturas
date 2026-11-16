// Utilidades: cálculos, formato y helpers de HTML.
const U = (() => {
  const TIPOS_IVA = [21, 10, 4, 0];
  const TIPOS_IRPF = [0, 7, 15, 19];

  const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const baseLinea = (l) =>
    redondear((Number(l.cantidad) || 0) * (Number(l.precio) || 0) * (1 - (Number(l.descuento) || 0) / 100));

  /** Base, IVA desglosado por tipo, retención IRPF y total. */
  function calcularTotales(lineas, irpfPct) {
    const porTipo = new Map();
    let base = 0;
    for (const l of lineas) {
      const b = baseLinea(l);
      base += b;
      const tipo = Number(l.iva) || 0;
      porTipo.set(tipo, (porTipo.get(tipo) || 0) + b);
    }
    base = redondear(base);
    const ivas = [...porTipo.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([tipo, b]) => ({ tipo, base: redondear(b), cuota: redondear((b * tipo) / 100) }));
    const totalIva = redondear(ivas.reduce((s, i) => s + i.cuota, 0));
    const irpf = redondear((base * (Number(irpfPct) || 0)) / 100);
    return { base, ivas, totalIva, irpf, total: redondear(base + totalIva - irpf) };
  }

  /** Facturas "2026-0001", presupuestos "P-2026-0001". */
  function codigo(tipo, anio, numero) {
    const n = String(numero).padStart(4, "0");
    return tipo === "factura" ? `${anio}-${n}` : `P-${anio}-${n}`;
  }

  /**
   * Totales de cualquier documento. Las facturas subidas en PDF no tienen líneas:
   * usan los importes que indicó el usuario (base, IVA y retención en euros).
   */
  function totalesDocumento(d) {
    if (!d.subida) return calcularTotales(d.lineas, d.irpf);
    const i = d.importes || {};
    const base = redondear(Number(i.base) || 0), iva = redondear(Number(i.iva) || 0), irpf = redondear(Number(i.irpf) || 0);
    return { base, ivas: [], totalIva: iva, irpf, total: redondear(base + iva - irpf) };
  }

  /** Texto del usuario + código, p. ej. "Factura para Paco 2026-0001". Las subidas usan su propio nombre. */
  function nombreDocumento(d) {
    if (d.subida) return (d.titulo || "").trim() || "Factura subida";
    const c = codigo(d.tipo, d.anio, d.numero);
    const t = (d.titulo || "").trim();
    return t ? `${t} ${c}` : c;
  }

  const siguienteNumero = (docs) => docs.reduce((max, d) => Math.max(max, d.numero), 0) + 1;

  const formatoEuros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const euros = (n) => formatoEuros.format(n || 0);

  const fechaES = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const p2 = (n) => String(n).padStart(2, "0");
  const aISO = (f) => `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())}`;
  const hoyISO = () => aISO(new Date());
  /** Fecha local (dd/mm/aaaa) de una marca de tiempo ISO, p. ej. la fecha de creación. */
  const fechaLocal = (iso) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const sumarDias = (iso, dias) => {
    const [y, m, d] = iso.split("-").map(Number);
    return aISO(new Date(y, m - 1, d + dias));
  };

  /** Escapa texto para insertarlo en HTML de forma segura. */
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const datosFiscalesVacios = () => ({
    nombre: "", nif: "", direccion: "", cp: "", ciudad: "", provincia: "", email: "", telefono: "",
  });

  const CAMPOS_FISCALES = [
    ["nombre", "Nombre o razón social"],
    ["nif", "NIF / CIF"],
    ["direccion", "Dirección"],
    ["cp", "Código postal"],
    ["ciudad", "Ciudad"],
    ["provincia", "Provincia"],
    ["email", "Email"],
    ["telefono", "Teléfono"],
  ];

  let temporizadorToast;
  function aviso(texto) {
    const t = document.getElementById("toast");
    t.textContent = texto;
    t.classList.add("visible");
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove("visible"), 2200);
  }

  return {
    TIPOS_IVA, TIPOS_IRPF, CAMPOS_FISCALES, redondear, baseLinea, calcularTotales, totalesDocumento, codigo, nombreDocumento,
    siguienteNumero, euros, fechaES, fechaLocal, hoyISO, sumarDias, esc, datosFiscalesVacios, aviso,
  };
})();

if (typeof module !== "undefined") module.exports = U; // para pruebas con Node
