// Creación de archivos ZIP (sin compresión, que los PDF ya van comprimidos). Sin librerías.
const Zip = (() => {
  const TABLA_CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Evita nombres repetidos dentro del ZIP: "a.pdf", "a (2).pdf"… */
  function nombresUnicos(archivos) {
    const usados = new Map();
    return archivos.map((a) => {
      let nombre = a.nombre;
      const clave = nombre.toLowerCase();
      if (usados.has(clave)) {
        const n = usados.get(clave) + 1;
        usados.set(clave, n);
        nombre = nombre.replace(/(\.[^.]+)?$/, ` (${n})$1`);
      } else {
        usados.set(clave, 1);
      }
      return { ...a, nombre };
    });
  }

  /** archivos: [{ nombre, datos: Uint8Array }] → Blob con el ZIP. */
  function crear(archivos) {
    const enc = new TextEncoder();
    const f = new Date();
    const hora = (f.getHours() << 11) | (f.getMinutes() << 5) | Math.floor(f.getSeconds() / 2);
    const fecha = ((f.getFullYear() - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate();
    const partes = [];
    const central = [];
    let desplazamiento = 0;

    for (const a of nombresUnicos(archivos)) {
      const nombre = enc.encode(a.nombre);
      const crc = crc32(a.datos);
      const tam = a.datos.length;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nombres en UTF-8 (acentos)
      local.setUint16(8, 0, true); // sin compresión
      local.setUint16(10, hora, true);
      local.setUint16(12, fecha, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, tam, true);
      local.setUint32(22, tam, true);
      local.setUint16(26, nombre.length, true);
      local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), nombre, a.datos);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, hora, true);
      cen.setUint16(14, fecha, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, tam, true);
      cen.setUint32(24, tam, true);
      cen.setUint16(28, nombre.length, true);
      cen.setUint32(42, desplazamiento, true);
      central.push(new Uint8Array(cen.buffer), nombre);

      desplazamiento += 30 + nombre.length + tam;
    }

    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, desplazamiento, true);

    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: "application/zip" });
  }

  return { crear, crc32 };
})();
