// Clientes: lista, alta, edición y borrado.
const Clientes = (() => {
  async function pagina(cont) {
    let clientes = [];
    let editando = null;

    cont.innerHTML = `
      <div class="cabecera">
        <h1>Clientes</h1>
        <button class="boton primario" id="nuevo">+ Nuevo cliente</button>
      </div>
      <div id="formulario"></div>
      <div class="panel">
        <div class="filtros"><input id="busqueda" placeholder="Buscar cliente…"></div>
        <div id="resultados"></div>
      </div>`;
    const $ = (sel) => cont.querySelector(sel);

    const cargar = async () => {
      clientes = (await DB.todos("clientes")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      pintarLista();
    };

    const pintarLista = () => {
      const q = $("#busqueda").value.trim().toLowerCase();
      const filtrados = clientes.filter((c) => !q || `${c.nombre} ${c.nif} ${c.email} ${c.ciudad}`.toLowerCase().includes(q));
      if (!filtrados.length) {
        $("#resultados").innerHTML = `<div class="vacio">${clientes.length ? "Sin resultados." : "Todavía no hay clientes. Guárdalos aquí para rellenar las facturas en un clic."}</div>`;
        return;
      }
      $("#resultados").innerHTML = `
        <table class="tabla">
          <thead><tr><th>Nombre</th><th>NIF</th><th>Ciudad</th><th>Email</th><th></th></tr></thead>
          <tbody>
            ${filtrados.map((c) => `
              <tr>
                <td><strong>${U.esc(c.nombre)}</strong></td>
                <td>${U.esc(c.nif)}</td>
                <td>${U.esc(c.ciudad)}</td>
                <td>${U.esc(c.email)}</td>
                <td class="num">
                  <button class="boton pequeno" data-editar="${c.id}">Editar</button>
                  <button class="boton pequeno peligro" data-eliminar="${c.id}">Eliminar</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>`;
    };

    const pintarFormulario = () => {
      if (!editando) { $("#formulario").innerHTML = ""; return; }
      $("#formulario").innerHTML = `
        <div class="panel">
          <h2>${editando.id ? "Editar cliente" : "Nuevo cliente"}</h2>
          <div class="rejilla">
            ${U.CAMPOS_FISCALES.map(([k, txt]) => `
              <div class="campo">
                <label for="c-${k}">${txt}${k === "nombre" ? " *" : ""}</label>
                <input id="c-${k}" data-campo="${k}" value="${U.esc(editando[k])}">
              </div>`).join("")}
          </div>
          <div class="acciones" style="margin-top:16px">
            <button class="boton primario" id="guardar">Guardar</button>
            <button class="boton" id="cancelar">Cancelar</button>
          </div>
        </div>`;
      $("#c-nombre").focus();
      $("#formulario").querySelectorAll("[data-campo]").forEach((inp) => {
        inp.addEventListener("input", () => (editando[inp.dataset.campo] = inp.value));
        inp.addEventListener("keydown", (e) => e.key === "Enter" && guardar());
      });
      $("#guardar").addEventListener("click", guardar);
      $("#cancelar").addEventListener("click", () => { editando = null; pintarFormulario(); });
    };

    const guardar = async () => {
      if (!editando.nombre.trim()) return alert("El nombre es obligatorio.");
      const datos = { ...editando };
      if (!datos.id) delete datos.id;
      await DB.poner("clientes", datos);
      editando = null;
      pintarFormulario();
      U.aviso("Cliente guardado");
      cargar();
    };

    $("#nuevo").addEventListener("click", () => {
      editando = { ...U.datosFiscalesVacios(), creado: new Date().toISOString() };
      pintarFormulario();
    });
    $("#busqueda").addEventListener("input", pintarLista);
    $("#resultados").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-editar]");
      const el = e.target.closest("[data-eliminar]");
      if (ed) {
        editando = { ...clientes.find((c) => c.id === Number(ed.dataset.editar)) };
        pintarFormulario();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (el) {
        const c = clientes.find((c) => c.id === Number(el.dataset.eliminar));
        const usados = (await DB.porIndice("documentos", "clienteId", c.id)).length;
        const msg = usados
          ? `"${c.nombre}" aparece en ${usados} documento(s). Los documentos conservarán sus datos. ¿Eliminar el cliente?`
          : `¿Eliminar a "${c.nombre}"?`;
        if (!confirm(msg)) return;
        await DB.eliminarCliente(c.id);
        U.aviso("Cliente eliminado");
        cargar();
      }
    });

    await cargar();
  }

  return { pagina };
})();
