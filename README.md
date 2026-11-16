# Aplicación web de facturas

Aplicación de facturación para autónomos y empresas, hecha con **HTML, CSS y JavaScript puro**. Funciona **en local y sin servidor**: los datos se guardan en el propio navegador (IndexedDB). No hay que instalar nada.

## Cómo abrirla

### Opción recomendada: el ejecutable (no hay que instalar nada)

En la carpeta `dist/` hay un programa para cada sistema. Todos llevan la aplicación dentro, la arrancan en `http://localhost:8000` y abren el navegador:

| Sistema | Archivo |
|---|---|
| Windows | `facturas-windows.exe` |
| Mac con chip Apple (M1, M2…) | `facturas-mac-apple` |
| Mac con Intel | `facturas-mac-intel` |
| Linux | `facturas-linux` |

Ábrelo con doble clic (o desde la consola). Aparecerá una ventana de consola: **déjala abierta** mientras uses la aplicación y ciérrala (o pulsa `Ctrl+C`) para apagarla. Si lo abres otra vez estando ya en marcha, solo abre el navegador.

La primera vez el sistema puede avisar de que el programa no está firmado:

- **Windows:** "Windows protegió su PC" → *Más información* → *Ejecutar de todas formas*.
- **Mac:** clic derecho sobre el archivo → *Abrir* → *Abrir*. Si dice que no se puede abrir, en la Terminal: `chmod +x facturas-mac-apple` y vuelve a probar.
- **Linux:** `chmod +x facturas-linux && ./facturas-linux`

Opciones de consola: `-sin-navegador` (no abre el navegador) y `-puerto 8001` (otro puerto; no recomendado, porque los datos se guardan por dirección y no verías los creados en el 8000).

Si el ejecutable está dentro de la carpeta del proyecto (junto a `index.html` o en `dist/`), usa esos archivos en lugar de su copia interna, así los cambios se ven sin recompilar. Para regenerar los ejecutables: `./lanzador/compilar.sh` (requiere Go).

### Otras formas

- **Doble clic en `index.html`:** funciona todo igual.
- **Servidor propio:** `python -m http.server 8000` y abre `http://localhost:8000`.

> Los datos se guardan por dirección: lo creado con doble clic en `index.html` no aparece en `localhost:8000` y al revés. Usa siempre la misma forma (lo ideal, el ejecutable).

## Funcionalidades (v0.1)

- **Facturas**: crear, editar, listar, buscar, filtrar por estado (pendiente/pagada) y descargar en PDF.
- **Presupuestos**: igual que las facturas, con estados (borrador, enviado, aceptado, rechazado, facturado) y **conversión a factura con un clic**.
- **Clientes**: se guardan una vez y rellenan las facturas automáticamente.
- **Ajustes**: datos fiscales del emisor (nombre, NIF, dirección, IBAN, logo), IVA e IRPF por defecto, texto al pie y copia de seguridad (exportar/importar).

### Subir facturas en PDF

En *Facturas*, el botón **Subir factura (PDF)** guarda una factura hecha con otro programa **tal cual**, sin pasarla al formato de la app. Se arrastra el PDF (o se elige) y, opcionalmente, se indican nombre o número, fecha, cliente e importes (base, IVA y retención, con atajos para calcular el 21 %, 15 %…). Esos datos sirven para buscarla, filtrarla por trimestre y sumarla en el resumen.

Las facturas subidas aparecen en el listado con la etiqueta **PDF** y se pueden ver (visor integrado), descargar, imprimir, enviar por email, marcar como pagadas, meter en el ZIP o imprimir junto a otras (se unen en un solo PDF). Siempre se usa el PDF original. No ocupan números de la numeración de la app y no se pueden duplicar. Se incluyen en las copias de seguridad.

### Numeración

Correlativa por año: facturas `2026-0001`, presupuestos `P-2026-0001`. Opcionalmente se puede añadir un nombre delante, por ejemplo **"Factura para Paco 2026-0001"**.

### Impuestos

- IVA por línea: 21 % (por defecto), 10 %, 4 % o 0 %.
- Retención de IRPF opcional: 7 %, 15 % o 19 %.

### PDF

El botón **Descargar PDF** genera el archivo directamente (A4, con logo, varias páginas si hace falta). Se llama como la factura, p. ej. `Factura para Paco 2026-0001.pdf`.

### Enviar por email

Botón **Enviar por email** en cada fila del listado y en la vista de cada factura o presupuesto. Abre una ventana con el destinatario (email del cliente), el asunto y el mensaje ya escritos; se pueden cambiar antes de enviar. El texto por defecto se define en *Ajustes → Mensaje para los correos*, con variables como `{cliente}`, `{numero}` o `{total}`.

Los botones *Abrir en Gmail*, *Abrir en Outlook / Hotmail* y *App de correo* abren el borrador con todo escrito y descargan el PDF: solo hay que **adjuntarlo** y enviar. Después, *Ya lo he enviado* lo registra en el documento (y los presupuestos en *Borrador* pasan a *Enviado*).

### Listado

- Columnas **Fecha** (fecha de la factura) y **Creada** (día en que se creó en la app, automática).
- Filtros por **año** y **trimestre** (1.º ene–mar, 2.º abr–jun, 3.º jul–sep, 4.º oct–dic), además de estado y búsqueda. Encima de la tabla se muestra la suma de base imponible, IVA, retención y total de lo filtrado (útil para las declaraciones trimestrales).
- **Duplicar** (a la izquierda de cada fila): abre el editor con una copia como documento nuevo, con fecha de hoy y número nuevo.
- **Imprimir**, **Descargar** y **Enviar por email** (a la derecha de cada fila). *Imprimir* abre directamente el diálogo de la impresora con la factura en A4, sin salir del listado. También están en la vista de cada documento.
- **Selección múltiple:** casilla a la izquierda de cada fila y otra en la cabecera para marcar todas las visibles (por ejemplo, todas las del 1.er trimestre). Con *Mayús + clic* se marca un rango. En la cabecera, **Imprimir (n)** manda todas las seleccionadas a la impresora en un solo trabajo (cada una en su página) y **Descargar (n)** las descarga juntas en un ZIP con un PDF por factura (p. ej. `Facturas 2026 1T.zip`; si solo hay una, descarga el PDF). Al cambiar los filtros se desmarca lo que deja de verse.

## Importante sobre los datos

Los datos viven solo en el navegador donde se crean. Si se borran los datos de navegación o se cambia de equipo, se pierden: usa **Ajustes → Descargar copia** con regularidad.

## Estructura

```
index.html          Página única con el menú
css/estilos.css     Estilos (incluye los de impresión/PDF)
js/utilidades.js    Cálculos de totales, numeración y formato
js/pdf.js           Generación del PDF y descarga de varios
js/zip.js           Creación de archivos ZIP
js/correo.js        Ventana de envío por email (abre Gmail, Outlook o la app de correo)
js/db.js            Base de datos local (IndexedDB) y copia de seguridad
js/documentos.js    Facturas y presupuestos: lista, editor y vista/PDF
js/clientes.js      Clientes
js/ajustes.js       Ajustes del emisor
js/app.js           Navegación entre secciones
vendor/             pdf-lib (licencia MIT)
lanzador/           Código del ejecutable (Go) y script para compilarlo
dist/               Ejecutables para Windows, Mac y Linux
```
