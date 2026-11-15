# Aplicación web de facturas

Aplicación de facturación para autónomos y empresas. Funciona **en local y sin servidor**: los datos se guardan en el propio navegador (IndexedDB).

## Funcionalidades (v0.1)

- **Facturas**: crear, editar, listar, buscar y filtrar por estado (pendiente/pagada). Descarga en PDF.
- **Presupuestos**: igual que las facturas, con estados (borrador, enviado, aceptado, rechazado, facturado) y **conversión a factura con un clic**.
- **Clientes**: se guardan una vez y rellenan las facturas automáticamente.
- **Ajustes**: datos fiscales del emisor (nombre, NIF, dirección, IBAN, logo), IVA e IRPF por defecto, texto al pie y copia de seguridad (exportar/importar).

### Numeración

Correlativa por año: facturas `2026-0001`, presupuestos `P-2026-0001`. Opcionalmente se puede añadir un nombre delante, por ejemplo **"Factura para Paco 2026-0001"**.

### Impuestos

- IVA por línea: 21 % (por defecto), 10 %, 4 % o 0 %.
- Retención de IRPF opcional: 7 %, 15 % o 19 %.

## Cómo arrancarla

Requisitos: [Node.js](https://nodejs.org) 18.18 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>.

Para una versión compilada (más rápida):

```bash
npm run build   # genera la carpeta out/
npm start       # la sirve en http://localhost:3000
```

## Importante sobre los datos

Los datos viven solo en el navegador donde se crean. Si se borran los datos de navegación o se cambia de equipo, se pierden: usa **Ajustes → Descargar copia** con regularidad.

## Tecnología

Next.js (exportación estática) · React · TypeScript · Dexie (IndexedDB).
