"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, guardarDocumento, nuevoDocumento, proximoNumero } from "@/lib/db";
import { baseLinea, calcularTotales, codigo, euros } from "@/lib/calculos";
import { TIPOS_IRPF, TIPOS_IVA, type DatosFiscales, type Documento, type Linea, type TipoDocumento } from "@/lib/types";
import { textos } from "./textos";

const camposCliente: { clave: keyof DatosFiscales; texto: string }[] = [
  { clave: "nombre", texto: "Nombre o razón social" },
  { clave: "nif", texto: "NIF / CIF" },
  { clave: "direccion", texto: "Dirección" },
  { clave: "cp", texto: "Código postal" },
  { clave: "ciudad", texto: "Ciudad" },
  { clave: "provincia", texto: "Provincia" },
  { clave: "email", texto: "Email" },
  { clave: "telefono", texto: "Teléfono" },
];

export default function EditorDocumento({ tipo }: { tipo: TipoDocumento }) {
  const t = textos[tipo];
  const router = useRouter();
  const id = Number(useSearchParams().get("id")) || undefined;
  const [doc, setDoc] = useState<Documento | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const anioOriginal = useRef<number | null>(null);
  const clientes = useLiveQuery(() => db.clientes.orderBy("nombre").toArray(), []);

  useEffect(() => {
    (async () => {
      if (id) {
        const d = await db.documentos.get(id);
        if (!d) return setError(`No se ha encontrado este ${t.singular.toLowerCase()}.`);
        anioOriginal.current = d.anio;
        setDoc(d);
      } else {
        setDoc(await nuevoDocumento(tipo));
      }
    })();
  }, [id, tipo, t.singular]);

  // Si cambia el año de la fecha, recalcula el número que tendrá.
  const anio = doc ? Number(doc.fecha.slice(0, 4)) : 0;
  useEffect(() => {
    if (!doc || !anio || anio === doc.anio) return;
    (async () => {
      const numero = anio === anioOriginal.current ? (await db.documentos.get(doc.id!))!.numero : await proximoNumero(tipo, anio);
      setDoc((d) => (d ? { ...d, anio, numero } : d));
    })();
    // Solo debe ejecutarse cuando cambia el año.
  }, [anio]);

  if (error) return <div className="panel vacio">{error}</div>;
  if (!doc) return null;

  const cambiar = (cambios: Partial<Documento>) => setDoc({ ...doc, ...cambios });
  const cambiarCliente = (clave: keyof DatosFiscales, valor: string) =>
    cambiar({ cliente: { ...doc.cliente, [clave]: valor } });
  const cambiarLinea = (i: number, cambios: Partial<Linea>) =>
    cambiar({ lineas: doc.lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)) });

  const elegirCliente = (valor: string) => {
    const c = clientes?.find((c) => c.id === Number(valor));
    if (!c) return cambiar({ clienteId: null });
    const { id: _id, creado: _creado, ...datos } = c;
    cambiar({ clienteId: c.id!, cliente: datos });
  };

  const guardarComoCliente = async () => {
    if (!doc.cliente.nombre.trim()) return alert("Escribe al menos el nombre del cliente.");
    const nuevoId = await db.clientes.add({ ...doc.cliente, creado: new Date().toISOString() });
    cambiar({ clienteId: nuevoId as number });
  };

  const guardar = async () => {
    if (doc.lineas.every((l) => !l.concepto.trim())) return alert("Añade al menos un concepto.");
    setGuardando(true);
    try {
      const nuevoId = await guardarDocumento({ ...doc, lineas: doc.lineas.filter((l) => l.concepto.trim()) });
      router.push(`${t.ruta}/ver/?id=${nuevoId}`);
    } finally {
      setGuardando(false);
    }
  };

  const totales = calcularTotales(doc.lineas, doc.irpf);

  return (
    <>
      <div className="cabecera">
        <h1>{id ? `Editar ${t.singular.toLowerCase()}` : t.nuevo}</h1>
        <div className="acciones">
          <Link href={id ? `${t.ruta}/ver/?id=${id}` : `${t.ruta}/`} className="boton">Cancelar</Link>
          <button className="boton primario" onClick={guardar} disabled={guardando}>Guardar</button>
        </div>
      </div>

      <div className="panel">
        <h2>Datos del {t.singular.toLowerCase()}</h2>
        <div className="rejilla">
          <div className="campo ancho">
            <label>Nombre (opcional) — se mostrará delante del número</label>
            <input
              placeholder={tipo === "factura" ? "Ej.: Factura para Paco" : "Ej.: Presupuesto reforma cocina"}
              value={doc.titulo}
              onChange={(e) => cambiar({ titulo: e.target.value })}
            />
            <small style={{ color: "var(--suave)" }}>
              Quedará como: <strong>{[doc.titulo.trim(), codigo(tipo, doc.anio, doc.numero)].filter(Boolean).join(" ")}</strong>
            </small>
          </div>
          <div className="campo">
            <label>Fecha</label>
            <input type="date" value={doc.fecha} onChange={(e) => e.target.value && cambiar({ fecha: e.target.value })} />
          </div>
          <div className="campo">
            <label>{t.vencimiento}</label>
            <input type="date" value={doc.vencimiento} onChange={(e) => cambiar({ vencimiento: e.target.value })} />
          </div>
          <div className="campo">
            <label>Estado</label>
            <select value={doc.estado} onChange={(e) => cambiar({ estado: e.target.value as Documento["estado"] })}>
              {t.estados.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="cabecera" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Cliente</h2>
          <div className="acciones">
            <select value={doc.clienteId ?? ""} onChange={(e) => elegirCliente(e.target.value)} style={{ width: 260 }}>
              <option value="">— Elegir cliente guardado —</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.nif ? ` (${c.nif})` : ""}</option>)}
            </select>
            {!doc.clienteId && <button className="boton" onClick={guardarComoCliente}>Guardar como cliente</button>}
          </div>
        </div>
        <div className="rejilla">
          {camposCliente.map((c) => (
            <div className="campo" key={c.clave}>
              <label>{c.texto}</label>
              <input value={doc.cliente[c.clave]} onChange={(e) => cambiarCliente(c.clave, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Conceptos</h2>
        <table className="tabla lineas">
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Concepto</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio (€)</th>
              <th className="num">Dto. %</th>
              <th>IVA</th>
              <th className="num">Importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {doc.lineas.map((l, i) => (
              <tr key={i}>
                <td><input value={l.concepto} placeholder="Descripción del producto o servicio" onChange={(e) => cambiarLinea(i, { concepto: e.target.value })} /></td>
                <td><input type="number" step="any" value={l.cantidad} onChange={(e) => cambiarLinea(i, { cantidad: e.target.valueAsNumber || 0 })} style={{ textAlign: "right" }} /></td>
                <td><input type="number" step="0.01" value={l.precio} onChange={(e) => cambiarLinea(i, { precio: e.target.valueAsNumber || 0 })} style={{ textAlign: "right" }} /></td>
                <td><input type="number" step="any" min={0} max={100} value={l.descuento} onChange={(e) => cambiarLinea(i, { descuento: e.target.valueAsNumber || 0 })} style={{ textAlign: "right" }} /></td>
                <td>
                  <select value={l.iva} onChange={(e) => cambiarLinea(i, { iva: Number(e.target.value) })}>
                    {TIPOS_IVA.map((v) => <option key={v} value={v}>{v} %</option>)}
                  </select>
                </td>
                <td className="num">{euros(baseLinea(l))}</td>
                <td>
                  <button className="boton pequeno peligro" title="Quitar línea" disabled={doc.lineas.length === 1}
                    onClick={() => cambiar({ lineas: doc.lineas.filter((_, j) => j !== i) })}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="boton"
          style={{ marginTop: 10 }}
          onClick={() => cambiar({ lineas: [...doc.lineas, { concepto: "", cantidad: 1, precio: 0, descuento: 0, iva: doc.lineas.at(-1)?.iva ?? 21 }] })}
        >
          + Añadir línea
        </button>

        <div style={{ display: "flex", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
          <div className="campo" style={{ flex: 1, minWidth: 260 }}>
            <label>Notas (aparecen en el documento)</label>
            <textarea value={doc.notas} onChange={(e) => cambiar({ notas: e.target.value })} placeholder="Forma de pago, condiciones…" />
            <label style={{ marginTop: 10 }}>Retención IRPF</label>
            <select value={doc.irpf} onChange={(e) => cambiar({ irpf: Number(e.target.value) })} style={{ width: 160 }}>
              {[...new Set([...TIPOS_IRPF, doc.irpf])].sort((a, b) => a - b).map((v) => (
                <option key={v} value={v}>{v === 0 ? "Sin retención" : `${v} %`}</option>
              ))}
            </select>
          </div>
          <div className="totales">
            <div><span>Base imponible</span><span>{euros(totales.base)}</span></div>
            {totales.ivas.map((i) => (
              <div key={i.tipo}><span>IVA {i.tipo} %</span><span>{euros(i.cuota)}</span></div>
            ))}
            {doc.irpf > 0 && <div><span>Retención IRPF {doc.irpf} %</span><span>−{euros(totales.irpf)}</span></div>}
            <div className="total"><span>Total</span><span>{euros(totales.total)}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}
