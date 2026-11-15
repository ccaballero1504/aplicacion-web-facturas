"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const enlaces = [
  { href: "/facturas/", texto: "Facturas" },
  { href: "/presupuestos/", texto: "Presupuestos" },
  { href: "/clientes/", texto: "Clientes" },
  { href: "/ajustes/", texto: "Ajustes" },
];

export default function Nav() {
  const ruta = usePathname() ?? "";
  return (
    <aside className="nav no-print">
      <div className="marca">Facturas</div>
      <nav>
        {enlaces.map((e) => (
          <Link key={e.href} href={e.href} className={ruta.startsWith(e.href.slice(0, -1)) ? "activo" : ""}>
            {e.texto}
          </Link>
        ))}
      </nav>
      <p className="nota-local">Tus datos se guardan solo en este navegador. Haz copias desde Ajustes.</p>
    </aside>
  );
}
