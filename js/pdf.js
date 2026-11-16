// Generación del PDF de facturas y presupuestos con pdf-lib (vendor/pdf-lib.min.js).
const PDF = (() => {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const A4 = [595.28, 841.89];
  const M = 50; // margen
  const DER = A4[0] - M;
  const ACENTO = rgb(0.184, 0.357, 0.918);
  const TEXTO = rgb(0.114, 0.137, 0.188);
  const SUAVE = rgb(0.4, 0.44, 0.52);
  const BORDE = rgb(0.89, 0.9, 0.92);

  /** Convierte cualquier imagen (data URL) a PNG mediante canvas, para poder incrustarla. */
  function imagenAPng(dataUrl) {
    return new Promise((resolver) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolver(c.toDataURL("image/png"));
      };
      img.onerror = () => resolver(null);
      img.src = dataUrl;
    });
  }

  async function generar(doc, emisor) {
    const pdf = await PDFDocument.create();
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    const esFactura = doc.tipo === "factura";
    const nombre = U.nombreDocumento(doc);
    const tituloTipo = esFactura ? "FACTURA" : "PRESUPUESTO";
    pdf.setTitle(nombre);
    pdf.setAuthor(emisor.nombre || "");
    pdf.setCreator("aplicacion-web-facturas");

    // Las fuentes estándar solo admiten caracteres WinAnsi: sustituye el resto.
    const cache = new Map();
    const limpio = (texto, fuente = normal) =>
      [...String(texto ?? "").replace(/−/g, "-").replace(/\t/g, " ")]
        .map((ch) => {
          const k = ch + (fuente === negrita ? "b" : "n");
          if (!cache.has(k)) {
            try { fuente.encodeText(ch); cache.set(k, ch); } catch (_) { cache.set(k, "?"); }
          }
          return cache.get(k);
        })
        .join("");

    let pagina = pdf.addPage(A4);
    let y = A4[1] - M;

    const texto = (t, x, yy, { tam = 10, fuente = normal, color = TEXTO, alinear = "izq" } = {}) => {
      const s = limpio(t, fuente);
      const ancho = fuente.widthOfTextAtSize(s, tam);
      const xx = alinear === "der" ? x - ancho : alinear === "centro" ? x - ancho / 2 : x;
      pagina.drawText(s, { x: xx, y: yy, size: tam, font: fuente, color });
      return ancho;
    };

    /** Parte un texto en líneas que caben en `ancho`. Respeta saltos de línea. */
    const partir = (t, ancho, tam = 10, fuente = normal) => {
      const lineas = [];
      for (const parrafo of limpio(t, fuente).split(/\r?\n/)) {
        let actual = "";
        for (const palabra of parrafo.split(" ")) {
          const prueba = actual ? `${actual} ${palabra}` : palabra;
          if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) { actual = prueba; continue; }
          if (actual) lineas.push(actual);
          // Palabra más larga que el ancho: córtala.
          let p = palabra;
          while (fuente.widthOfTextAtSize(p, tam) > ancho) {
            let i = p.length;
            while (i > 1 && fuente.widthOfTextAtSize(p.slice(0, i), tam) > ancho) i--;
            lineas.push(p.slice(0, i));
            p = p.slice(i);
          }
          actual = p;
        }
        lineas.push(actual);
      }
      return lineas;
    };

    const nuevaPagina = () => {
      pagina = pdf.addPage(A4);
      y = A4[1] - M;
      texto(nombre, DER, y, { tam: 9, color: SUAVE, alinear: "der" });
      y -= 28;
    };
    const asegurar = (alto) => { if (y - alto < M + 20) nuevaPagina(); };

    const lineasDatos = (d) => {
      const ciudad = [d.cp, d.ciudad].filter(Boolean).join(" ") + (d.provincia ? ` (${d.provincia})` : "");
      return [
        d.nif && `NIF: ${d.nif}`, d.direccion, ciudad.trim(), d.email, d.telefono,
      ].filter(Boolean);
    };

    // ---------- Cabecera ----------
    let yIzq = y;
    if (emisor.logo) {
      const png = await imagenAPng(emisor.logo);
      if (png) {
        const img = await pdf.embedPng(png);
        const esc = Math.min(150 / img.width, 55 / img.height, 1);
        const w = img.width * esc, h = img.height * esc;
        pagina.drawImage(img, { x: M, y: yIzq - h, width: w, height: h });
        yIzq -= h + 12;
      }
    }
    texto(emisor.nombre || "", M, yIzq - 10, { fuente: negrita, tam: 11 });
    yIzq -= 25;
    for (const l of lineasDatos(emisor)) { texto(l, M, yIzq, { tam: 9.5 }); yIzq -= 13; }

    let yDer = y - 20;
    texto(tituloTipo, DER, yDer, { tam: 22, fuente: negrita, color: ACENTO, alinear: "der" });
    yDer -= 20;
    texto(nombre, DER, yDer, { tam: 10.5, fuente: negrita, alinear: "der" });
    yDer -= 18;
    texto(`Fecha: ${U.fechaES(doc.fecha)}`, DER, yDer, { tam: 9.5, alinear: "der" });
    if (doc.vencimiento) {
      yDer -= 13;
      texto(`${esFactura ? "Vencimiento" : "Válido hasta"}: ${U.fechaES(doc.vencimiento)}`, DER, yDer, { tam: 9.5, alinear: "der" });
    }

    y = Math.min(yIzq, yDer) - 26;

    // ---------- Cliente ----------
    texto(esFactura ? "FACTURAR A" : "CLIENTE", M, y, { tam: 8, fuente: negrita, color: SUAVE });
    y -= 15;
    texto(doc.cliente.nombre || "-", M, y, { fuente: negrita, tam: 10.5 });
    y -= 14;
    for (const l of lineasDatos(doc.cliente)) { texto(l, M, y, { tam: 9.5 }); y -= 13; }
    y -= 18;

    // ---------- Tabla de conceptos ----------
    const hayDto = doc.lineas.some((l) => l.descuento);
    // Columnas numéricas alineadas a la derecha (borde derecho de cada una).
    const cols = hayDto
      ? { cant: 330, precio: 400, dto: 445, iva: 485, importe: DER - 4 }
      : { cant: 345, precio: 425, iva: 475, importe: DER - 4 };
    const anchoConcepto = cols.cant - 50 - M - 4;

    const cabeceraTabla = () => {
      const t = { tam: 8, fuente: negrita, color: SUAVE };
      texto("CONCEPTO", M + 4, y, t);
      texto("CANT.", cols.cant, y, { ...t, alinear: "der" });
      texto("PRECIO", cols.precio, y, { ...t, alinear: "der" });
      if (hayDto) texto("DTO.", cols.dto, y, { ...t, alinear: "der" });
      texto("IVA", cols.iva, y, { ...t, alinear: "der" });
      texto("IMPORTE", cols.importe, y, { ...t, alinear: "der" });
      y -= 7;
      pagina.drawLine({ start: { x: M, y }, end: { x: DER, y }, thickness: 0.8, color: BORDE });
      y -= 15;
    };
    cabeceraTabla();

    doc.lineas.forEach((l, i) => {
      const lineas = partir(l.concepto, anchoConcepto, 9.5);
      const alto = lineas.length * 12 + 8;
      if (y - alto < M + 20) { nuevaPagina(); cabeceraTabla(); }
      lineas.forEach((t, j) => texto(t, M + 4, y - j * 12, { tam: 9.5 }));
      texto(Number(l.cantidad).toLocaleString("es-ES"), cols.cant, y, { tam: 9.5, alinear: "der" });
      texto(U.euros(l.precio), cols.precio, y, { tam: 9.5, alinear: "der" });
      if (hayDto) texto(l.descuento ? `${l.descuento} %` : "", cols.dto, y, { tam: 9.5, alinear: "der" });
      texto(`${l.iva} %`, cols.iva, y, { tam: 9.5, alinear: "der" });
      texto(U.euros(U.baseLinea(l)), cols.importe, y, { tam: 9.5, alinear: "der" });
      y -= alto - 4;
      if (i < doc.lineas.length - 1) pagina.drawLine({ start: { x: M, y: y + 6 }, end: { x: DER, y: y + 6 }, thickness: 0.5, color: BORDE });
      y -= 6;
    });

    // ---------- Totales ----------
    const tot = U.calcularTotales(doc.lineas, doc.irpf);
    const filas = [
      ["Base imponible", U.euros(tot.base)],
      ...tot.ivas.map((i) => [`IVA ${i.tipo} % (sobre ${U.euros(i.base)})`, U.euros(i.cuota)]),
      ...(doc.irpf > 0 ? [[`Retención IRPF ${doc.irpf} %`, `-${U.euros(tot.irpf)}`]] : []),
    ];
    asegurar(filas.length * 15 + 50);
    y -= 10;
    const xTot = DER - 230;
    for (const [k, v] of filas) {
      texto(k, xTot, y, { tam: 9.5 });
      texto(v, DER, y, { tam: 9.5, alinear: "der" });
      y -= 15;
    }
    pagina.drawLine({ start: { x: xTot, y: y + 6 }, end: { x: DER, y: y + 6 }, thickness: 0.8, color: BORDE });
    y -= 12;
    texto("Total", xTot, y, { tam: 13, fuente: negrita });
    texto(U.euros(tot.total), DER, y, { tam: 13, fuente: negrita, alinear: "der" });
    y -= 34;

    // ---------- Notas y pie ----------
    const bloques = [];
    if (doc.notas) bloques.push({ t: doc.notas });
    if (esFactura && emisor.iban) bloques.push({ t: `Pago por transferencia a: ${emisor.iban}` });
    if (emisor.notasPie) bloques.push({ t: emisor.notasPie });
    for (const b of bloques) {
      for (const l of partir(b.t, DER - M, 9)) {
        asegurar(12);
        texto(l, M, y, { tam: 9, color: SUAVE });
        y -= 12;
      }
      y -= 6;
    }

    // ---------- Numeración de páginas ----------
    const paginas = pdf.getPages();
    if (paginas.length > 1) {
      paginas.forEach((p, i) => {
        pagina = p;
        texto(`Página ${i + 1} de ${paginas.length}`, A4[0] / 2, 25, { tam: 8, color: SUAVE, alinear: "centro" });
      });
    }

    return pdf.save();
  }

  const nombreArchivo = (doc) => `${U.nombreDocumento(doc).replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;

  function guardarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function descargar(doc, emisor) {
    guardarBlob(new Blob([await generar(doc, emisor)], { type: "application/pdf" }), nombreArchivo(doc));
  }

  /** Descarga varios documentos: uno solo como PDF; varios, juntos en un ZIP con un PDF por documento. */
  async function descargarVarios(docs, emisor, nombreZip) {
    if (docs.length === 1) return descargar(docs[0], emisor);
    const archivos = [];
    for (const d of docs) archivos.push({ nombre: nombreArchivo(d), datos: await generar(d, emisor) });
    guardarBlob(Zip.crear(archivos), nombreZip);
  }

  return { generar, descargar, descargarVarios, nombreArchivo };
})();
