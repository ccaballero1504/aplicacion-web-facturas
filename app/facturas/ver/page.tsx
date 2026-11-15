"use client";

import { Suspense } from "react";
import VistaDocumento from "@/components/VistaDocumento";

export default function Pagina() {
  return (
    <Suspense>
      <VistaDocumento tipo="factura" />
    </Suspense>
  );
}
