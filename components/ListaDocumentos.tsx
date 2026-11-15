"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { calcularTotales, euros, fechaES, nombreDocumento } from "@/lib/calculos";
import type { TipoDocumento } from "@/lib/types";
import { textoEstado, textos } from "./textos";

export default function ListaDocumentos({ tipo }: { tipo: TipoDocumento }) {
  const t = textos[tipo];
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");

  const documentos = useLiveQuery(
    () => db.documentos.where("tipo").equals(tipo).toArray(),
    [tipo],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (documentos ?? [])
      .filter((d) => !estado || d.estado === estado)
      .filter((d) => !q || `${nombreDocumento(d)} ${d.cliente.nombre} ${d.cliente.nif}`.toLowerCase().includes(q))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.anio - a.anio || b.numero - a.numero);
  }, [documentos, busqueda, estado]);

  const totalFiltrado = filtrados.reduce((s, d) => s + calcularTotales(d.lineas, d.irpf).total, 0);

  return (
    <>
      <div className="cabecera">
        <h1>{t.plural}</h1>
        <Link href={`${t.ruta}/editar/`} className="boton primario">+ {t.nuevo}</Link>
      </div>

      <div className="panel">
        <div className="filtros">
          <input placeholder="Buscar por nombre, número o cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {t.estados.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
          </select>
        </div>

        {documentos === undefined ? null : filtrados.length === 0 ? (
          <div className="vacio">
            {documentos.length === 0 ? `Todavía no hay ${t.plural.toLowerCase()}.` : "No hay resultados con estos filtros."}
          </div>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>{t.singular}</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d) => (
                <tr key={d.id} className="clic" onClick={() => router.push(`${t.ruta}/ver/?id=${d.id}`)}>
                  <td><strong>{nombreDocumento(d)}</strong></td>
                  <td>{fechaES(d.fecha)}</td>
                  <td>{d.cliente.nombre || <span style={{ color: "var(--suave)" }}>Sin cliente</span>}</td>
                  <td><span className={`etiqueta ${d.estado}`}>{textoEstado(tipo, d.estado)}</span></td>
                  <td className="num">{euros(calcularTotales(d.lineas, d.irpf).total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ color: "var(--suave)", paddingTop: 12 }}>{filtrados.length} {filtrados.length === 1 ? t.singular.toLowerCase() : t.plural.toLowerCase()}</td>
                <td className="num" style={{ paddingTop: 12 }}><strong>{euros(totalFiltrado)}</strong></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
