/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportación estática: la app se compila a HTML/JS en /out y no necesita servidor.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
