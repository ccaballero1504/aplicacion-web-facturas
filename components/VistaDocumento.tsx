"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { convertirEnFactura, db, obtenerAjustes } from "@/lib/db";
import { baseLinea, calcularTotales, euros, fechaES, nombreDocumento } from "@/lib/calculos";
import type { DatosFiscales, TipoDocumento } from "@/lib/types";
import { textoEstado, textos } from "./textos";

function Bloque({ d }: { d: DatosFiscales }) {
  const ciudad = [d.cp, d.ciudad].filter(Boolean).join(" ") + (d.provincia ? ` (${d.provincia})` : "");
  return (
    <p>
      <strong>{d.nombre || "—"}</strong>
      {d.nif && <><br />NIF: {d.nif}</>}
      {d.direccion && <><br />{d.direccion}</>}
      {ciudad.trim() && <><br />{ciudad}</>}
      {d.email && <><br />{d.email}</>}
      {d.telefono && <><br />{d.telefono}</>}
    </p>
  );
}

export default function VistaDocumento({ tipo }: { tipo: TipoDocumento }) {
  const t = textos[tipo];
  const router = useRouter();
  const id = Number(useSearchParams().get("id"));
  const doc = useLiveQuery(async () => (await db.documentos.get(id)) ?? null, [id]);
  const emisor = useLiveQuery(obtenerAjustes, []);

  if (doc === undefined || !emisor) return null;
  if (doc === null || doc.tipo !== tipo) {
    return <div className="panel vacio">No se ha encontrado este {t.singular.toLowerCase()}. <Link href={`${t.ruta}/`}>Volver</Link></div>;
  }

  const nombre = nombreDocumento(doc);
  const totales = calcularTotales(doc.lineas, doc.irpf);
  const faltaEmisor = !emisor.nombre || !emisor.nif;

  const descargarPDF = () => {
    // El navegador permite "Guardar como PDF" desde el diálogo de impresión; el título será el nombre del archivo.
    const tituloAnterior = document.title;
    document.title = nombre;
    window.print();
    document.title = tituloAnterior;
  };

  const eliminar = async () => {
    if (!confirm(`¿Eliminar "${nombre}"? No se puede deshacer.`)) return;
    await db.transaction("rw", db.documentos, async () => {
      if (doc.presupuestoId) await db.documentos.update(doc.presupuestoId, { estado: "aceptado", facturaId: undefined });
      if (doc.facturaId) await db.documentos.update(doc.facturaId, { presupuestoId: undefined });
      await db.documentos.delete(id);
    });
    router.push(`${t.ruta}/`);
  };

  const convertir = async () => {
    const facturaId = await convertirEnFactura(id);
    router.push(`/facturas/ver/?id=${facturaId}`);
  };

  return (
    <>
      <div className="cabecera no-print">
        <div>
          <Link href={`${t.ruta}/`} style={{ color: "var(--suave)", textDecoration: "none" }}>← {t.plural}</Link>
          <h1 style={{ marginTop: 6 }}>{nombre} <span className={`etiqueta ${doc.estado}`}>{textoEstado(tipo, doc.estado)}</span></h1>
        </div>
        <div className="acciones">
          {tipo === "factura" && (
            <button className="boton" onClick={() => db.documentos.update(id, { estado: doc.estado === "pagada" ? "pendiente" : "pagada" })}>
              {doc.estado === "pagada" ? "Marcar pendiente" : "Marcar pagada"}
            </button>
          )}
          {tipo === "presupuesto" && (doc.facturaId ? (
            <Link className="boton" href={`/facturas/ver/?id=${doc.facturaId}`}>Ver factura</Link>
          ) : (
            <button className="boton" onClick={convertir}>Convertir en factura</button>
          ))}
          <Link className="boton" href={`${t.ruta}/editar/?id=${id}`}>Editar</Link>
          <button className="boton primario" onClick={descargarPDF}>Descargar PDF</button>
          <button className="boton peligro" onClick={eliminar}>Eliminar</button>
        </div>
      </div>

      {faltaEmisor && (
        <div className="aviso no-print">
          Faltan tus datos fiscales (nombre y NIF). Complétalos en <Link href="/ajustes/">Ajustes</Link> para que aparezcan en el documento.
        </div>
      )}
      {doc.presupuestoId && (
        <p className="no-print" style={{ color: "var(--suave)" }}>
          Creada a partir de un <Link href={`/presupuestos/ver/?id=${doc.presupuestoId}`}>presupuesto</Link>.
        </p>
      )}

      <article className="hoja">
        <div className="hoja-cab">
          <div>
            {emisor.logo && <img src={emisor.logo} alt="Logo" />}
            <Bloque d={emisor} />
          </div>
          <div className="hoja-titulo">
            <h1>{t.singular}</h1>
            <div className="nombre">{nombre}</div>
            <div style={{ marginTop: 10, lineHeight: 1.6 }}>
              Fecha: {fechaES(doc.fecha)}
              {doc.vencimiento && <><br />{t.vencimiento}: {fechaES(doc.vencimiento)}</>}
            </div>
          </div>
        </div>

        <div className="partes">
          <div>
            <h3>{tipo === "factura" ? "Facturar a" : "Cliente"}</h3>
            <Bloque d={doc.cliente} />
          </div>
        </div>

        <table className="tabla">
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="num">Cant.</th>
              <th className="num">Precio</th>
              {doc.lineas.some((l) => l.descuento) && <th className="num">Dto.</th>}
              <th className="num">IVA</th>
              <th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {doc.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.concepto}</td>
                <td className="num">{l.cantidad.toLocaleString("es-ES")}</td>
                <td className="num">{euros(l.precio)}</td>
                {doc.lineas.some((x) => x.descuento) && <td className="num">{l.descuento ? `${l.descuento} %` : ""}</td>}
                <td className="num">{l.iva} %</td>
                <td className="num">{euros(baseLinea(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totales" style={{ marginTop: 20 }}>
          <div><span>Base imponible</span><span>{euros(totales.base)}</span></div>
          {totales.ivas.map((i) => (
            <div key={i.tipo}><span>IVA {i.tipo} % (sobre {euros(i.base)})</span><span>{euros(i.cuota)}</span></div>
          ))}
          {doc.irpf > 0 && <div><span>Retención IRPF {doc.irpf} %</span><span>−{euros(totales.irpf)}</span></div>}
          <div className="total"><span>Total</span><span>{euros(totales.total)}</span></div>
        </div>

        {(doc.notas || emisor.iban || emisor.notasPie) && (
          <div className="pie">
            {doc.notas && <div>{doc.notas}</div>}
            {tipo === "factura" && emisor.iban && <div style={{ marginTop: 8 }}>Pago por transferencia a: <strong>{emisor.iban}</strong></div>}
            {emisor.notasPie && <div style={{ marginTop: 8 }}>{emisor.notasPie}</div>}
          </div>
        )}
      </article>
    </>
  );
}
