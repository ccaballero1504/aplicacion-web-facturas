import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facturas",
  description: "Facturación para autónomos y empresas, en local y sin servidor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="app">
          <Nav />
          <main className="contenido">{children}</main>
        </div>
      </body>
    </html>
  );
}
