// Base de datos local del navegador (IndexedDB). No hay servidor.
const DB = (() => {
  const NOMBRE = "aplicacion-web-facturas";
  let conexion = null;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((resolver, rechazar) => {
      const r = indexedDB.open(NOMBRE, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        const clientes = d.createObjectStore("clientes", { keyPath: "id", autoIncrement: true });
        clientes.createIndex("nombre", "nombre");
        const docs = d.createObjectStore("documentos", { keyPath: "id", autoIncrement: true });
        docs.createIndex("tipo", "tipo");
        docs.createIndex("tipoAnio", ["tipo", "anio"]);
        docs.createIndex("clienteId", "clienteId");
        d.createObjectStore("ajustes", { keyPath: "id" });
      };
      r.onsuccess = () => resolver(r.result);
      r.onerror = () => rechazar(r.error);
    });
    return conexion;
  }

  const peticion = (r) =>
    new Promise((resolver, rechazar) => {
      r.onsuccess = () => resolver(r.result);
      r.onerror = () => rechazar(r.error);
    });

  /**
   * Ejecuta `fn(stores)` dentro de una transacción. `fn` debe usar solo peticiones IndexedDB
   * (vía `peticion`) para que la transacción no se cierre antes de tiempo.
   */
  async function transaccion(nombres, modo, fn) {
    const d = await abrir();
    return new Promise((resolver, rechazar) => {
      const t = d.transaction(nombres, modo);
      const stores = Object.fromEntries([].concat(nombres).map((n) => [n, t.objectStore(n)]));
      let resultado;
      Promise.resolve()
        .then(() => fn(stores))
        .then((v) => (resultado = v))
        .catch((e) => {
          try { t.abort(); } catch (_) {}
          rechazar(e);
        });
      t.oncomplete = () => resolver(resultado);
      t.onerror = () => rechazar(t.error);
      t.onabort = () => rechazar(t.error || new Error("Operación cancelada"));
    });
  }

  // ---------- Operaciones genéricas ----------
  const todos = (store) => transaccion(store, "readonly", (s) => peticion(s[store].getAll()));
  const obtener = (store, id) => transaccion(store, "readonly", (s) => peticion(s[store].get(id)));
  const poner = (store, obj) => transaccion(store, "readwrite", (s) => peticion(s[store].put(obj)));
  const borrar = (store, id) => transaccion(store, "readwrite", (s) => peticion(s[store].delete(id)));
  const porIndice = (store, indice, valor) =>
    transaccion(store, "readonly", (s) => peticion(s[store].index(indice).getAll(valor)));

  // ---------- Ajustes ----------
  const ajustesPorDefecto = () => ({
    id: "emisor", ...U.datosFiscalesVacios(), iban: "", logo: "", ivaPorDefecto: 21, irpfPorDefecto: 0, notasPie: "",
    correo: { googleClientId: "", microsoftClientId: "", asunto: "", mensaje: "" },
  });
  async function obtenerAjustes() {
    const base = ajustesPorDefecto();
    const guardados = (await obtener("ajustes", "emisor")) || {};
    return { ...base, ...guardados, correo: { ...base.correo, ...(guardados.correo || {}) } };
  }

  // ---------- Documentos (facturas y presupuestos) ----------
  async function proximoNumero(tipo, anio) {
    return U.siguienteNumero(await porIndice("documentos", "tipoAnio", [tipo, anio]));
  }

  async function nuevoDocumento(tipo) {
    const a = await obtenerAjustes();
    const fecha = U.hoyISO();
    const anio = Number(fecha.slice(0, 4));
    const ahora = new Date().toISOString();
    return {
      tipo, anio, numero: await proximoNumero(tipo, anio), titulo: "", fecha, vencimiento: U.sumarDias(fecha, 30),
      clienteId: null, cliente: U.datosFiscalesVacios(),
      lineas: [{ concepto: "", cantidad: 1, precio: 0, descuento: 0, iva: a.ivaPorDefecto }],
      irpf: a.irpfPorDefecto, notas: "", estado: tipo === "factura" ? "pendiente" : "borrador",
      creado: ahora, actualizado: ahora,
    };
  }

  /** Guarda un documento. Si es nuevo o cambia de año, recibe el siguiente número libre (de forma atómica). */
  function guardarDocumento(doc) {
    return transaccion("documentos", "readwrite", async ({ documentos }) => {
      const anio = Number(doc.fecha.slice(0, 4));
      const anterior = doc.id ? await peticion(documentos.get(doc.id)) : null;
      let numero = doc.numero;
      if (!anterior || anterior.anio !== anio) {
        numero = U.siguienteNumero(await peticion(documentos.index("tipoAnio").getAll([doc.tipo, anio])));
      }
      const datos = { ...doc, anio, numero, actualizado: new Date().toISOString() };
      if (!datos.id) delete datos.id;
      return peticion(documentos.put(datos));
    });
  }

  /** Crea una factura a partir de un presupuesto y lo marca como facturado. */
  async function convertirEnFactura(presupuestoId) {
    const p = await obtener("documentos", presupuestoId);
    if (!p || p.tipo !== "presupuesto") throw new Error("Presupuesto no encontrado");
    if (p.facturaId) return p.facturaId;
    const base = await nuevoDocumento("factura");
    const facturaId = await guardarDocumento({
      ...base, titulo: p.titulo, clienteId: p.clienteId, cliente: { ...p.cliente },
      lineas: p.lineas.map((l) => ({ ...l })), irpf: p.irpf, notas: p.notas, presupuestoId,
    });
    await poner("documentos", { ...p, estado: "facturado", facturaId });
    return facturaId;
  }

  /** Elimina un documento y deshace el enlace presupuesto ⇄ factura si lo había. */
  function eliminarDocumento(id) {
    return transaccion("documentos", "readwrite", async ({ documentos }) => {
      const d = await peticion(documentos.get(id));
      if (!d) return;
      if (d.presupuestoId) {
        const p = await peticion(documentos.get(d.presupuestoId));
        if (p) { delete p.facturaId; p.estado = "aceptado"; await peticion(documentos.put(p)); }
      }
      if (d.facturaId) {
        const f = await peticion(documentos.get(d.facturaId));
        if (f) { delete f.presupuestoId; await peticion(documentos.put(f)); }
      }
      await peticion(documentos.delete(id));
    });
  }

  // ---------- Clientes ----------
  /** Elimina un cliente; los documentos conservan su copia de los datos. */
  function eliminarCliente(id) {
    return transaccion(["clientes", "documentos"], "readwrite", async ({ clientes, documentos }) => {
      const usados = await peticion(documentos.index("clienteId").getAll(id));
      for (const d of usados) { d.clienteId = null; await peticion(documentos.put(d)); }
      await peticion(clientes.delete(id));
    });
  }

  // ---------- Copia de seguridad ----------
  async function exportarCopia() {
    const datos = {
      app: NOMBRE, version: 1, exportado: new Date().toISOString(),
      clientes: await todos("clientes"), documentos: await todos("documentos"), ajustes: await todos("ajustes"),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `copia-facturas-${U.hoyISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importarCopia(archivo) {
    let datos;
    try { datos = JSON.parse(await archivo.text()); } catch (_) { throw new Error("El archivo no es un JSON válido."); }
    if (!datos || datos.app !== NOMBRE) throw new Error("El archivo no es una copia de esta aplicación.");
    await transaccion(["clientes", "documentos", "ajustes"], "readwrite", async (s) => {
      for (const n of ["clientes", "documentos", "ajustes"]) {
        await peticion(s[n].clear());
        for (const obj of datos[n] || []) await peticion(s[n].put(obj));
      }
    });
  }

  return {
    todos, obtener, poner, borrar, porIndice, obtenerAjustes, proximoNumero, nuevoDocumento, guardarDocumento,
    convertirEnFactura, eliminarDocumento, eliminarCliente, exportarCopia, importarCopia,
  };
})();
