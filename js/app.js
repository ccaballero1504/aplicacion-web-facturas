// Enrutado por hash (#/facturas, #/facturas/ver/3…). Funciona sin servidor.
(() => {
  const cont = document.getElementById("contenido");
  const TIPOS = { facturas: "factura", presupuestos: "presupuesto" };

  let turno = 0;

  async function enrutar() {
    // Cada navegación pinta en un contenedor nuevo y solo lo muestra si sigue siendo la última:
    // así una pantalla lenta nunca sobrescribe a la que el usuario acaba de abrir.
    const mio = ++turno;
    const destino = document.createElement("div");
    const [seccion = "facturas", accion, idTexto] = location.hash.replace(/^#\/?/, "").split("/");
    const id = Number(idTexto) || null;

    document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("activo", a.dataset.seccion === seccion));

    try {
      if (TIPOS[seccion]) {
        const tipo = TIPOS[seccion];
        if (accion === "nueva") await Documentos.editor(tipo, null, destino);
        else if (accion === "editar" && id) await Documentos.editor(tipo, id, destino);
        else if (accion === "duplicar" && id) await Documentos.editor(tipo, null, destino, id);
        else if (accion === "ver" && id) await Documentos.vista(tipo, id, destino);
        else await Documentos.lista(tipo, destino);
      } else if (seccion === "clientes") {
        await Clientes.pagina(destino);
      } else if (seccion === "ajustes") {
        await Ajustes.pagina(destino);
      } else {
        location.hash = "#/facturas";
        return;
      }
    } catch (err) {
      console.error(err);
      destino.innerHTML = `<div class="panel vacio">Ha ocurrido un error: ${U.esc(err.message)}</div>`;
    }
    if (mio !== turno) return;
    cont.replaceChildren(destino);
    window.scrollTo(0, 0);
    const foco = destino.querySelector("[data-foco]");
    if (foco) foco.focus();
  }

  if (!window.indexedDB) {
    cont.innerHTML = `<div class="panel vacio">Este navegador no permite guardar datos (IndexedDB). Prueba con Chrome, Edge o Firefox actualizados.</div>`;
    return;
  }

  window.addEventListener("hashchange", enrutar);
  enrutar();
})();
