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

  // =====================================================================
  // LISTA
  // =====================================================================
  async function lista(tipo, cont) {
    const t = TEXTOS[tipo];
    const docs = await DB.porIndice("documentos", "tipo", tipo);

    cont.innerHTML = `
      <div class="cabecera">
        <h1>${t.plural}</h1>
        <a href="${t.ruta}/nueva" class="boton primario">+ ${t.nuevo}</a>
      </div>
      <div class="panel">
        <div class="filtros">
          <input id="busqueda" placeholder="Buscar por nombre, número o cliente…">
          <select id="filtro-estado"><option value="">Todos los estados</option>${opciones(t.estados)}</select>
        </div>
        <div id="resultados"></div>
      </div>`;

    const pintar = () => {
      const q = cont.querySelector("#busqueda").value.trim().toLowerCase();
      const estado = cont.querySelector("#filtro-estado").value;
      const filtrados = docs
        .filter((d) => !estado || d.estado === estado)
        .filter((d) => !q || `${U.nombreDocumento(d)} ${d.cliente.nombre} ${d.cliente.nif}`.toLowerCase().includes(q))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.anio - a.anio || b.numero - a.numero);
      const res = cont.querySelector("#resultados");

      if (!filtrados.length) {
        res.innerHTML = `<div class="vacio">${docs.length ? "No hay resultados con estos filtros." : `Todavía no hay ${t.plural.toLowerCase()}.`}</div>`;
        return;
      }
      const suma = filtrados.reduce((s, d) => s + U.calcularTotales(d.lineas, d.irpf).total, 0);
      res.innerHTML = `
        <table class="tabla">
          <thead><tr><th>${t.singular}</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${filtrados.map((d) => `
              <tr class="clic" data-id="${d.id}">
                <td><strong>${U.esc(U.nombreDocumento(d))}</strong></td>
                <td>${U.fechaES(d.fecha)}</td>
                <td>${d.cliente.nombre ? U.esc(d.cliente.nombre) : '<span class="texto-suave">Sin cliente</span>'}</td>
                <td>${etiqueta(tipo, d.estado)}</td>
                <td class="num">${U.euros(U.calcularTotales(d.lineas, d.irpf).total)}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot><tr>
            <td colspan="4" class="texto-suave" style="padding-top:12px">${filtrados.length} ${filtrados.length === 1 ? t.singular.toLowerCase() : t.plural.toLowerCase()}</td>
            <td class="num" style="padding-top:12px"><strong>${U.euros(suma)}</strong></td>
          </tr></tfoot>
        </table>`;
      res.querySelectorAll("tr[data-id]").forEach((tr) =>
        tr.addEventListener("click", () => (location.hash = `${t.ruta}/ver/${tr.dataset.id}`)));
    };

    cont.querySelector("#busqueda").addEventListener("input", pintar);
    cont.querySelector("#filtro-estado").addEventListener("change", pintar);
    pintar();
  }

  // =====================================================================
  // EDITOR
  // =====================================================================
  async function editor(tipo, id, cont) {
    const t = TEXTOS[tipo];
    let doc;
    if (id) {
      doc = await DB.obtener("documentos", id);
      if (!doc || doc.tipo !== tipo) return noEncontrado(tipo, cont);
    } else {
      doc = await DB.nuevoDocumento(tipo);
    }
    const anioOriginal = id ? doc.anio : null;
    const numeroOriginal = doc.numero;
    const clientes = (await DB.todos("clientes")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    cont.innerHTML = `
      <div class="cabecera">
        <h1>${id ? `Editar ${t.singular.toLowerCase()}` : t.nuevo}</h1>
        <div class="acciones">
          <a href="${id ? `${t.ruta}/ver/${id}` : t.ruta}" class="boton">Cancelar</a>
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

  async function vista(tipo, id, cont) {
    const t = TEXTOS[tipo];
    const doc = await DB.obtener("documentos", id);
    if (!doc || doc.tipo !== tipo) return noEncontrado(tipo, cont);
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
          <a class="boton" href="${t.ruta}/editar/${id}">Editar</a>
          <button class="boton primario" id="pdf">Descargar PDF</button>
          <button class="boton peligro" id="eliminar">Eliminar</button>
        </div>
      </div>

      ${!emisor.nombre || !emisor.nif ? `<div class="aviso no-print">Faltan tus datos fiscales (nombre y NIF). Complétalos en <a href="#/ajustes">Ajustes</a> para que aparezcan en el documento.</div>` : ""}
      ${doc.presupuestoId ? `<p class="no-print texto-suave">Creada a partir de un <a href="#/presupuestos/ver/${doc.presupuestoId}">presupuesto</a>.</p>` : ""}

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

    const $ = (sel) => cont.querySelector(sel);

    $("#pdf").addEventListener("click", () => {
      // "Guardar como PDF" desde el diálogo de impresión; el título de la página será el nombre del archivo.
      const anterior = document.title;
      document.title = nombre;
      window.print();
      document.title = anterior;
    });

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

  function noEncontrado(tipo, cont) {
    const t = TEXTOS[tipo];
    cont.innerHTML = `<div class="panel vacio">No se ha encontrado este ${t.singular.toLowerCase()}. <a href="${t.ruta}">Volver</a></div>`;
  }

  return { lista, editor, vista };
})();
