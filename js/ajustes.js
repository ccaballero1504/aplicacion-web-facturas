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
        <h2>Correo electrónico</h2>
        <p class="texto-suave" style="margin-top:-6px">
          Conecta tu cuenta para enviar facturas y presupuestos con el PDF adjunto directamente desde la aplicación.
          Sin conectar nada, también puedes abrirlos en tu correo con el mensaje ya escrito.
        </p>
        <div id="estado-conexion"></div>

        <details id="config-correo">
          <summary>Configuración de la conexión (IDs de cliente)</summary>
          <p class="texto-suave" style="font-size:13px">
            Se obtienen una sola vez registrando la aplicación en Google Cloud y en Microsoft Azure (ver README).
            Redirección para Microsoft: <code id="uri-ms"></code>
          </p>
          <div class="rejilla">
            <div class="campo ancho"><label for="a-google-id">ID de cliente de Google</label>
              <input id="a-google-id" data-correo="googleClientId" value="${U.esc(a.correo.googleClientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com"></div>
            <div class="campo ancho"><label for="a-ms-id">ID de aplicación de Microsoft</label>
              <input id="a-ms-id" data-correo="microsoftClientId" value="${U.esc(a.correo.microsoftClientId)}" placeholder="00000000-0000-0000-0000-000000000000"></div>
          </div>
        </details>

        <h2 style="margin-top:20px">Plantilla del mensaje</h2>
        <div class="rejilla">
          <div class="campo ancho"><label for="a-asunto">Asunto</label>
            <input id="a-asunto" data-correo="asunto" value="${U.esc(a.correo.asunto || Correo.PLANTILLA_ASUNTO)}"></div>
          <div class="campo ancho"><label for="a-mensaje">Mensaje</label>
            <textarea id="a-mensaje" data-correo="mensaje" rows="7">${U.esc(a.correo.mensaje || Correo.PLANTILLA_MENSAJE)}</textarea></div>
        </div>
        <p class="texto-suave" style="font-size:13px;margin-bottom:0">
          Variables: ${Correo.VARIABLES.map(([v, t]) => `<code title="${U.esc(t)}">${v}</code>`).join(" ")}
        </p>
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

    // ---------- Correo ----------
    $("#uri-ms").textContent = Correo.redirigirMicrosoft();
    cont.querySelectorAll("[data-correo]").forEach((inp) =>
      inp.addEventListener("input", () => { a.correo[inp.dataset.correo] = inp.value; sinGuardar(); pintarConexion(); }));

    const pintarConexion = () => {
      const c = Correo.conexion();
      const caja = $("#estado-conexion");
      if (c) {
        caja.innerHTML = `
          <div class="estado-conexion">
            <span class="punto on"></span>
            <span>Conectado: <strong>${U.esc(c.email || "cuenta")}</strong> (${Correo.nombreProveedor(c.proveedor)})</span>
            <button class="boton pequeno" id="desconectar">Desconectar</button>
          </div>`;
        $("#desconectar").addEventListener("click", () => { Correo.desconectar(); pintarConexion(); U.aviso("Cuenta desconectada"); });
        return;
      }
      const local = Correo.puedeConectar();
      const g = a.correo.googleClientId.trim(), m = a.correo.microsoftClientId.trim();
      let nota = "";
      if (!local) nota = "Para conectar tu correo abre la aplicación desde <strong>localhost</strong> (no con doble clic). Consulta el README.";
      else if (!g && !m) nota = "Primero rellena los IDs de cliente en «Configuración de la conexión».";
      caja.innerHTML = `
        <div class="estado-conexion">
          <span class="punto"></span><span>Ninguna cuenta conectada</span>
          <button class="boton pequeno" id="conectar-google" ${!local || !g ? "disabled" : ""}>Conectar Gmail</button>
          <button class="boton pequeno" id="conectar-ms" ${!local || !m ? "disabled" : ""}>Conectar Outlook / Hotmail</button>
        </div>
        ${nota ? `<p class="texto-suave" style="font-size:13px;margin-top:-6px">${nota}</p>` : ""}`;
      if (local && g) Correo.cargarGoogle().catch(() => {}); // precarga para que la ventana de Google no se bloquee
      const conectar = (proveedor, id) => async () => {
        try {
          await Correo.conectar(proveedor, id);
          await DB.poner("ajustes", a); // guarda los IDs usados
          pintarConexion();
          U.aviso("Cuenta conectada");
        } catch (e) {
          alert(`No se pudo conectar: ${e.message}`);
        }
      };
      $("#conectar-google").addEventListener("click", conectar("google", g));
      $("#conectar-ms").addEventListener("click", conectar("microsoft", m));
    };
    pintarConexion();
    if (!a.correo.googleClientId && !a.correo.microsoftClientId) $("#config-correo").open = true;

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
