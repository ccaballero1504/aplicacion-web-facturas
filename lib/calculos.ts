import type { Documento, Linea, TipoDocumento } from "./types";

export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const baseLinea = (l: Linea) =>
  redondear((Number(l.cantidad) || 0) * (Number(l.precio) || 0) * (1 - (Number(l.descuento) || 0) / 100));

export interface Totales {
  base: number;
  ivas: { tipo: number; base: number; cuota: number }[];
  totalIva: number;
  irpf: number;
  total: number;
}

export function calcularTotales(lineas: Linea[], irpfPct: number): Totales {
  const porTipo = new Map<number, number>();
  let base = 0;
  for (const l of lineas) {
    const b = baseLinea(l);
    base += b;
    const tipo = Number(l.iva) || 0;
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + b);
  }
  base = redondear(base);
  const ivas = [...porTipo.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([tipo, b]) => ({ tipo, base: redondear(b), cuota: redondear((b * tipo) / 100) }));
  const totalIva = redondear(ivas.reduce((s, i) => s + i.cuota, 0));
  const irpf = redondear((base * (Number(irpfPct) || 0)) / 100);
  return { base, ivas, totalIva, irpf, total: redondear(base + totalIva - irpf) };
}

/** Código correlativo: facturas "2026-0001", presupuestos "P-2026-0001". */
export function codigo(tipo: TipoDocumento, anio: number, numero: number) {
  const n = String(numero).padStart(4, "0");
  return tipo === "factura" ? `${anio}-${n}` : `P-${anio}-${n}`;
}

/** Nombre visible: texto del usuario seguido del código, p. ej. "Factura para Paco 2026-0001". */
export function nombreDocumento(d: Pick<Documento, "tipo" | "anio" | "numero" | "titulo">) {
  const c = codigo(d.tipo, d.anio, d.numero);
  const t = d.titulo.trim();
  return t ? `${t} ${c}` : c;
}

export function siguienteNumero(existentes: Pick<Documento, "numero">[]) {
  return existentes.reduce((max, d) => Math.max(max, d.numero), 0) + 1;
}

export const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);

export const fechaES = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const hoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const sumarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(y, m - 1, d + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
};
