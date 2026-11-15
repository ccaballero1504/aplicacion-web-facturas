import Dexie, { type EntityTable } from "dexie";
import type { Ajustes, Cliente, Documento, TipoDocumento } from "./types";
import { ajustesPorDefecto } from "./types";
import { hoyISO, siguienteNumero, sumarDias } from "./calculos";

/** Base de datos local (IndexedDB) del navegador. No hay servidor. */
class FacturasDB extends Dexie {
  clientes!: EntityTable<Cliente, "id">;
  documentos!: EntityTable<Documento, "id">;
  ajustes!: EntityTable<Ajustes, "id">;

  constructor() {
    super("aplicacion-web-facturas");
    this.version(1).stores({
      clientes: "++id, nombre, nif",
      documentos: "++id, tipo, [tipo+anio], fecha, clienteId, estado",
      ajustes: "id",
    });
  }
}

export const db = new FacturasDB();

export async function obtenerAjustes(): Promise<Ajustes> {
  return { ...ajustesPorDefecto(), ...((await db.ajustes.get("emisor")) ?? {}) };
}

export async function proximoNumero(tipo: TipoDocumento, anio: number) {
  const existentes = await db.documentos.where("[tipo+anio]").equals([tipo, anio]).toArray();
  return siguienteNumero(existentes);
}

export async function nuevoDocumento(tipo: TipoDocumento): Promise<Documento> {
  const a = await obtenerAjustes();
  const fecha = hoyISO();
  const anio = Number(fecha.slice(0, 4));
  const ahora = new Date().toISOString();
  return {
    tipo,
    anio,
    numero: await proximoNumero(tipo, anio),
    titulo: "",
    fecha,
    vencimiento: sumarDias(fecha, 30),
    clienteId: null,
    cliente: { nombre: "", nif: "", direccion: "", cp: "", ciudad: "", provincia: "", email: "", telefono: "" },
    lineas: [{ concepto: "", cantidad: 1, precio: 0, descuento: 0, iva: a.ivaPorDefecto }],
    irpf: a.irpfPorDefecto,
    notas: "",
    estado: tipo === "factura" ? "pendiente" : "borrador",
    creado: ahora,
    actualizado: ahora,
  };
}

/** Guarda un documento. Si es nuevo o cambia de año, le asigna el siguiente número libre. */
export async function guardarDocumento(doc: Documento): Promise<number> {
  return db.transaction("rw", db.documentos, async () => {
    const anio = Number(doc.fecha.slice(0, 4));
    const anterior = doc.id ? await db.documentos.get(doc.id) : undefined;
    let numero = doc.numero;
    if (!anterior || anterior.anio !== anio) {
      numero = await proximoNumero(doc.tipo, anio);
    }
    const datos: Documento = { ...doc, anio, numero, actualizado: new Date().toISOString() };
    return (await db.documentos.put(datos)) as number;
  });
}

/** Crea una factura a partir de un presupuesto y marca el presupuesto como facturado. */
export async function convertirEnFactura(presupuestoId: number): Promise<number> {
  return db.transaction("rw", db.documentos, db.ajustes, async () => {
    const p = await db.documentos.get(presupuestoId);
    if (!p || p.tipo !== "presupuesto") throw new Error("Presupuesto no encontrado");
    if (p.facturaId) return p.facturaId;
    const base = await nuevoDocumento("factura");
    const facturaId = await guardarDocumento({
      ...base,
      titulo: p.titulo,
      clienteId: p.clienteId,
      cliente: { ...p.cliente },
      lineas: p.lineas.map((l) => ({ ...l })),
      irpf: p.irpf,
      notas: p.notas,
      presupuestoId,
    });
    await db.documentos.update(presupuestoId, { estado: "facturado", facturaId });
    return facturaId;
  });
}

// ---------- Copia de seguridad ----------

export async function exportarCopia() {
  const datos = {
    app: "aplicacion-web-facturas",
    version: 1,
    exportado: new Date().toISOString(),
    clientes: await db.clientes.toArray(),
    documentos: await db.documentos.toArray(),
    ajustes: await db.ajustes.toArray(),
  };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `copia-facturas-${hoyISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importarCopia(archivo: File) {
  const datos = JSON.parse(await archivo.text());
  if (datos?.app !== "aplicacion-web-facturas") throw new Error("El archivo no es una copia de esta aplicación.");
  await db.transaction("rw", db.clientes, db.documentos, db.ajustes, async () => {
    await Promise.all([db.clientes.clear(), db.documentos.clear(), db.ajustes.clear()]);
    await db.clientes.bulkPut(datos.clientes ?? []);
    await db.documentos.bulkPut(datos.documentos ?? []);
    await db.ajustes.bulkPut(datos.ajustes ?? []);
  });
}
