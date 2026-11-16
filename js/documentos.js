// Facturas y presupuestos: lista, editor y vista imprimible (PDF).
const Documentos = (() => {
  const TEXTOS = {
    factura: {
      singular: "Factura", plural: "Facturas", nuevo: "Nueva factura", ruta: "#/facturas", vencimiento: "Vencimiento",
      estados: [["pendiente", "Pendiente"], ["pagada", "Pagada"]],
    },
    presupuesto: {
      singular: "Presupuesto", plural: "Presupuestos", nuevo: "Nuevo presupuesto", ruta: "#/presupuestos", vencimiento: "Válido hasta",
      estados: [["borrador", "Borrador"], ["enviado", "Enviado"], ["aceptado", "Aceptado"], ["rechazado", "Rechazado"], ["facturado", "Facturado"]],
    },
  };
  const textoEstado = (tipo, e) => (TEXTOS[tipo].estados.find(([v]) => v === e) || [, e])[1];
  const etiqueta = (tipo, e) => `<span class="etiqueta ${U.esc(e)}">${U.esc(textoEstado(tipo, e))}</span>`;
  const opciones = (lista, actual) =>
    lista.map(([v, t]) => `<option value="${U.esc(v)}" ${String(v) === String(actual) ? "selected" : ""}>${U.esc(t)}</option>`).join("");

  const TRIMESTRES = [["1", "1.er trimestre (ene–mar)"], ["2", "2.º trimestre (abr–jun)"], ["3", "3.er trimestre (jul–sep)"], ["4", "4.º trimestre (oct–dic)"]];
  const trimestreDe = (fechaISO) => String(Math.ceil(Number(fechaISO.slice(5, 7)) / 3));

  /** Guarda un envío en el historial del documento; un presupuesto en borrador pasa a "enviado". */
  async function registrarEnvio(id, { para, via }) {
    const ahora = new Date();
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString();
    const actual = await DB.obtener("documentos", id);
    actual.envios = [...(actual.envios || []), { fecha: local, para, via }];
    if (actual.tipo === "presupuesto" && actual.estado === "borrador") actual.estado = "enviado";
    await DB.poner("documentos", actual);
  }

  // =====================================================================
  // LISTA
  // =====================================================================
  async function lista(tipo, cont) {
    const t = TEXTOS[tipo];
    const docs = await DB.porIndice("documentos", "tipo", tipo);
    const porId = new Map(docs.map((d) => [d.id, d]));
    const anios = [...new Set([new Date().getFullYear(), ...docs.map((d) => Number(d.fecha.slice(0, 4)))])].sort((a, b) => b - a);

    // Año, trimestre y estado se recuerdan al volver al listado (durante la sesión); la búsqueda de texto no.
    const claveFiltros = `filtros-${tipo}`;
    let filtros = {};
    try { filtros = JSON.parse(sessionStorage.getItem(claveFiltros)) || {}; } catch (_) {}

    const seleccion = new Set(); // ids seleccionados (solo de los visibles)
    let visibles = [];
    let ultimoMarcado = null; // para seleccionar un rango con Mayús

    cont.innerHTML = `
      <div class="cabecera">
        <h1>${t.plural}</h1>
        <div class="acciones">
          ${tipo === "factura" ? `<a href="${t.ruta}/subir" class="boton">⬆ Subir factura (PDF)</a>` : ""}
          <a href="${t.ruta}/nueva" class="boton primario">+ ${t.nuevo}</a>
        </div>
      </div>
      <div class="panel">
        <div class="filtros">
          <input id="busqueda" placeholder="Buscar por nombre, número o cliente…">
          <select id="filtro-anio" aria-label="Año"><option value="">Todos los años</option>${opciones(anios.map((a) => [a, a]), filtros.anio)}</select>
          <select id="filtro-trimestre" aria-label="Trimestre"><option value="">Todos los trimestres</option>${opciones(TRIMESTRES, filtros.trimestre)}</select>
          <select id="filtro-estado" aria-label="Estado"><option value="">Todos los estados</option>${opciones(t.estados, filtros.estado)}</select>
        </div>
        <div id="resultados"></div>
      </div>`;

    const $ = (sel) => cont.querySelector(sel);
    const plural = (n) => (n === 1 ? t.singular.toLowerCase() : t.plural.toLowerCase());

    /** Documentos seleccionados, en orden cronológico (así salen impresos y en el ZIP). */
    const seleccionados = () =>
      [...seleccion].map((id) => porId.get(id)).filter(Boolean)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.anio - b.anio || a.numero - b.numero);

    const nombreZip = () => {
      const partes = [t.plural];
      if (filtros.anio) partes.push(filtros.anio);
      if (filtros.trimestre) partes.push(`${filtros.trimestre}T`);
      if (!filtros.anio && !filtros.trimestre) partes.push(U.hoyISO());
      return `${partes.join(" ")}.zip`;
    };

    /** Actualiza casillas, botones de la cabecera y contador sin volver a pintar la tabla. */
    const actualizarSeleccion = () => {
      const n = seleccion.size;
      const todas = $("#sel-todas");
      if (!todas) return;
      todas.checked = n > 0 && n === visibles.length;
      todas.indeterminate = n > 0 && n < visibles.length;
      cont.querySelectorAll("[data-sel]").forEach((c) => {
        c.checked = seleccion.has(Number(c.dataset.sel));
        c.closest("tr").classList.toggle("seleccionada", c.checked);
      });
      for (const b of cont.querySelectorAll("[data-lote]")) {
        b.disabled = n === 0;
        b.querySelector(".cuenta").textContent = n ? ` (${n})` : "";
      }
      $("#contador").textContent = `${visibles.length} ${plural(visibles.length)}` + (n ? ` · ${n} ${n === 1 ? "seleccionada" : "seleccionadas"}` : "");
      if (tipo === "presupuesto") $("#contador").textContent = $("#contador").textContent.replace("seleccionada", "seleccionado");
    };

    const pintar = () => {
      filtros = {
        q: $("#busqueda").value, anio: $("#filtro-anio").value, trimestre: $("#filtro-trimestre").value, estado: $("#filtro-estado").value,
      };
      try { sessionStorage.setItem(claveFiltros, JSON.stringify({ ...filtros, q: "" })); } catch (_) {}
      const q = filtros.q.trim().toLowerCase();
      visibles = docs
        .filter((d) => !filtros.estado || d.estado === filtros.estado)
        .filter((d) => !filtros.anio || d.fecha.slice(0, 4) === filtros.anio)
        .filter((d) => !filtros.trimestre || trimestreDe(d.fecha) === filtros.trimestre)
        .filter((d) => !q || `${U.nombreDocumento(d)} ${d.cliente.nombre} ${d.cliente.nif}`.toLowerCase().includes(q))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.anio - a.anio || b.numero - a.numero);
      // Lo que deja de verse al filtrar se deselecciona, para no imprimir ni descargar nada oculto.
      const idsVisibles = new Set(visibles.map((d) => d.id));
      for (const id of [...seleccion]) if (!idsVisibles.has(id)) seleccion.delete(id);
      ultimoMarcado = null;
      const res = $("#resultados");

      if (!visibles.length) {
        res.innerHTML = `<div class="vacio">${docs.length ? "No hay resultados con estos filtros." : `Todavía no hay ${t.plural.toLowerCase()}.`}</div>`;
        return;
      }

      const totales = visibles.map((d) => U.totalesDocumento(d));
      const suma = (k) => U.redondear(totales.reduce((s, x) => s + x[k], 0));
      res.innerHTML = `
        <div class="resumen">
          <div><span>Base imponible</span><strong>${U.euros(suma("base"))}</strong></div>
          <div><span>IVA</span><strong>${U.euros(suma("totalIva"))}</strong></div>
          <div><span>Retención IRPF</span><strong>${U.euros(suma("irpf"))}</strong></div>
          <div><span>Total</span><strong>${U.euros(suma("total"))}</strong></div>
        </div>
        <div class="tabla-desplazable"><table class="tabla tabla-listado">
          <thead><tr>
            <th class="col-casilla"><label class="casilla" title="Seleccionar todas"><input type="checkbox" id="sel-todas" aria-label="Seleccionar todas"></label></th>
            <th></th><th>${t.singular}</th><th>Fecha</th><th>Creada</th><th>Cliente</th><th>Estado</th><th class="num">Total</th>
            <th class="botones-fila">
              <button class="boton pequeno" data-lote="imprimir" disabled title="Imprimir las seleccionadas">Imprimir<span class="cuenta"></span></button>
              <button class="boton pequeno" data-lote="descargar" disabled title="Descargar las seleccionadas">Descargar<span class="cuenta"></span></button>
            </th>
          </tr></thead>
          <tbody>
            ${visibles.map((d, i) => `
              <tr class="clic" data-id="${d.id}">
                <td class="col-casilla"><label class="casilla"><input type="checkbox" data-sel="${d.id}" aria-label="Seleccionar ${U.esc(U.nombreDocumento(d))}"></label></td>
                <td>${d.subida
                  ? `<button class="boton pequeno" disabled title="Las facturas subidas en PDF no se pueden duplicar">Duplicar</button>`
                  : `<button class="boton pequeno" data-duplicar="${d.id}" title="Crear una ${t.singular.toLowerCase()} nueva a partir de esta">Duplicar</button>`}</td>
                <td class="col-texto"><strong>${d.subida
                  ? U.esc(U.nombreDocumento(d))
                  : `${d.titulo.trim() ? `${U.esc(d.titulo.trim())} ` : ""}<span class="sin-corte">${U.codigo(d.tipo, d.anio, d.numero)}</span>`}</strong>${d.subida ? ' <span class="etiqueta pdf" title="Factura subida en PDF">PDF</span>' : ""}</td>
                <td>${U.fechaES(d.fecha)}</td>
                <td>${U.fechaLocal(d.creado)}</td>
                <td class="col-texto">${d.cliente.nombre ? U.esc(d.cliente.nombre) : '<span class="texto-suave">Sin cliente</span>'}</td>
                <td>${etiqueta(tipo, d.estado)}</td>
                <td class="num">${U.euros(totales[i].total)}</td>
                <td class="botones-fila">
                  <button class="boton pequeno" data-imprimir="${d.id}">Imprimir</button>
                  <button class="boton pequeno" data-descargar="${d.id}">Descargar</button>
                  <button class="boton pequeno" data-enviar="${d.id}">Enviar por email</button>
                </td>
              </tr>`).join("")}
          </tbody>
          <tfoot><tr>
            <td colspan="9" class="texto-suave" style="padding-top:12px" id="contador"></td>
          </tr></tfoot>
        </table></div>`;
      actualizarSeleccion();
    };

    /** Ejecuta una acción mostrando el botón ocupado y avisando si falla. */
    const ocupado = async (boton, textoError, accion) => {
      const html = boton.innerHTML;
      boton.disabled = true;
      try {
        await accion();
      } catch (err) {
        alert(`${textoError}: ${err.message}`);
      } finally {
        boton.innerHTML = html;
        boton.disabled = false;
        actualizarSeleccion();
      }
    };

    $("#resultados").addEventListener("change", (e) => {
      if (e.target.id === "sel-todas") {
        if (e.target.checked) visibles.forEach((d) => seleccion.add(d.id));
        else seleccion.clear();
        actualizarSeleccion();
      }
    });

    $("#resultados").addEventListener("click", async (e) => {
      const casilla = e.target.closest("[data-sel]");
      if (casilla) {
        const id = Number(casilla.dataset.sel);
        const indice = visibles.findIndex((d) => d.id === id);
        if (e.shiftKey && ultimoMarcado !== null) {
          // Mayús + clic: marca o desmarca todo el rango.
          const [desde, hasta] = [Math.min(ultimoMarcado, indice), Math.max(ultimoMarcado, indice)];
          for (let i = desde; i <= hasta; i++) casilla.checked ? seleccion.add(visibles[i].id) : seleccion.delete(visibles[i].id);
        } else {
          casilla.checked ? seleccion.add(id) : seleccion.delete(id);
        }
        ultimoMarcado = indice;
        actualizarSeleccion();
        return;
      }
      if (e.target.closest(".casilla")) return; // clic en el hueco de la casilla: no abrir la factura

      const lote = e.target.closest("[data-lote]");
      const dup = e.target.closest("[data-duplicar]");
      const env = e.target.closest("[data-enviar]");
      const imp = e.target.closest("[data-imprimir]");
      const des = e.target.closest("[data-descargar]");
      const fila = e.target.closest("tr[data-id]");

      if (lote) {
        const elegidos = seleccionados();
        if (!elegidos.length) return;
        const emisor = await DB.obtenerAjustes();
        if (lote.dataset.lote === "imprimir") {
          await ocupado(lote, "No se pudo imprimir", () => imprimir(elegidos, emisor));
        } else {
          await ocupado(lote, "No se pudo descargar", async () => {
            lote.textContent = "Preparando…";
            await PDF.descargarVarios(elegidos, emisor, nombreZip());
          });
        }
      } else if (dup) {
        location.hash = `${t.ruta}/duplicar/${dup.dataset.duplicar}`;
      } else if (imp) {
        const doc = porId.get(Number(imp.dataset.imprimir));
        await ocupado(imp, "No se pudo imprimir", async () => imprimir([doc], await DB.obtenerAjustes()));
      } else if (des) {
        const doc = porId.get(Number(des.dataset.descargar));
        await ocupado(des, "No se pudo descargar", async () => PDF.descargar(doc, await DB.obtenerAjustes()));
      } else if (env) {
        const id = Number(env.dataset.enviar);
        const [doc, emisor] = await Promise.all([DB.obtener("documentos", id), DB.obtenerAjustes()]);
        Correo.abrirVentana(doc, emisor, async (envio) => {
          await registrarEnvio(id, envio);
          lista(tipo, cont);
        });
      } else if (fila) {
        location.hash = `${t.ruta}/ver/${fila.dataset.id}`;
      }
    });
    $("#busqueda").addEventListener("input", pintar);
    ["#filtro-anio", "#filtro-trimestre", "#filtro-estado"].forEach((s) => $(s).addEventListener("change", pintar));
    pintar();
  }

  // =====================================================================
  // EDITOR
  // =====================================================================
  async function editor(tipo, id, cont, duplicarDe = null) {
    const t = TEXTOS[tipo];
    let doc;
    if (id) {
      doc = await DB.obtener("documentos", id);
      if (!doc || doc.tipo !== tipo) return noEncontrado(tipo, cont);
      if (doc.subida) return editorSubida(id, cont);
    } else if (duplicarDe) {
      // Copia el contenido de otro documento, pero como uno nuevo: fecha de hoy, número nuevo, sin envíos.
      const origen = await DB.obtener("documentos", duplicarDe);
      if (!origen || origen.tipo !== tipo) return noEncontrado(tipo, cont);
      const base = await DB.nuevoDocumento(tipo);
      doc = {
        ...base, titulo: origen.titulo, clienteId: origen.clienteId, cliente: { ...origen.cliente },
        lineas: origen.lineas.map((l) => ({ ...l })), irpf: origen.irpf, notas: origen.notas,
      };
    } else {
      doc = await DB.nuevoDocumento(tipo);
    }
    const anioOriginal = id ? doc.anio : null;
    const numeroOriginal = doc.numero;
    const clientes = (await DB.todos("clientes")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    cont.innerHTML = `
      <div class="cabecera">
        <h1>${id ? `Editar ${t.singular.toLowerCase()}` : duplicarDe ? `${t.nuevo} (copia)` : t.nuevo}</h1>
        <div class="acciones">
          <a href="${id ? `${t.ruta}/ver/${id}` : duplicarDe ? `${t.ruta}/ver/${duplicarDe}` : t.ruta}" class="boton">Cancelar</a>
          <button class="boton primario" id="guardar">Guardar</button>
        </div>
      </div>

      <div class="panel">
        <h2>Datos del ${t.singular.toLowerCase()}</h2>
        <div class="rejilla">
          <div class="campo ancho">
            <label for="titulo">Nombre (opcional) — se mostrará delante del número</label>
            <input id="titulo" value="${U.esc(doc.titulo)}" placeholder="${tipo === "factura" ? "Ej.: Factura para Paco" : "Ej.: Presupuesto reforma cocina"}">
            <small class="texto-suave">Quedará como: <strong id="vista-nombre"></strong></small>
          </div>
          <div class="campo"><label for="fecha">Fecha</label><input type="date" id="fecha" value="${doc.fecha}"></div>
          <div class="campo"><label for="vencimiento">${t.vencimiento}</label><input type="date" id="vencimiento" value="${doc.vencimiento}"></div>
          <div class="campo"><label for="estado">Estado</label><select id="estado">${opciones(t.estados, doc.estado)}</select></div>
        </div>
      </div>

      <div class="panel">
        <div class="cabecera" style="margin-bottom:12px">
          <h2 style="margin:0">Cliente</h2>
          <div class="acciones">
            <select id="cliente-guardado" style="width:260px">
              <option value="">— Elegir cliente guardado —</option>
              ${clientes.map((c) => `<option value="${c.id}" ${c.id === doc.clienteId ? "selected" : ""}>${U.esc(c.nombre)}${c.nif ? ` (${U.esc(c.nif)})` : ""}</option>`).join("")}
            </select>
            <button class="boton" id="guardar-cliente">Guardar como cliente</button>
          </div>
        </div>
        <div class="rejilla">
          ${U.CAMPOS_FISCALES.map(([k, txt]) => `
            <div class="campo"><label for="cli-${k}">${txt}</label><input id="cli-${k}" data-cliente="${k}" value="${U.esc(doc.cliente[k])}"></div>`).join("")}
        </div>
      </div>

      <div class="panel">
        <h2>Conceptos</h2>
        <table class="tabla lineas">
          <thead><tr>
            <th style="width:40%">Concepto</th><th class="num">Cantidad</th><th class="num">Precio (€)</th>
            <th class="num">Dto. %</th><th>IVA</th><th class="num">Importe</th><th></th>
          </tr></thead>
          <tbody id="lineas"></tbody>
        </table>
        <button class="boton" id="anadir-linea" style="margin-top:10px">+ Añadir línea</button>

        <div style="display:flex;gap:24px;margin-top:24px;flex-wrap:wrap">
          <div class="campo" style="flex:1;min-width:260px">
            <label for="notas">Notas (aparecen en el documento)</label>
            <textarea id="notas" placeholder="Forma de pago, condiciones…">${U.esc(doc.notas)}</textarea>
            <label for="irpf" style="margin-top:10px">Retención IRPF</label>
            <select id="irpf" style="width:160px">
              ${opciones([...new Set([...U.TIPOS_IRPF, doc.irpf])].sort((a, b) => a - b).map((v) => [v, v === 0 ? "Sin retención" : `${v} %`]), doc.irpf)}
            </select>
          </div>
          <div class="totales" id="totales"></div>
        </div>
      </div>`;

    const $ = (sel) => cont.querySelector(sel);

    const pintarNombre = () => ($("#vista-nombre").textContent = U.nombreDocumento(doc));
    const pintarBotonCliente = () => ($("#guardar-cliente").hidden = !!doc.clienteId);

    const pintarTotales = () => {
      const tot = U.calcularTotales(doc.lineas, doc.irpf);
      $("#totales").innerHTML = `
        <div><span>Base imponible</span><span>${U.euros(tot.base)}</span></div>
        ${tot.ivas.map((i) => `<div><span>IVA ${i.tipo} %</span><span>${U.euros(i.cuota)}</span></div>`).join("")}
        ${doc.irpf > 0 ? `<div><span>Retención IRPF ${doc.irpf} %</span><span>−${U.euros(tot.irpf)}</span></div>` : ""}
        <div class="total"><span>Total</span><span>${U.euros(tot.total)}</span></div>`;
      doc.lineas.forEach((l, i) => {
        const celda = cont.querySelector(`[data-importe="${i}"]`);
        if (celda) celda.textContent = U.euros(U.baseLinea(l));
      });
    };

    const pintarLineas = () => {
      $("#lineas").innerHTML = doc.lineas.map((l, i) => `
        <tr>
          <td><input data-i="${i}" data-campo="concepto" value="${U.esc(l.concepto)}" placeholder="Descripción del producto o servicio"></td>
          <td><input data-i="${i}" data-campo="cantidad" type="number" step="any" value="${l.cantidad}" style="text-align:right"></td>
          <td><input data-i="${i}" data-campo="precio" type="number" step="0.01" value="${l.precio}" style="text-align:right"></td>
          <td><input data-i="${i}" data-campo="descuento" type="number" step="any" min="0" max="100" value="${l.descuento}" style="text-align:right"></td>
          <td><select data-i="${i}" data-campo="iva">${opciones(U.TIPOS_IVA.map((v) => [v, `${v} %`]), l.iva)}</select></td>
          <td class="num" data-importe="${i}"></td>
          <td><button class="boton pequeno peligro" data-quitar="${i}" title="Quitar línea" ${doc.lineas.length === 1 ? "disabled" : ""}>✕</button></td>
        </tr>`).join("");
      pintarTotales();
    };

    // --- Eventos ---
    $("#titulo").addEventListener("input", (e) => { doc.titulo = e.target.value; pintarNombre(); });
    $("#vencimiento").addEventListener("change", (e) => (doc.vencimiento = e.target.value));
    $("#estado").addEventListener("change", (e) => (doc.estado = e.target.value));
    $("#notas").addEventListener("input", (e) => (doc.notas = e.target.value));
    $("#irpf").addEventListener("change", (e) => { doc.irpf = Number(e.target.value); pintarTotales(); });

    $("#fecha").addEventListener("change", async (e) => {
      if (!e.target.value) return;
      doc.fecha = e.target.value;
      const anio = Number(doc.fecha.slice(0, 4));
      if (anio !== doc.anio) {
        // Muestra el número que tendrá en el nuevo año.
        doc.numero = anio === anioOriginal ? numeroOriginal : await DB.proximoNumero(tipo, anio);
        doc.anio = anio;
        pintarNombre();
      }
    });

    cont.querySelectorAll("[data-cliente]").forEach((inp) =>
      inp.addEventListener("input", () => (doc.cliente[inp.dataset.cliente] = inp.value)));

    $("#cliente-guardado").addEventListener("change", (e) => {
      const c = clientes.find((c) => c.id === Number(e.target.value));
      doc.clienteId = c ? c.id : null;
      if (c) {
        for (const [k] of U.CAMPOS_FISCALES) {
          doc.cliente[k] = c[k] || "";
          $(`#cli-${k}`).value = doc.cliente[k];
        }
      }
      pintarBotonCliente();
    });

    $("#guardar-cliente").addEventListener("click", async () => {
      if (!doc.cliente.nombre.trim()) return alert("Escribe al menos el nombre del cliente.");
      const nuevo = { ...doc.cliente, creado: new Date().toISOString() };
      nuevo.id = await DB.poner("clientes", nuevo);
      clientes.push(nuevo);
      doc.clienteId = nuevo.id;
      const opt = new Option(`${nuevo.nombre}${nuevo.nif ? ` (${nuevo.nif})` : ""}`, nuevo.id, true, true);
      $("#cliente-guardado").add(opt);
      pintarBotonCliente();
      U.aviso("Cliente guardado");
    });

    $("#lineas").addEventListener("input", (e) => {
      const { i, campo } = e.target.dataset;
      if (i === undefined) return;
      const l = doc.lineas[Number(i)];
      l[campo] = campo === "concepto" ? e.target.value : Number(e.target.value) || 0;
      pintarTotales();
    });
    $("#lineas").addEventListener("change", (e) => {
      if (e.target.dataset.campo === "iva") { doc.lineas[Number(e.target.dataset.i)].iva = Number(e.target.value); pintarTotales(); }
    });
    $("#lineas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-quitar]");
      if (!b || doc.lineas.length === 1) return;
      doc.lineas.splice(Number(b.dataset.quitar), 1);
      pintarLineas();
    });
    $("#anadir-linea").addEventListener("click", () => {
      const ultimoIva = doc.lineas.length ? doc.lineas[doc.lineas.length - 1].iva : 21;
      doc.lineas.push({ concepto: "", cantidad: 1, precio: 0, descuento: 0, iva: ultimoIva });
      pintarLineas();
      cont.querySelector(`[data-i="${doc.lineas.length - 1}"][data-campo="concepto"]`).focus();
    });

    $("#guardar").addEventListener("click", async () => {
      const lineas = doc.lineas.filter((l) => l.concepto.trim());
      if (!lineas.length) return alert("Añade al menos un concepto.");
      $("#guardar").disabled = true;
      try {
        const nuevoId = await DB.guardarDocumento({ ...doc, lineas });
        U.aviso(`${t.singular} guardad${tipo === "factura" ? "a" : "o"}`);
        location.hash = `${t.ruta}/ver/${nuevoId}`;
      } catch (err) {
        alert(`No se pudo guardar: ${err.message}`);
        $("#guardar").disabled = false;
      }
    });

    pintarNombre();
    pintarBotonCliente();
    pintarLineas();
  }

  // =====================================================================
  // VISTA / PDF
  // =====================================================================
  const bloqueDatos = (d) => {
    const ciudad = [d.cp, d.ciudad].filter(Boolean).join(" ") + (d.provincia ? ` (${d.provincia})` : "");
    return `<p>
      <strong>${U.esc(d.nombre) || "—"}</strong>
      ${d.nif ? `<br>NIF: ${U.esc(d.nif)}` : ""}
      ${d.direccion ? `<br>${U.esc(d.direccion)}` : ""}
      ${ciudad.trim() ? `<br>${U.esc(ciudad)}` : ""}
      ${d.email ? `<br>${U.esc(d.email)}` : ""}
      ${d.telefono ? `<br>${U.esc(d.telefono)}` : ""}
    </p>`;
  };

  /** HTML de la hoja de la factura/presupuesto (pantalla e impresión). */
  function htmlHoja(doc, emisor) {
    const t = TEXTOS[doc.tipo];
    const tipo = doc.tipo;
    const nombre = U.nombreDocumento(doc);
    const tot = U.calcularTotales(doc.lineas, doc.irpf);
    const hayDto = doc.lineas.some((l) => l.descuento);
    return `
      <article class="hoja">
        <div class="hoja-cab">
          <div>
            ${emisor.logo ? `<img src="${U.esc(emisor.logo)}" alt="Logo">` : ""}
            ${bloqueDatos(emisor)}
          </div>
          <div class="hoja-titulo">
            <h1>${t.singular}</h1>
            <div class="nombre">${U.esc(nombre)}</div>
            <div style="margin-top:10px;line-height:1.6">
              Fecha: ${U.fechaES(doc.fecha)}
              ${doc.vencimiento ? `<br>${t.vencimiento}: ${U.fechaES(doc.vencimiento)}` : ""}
            </div>
          </div>
        </div>

        <div class="partes">
          <div><h3>${tipo === "factura" ? "Facturar a" : "Cliente"}</h3>${bloqueDatos(doc.cliente)}</div>
        </div>

        <table class="tabla">
          <thead><tr>
            <th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th>
            ${hayDto ? '<th class="num">Dto.</th>' : ""}<th class="num">IVA</th><th class="num">Importe</th>
          </tr></thead>
          <tbody>
            ${doc.lineas.map((l) => `
              <tr>
                <td>${U.esc(l.concepto)}</td>
                <td class="num">${Number(l.cantidad).toLocaleString("es-ES")}</td>
                <td class="num">${U.euros(l.precio)}</td>
                ${hayDto ? `<td class="num">${l.descuento ? `${l.descuento} %` : ""}</td>` : ""}
                <td class="num">${l.iva} %</td>
                <td class="num">${U.euros(U.baseLinea(l))}</td>
              </tr>`).join("")}
          </tbody>
        </table>

        <div class="totales" style="margin-top:20px">
          <div><span>Base imponible</span><span>${U.euros(tot.base)}</span></div>
          ${tot.ivas.map((i) => `<div><span>IVA ${i.tipo} % (sobre ${U.euros(i.base)})</span><span>${U.euros(i.cuota)}</span></div>`).join("")}
          ${doc.irpf > 0 ? `<div><span>Retención IRPF ${doc.irpf} %</span><span>−${U.euros(tot.irpf)}</span></div>` : ""}
          <div class="total"><span>Total</span><span>${U.euros(tot.total)}</span></div>
        </div>

        ${doc.notas || emisor.iban || emisor.notasPie ? `
          <div class="pie">
            ${doc.notas ? `<div>${U.esc(doc.notas)}</div>` : ""}
            ${tipo === "factura" && emisor.iban ? `<div style="margin-top:8px">Pago por transferencia a: <strong>${U.esc(emisor.iban)}</strong></div>` : ""}
            ${emisor.notasPie ? `<div style="margin-top:8px">${U.esc(emisor.notasPie)}</div>` : ""}
          </div>` : ""}
      </article>`;
  }

  /**
   * Imprime uno o varios documentos sin salir de la página: los pinta en un marco oculto con los
   * estilos de impresión (A4, cada documento en su página) y abre el diálogo de la impresora.
   */
  async function imprimir(documentos, emisor) {
    const lista = [].concat(documentos);
    // Los PDF subidos no se pueden pintar como HTML: se unen todos en un PDF y se imprime ese.
    if (lista.some((d) => d.subida)) return PDF.imprimirBytes(await PDF.unir(lista, emisor));
    const titulo = lista.length === 1 ? U.nombreDocumento(lista[0]) : `${TEXTOS[lista[0].tipo].plural} (${lista.length})`;
    return new Promise((resolver) => {
      document.getElementById("marco-impresion")?.remove();
      const marco = document.createElement("iframe");
      marco.id = "marco-impresion";
      marco.title = "Impresión";
      marco.setAttribute("aria-hidden", "true");
      marco.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
      const hojaEstilos = new URL("css/estilos.css", location.href.split("#")[0]).href;
      marco.srcdoc = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <title>${U.esc(titulo)}</title>
        <link rel="stylesheet" href="${U.esc(hojaEstilos)}">
        <style>body{background:#fff}.hoja{border:none;padding:0;max-width:none}.hoja+.hoja{break-before:page;page-break-before:always}</style>
        </head><body>${lista.map((d) => htmlHoja(d, emisor)).join("")}</body></html>`;
      marco.onload = () => {
        const ventana = marco.contentWindow;
        const imgs = [...ventana.document.images].filter((i) => !i.complete);
        Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(() => {
          ventana.focus();
          ventana.print();
          resolver();
        });
      };
      document.body.appendChild(marco);
    });
  }

  async function vista(tipo, id, cont) {
    const t = TEXTOS[tipo];
    const doc = await DB.obtener("documentos", id);
    if (!doc || doc.tipo !== tipo) return noEncontrado(tipo, cont);
    if (doc.subida) return vistaSubida(id, cont);
    const emisor = await DB.obtenerAjustes();
    const nombre = U.nombreDocumento(doc);
    const tot = U.calcularTotales(doc.lineas, doc.irpf);
    const hayDto = doc.lineas.some((l) => l.descuento);

    let botonesTipo = "";
    if (tipo === "factura") {
      botonesTipo = `<button class="boton" id="cambiar-estado">${doc.estado === "pagada" ? "Marcar pendiente" : "Marcar pagada"}</button>`;
    } else {
      botonesTipo = doc.facturaId
        ? `<a class="boton" href="#/facturas/ver/${doc.facturaId}">Ver factura</a>`
        : `<button class="boton" id="convertir">Convertir en factura</button>`;
    }

    cont.innerHTML = `
      <div class="cabecera no-print">
        <div>
          <a href="${t.ruta}" class="volver">← ${t.plural}</a>
          <h1 style="margin-top:6px">${U.esc(nombre)} ${etiqueta(tipo, doc.estado)}</h1>
        </div>
        <div class="acciones">
          ${botonesTipo}
          <a class="boton" href="${t.ruta}/duplicar/${id}">Duplicar</a>
          <a class="boton" href="${t.ruta}/editar/${id}">Editar</a>
          <button class="boton" id="pdf">Descargar PDF</button>
          <button class="boton" id="imprimir">Imprimir</button>
          <button class="boton primario" id="enviar">Enviar por email</button>
          <button class="boton peligro" id="eliminar">Eliminar</button>
        </div>
      </div>
      ${(doc.envios || []).length ? `<div class="envios no-print">✉️ ${doc.envios.slice().reverse().map((e) =>
        `Enviado a ${U.esc(e.para || "—")} el ${U.fechaES(e.fecha.slice(0, 10))} a las ${e.fecha.slice(11, 16)} · ${U.esc(e.via)}`).join("<br>")}</div>` : ""}

      ${!emisor.nombre || !emisor.nif ? `<div class="aviso no-print">Faltan tus datos fiscales (nombre y NIF). Complétalos en <a href="#/ajustes">Ajustes</a> para que aparezcan en el documento.</div>` : ""}
      ${doc.presupuestoId ? `<p class="no-print texto-suave">Creada a partir de un <a href="#/presupuestos/ver/${doc.presupuestoId}">presupuesto</a>.</p>` : ""}

      ${htmlHoja(doc, emisor)}`;

    const $ = (sel) => cont.querySelector(sel);

    $("#pdf").addEventListener("click", async () => {
      try { await PDF.descargar(doc, emisor); } catch (e) { alert(`No se pudo generar el PDF: ${e.message}`); }
    });

    $("#imprimir").addEventListener("click", async () => {
      try { await imprimir([doc], emisor); } catch (e) { alert(`No se pudo imprimir: ${e.message}`); }
    });

    $("#enviar").addEventListener("click", () =>
      Correo.abrirVentana(doc, emisor, async (envio) => {
        await registrarEnvio(id, envio);
        vista(tipo, id, cont);
      }));

    $("#eliminar").addEventListener("click", async () => {
      if (!confirm(`¿Eliminar "${nombre}"? No se puede deshacer.`)) return;
      await DB.eliminarDocumento(id);
      U.aviso("Eliminado");
      location.hash = t.ruta;
    });

    const estadoBtn = $("#cambiar-estado");
    if (estadoBtn) estadoBtn.addEventListener("click", async () => {
      await DB.poner("documentos", { ...doc, estado: doc.estado === "pagada" ? "pendiente" : "pagada" });
      vista(tipo, id, cont);
    });

    const convertirBtn = $("#convertir");
    if (convertirBtn) convertirBtn.addEventListener("click", async () => {
      convertirBtn.disabled = true;
      const facturaId = await DB.convertirEnFactura(id);
      U.aviso("Factura creada desde el presupuesto");
      location.hash = `#/facturas/ver/${facturaId}`;
    });
  }

  // =====================================================================
  // FACTURAS SUBIDAS EN PDF
  // =====================================================================
  const MAX_PDF = 20 * 1024 * 1024;
  const tamano = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

  /** Formulario para subir una factura en PDF (id = null) o editar los datos de una ya subida. */
  async function editorSubida(id, cont) {
    const t = TEXTOS.factura;
    let doc;
    if (id) {
      doc = await DB.obtener("documentos", id);
    } else {
      const base = await DB.nuevoDocumento("factura");
      doc = { ...base, subida: true, numero: 0, vencimiento: "", lineas: [], irpf: 0, importes: { base: "", iva: "", irpf: "" }, archivo: null };
    }
    doc.importes = doc.importes || { base: "", iva: "", irpf: "" };
    const clientes = (await DB.todos("clientes")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const valor = (n) => (n === "" || n === undefined || n === null ? "" : n);

    cont.innerHTML = `
      <div class="cabecera">
        <h1>${id ? "Editar factura subida" : "Subir factura (PDF)"}</h1>
        <div class="acciones">
          <a href="${id ? `${t.ruta}/ver/${id}` : t.ruta}" class="boton">Cancelar</a>
          <button class="boton primario" id="guardar">Guardar</button>
        </div>
      </div>

      <div class="panel">
        <h2>Archivo</h2>
        <label class="zona-subida" id="zona">
          <input type="file" id="archivo" accept="application/pdf,.pdf" hidden>
          <span id="zona-texto"></span>
        </label>
      </div>

      <div class="panel">
        <h2>Datos de la factura</h2>
        <p class="texto-suave" style="margin-top:-6px">Solo sirven para buscarla, filtrarla por trimestre y sumar los importes. El PDF se guarda tal cual.</p>
        <div class="rejilla">
          <div class="campo ancho"><label for="titulo">Nombre o número de la factura</label>
            <input id="titulo" value="${U.esc(doc.titulo)}" placeholder="Ej.: F-2026-015 Reforma Paco"></div>
          <div class="campo"><label for="fecha">Fecha de la factura</label><input type="date" id="fecha" value="${doc.fecha}"></div>
          <div class="campo"><label for="vencimiento">Vencimiento (opcional)</label><input type="date" id="vencimiento" value="${doc.vencimiento || ""}"></div>
          <div class="campo"><label for="estado">Estado</label><select id="estado">${opciones(t.estados, doc.estado)}</select></div>
        </div>
      </div>

      <div class="panel">
        <div class="cabecera" style="margin-bottom:12px">
          <h2 style="margin:0">Cliente (opcional)</h2>
          <select id="cliente-guardado" style="width:260px">
            <option value="">— Elegir cliente guardado —</option>
            ${clientes.map((c) => `<option value="${c.id}" ${c.id === doc.clienteId ? "selected" : ""}>${U.esc(c.nombre)}${c.nif ? ` (${U.esc(c.nif)})` : ""}</option>`).join("")}
          </select>
        </div>
        <div class="rejilla">
          <div class="campo"><label for="cli-nombre">Nombre o razón social</label><input id="cli-nombre" data-cliente="nombre" value="${U.esc(doc.cliente.nombre)}"></div>
          <div class="campo"><label for="cli-nif">NIF / CIF</label><input id="cli-nif" data-cliente="nif" value="${U.esc(doc.cliente.nif)}"></div>
          <div class="campo"><label for="cli-email">Email (para enviársela)</label><input id="cli-email" data-cliente="email" value="${U.esc(doc.cliente.email)}"></div>
        </div>
      </div>

      <div class="panel">
        <h2>Importes (opcional)</h2>
        <div class="rejilla">
          <div class="campo"><label for="imp-base">Base imponible (€)</label><input id="imp-base" data-importe="base" type="number" step="0.01" value="${valor(doc.importes.base)}"></div>
          <div class="campo"><label for="imp-iva">IVA (€)</label><input id="imp-iva" data-importe="iva" type="number" step="0.01" value="${valor(doc.importes.iva)}">
            <small class="texto-suave">Rellenar: <a href="#" data-iva="21">21 %</a> · <a href="#" data-iva="10">10 %</a> · <a href="#" data-iva="4">4 %</a></small></div>
          <div class="campo"><label for="imp-irpf">Retención IRPF (€)</label><input id="imp-irpf" data-importe="irpf" type="number" step="0.01" value="${valor(doc.importes.irpf)}">
            <small class="texto-suave">Rellenar: <a href="#" data-irpf="7">7 %</a> · <a href="#" data-irpf="15">15 %</a></small></div>
          <div class="campo"><label>Total</label><div class="total-subida" id="total"></div></div>
        </div>
      </div>`;

    const $ = (sel) => cont.querySelector(sel);
    let archivo = doc.archivo; // { nombre, tipo, tamano, datos: Blob }

    const pintarArchivo = () => {
      $("#zona-texto").innerHTML = archivo
        ? `📄 <strong>${U.esc(archivo.nombre)}</strong> <span class="texto-suave">(${tamano(archivo.tamano || archivo.datos.size)})</span><br><span class="texto-suave">Haz clic o arrastra otro PDF para cambiarlo</span>`
        : `<strong>Haz clic para elegir el PDF</strong> o arrástralo aquí<br><span class="texto-suave">Máximo 20 MB</span>`;
      $("#zona").classList.toggle("con-archivo", !!archivo);
    };
    const pintarTotal = () => ($("#total").textContent = U.euros(U.totalesDocumento({ subida: true, importes: doc.importes }).total));

    const elegirArchivo = async (f) => {
      if (!f) return;
      const esPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (!esPdf) return alert("Solo se pueden subir archivos PDF.");
      if (f.size > MAX_PDF) return alert("El PDF ocupa más de 20 MB.");
      const cabecera = new Uint8Array(await f.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...cabecera) !== "%PDF-") return alert("El archivo no parece un PDF válido.");
      archivo = { nombre: f.name, tipo: "application/pdf", tamano: f.size, datos: f };
      if (!$("#titulo").value.trim()) $("#titulo").value = f.name.replace(/\.pdf$/i, "");
      pintarArchivo();
    };

    $("#archivo").addEventListener("change", (e) => elegirArchivo(e.target.files[0]));
    const zona = $("#zona");
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("arrastrando"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("arrastrando"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("arrastrando"); elegirArchivo(e.dataTransfer.files[0]); });

    cont.querySelectorAll("[data-cliente]").forEach((inp) => inp.addEventListener("input", () => (doc.cliente[inp.dataset.cliente] = inp.value)));
    $("#cliente-guardado").addEventListener("change", (e) => {
      const c = clientes.find((c) => c.id === Number(e.target.value));
      doc.clienteId = c ? c.id : null;
      if (c) {
        for (const [k] of U.CAMPOS_FISCALES) doc.cliente[k] = c[k] || "";
        ["nombre", "nif", "email"].forEach((k) => ($(`#cli-${k}`).value = doc.cliente[k]));
      }
    });
    cont.querySelectorAll("[data-importe]").forEach((inp) => inp.addEventListener("input", () => {
      doc.importes[inp.dataset.importe] = inp.value === "" ? "" : Number(inp.value);
      pintarTotal();
    }));
    const rellenarPct = (campo, pct) => {
      const base = Number(doc.importes.base) || 0;
      doc.importes[campo] = U.redondear((base * pct) / 100);
      $(`#imp-${campo}`).value = doc.importes[campo];
      pintarTotal();
    };
    cont.querySelectorAll("[data-iva]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); rellenarPct("iva", Number(a.dataset.iva)); }));
    cont.querySelectorAll("[data-irpf]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); rellenarPct("irpf", Number(a.dataset.irpf)); }));

    $("#guardar").addEventListener("click", async () => {
      if (!archivo) return alert("Elige el PDF de la factura.");
      const fecha = $("#fecha").value;
      if (!fecha) return alert("Indica la fecha de la factura.");
      $("#guardar").disabled = true;
      try {
        const nuevoId = await DB.guardarDocumento({
          ...doc,
          titulo: $("#titulo").value.trim() || archivo.nombre.replace(/\.pdf$/i, ""),
          fecha, vencimiento: $("#vencimiento").value, estado: $("#estado").value,
          archivo: { nombre: archivo.nombre, tipo: "application/pdf", tamano: archivo.tamano || archivo.datos.size, datos: archivo.datos },
        });
        U.aviso(id ? "Factura actualizada" : "Factura subida");
        location.hash = `${t.ruta}/ver/${nuevoId}`;
      } catch (err) {
        alert(`No se pudo guardar: ${err.message}`);
        $("#guardar").disabled = false;
      }
    });

    pintarArchivo();
    pintarTotal();
  }

  /** Vista de una factura subida: datos y el PDF original en un visor. */
  async function vistaSubida(id, cont) {
    const t = TEXTOS.factura;
    const doc = await DB.obtener("documentos", id);
    const emisor = await DB.obtenerAjustes();
    const nombre = U.nombreDocumento(doc);
    const tot = U.totalesDocumento(doc);
    const url = URL.createObjectURL(doc.archivo.datos);

    cont.innerHTML = `
      <div class="cabecera no-print">
        <div>
          <a href="${t.ruta}" class="volver">← ${t.plural}</a>
          <h1 style="margin-top:6px">${U.esc(nombre)} <span class="etiqueta pdf">PDF</span> ${etiqueta("factura", doc.estado)}</h1>
        </div>
        <div class="acciones">
          <button class="boton" id="cambiar-estado">${doc.estado === "pagada" ? "Marcar pendiente" : "Marcar pagada"}</button>
          <a class="boton" href="${t.ruta}/editar/${id}">Editar datos</a>
          <button class="boton" id="pdf">Descargar PDF</button>
          <button class="boton" id="imprimir">Imprimir</button>
          <button class="boton primario" id="enviar">Enviar por email</button>
          <button class="boton peligro" id="eliminar">Eliminar</button>
        </div>
      </div>
      ${(doc.envios || []).length ? `<div class="envios">✉️ ${doc.envios.slice().reverse().map((e) =>
        `Enviado a ${U.esc(e.para || "—")} el ${U.fechaES(e.fecha.slice(0, 10))} a las ${e.fecha.slice(11, 16)} · ${U.esc(e.via)}`).join("<br>")}</div>` : ""}

      <div class="panel datos-subida">
        <div><span>Fecha</span><strong>${U.fechaES(doc.fecha)}</strong></div>
        ${doc.vencimiento ? `<div><span>Vencimiento</span><strong>${U.fechaES(doc.vencimiento)}</strong></div>` : ""}
        <div><span>Cliente</span><strong>${U.esc(doc.cliente.nombre) || "—"}</strong></div>
        <div><span>Base imponible</span><strong>${U.euros(tot.base)}</strong></div>
        <div><span>IVA</span><strong>${U.euros(tot.totalIva)}</strong></div>
        ${tot.irpf ? `<div><span>Retención IRPF</span><strong>−${U.euros(tot.irpf)}</strong></div>` : ""}
        <div><span>Total</span><strong>${U.euros(tot.total)}</strong></div>
        <div><span>Archivo</span><strong>${U.esc(doc.archivo.nombre)}</strong></div>
      </div>

      <div class="visor-pdf">
        <iframe src="${url}" title="${U.esc(nombre)}"></iframe>
        <p class="texto-suave">¿No ves el PDF? <a href="${url}" target="_blank" rel="noopener">Ábrelo en otra pestaña</a>.</p>
      </div>`;

    const $ = (sel) => cont.querySelector(sel);
    $("#pdf").addEventListener("click", () => PDF.descargar(doc, emisor));
    $("#imprimir").addEventListener("click", async () => {
      try { await imprimir([doc], emisor); } catch (e) { alert(`No se pudo imprimir: ${e.message}`); }
    });
    $("#enviar").addEventListener("click", () =>
      Correo.abrirVentana(doc, emisor, async (envio) => {
        await registrarEnvio(id, envio);
        vistaSubida(id, cont);
      }));
    $("#cambiar-estado").addEventListener("click", async () => {
      await DB.poner("documentos", { ...doc, estado: doc.estado === "pagada" ? "pendiente" : "pagada" });
      vistaSubida(id, cont);
    });
    $("#eliminar").addEventListener("click", async () => {
      if (!confirm(`¿Eliminar "${nombre}"? Se borrará también el PDF guardado. No se puede deshacer.`)) return;
      await DB.eliminarDocumento(id);
      U.aviso("Eliminada");
      location.hash = t.ruta;
    });
  }

  function noEncontrado(tipo, cont) {
    const t = TEXTOS[tipo];
    cont.innerHTML = `<div class="panel vacio">No se ha encontrado este ${t.singular.toLowerCase()}. <a href="${t.ruta}">Volver</a></div>`;
  }

  return { lista, editor, vista, editorSubida };
})();
