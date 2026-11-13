"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";

type ExportMonth = { value: string; label: string; count: number };

export function ExportPipelineButton({
  months,
  hasUnassigned,
  unassignedCount,
}: {
  months: ExportMonth[];
  hasUnassigned: boolean;
  unassignedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(value: string) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  function downloadAll() {
    window.location.assign("/api/exports/pipeline?all=1");
    setOpen(false);
  }

  function downloadSelected() {
    if (!selected.length) return;
    const params = new URLSearchParams();
    selected.forEach((value) => params.append("month", value));
    window.location.assign("/api/exports/pipeline?" + params.toString());
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
      >
        <Download size={16} /> Exportar funil
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipeline-export-title"
            className="max-h-[min(85vh,720px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <FileSpreadsheet size={18} />
                  <span className="text-xs font-semibold uppercase tracking-wide">Exportação Excel</span>
                </div>
                <h2 id="pipeline-export-title" className="mt-1 text-lg font-semibold text-slate-900">
                  Exportar funil de vendas
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Escolhe entre exportar todos os negócios ou apenas os meses pretendidos.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[52vh] space-y-4 overflow-y-auto px-5 py-4">
              <button
                type="button"
                onClick={downloadAll}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100"
              >
                <span>
                  <span className="block text-sm font-semibold text-emerald-900">Exportar tudo</span>
                  <span className="mt-0.5 block text-xs text-emerald-800">Todos os negócios e respetivo histórico</span>
                </span>
                <Download size={18} className="shrink-0 text-emerald-700" />
              </button>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Ou seleciona os meses</h3>
                  <span className="text-xs text-slate-400">{selected.length} selecionado(s)</span>
                </div>

                {months.length === 0 && !hasUnassigned ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    Ainda não existem meses com negócios para exportar.
                  </p>
                ) : (
                  <div className="space-y-1 rounded-xl border border-slate-200 p-2">
                    {months.map((month) => (
                      <label
                        key={month.value}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(month.value)}
                          onChange={() => toggle(month.value)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{month.label}</span>
                        <span className="text-xs tabular-nums text-slate-400">{month.count}</span>
                      </label>
                    ))}
                    {hasUnassigned && (
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.includes("unassigned")}
                          onChange={() => toggle("unassigned")}
                          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">Sem mês definido</span>
                        <span className="text-xs tabular-nums text-slate-400">{unassignedCount}</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={selected.length === 0}
                onClick={downloadSelected}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <Download size={16} /> Exportar meses selecionados
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
