// Enrutado por hash (#/facturas, #/facturas/ver/3…). Funciona sin servidor.
(() => {
  const cont = document.getElementById("contenido");
  const TIPOS = { facturas: "factura", presupuestos: "presupuesto" };

  async function enrutar() {
    const [seccion = "facturas", accion, idTexto] = location.hash.replace(/^#\/?/, "").split("/");
    const id = Number(idTexto) || null;

    document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("activo", a.dataset.seccion === seccion));
    window.scrollTo(0, 0);

    try {
      if (TIPOS[seccion]) {
        const tipo = TIPOS[seccion];
        if (accion === "nueva") return await Documentos.editor(tipo, null, cont);
        if (accion === "editar" && id) return await Documentos.editor(tipo, id, cont);
        if (accion === "duplicar" && id) return await Documentos.editor(tipo, null, cont, id);
        if (accion === "ver" && id) return await Documentos.vista(tipo, id, cont);
        return await Documentos.lista(tipo, cont);
      }
      if (seccion === "clientes") return await Clientes.pagina(cont);
      if (seccion === "ajustes") return await Ajustes.pagina(cont);
      location.hash = "#/facturas";
    } catch (err) {
      console.error(err);
      cont.innerHTML = `<div class="panel vacio">Ha ocurrido un error: ${U.esc(err.message)}</div>`;
    }
  }

  if (!window.indexedDB) {
    cont.innerHTML = `<div class="panel vacio">Este navegador no permite guardar datos (IndexedDB). Prueba con Chrome, Edge o Firefox actualizados.</div>`;
    return;
  }

  window.addEventListener("hashchange", enrutar);
  enrutar();
})();
