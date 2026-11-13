"use client";

import { Download } from "lucide-react";

export function ExportClientsButton() {
  return (
    <a
      href="/api/exports/clients"
      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
    >
      <Download size={16} /> Exportar clientes
    </a>
  );
}
