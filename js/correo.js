// Envío de facturas y presupuestos por email.
//  A) Sin conexión: abre Gmail web, Outlook web o la app de correo con el mensaje relleno (el PDF se adjunta a mano).
//  B) Con conexión: envía desde la cuenta del usuario con el PDF adjunto (Gmail API o Microsoft Graph), sin servidor.
const Correo = (() => {
  const CLAVE = "facturas-correo-conexion"; // la sesión se guarda solo en este navegador, no en las copias de seguridad

  const PLANTILLA_ASUNTO = "{documento} {numero} - {empresa}";
  const PLANTILLA_MENSAJE =
    "Hola {cliente},\n\nTe envío adjunto el documento {numero} por importe de {total}.\n\nQuedo a tu disposición para cualquier duda.\n\nUn saludo,\n{empresa}";

  const VARIABLES = [
    ["{documento}", "Factura o Presupuesto"],
    ["{numero}", "Nombre y número, p. ej. Factura para Paco 2026-0001"],
    ["{cliente}", "Nombre del cliente"],
    ["{total}", "Importe total"],
    ["{fecha}", "Fecha del documento"],
    ["{vencimiento}", "Vencimiento o validez"],
    ["{empresa}", "Tu nombre o razón social"],
  ];

  function rellenar(plantilla, doc, emisor) {
    const valores = {
      documento: doc.tipo === "factura" ? "Factura" : "Presupuesto",
      numero: U.nombreDocumento(doc),
      cliente: doc.cliente.nombre || "",
      total: U.euros(U.calcularTotales(doc.lineas, doc.irpf).total),
      fecha: U.fechaES(doc.fecha),
      vencimiento: U.fechaES(doc.vencimiento),
      empresa: emisor.nombre || "",
    };
    return String(plantilla || "")
      .replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m))
      // Evita "Factura Factura para Paco…" cuando el nombre ya empieza por el tipo de documento.
      .replace(/\b(Factura|Presupuesto)\s+(?=\1\b)/gi, "");
  }

  // =====================================================================
  // Conexión guardada
  // =====================================================================
  const leerConexion = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch (_) { return null; } };
  const guardarConexion = (c) => (c ? localStorage.setItem(CLAVE, JSON.stringify(c)) : localStorage.removeItem(CLAVE));
  const conexion = () => leerConexion();
  const nombreProveedor = (p) => (p === "google" ? "Gmail" : "Outlook / Hotmail");

  /** El inicio de sesión de Google y Microsoft solo funciona desde http(s), no abriendo el archivo con doble clic. */
  const puedeConectar = () => location.protocol === "http:" || location.protocol === "https:";

  // =====================================================================
  // Google (Google Identity Services + Gmail API)
  // =====================================================================
  const GOOGLE_SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email openid";
  let promesaGIS = null;
  let clienteGoogle = null;
  let esperaGoogle = null;

  function cargarGoogle() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!promesaGIS) {
      promesaGIS = new Promise((resolver, rechazar) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = resolver;
        s.onerror = () => { promesaGIS = null; rechazar(new Error("No se pudo cargar el inicio de sesión de Google. ¿Hay conexión a internet?")); };
        document.head.appendChild(s);
      });
    }
    return promesaGIS;
  }

  function prepararClienteGoogle(clientId) {
    if (clienteGoogle && clienteGoogle._id === clientId) return clienteGoogle;
    clienteGoogle = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (r) => {
        const e = esperaGoogle; esperaGoogle = null;
        if (!e) return;
        if (r.error) e.rechazar(new Error(r.error_description || r.error));
        else e.resolver(r);
      },
      error_callback: (err) => {
        const e = esperaGoogle; esperaGoogle = null;
        if (e) e.rechazar(new Error(err.type === "popup_closed" ? "Se cerró la ventana de Google." : err.message || "Error de Google"));
      },
    });
    clienteGoogle._id = clientId;
    return clienteGoogle;
  }

  /** Pide un token a Google. Debe llamarse directamente desde un clic (abre una ventana emergente). */
  function pedirTokenGoogle(clientId, opciones) {
    const cliente = prepararClienteGoogle(clientId);
    return new Promise((resolver, rechazar) => {
      esperaGoogle = { resolver, rechazar };
      cliente.requestAccessToken(opciones);
    });
  }

  async function conectarGoogle(clientId) {
    const r = await pedirTokenGoogle(clientId, { prompt: "consent" });
    if (!google.accounts.oauth2.hasGrantedAllScopes(r, "https://www.googleapis.com/auth/gmail.send")) {
      throw new Error("Hay que marcar el permiso para enviar correos en la ventana de Google.");
    }
    const info = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${r.access_token}` },
    })).json();
    const c = { proveedor: "google", clientId, email: info.email || "", token: r.access_token, expira: Date.now() + (r.expires_in - 60) * 1000 };
    guardarConexion(c);
    return c;
  }

  // =====================================================================
  // Microsoft (OAuth 2.0 con PKCE + Microsoft Graph), sin librerías
  // =====================================================================
  const MS_AUTORIDAD = "https://login.microsoftonline.com/common/oauth2/v2.0";
  const MS_SCOPES = "openid profile offline_access User.Read Mail.Send";
  const redirigirMicrosoft = () => new URL("auth-microsoft.html", location.href.split("#")[0]).href;

  const base64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const aleatorio = (n = 32) => base64url(crypto.getRandomValues(new Uint8Array(n)));

  async function pedirTokenMicrosoft(params) {
    const r = await fetch(`${MS_AUTORIDAD}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error_description?.split("\r\n")[0] || datos.error || "Error de Microsoft");
    return datos;
  }

  /** Abre la ventana de Microsoft. Debe llamarse directamente desde un clic. */
  async function conectarMicrosoft(clientId) {
    // La ventana se abre al momento (antes de cualquier await) para que el navegador no la bloquee.
    const ventana = window.open("about:blank", "login-microsoft", "width=500,height=650");
    if (!ventana) throw new Error("El navegador ha bloqueado la ventana emergente. Permite las ventanas emergentes para esta página.");
    try {
      const verificador = aleatorio(48);
      const reto = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
      const estado = aleatorio(16);
      const url = `${MS_AUTORIDAD}/authorize?${new URLSearchParams({
        client_id: clientId, response_type: "code", redirect_uri: redirigirMicrosoft(), response_mode: "query",
        scope: MS_SCOPES, state: estado, code_challenge: reto, code_challenge_method: "S256", prompt: "select_account",
      })}`;
      ventana.location.href = url;

      const params = await new Promise((resolver, rechazar) => {
        const alMensaje = (e) => {
          if (e.origin !== location.origin || e.data?.tipo !== "auth-microsoft") return;
          limpiar();
          resolver(new URLSearchParams(e.data.busqueda));
        };
        const vigilar = setInterval(() => { if (ventana.closed) { limpiar(); rechazar(new Error("Se cerró la ventana de Microsoft.")); } }, 700);
        const limpiar = () => { clearInterval(vigilar); window.removeEventListener("message", alMensaje); };
        window.addEventListener("message", alMensaje);
      });
      if (params.get("error")) throw new Error(params.get("error_description") || params.get("error"));
      if (params.get("state") !== estado) throw new Error("Respuesta de Microsoft no válida (state).");

      const t = await pedirTokenMicrosoft({
        client_id: clientId, grant_type: "authorization_code", code: params.get("code"),
        redirect_uri: redirigirMicrosoft(), code_verifier: verificador, scope: MS_SCOPES,
      });
      const yo = await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
      const c = {
        proveedor: "microsoft", clientId, email: yo.mail || yo.userPrincipalName || "",
        token: t.access_token, expira: Date.now() + (t.expires_in - 60) * 1000, refresco: t.refresh_token || "",
      };
      guardarConexion(c);
      return c;
    } finally {
      if (!ventana.closed) ventana.close();
    }
  }

  // =====================================================================
  // Conectar / desconectar
  // =====================================================================
  function conectar(proveedor, clientId) {
    if (!puedeConectar()) return Promise.reject(new Error("Para conectar tu correo abre la aplicación desde localhost (no con doble clic)."));
    if (!clientId) return Promise.reject(new Error("Falta el ID de cliente. Configúralo en Ajustes → Correo electrónico."));
    return proveedor === "google" ? cargarGoogle().then(() => conectarGoogle(clientId)) : conectarMicrosoft(clientId);
  }

  function desconectar() {
    const c = leerConexion();
    if (c?.proveedor === "google" && window.google?.accounts?.oauth2 && c.token) {
      try { google.accounts.oauth2.revoke(c.token, () => {}); } catch (_) {}
    }
    guardarConexion(null);
  }

  /**
   * Devuelve un token válido. Si ha caducado lo renueva: Microsoft en segundo plano;
   * Google abre una ventana (por eso esta función debe llamarse al principio del clic, antes de otros await).
   */
  function obtenerToken() {
    const c = leerConexion();
    if (!c) return Promise.reject(new Error("No hay ninguna cuenta de correo conectada."));
    if (c.token && Date.now() < c.expira) return Promise.resolve(c);
    if (c.proveedor === "google") {
      if (!window.google?.accounts?.oauth2) return Promise.reject(new Error("La sesión de Google ha caducado. Vuelve a intentarlo."));
      return pedirTokenGoogle(c.clientId, { prompt: "", login_hint: c.email }).then((r) => {
        const n = { ...c, token: r.access_token, expira: Date.now() + (r.expires_in - 60) * 1000 };
        guardarConexion(n);
        return n;
      });
    }
    if (!c.refresco) return Promise.reject(new Error("La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta en Ajustes."));
    return pedirTokenMicrosoft({ client_id: c.clientId, grant_type: "refresh_token", refresh_token: c.refresco, scope: MS_SCOPES })
      .then((t) => {
        const n = { ...c, token: t.access_token, expira: Date.now() + (t.expires_in - 60) * 1000, refresco: t.refresh_token || c.refresco };
        guardarConexion(n);
        return n;
      })
      .catch(() => { throw new Error("La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta en Ajustes."); });
  }

  // =====================================================================
  // Envío
  // =====================================================================
  function bytesABase64(bytes) {
    let s = "";
    const trozo = 0x8000;
    for (let i = 0; i < bytes.length; i += trozo) s += String.fromCharCode(...bytes.subarray(i, i + trozo));
    return btoa(s);
  }
  const utf8Base64 = (t) => bytesABase64(new TextEncoder().encode(t));
  const cabeceraUtf8 = (t) => `=?UTF-8?B?${utf8Base64(t)}?=`;
  const lineas76 = (b64) => b64.replace(/.{1,76}/g, "$&\r\n");

  /** Construye el mensaje MIME (RFC 2822) con el PDF adjunto, tal como lo espera la API de Gmail. */
  function construirMime({ de, para, asunto, mensaje, archivo, pdf }) {
    const limite = `limite_${aleatorio(12)}`;
    return [
      de ? `From: ${de}` : null,
      `To: ${para}`,
      `Subject: ${cabeceraUtf8(asunto)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${limite}"`,
      "",
      `--${limite}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      lineas76(utf8Base64(mensaje)),
      `--${limite}`,
      `Content-Type: application/pdf; name="${cabeceraUtf8(archivo)}"`,
      `Content-Disposition: attachment; filename="${cabeceraUtf8(archivo)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      lineas76(bytesABase64(pdf)),
      `--${limite}--`,
      "",
    ].filter((l) => l !== null).join("\r\n");
  }

  async function enviarGmail(c, datos) {
    const mime = construirMime({ ...datos, de: c.email });
    const raw = btoa(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error?.message || `Gmail respondió ${r.status}`);
    }
  }

  async function enviarOutlook(c, { para, asunto, mensaje, archivo, pdf }) {
    const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: asunto,
          body: { contentType: "Text", content: mensaje },
          toRecipients: para.split(/[,;]\s*/).filter(Boolean).map((address) => ({ emailAddress: { address } })),
          attachments: [{
            "@odata.type": "#microsoft.graph.fileAttachment", name: archivo, contentType: "application/pdf", contentBytes: bytesABase64(pdf),
          }],
        },
        saveToSentItems: true,
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error?.message || `Outlook respondió ${r.status}`);
    }
  }

  // =====================================================================
  // Ventana "Enviar por email"
  // =====================================================================
  const emailValido = (t) => t.split(/[,;]\s*/).filter(Boolean).every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  async function abrirVentana(doc, emisor, alEnviar) {
    const c = leerConexion();
    if (c?.proveedor === "google") cargarGoogle().then(() => prepararClienteGoogle(c.clientId)).catch(() => {});
    const correo = emisor.correo || {};

    const fondo = document.createElement("div");
    fondo.className = "modal-fondo no-print";
    fondo.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-envio">
        <div class="cabecera" style="margin-bottom:14px">
          <h2 id="titulo-envio" style="margin:0">Enviar por email</h2>
          <button class="boton pequeno" data-cerrar aria-label="Cerrar">✕</button>
        </div>
        <div class="campo"><label for="env-para">Para</label>
          <input id="env-para" type="email" multiple value="${U.esc(doc.cliente.email)}" placeholder="correo@cliente.com"></div>
        <div class="campo" style="margin-top:10px"><label for="env-asunto">Asunto</label>
          <input id="env-asunto" value="${U.esc(rellenar(correo.asunto || PLANTILLA_ASUNTO, doc, emisor))}"></div>
        <div class="campo" style="margin-top:10px"><label for="env-mensaje">Mensaje</label>
          <textarea id="env-mensaje" rows="8">${U.esc(rellenar(correo.mensaje || PLANTILLA_MENSAJE, doc, emisor))}</textarea></div>
        <p class="texto-suave" style="font-size:13px">Adjunto: <strong>${U.esc(PDF.nombreArchivo(doc))}</strong></p>

        <div class="modal-seccion">
          ${c ? `
            <button class="boton primario" id="env-auto" style="width:100%;justify-content:center">
              Enviar desde ${U.esc(c.email || nombreProveedor(c.proveedor))} con el PDF adjunto
            </button>` : `
            <p class="texto-suave" style="margin:0;font-size:13px">
              💡 Conecta tu Gmail u Outlook en <a href="#/ajustes" data-cerrar>Ajustes</a> para enviarlo directamente con el PDF adjunto.
            </p>`}
        </div>

        <div class="modal-seccion">
          <p style="margin:0 0 8px;font-size:13px" class="texto-suave">
            ${c ? "O abrir" : "Abrir"} en tu correo con el mensaje escrito. <strong>El PDF se descargará y tendrás que adjuntarlo tú.</strong>
          </p>
          <div class="acciones">
            <button class="boton" data-manual="gmail">Gmail</button>
            <button class="boton" data-manual="outlook">Outlook / Hotmail</button>
            <button class="boton" data-manual="app">App de correo</button>
          </div>
          <div id="env-hecho" hidden style="margin-top:12px">
            <button class="boton" id="env-marcar">✓ Ya lo he enviado, registrarlo</button>
          </div>
        </div>
        <p id="env-error" class="aviso" hidden style="margin:14px 0 0"></p>
      </div>`;
    document.body.appendChild(fondo);

    const $ = (s) => fondo.querySelector(s);
    const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", alTecla); };
    const alTecla = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", alTecla);
    fondo.addEventListener("click", (e) => { if (e.target === fondo || e.target.closest("[data-cerrar]")) cerrar(); });
    $("#env-para").focus();

    const mostrarError = (m) => { $("#env-error").textContent = m; $("#env-error").hidden = !m; };
    const leer = () => ({ para: $("#env-para").value.trim(), asunto: $("#env-asunto").value, mensaje: $("#env-mensaje").value });
    const validar = (d) => {
      if (!d.para) return "Escribe el correo del destinatario.";
      if (!emailValido(d.para)) return "El correo del destinatario no parece válido.";
      return "";
    };

    // --- B) Envío automático ---
    const botonAuto = $("#env-auto");
    if (botonAuto) botonAuto.addEventListener("click", async () => {
      const d = leer();
      const err = validar(d);
      if (err) return mostrarError(err);
      mostrarError("");
      const promesaToken = obtenerToken(); // primero, para que la posible ventana de Google no se bloquee
      botonAuto.disabled = true;
      const textoOriginal = botonAuto.textContent;
      botonAuto.textContent = "Enviando…";
      try {
        const [cn, pdf] = await Promise.all([promesaToken, PDF.generar(doc, emisor)]);
        const datos = { ...d, archivo: PDF.nombreArchivo(doc), pdf };
        if (cn.proveedor === "google") await enviarGmail(cn, datos);
        else await enviarOutlook(cn, datos);
        await alEnviar({ para: d.para, via: nombreProveedor(cn.proveedor) });
        cerrar();
        U.aviso(`Enviado a ${d.para}`);
      } catch (e) {
        mostrarError(`No se pudo enviar: ${e.message}`);
        botonAuto.disabled = false;
        botonAuto.textContent = textoOriginal;
      }
    });

    // --- A) Abrir en el correo ---
    let manualVia = "";
    fondo.querySelectorAll("[data-manual]").forEach((b) => b.addEventListener("click", async () => {
      const d = leer();
      if (d.para && !emailValido(d.para)) return mostrarError("El correo del destinatario no parece válido.");
      mostrarError("");
      const q = (o) => new URLSearchParams(o).toString().replace(/\+/g, "%20");
      let url;
      if (b.dataset.manual === "gmail") {
        url = `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", to: d.para, su: d.asunto, body: d.mensaje })}`;
        manualVia = "Gmail (manual)";
      } else if (b.dataset.manual === "outlook") {
        url = `https://outlook.live.com/mail/0/deeplink/compose?${q({ to: d.para, subject: d.asunto, body: d.mensaje })}`;
        manualVia = "Outlook (manual)";
      } else {
        url = `mailto:${encodeURIComponent(d.para).replace(/%40/g, "@").replace(/%2C/gi, ",")}?${q({ subject: d.asunto, body: d.mensaje })}`;
        manualVia = "App de correo (manual)";
      }
      // La pestaña se abre antes de generar el PDF para que el navegador no la bloquee.
      if (b.dataset.manual === "app") {
        const a = document.createElement("a");
        a.href = url;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
      await PDF.descargar(doc, emisor);
      $("#env-hecho").hidden = false;
    }));

    $("#env-marcar").addEventListener("click", async () => {
      await alEnviar({ para: leer().para, via: manualVia });
      cerrar();
      U.aviso("Envío registrado");
    });
  }

  return {
    PLANTILLA_ASUNTO, PLANTILLA_MENSAJE, VARIABLES, rellenar, conexion, conectar, desconectar, puedeConectar,
    nombreProveedor, redirigirMicrosoft, cargarGoogle, abrirVentana, construirMime,
  };
})();
