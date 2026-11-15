"use client";

import { Suspense } from "react";
import EditorDocumento from "@/components/EditorDocumento";

export default function Pagina() {
  return (
    <Suspense>
      <EditorDocumento tipo="factura" />
    </Suspense>
  );
}
