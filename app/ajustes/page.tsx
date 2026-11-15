"use client";

import { useEffect, useRef, useState } from "react";
import { db, exportarCopia, importarCopia, obtenerAjustes } from "@/lib/db";
import { TIPOS_IRPF, TIPOS_IVA, type Ajustes, type DatosFiscales } from "@/lib/types";

const campos: { clave: keyof DatosFiscales; texto: string }[] = [
  { clave: "nombre", texto: "Nombre o razón social" },
  { clave: "nif", texto: "NIF / CIF" },
  { clave: "direccion", texto: "Dirección" },
  { clave: "cp", texto: "Código postal" },
  { clave: "ciudad", texto: "Ciudad" },
  { clave: "provincia", texto: "Provincia" },
  { clave: "email", texto: "Email" },
  { clave: "telefono", texto: "Teléfono" },
];

export default function PaginaAjustes() {
  const [a, setA] = useState<Ajustes | null>(null);
  const [guardado, setGuardado] = useState(false);
  const inputCopia = useRef<HTMLInputElement>(null);

  useEffect(() => {
    obtenerAjustes().then(setA);
  }, []);

  if (!a) return null;

  const cambiar = (cambios: Partial<Ajustes>) => {
    setA({ ...a, ...cambios });
    setGuardado(false);
  };

  const guardar = async () => {
    await db.ajustes.put(a);
    setGuardado(true);
  };

  const subirLogo = (archivo?: File) => {
    if (!archivo) return;
    if (archivo.size > 500_000) return alert("El logo debe ocupar menos de 500 KB.");
    const lector = new FileReader();
    lector.onload = () => cambiar({ logo: String(lector.result) });
    lector.readAsDataURL(archivo);
  };

  const restaurar = async (archivo?: File) => {
    if (!archivo) return;
    if (!confirm("Restaurar la copia sustituirá TODOS los datos actuales (facturas, presupuestos, clientes y ajustes). ¿Continuar?")) return;
    try {
      await importarCopia(archivo);
      setA(await obtenerAjustes());
      alert("Copia restaurada correctamente.");
    } catch (e) {
      alert(`No se pudo restaurar: ${(e as Error).message}`);
    } finally {
      if (inputCopia.current) inputCopia.current.value = "";
    }
  };

  return (
    <>
      <div className="cabecera">
        <h1>Ajustes</h1>
        <div className="acciones">
          {guardado && <span style={{ color: "var(--ok)", alignSelf: "center" }}>Guardado ✓</span>}
          <button className="boton primario" onClick={guardar}>Guardar cambios</button>
        </div>
      </div>

      <div className="panel">
        <h2>Tus datos fiscales (emisor)</h2>
        <p style={{ color: "var(--suave)", marginTop: -6 }}>Aparecerán en todas tus facturas y presupuestos.</p>
        <div className="rejilla">
          {campos.map((c) => (
            <div className="campo" key={c.clave}>
              <label>{c.texto}</label>
              <input value={a[c.clave]} onChange={(e) => cambiar({ [c.clave]: e.target.value })} />
            </div>
          ))}
          <div className="campo ancho">
            <label>IBAN (para cobros por transferencia)</label>
            <input value={a.iban} placeholder="ES00 0000 0000 0000 0000 0000" onChange={(e) => cambiar({ iban: e.target.value })} />
          </div>
          <div className="campo ancho">
            <label>Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {a.logo && <img src={a.logo} alt="Logo" style={{ maxHeight: 60, maxWidth: 180, objectFit: "contain" }} />}
              <input type="file" accept="image/*" onChange={(e) => subirLogo(e.target.files?.[0])} style={{ width: "auto" }} />
              {a.logo && <button className="boton pequeno peligro" onClick={() => cambiar({ logo: "" })}>Quitar</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Valores por defecto</h2>
        <div className="rejilla">
          <div className="campo">
            <label>IVA por defecto</label>
            <select value={a.ivaPorDefecto} onChange={(e) => cambiar({ ivaPorDefecto: Number(e.target.value) })}>
              {TIPOS_IVA.map((v) => <option key={v} value={v}>{v} %</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Retención IRPF por defecto</label>
            <select value={a.irpfPorDefecto} onChange={(e) => cambiar({ irpfPorDefecto: Number(e.target.value) })}>
              {TIPOS_IRPF.map((v) => <option key={v} value={v}>{v === 0 ? "Sin retención" : `${v} %`}</option>)}
            </select>
          </div>
          <div className="campo ancho">
            <label>Texto al pie de los documentos</label>
            <textarea value={a.notasPie} placeholder="Ej.: Inscrita en el Registro Mercantil de…" onChange={(e) => cambiar({ notasPie: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Copia de seguridad</h2>
        <p style={{ color: "var(--suave)", marginTop: -6 }}>
          Los datos solo existen en este navegador. Descarga una copia de vez en cuando y guárdala en un lugar seguro.
        </p>
        <div className="acciones">
          <button className="boton" onClick={exportarCopia}>Descargar copia</button>
          <button className="boton" onClick={() => inputCopia.current?.click()}>Restaurar copia…</button>
          <input ref={inputCopia} type="file" accept="application/json,.json" hidden onChange={(e) => restaurar(e.target.files?.[0])} />
        </div>
      </div>
    </>
  );
}
