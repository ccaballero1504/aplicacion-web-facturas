// Ajustes: datos del emisor, valores por defecto y copia de seguridad.
const Ajustes = (() => {
  async function pagina(cont) {
    const a = await DB.obtenerAjustes();
    const opciones = (lista, actual) =>
      lista.map(([v, t]) => `<option value="${v}" ${v === actual ? "selected" : ""}>${t}</option>`).join("");

    cont.innerHTML = `
      <div class="cabecera">
        <h1>Ajustes</h1>
        <div class="acciones">
          <span id="estado-guardado" style="color:var(--ok);align-self:center"></span>
          <button class="boton primario" id="guardar">Guardar cambios</button>
        </div>
      </div>

      <div class="panel">
        <h2>Tus datos fiscales (emisor)</h2>
        <p class="texto-suave" style="margin-top:-6px">Aparecerán en todas tus facturas y presupuestos.</p>
        <div class="rejilla">
          ${U.CAMPOS_FISCALES.map(([k, txt]) => `
            <div class="campo"><label for="a-${k}">${txt}</label><input id="a-${k}" data-campo="${k}" value="${U.esc(a[k])}"></div>`).join("")}
          <div class="campo ancho">
            <label for="a-iban">IBAN (para cobros por transferencia)</label>
            <input id="a-iban" data-campo="iban" value="${U.esc(a.iban)}" placeholder="ES00 0000 0000 0000 0000 0000">
          </div>
          <div class="campo ancho">
            <label>Logo</label>
            <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              <img id="logo-vista" alt="Logo" style="max-height:60px;max-width:180px;object-fit:contain">
              <input type="file" id="logo" accept="image/*" style="width:auto">
              <button class="boton pequeno peligro" id="quitar-logo">Quitar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Valores por defecto</h2>
        <div class="rejilla">
          <div class="campo">
            <label for="a-iva">IVA por defecto</label>
            <select id="a-iva">${opciones(U.TIPOS_IVA.map((v) => [v, `${v} %`]), a.ivaPorDefecto)}</select>
          </div>
          <div class="campo">
            <label for="a-irpf">Retención IRPF por defecto</label>
            <select id="a-irpf">${opciones(U.TIPOS_IRPF.map((v) => [v, v === 0 ? "Sin retención" : `${v} %`]), a.irpfPorDefecto)}</select>
          </div>
          <div class="campo ancho">
            <label for="a-pie">Texto al pie de los documentos</label>
            <textarea id="a-pie" data-campo="notasPie" placeholder="Ej.: Inscrita en el Registro Mercantil de…">${U.esc(a.notasPie)}</textarea>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Copia de seguridad</h2>
        <p class="texto-suave" style="margin-top:-6px">
          Los datos solo existen en este navegador. Descarga una copia de vez en cuando y guárdala en un lugar seguro.
        </p>
        <div class="acciones">
          <button class="boton" id="exportar">Descargar copia</button>
          <button class="boton" id="importar">Restaurar copia…</button>
          <input type="file" id="archivo-copia" accept="application/json,.json" hidden>
        </div>
      </div>`;

    const $ = (sel) => cont.querySelector(sel);
    const sinGuardar = () => ($("#estado-guardado").textContent = "");

    const pintarLogo = () => {
      $("#logo-vista").hidden = !a.logo;
      $("#quitar-logo").hidden = !a.logo;
      if (a.logo) $("#logo-vista").src = a.logo;
    };

    cont.querySelectorAll("[data-campo]").forEach((inp) =>
      inp.addEventListener("input", () => { a[inp.dataset.campo] = inp.value; sinGuardar(); }));
    $("#a-iva").addEventListener("change", (e) => { a.ivaPorDefecto = Number(e.target.value); sinGuardar(); });
    $("#a-irpf").addEventListener("change", (e) => { a.irpfPorDefecto = Number(e.target.value); sinGuardar(); });

    $("#logo").addEventListener("change", (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      if (archivo.size > 500000) { e.target.value = ""; return alert("El logo debe ocupar menos de 500 KB."); }
      const lector = new FileReader();
      lector.onload = () => { a.logo = String(lector.result); pintarLogo(); sinGuardar(); };
      lector.readAsDataURL(archivo);
    });
    $("#quitar-logo").addEventListener("click", () => { a.logo = ""; $("#logo").value = ""; pintarLogo(); sinGuardar(); });

    $("#guardar").addEventListener("click", async () => {
      await DB.poner("ajustes", a);
      $("#estado-guardado").textContent = "Guardado ✓";
      U.aviso("Ajustes guardados");
    });

    $("#exportar").addEventListener("click", () => DB.exportarCopia());
    $("#importar").addEventListener("click", () => $("#archivo-copia").click());
    $("#archivo-copia").addEventListener("change", async (e) => {
      const archivo = e.target.files[0];
      e.target.value = "";
      if (!archivo) return;
      if (!confirm("Restaurar la copia sustituirá TODOS los datos actuales (facturas, presupuestos, clientes y ajustes). ¿Continuar?")) return;
      try {
        await DB.importarCopia(archivo);
        alert("Copia restaurada correctamente.");
        pagina(cont);
      } catch (err) {
        alert(`No se pudo restaurar: ${err.message}`);
      }
    });

    pintarLogo();
  }

  return { pagina };
})();
