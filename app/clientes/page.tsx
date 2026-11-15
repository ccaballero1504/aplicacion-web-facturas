"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { datosFiscalesVacios, type Cliente, type DatosFiscales } from "@/lib/types";

const campos: { clave: keyof DatosFiscales; texto: string }[] = [
  { clave: "nombre", texto: "Nombre o razón social *" },
  { clave: "nif", texto: "NIF / CIF" },
  { clave: "direccion", texto: "Dirección" },
  { clave: "cp", texto: "Código postal" },
  { clave: "ciudad", texto: "Ciudad" },
  { clave: "provincia", texto: "Provincia" },
  { clave: "email", texto: "Email" },
  { clave: "telefono", texto: "Teléfono" },
];

export default function Clientes() {
  const clientes = useLiveQuery(() => db.clientes.orderBy("nombre").toArray(), []);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (clientes ?? []).filter((c) => !q || `${c.nombre} ${c.nif} ${c.email} ${c.ciudad}`.toLowerCase().includes(q));
  }, [clientes, busqueda]);

  const guardar = async () => {
    if (!editando) return;
    if (!editando.nombre.trim()) return alert("El nombre es obligatorio.");
    await db.clientes.put(editando);
    setEditando(null);
  };

  const eliminar = async (c: Cliente) => {
    const usados = await db.documentos.where("clienteId").equals(c.id!).count();
    const aviso = usados
      ? `"${c.nombre}" aparece en ${usados} documento(s). Los documentos conservarán sus datos. ¿Eliminar el cliente?`
      : `¿Eliminar a "${c.nombre}"?`;
    if (!confirm(aviso)) return;
    await db.transaction("rw", db.clientes, db.documentos, async () => {
      await db.documentos.where("clienteId").equals(c.id!).modify({ clienteId: null });
      await db.clientes.delete(c.id!);
    });
  };

  return (
    <>
      <div className="cabecera">
        <h1>Clientes</h1>
        <button className="boton primario" onClick={() => setEditando({ ...datosFiscalesVacios(), creado: new Date().toISOString() })}>
          + Nuevo cliente
        </button>
      </div>

      {editando && (
        <div className="panel">
          <h2>{editando.id ? "Editar cliente" : "Nuevo cliente"}</h2>
          <div className="rejilla">
            {campos.map((c) => (
              <div className="campo" key={c.clave}>
                <label>{c.texto}</label>
                <input
                  autoFocus={c.clave === "nombre"}
                  value={editando[c.clave]}
                  onChange={(e) => setEditando({ ...editando, [c.clave]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && guardar()}
                />
              </div>
            ))}
          </div>
          <div className="acciones" style={{ marginTop: 16 }}>
            <button className="boton primario" onClick={guardar}>Guardar</button>
            <button className="boton" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="filtros">
          <input placeholder="Buscar cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        {clientes === undefined ? null : filtrados.length === 0 ? (
          <div className="vacio">{clientes.length === 0 ? "Todavía no hay clientes. Guárdalos aquí para rellenar las facturas en un clic." : "Sin resultados."}</div>
        ) : (
          <table className="tabla">
            <thead>
              <tr><th>Nombre</th><th>NIF</th><th>Ciudad</th><th>Email</th><th></th></tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong></td>
                  <td>{c.nif}</td>
                  <td>{c.ciudad}</td>
                  <td>{c.email}</td>
                  <td className="num">
                    <button className="boton pequeno" onClick={() => setEditando(c)}>Editar</button>{" "}
                    <button className="boton pequeno peligro" onClick={() => eliminar(c)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
