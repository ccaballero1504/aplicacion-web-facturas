# Aplicación web de facturas

Aplicación de facturación para autónomos y empresas, hecha con **HTML, CSS y JavaScript puro**. Funciona **en local y sin servidor**: los datos se guardan en el propio navegador (IndexedDB). No hay que instalar nada.

## Cómo abrirla

**Opción 1 — doble clic:** abre `index.html` en Chrome, Edge o Firefox.

**Opción 2 — localhost** (cualquiera de estas):

```bash
python -m http.server 8000      # y abre http://localhost:8000
npx serve .                     # si tienes Node.js
```

O con la extensión *Live Server* de VS Code.

> Los datos se guardan por "origen": lo que crees abriendo el archivo con doble clic no aparecerá en `localhost` y al revés. Elige una forma y úsala siempre.

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

El botón **Descargar PDF** abre el diálogo de impresión del navegador: elige *Guardar como PDF*. El archivo se llama como la factura.

## Importante sobre los datos

Los datos viven solo en el navegador donde se crean. Si se borran los datos de navegación o se cambia de equipo, se pierden: usa **Ajustes → Descargar copia** con regularidad.

## Estructura

```
index.html          Página única con el menú
css/estilos.css     Estilos (incluye los de impresión/PDF)
js/utilidades.js    Cálculos de totales, numeración y formato
js/db.js            Base de datos local (IndexedDB) y copia de seguridad
js/documentos.js    Facturas y presupuestos: lista, editor y vista/PDF
js/clientes.js      Clientes
js/ajustes.js       Ajustes del emisor
js/app.js           Navegación entre secciones
```
