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

Opciones de consola: `-sin-navegador` (no abre el navegador) y `-puerto 8001` (otro puerto; no recomendado, porque los datos se guardan por dirección y el correo conectado está registrado para el 8000).

Si el ejecutable está dentro de la carpeta del proyecto (junto a `index.html` o en `dist/`), usa esos archivos en lugar de su copia interna, así los cambios se ven sin recompilar. Para regenerar los ejecutables: `./lanzador/compilar.sh` (requiere Go).

### Otras formas

- **Doble clic en `index.html`:** funciona todo salvo conectar el correo.
- **Servidor propio:** `python -m http.server 8000` y abre `http://localhost:8000`.

> Los datos se guardan por dirección: lo creado con doble clic en `index.html` no aparece en `localhost:8000` y al revés. Usa siempre la misma forma (lo ideal, el ejecutable).

## Funcionalidades (v0.1)

- **Facturas**: crear, editar, listar, buscar, filtrar por estado (pendiente/pagada) y descargar en PDF.
- **Presupuestos**: igual que las facturas, con estados (borrador, enviado, aceptado, rechazado, facturado) y **conversión a factura con un clic**.
- **Clientes**: se guardan una vez y rellenan las facturas automáticamente.
- **Ajustes**: datos fiscales del emisor (nombre, NIF, dirección, IBAN, logo), IVA e IRPF por defecto, texto al pie y copia de seguridad (exportar/importar).

### Numeración

Correlativa por año: facturas `2026-0001`, presupuestos `P-2026-0001`. Opcionalmente se puede añadir un nombre delante, por ejemplo **"Factura para Paco 2026-0001"**.

### Impuestos

- IVA por línea: 21 % (por defecto), 10 %, 4 % o 0 %.
- Retención de IRPF opcional: 7 %, 15 % o 19 %.

### PDF

El botón **Descargar PDF** genera el archivo directamente (A4, con logo, varias páginas si hace falta). Se llama como la factura, p. ej. `Factura para Paco 2026-0001.pdf`.

### Enviar por email

En cada factura o presupuesto, **Enviar por email** abre una ventana con el destinatario, el asunto y el mensaje ya rellenos (las plantillas se editan en *Ajustes*). Hay dos formas de enviarlo:

- **Sin conectar nada:** botones *Gmail*, *Outlook / Hotmail* y *App de correo*. Abren el correo con todo escrito y descargan el PDF, que hay que **adjuntar a mano**. Funciona siempre, también con doble clic.
- **Con tu cuenta conectada** (*Ajustes → Correo electrónico*): se envía directamente desde tu Gmail u Outlook **con el PDF adjunto** y queda en tu carpeta de enviados. Requiere abrir la app desde `http://localhost:8000` y configurar los IDs de cliente una vez (ver abajo).

Cada envío queda registrado en el documento, y los presupuestos en *Borrador* pasan a *Enviado*.

## Configurar el envío automático (una sola vez)

La app debe abrirse **siempre en `http://localhost:8000`** (es lo que hace el ejecutable). Esa dirección es la que se registra en Google y Microsoft.

### Gmail (Google Cloud)

1. Entra en <https://console.cloud.google.com> y crea un proyecto.
2. *APIs y servicios → Biblioteca*: busca **Gmail API** y actívala.
3. *Pantalla de consentimiento de OAuth*: tipo **Externo**, nombre de la app y tu email. En *Usuarios de prueba* añade las cuentas de Gmail que la usarán.
4. *Credenciales → Crear credenciales → ID de cliente de OAuth*: tipo **Aplicación web**. En *Orígenes de JavaScript autorizados* añade `http://localhost:8000`.
5. Copia el **ID de cliente** (`….apps.googleusercontent.com`) y pégalo en *Ajustes → Correo electrónico*.

Mientras la app no esté verificada por Google, aparecerá un aviso de "app no verificada" (pulsa *Continuar*) y solo podrán usarla los usuarios de prueba (hasta 100).

### Outlook / Hotmail (Microsoft Entra)

1. Entra en <https://entra.microsoft.com> → *Registros de aplicaciones → Nuevo registro*.
2. Tipos de cuenta: **Cuentas de cualquier directorio organizativo y cuentas Microsoft personales**.
3. URI de redirección: plataforma **Aplicación de página única (SPA)** y dirección `http://localhost:8000/auth-microsoft.html`.
4. En *Permisos de API* añade **Microsoft Graph → Permisos delegados → Mail.Send** (User.Read ya viene).
5. Copia el **Id. de aplicación (cliente)** y pégalo en *Ajustes → Correo electrónico*.

La sesión de Microsoft se renueva sola; pasadas 24 h puede pedir conectar de nuevo. La conexión se guarda solo en ese navegador y no se incluye en las copias de seguridad.

## Importante sobre los datos

Los datos viven solo en el navegador donde se crean. Si se borran los datos de navegación o se cambia de equipo, se pierden: usa **Ajustes → Descargar copia** con regularidad.

## Estructura

```
index.html          Página única con el menú
css/estilos.css     Estilos (incluye los de impresión/PDF)
js/utilidades.js    Cálculos de totales, numeración y formato
js/pdf.js           Generación del PDF
js/correo.js        Envío por email (Gmail / Outlook / abrir en el correo)
js/db.js            Base de datos local (IndexedDB) y copia de seguridad
js/documentos.js    Facturas y presupuestos: lista, editor y vista/PDF
js/clientes.js      Clientes
js/ajustes.js       Ajustes del emisor
js/app.js           Navegación entre secciones
auth-microsoft.html Página de retorno del inicio de sesión de Microsoft
vendor/             pdf-lib (licencia MIT)
lanzador/           Código del ejecutable (Go) y script para compilarlo
dist/               Ejecutables para Windows, Mac y Linux
```
