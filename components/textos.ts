import type { TipoDocumento } from "@/lib/types";

export const textos = {
  factura: {
    singular: "Factura",
    plural: "Facturas",
    nuevo: "Nueva factura",
    ruta: "/facturas",
    vencimiento: "Vencimiento",
    estados: [
      { valor: "pendiente", texto: "Pendiente" },
      { valor: "pagada", texto: "Pagada" },
    ],
  },
  presupuesto: {
    singular: "Presupuesto",
    plural: "Presupuestos",
    nuevo: "Nuevo presupuesto",
    ruta: "/presupuestos",
    vencimiento: "Válido hasta",
    estados: [
      { valor: "borrador", texto: "Borrador" },
      { valor: "enviado", texto: "Enviado" },
      { valor: "aceptado", texto: "Aceptado" },
      { valor: "rechazado", texto: "Rechazado" },
      { valor: "facturado", texto: "Facturado" },
    ],
  },
} satisfies Record<TipoDocumento, unknown>;

export const textoEstado = (tipo: TipoDocumento, estado: string) =>
  textos[tipo].estados.find((e) => e.valor === estado)?.texto ?? estado;
