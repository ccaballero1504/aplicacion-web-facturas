// Envío por email: abre Gmail web, Outlook web o la app de correo con el destinatario,
// el asunto y el mensaje ya escritos, y descarga el PDF para adjuntarlo a mano.
const Correo = (() => {
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
      total: U.euros(U.totalesDocumento(doc).total),
      fecha: U.fechaES(doc.fecha),
      vencimiento: U.fechaES(doc.vencimiento),
      empresa: emisor.nombre || "",
    };
    return String(plantilla || "")
      .replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m))
      // Evita "Factura Factura para Paco…" cuando el nombre ya empieza por el tipo de documento.
      .replace(/\b(Factura|Presupuesto)\s+(?=\1\b)/gi, "");
  }

  const emailValido = (t) => t.split(/[,;]\s*/).filter(Boolean).every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  /**
   * Abre la ventana "Enviar por email".
   * `alEnviar({ para, via })` se llama cuando el usuario confirma que lo ha enviado.
   */
  function abrirVentana(doc, emisor, alEnviar) {
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

        <div class="modal-seccion">
          <p style="margin:0 0 10px;font-size:13px" class="texto-suave">
            Se abrirá tu correo con todo escrito y se descargará <strong>${U.esc(PDF.nombreArchivo(doc))}</strong>.
            Solo tendrás que <strong>adjuntar el PDF</strong> y pulsar enviar.
          </p>
          <div class="acciones">
            <button class="boton primario" data-correo="gmail">Abrir en Gmail</button>
            <button class="boton primario" data-correo="outlook">Abrir en Outlook / Hotmail</button>
            <button class="boton" data-correo="app">App de correo</button>
          </div>
          <div id="env-hecho" hidden style="margin-top:14px">
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

    let via = "";
    fondo.querySelectorAll("[data-correo]").forEach((b) => b.addEventListener("click", async () => {
      const d = leer();
      if (d.para && !emailValido(d.para)) return mostrarError("El correo del destinatario no parece válido.");
      mostrarError("");
      const q = (o) => new URLSearchParams(o).toString().replace(/\+/g, "%20");
      let url;
      if (b.dataset.correo === "gmail") {
        url = `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", to: d.para, su: d.asunto, body: d.mensaje })}`;
        via = "Gmail";
      } else if (b.dataset.correo === "outlook") {
        url = `https://outlook.live.com/mail/0/deeplink/compose?${q({ to: d.para, subject: d.asunto, body: d.mensaje })}`;
        via = "Outlook";
      } else {
        url = `mailto:${encodeURIComponent(d.para).replace(/%40/g, "@").replace(/%2C/gi, ",")}?${q({ subject: d.asunto, body: d.mensaje })}`;
        via = "App de correo";
      }
      // La pestaña se abre antes de generar el PDF para que el navegador no la bloquee.
      if (b.dataset.correo === "app") {
        const a = document.createElement("a");
        a.href = url;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
      try {
        await PDF.descargar(doc, emisor);
      } catch (e) {
        mostrarError(`No se pudo generar el PDF: ${e.message}`);
      }
      $("#env-hecho").hidden = false;
    }));

    $("#env-marcar").addEventListener("click", async () => {
      await alEnviar({ para: leer().para, via });
      cerrar();
      U.aviso("Envío registrado");
    });
  }

  return { PLANTILLA_ASUNTO, PLANTILLA_MENSAJE, VARIABLES, rellenar, abrirVentana };
})();
