"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Download, Eye, FileText, RefreshCw } from "lucide-react";

type DealService = {
  id: string;
  service_number: string;
  label: string;
  loyalty_end_date: string | null;
};
type Invoice = {
  id: string;
  service_id: string;
  document_number: string;
  issued_at: string;
  created_at: string;
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Lisbon",
  });
}

function InvoiceItem({ invoice }: { invoice: Invoice }) {
  const base = "/api/invoices/" + encodeURIComponent(invoice.id) + "/document";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/40 px-2.5 py-2">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 break-all text-xs font-semibold text-slate-800">
          <FileText size={13} className="shrink-0 text-blue-700" />
          Invoice {invoice.document_number}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">{dateLabel(invoice.issued_at)}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <a href={base} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-50">
          <Eye size={13} /> Ver PDF
        </a>
        <a href={base + "?download=1"} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
          <Download size={13} /> Descarregar
        </a>
      </div>
    </div>
  );
}

export function DealServicesInvoices({ dealId, services }: { dealId: string; services: DealService[] }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setInvoices([]);
    fetch("/api/deals/" + encodeURIComponent(dealId) + "/invoices", {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Falha na consulta de faturas.");
      return response.json() as Promise<{ invoices: Invoice[] }>;
    }).then((result) => {
      if (!controller.signal.aborted) {
        setInvoices(result.invoices ?? []);
        setStatus("ready");
      }
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, [dealId, reload]);

  const byService = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    const current = byService.get(invoice.service_id) ?? [];
    current.push(invoice);
    byService.set(invoice.service_id, current);
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Serviços associados</h3>
        <span className="text-xs text-slate-500">{services.length} {services.length === 1 ? "serviço" : "serviços"}</span>
      </div>
      {services.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const entries = byService.get(service.id) ?? [];
            return (
              <div key={service.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{service.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">N.º {service.service_number}</p>
                <p className="mt-2 text-xs text-slate-600">
                  <CalendarClock size={13} className="mr-1 inline" />
                  Fidelização até <strong>{dateLabel(service.loyalty_end_date)}</strong>
                </p>
                <div className="mt-3 border-t border-slate-100 pt-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">Faturas</p>
                    {status === "ready" && entries.length > 0 && (
                      <span className="text-[11px] text-slate-500">{entries.length} {entries.length === 1 ? "documento" : "documentos"}</span>
                    )}
                  </div>
                  {status === "loading" ? (
                    <p role="status" className="text-xs text-slate-500">A consultar faturas…</p>
                  ) : status === "error" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p role="alert" className="text-xs text-rose-700">Não foi possível consultar as faturas.</p>
                      <button type="button" onClick={() => setReload((value) => value + 1)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                        <RefreshCw size={12} /> Repetir
                      </button>
                    </div>
                  ) : entries.length === 0 ? (
                    <p className="text-xs text-slate-500">Sem faturas associadas a este serviço.</p>
                  ) : (
                    <div className="space-y-2">
                      <InvoiceItem invoice={entries[0]} />
                      {entries.length > 1 && (
                        <details className="group">
                          <summary className="cursor-pointer text-xs font-semibold text-blue-700 hover:underline">
                            Ver outras {entries.length - 1} {entries.length === 2 ? "fatura" : "faturas"}
                          </summary>
                          <div className="mt-2 space-y-2">
                            {entries.slice(1).map((invoice) => <InvoiceItem key={invoice.id} invoice={invoice} />)}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-sm text-slate-500">Sem serviços associados.</p>
      )}
    </section>
  );
}
