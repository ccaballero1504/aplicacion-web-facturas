export type TipoDocumento = "factura" | "presupuesto";

export type EstadoFactura = "pendiente" | "pagada";
export type EstadoPresupuesto = "borrador" | "enviado" | "aceptado" | "rechazado" | "facturado";

export interface DatosFiscales {
  nombre: string; // nombre o razón social
  nif: string;
  direccion: string;
  cp: string;
  ciudad: string;
  provincia: string;
  email: string;
  telefono: string;
}

export interface Cliente extends DatosFiscales {
  id?: number;
  creado: string; // ISO
}

export interface Ajustes extends DatosFiscales {
  id: "emisor";
  iban: string;
  logo: string; // data URL
  ivaPorDefecto: number;
  irpfPorDefecto: number;
  notasPie: string;
}

export interface Linea {
  concepto: string;
  cantidad: number;
  precio: number; // precio unitario sin IVA
  descuento: number; // %
  iva: number; // %
}

export interface Documento {
  id?: number;
  tipo: TipoDocumento;
  anio: number;
  numero: number; // correlativo dentro de tipo + año
  titulo: string; // texto libre del usuario, p. ej. "Factura para Paco"
  fecha: string; // YYYY-MM-DD
  vencimiento: string; // factura: vencimiento · presupuesto: válido hasta
  clienteId: number | null;
  cliente: DatosFiscales; // copia de los datos en el momento de emitir
  lineas: Linea[];
  irpf: number; // % de retención
  notas: string;
  estado: EstadoFactura | EstadoPresupuesto;
  presupuestoId?: number; // factura creada desde un presupuesto
  facturaId?: number; // presupuesto ya convertido
  creado: string;
  actualizado: string;
}

export const TIPOS_IVA = [21, 10, 4, 0];
export const TIPOS_IRPF = [0, 7, 15, 19];

export const datosFiscalesVacios = (): DatosFiscales => ({
  nombre: "",
  nif: "",
  direccion: "",
  cp: "",
  ciudad: "",
  provincia: "",
  email: "",
  telefono: "",
});

export const ajustesPorDefecto = (): Ajustes => ({
  id: "emisor",
  ...datosFiscalesVacios(),
  iban: "",
  logo: "",
  ivaPorDefecto: 21,
  irpfPorDefecto: 0,
  notasPie: "",
});
