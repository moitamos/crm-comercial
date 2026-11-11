"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Mail, Phone, UserRound, X } from "lucide-react";
import { getServicePackageLabel } from "@/lib/crm/packages";

type SourceRow = Record<string, string | null>;
type Service = {
  id: string;
  service_number: string;
  service_type: "meo" | "mobile" | "gcp" | "other";
  package_name: string | null;
  current_monthly_fee: number | string | null;
  loyalty_end_date: string | null;
  loyalty_conclusion_date: string | null;
  is_active: boolean;
  source_data: SourceRow[] | SourceRow | null;
};
type Administrator = {
  id: string;
  full_name: string | null;
  phone_numbers: string[] | null;
  email: string | null;
  marketing_permission: string | null;
  observations: string | null;
  source_data: SourceRow | null;
};
type ClientDetails = {
  client: {
    id: string; full_name: string; nif: string; nic: string | null; ncc: string | null;
    phone: string | null; email: string | null; address: string | null; notes: string | null; created_at: string;
  };
  services: Service[];
  administrators: Administrator[];
};
type ErrorPayload = { error: string };

function sourceRows(value: Service["source_data"] | Administrator["source_data"]): SourceRow[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value as SourceRow];
}

function valueFrom(rows: SourceRow[], names: string[]): string | null {
  for (const row of rows) {
    for (const name of names) {
      const value = row[name];
      if (value && value.trim()) return value;
    }
  }
  return null;
}

function dateLabel(value: string | null) {
  if (!value) return "Não indicada";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-PT");
}

function moneyLabel(value: number | string | null) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function serviceLabel(type: Service["service_type"]) {
  if (type === "meo") return "MEO";
  if (type === "mobile") return "M Móvel";
  if (type === "gcp") return "GCP";
  return "Outro serviço";
}

function DataGrid({ data }: { data: SourceRow }) {
  const fields = Object.entries(data).filter(([key, value]) => key !== "Linha Excel" && value !== null && value !== "");
  if (!fields.length) return <p className="text-xs text-slate-500">Sem dados adicionais.</p>;
  return (
    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
      {fields.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{key}</dt>
          <dd className="mt-1 break-words text-xs leading-5 text-slate-700">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ClientDetailsButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<ClientDetails | null>(null);
  const [error, setError] = useState("");

  async function showDetails() {
    setOpen(true);
    setError("");
    if (details) return;
    setBusy(true);
    try {
      const response = await fetch("/api/clients/" + clientId + "/details", { cache: "no-store" });
      const payload = await response.json() as ClientDetails & ErrorPayload;
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a ficha.");
      setDetails(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao consultar o cliente.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const client = details?.client;
  const services = details?.services ?? [];
  const administrators = details?.administrators ?? [];
  const administratorPhones = Array.from(new Set(administrators.flatMap((item) => item.phone_numbers ?? []).map((item) => item.trim()).filter(Boolean)));
  const administratorEmails = Array.from(new Set(administrators.map((item) => item.email?.trim()).filter((item): item is string => Boolean(item))));
  const contactPhones = client?.phone ? [client.phone] : administratorPhones;
  const contactEmails = client?.email ? [client.email] : administratorEmails;

  return (
    <>
      <button type="button" onClick={showDetails} className="text-left font-semibold text-slate-900 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {clientName}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"
          role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="client-modal-title"
            className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UserRound size={20} /></span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Ficha completa do cliente</p>
                  <h2 id="client-modal-title" className="mt-1 break-words text-lg font-semibold text-slate-900">{client?.full_name ?? clientName}</h2>
                  {client && <p className="mt-1 font-mono text-xs text-slate-500">NIF {client.nif}</p>}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar ficha"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={19} /></button>
            </header>

            <div className="max-h-[calc(100vh-115px)] space-y-6 overflow-y-auto p-5 sm:p-7">
              {busy && <div className="py-14 text-center text-sm text-slate-500">A carregar toda a informação do cliente...</div>}
              {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

              {client && (
                <>
                  <section>
                    <h3 className="text-sm font-semibold text-slate-900">Identificação e contacto</h3>
                    <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Nome</p><p className="mt-1 text-sm font-medium text-slate-800">{client.full_name}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wide text-slate-400">NIF</p><p className="mt-1 font-mono text-sm text-slate-800">{client.nif}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wide text-slate-400">NIC</p><p className="mt-1 text-sm text-slate-800">{client.nic ?? "—"}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wide text-slate-400">NCC</p><p className="mt-1 text-sm text-slate-800">{client.ncc ?? "—"}</p></div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Telemóvel</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {contactPhones.length ? contactPhones.map((phone) => <a key={phone} href={"tel:" + phone} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-sm text-blue-700 ring-1 ring-slate-200 hover:bg-blue-50"><Phone size={13} />{phone}</a>) : <span className="text-sm text-slate-500">—</span>}
                        </div>
                        {!client.phone && contactPhones.length > 0 && <p className="mt-1 text-[10px] text-slate-400">Contacto de administrador associado</p>}
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Email</p>
                        <div className="mt-1 flex flex-col items-start gap-1.5">
                          {contactEmails.length ? contactEmails.map((email) => <a key={email} href={"mailto:" + email} className="inline-flex max-w-full items-center gap-1.5 break-all text-sm text-blue-700 hover:underline"><Mail size={13} className="shrink-0" />{email}</a>) : <span className="text-sm text-slate-500">—</span>}
                        </div>
                        {!client.email && contactEmails.length > 0 && <p className="mt-1 text-[10px] text-slate-400">Contacto de administrador associado</p>}
                      </div>
                      {client.address && <div className="sm:col-span-2 lg:col-span-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">Morada</p><p className="mt-1 text-sm text-slate-800">{client.address}</p></div>}
                    </div>
                  </section>

                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">Serviços e fidelizações</h3>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{services.length} serviços · {services.filter((item) => item.is_active).length} ativos</span>
                    </div>
                    {services.length === 0 ? (
                      <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">Não existem serviços registados para este cliente.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {services.map((service) => {
                          const rows = sourceRows(service.source_data);
                          const packageLabel = getServicePackageLabel(service) ?? "Pacote não indicado";
                          const state = valueFrom(rows, ["Estado Fid. Pacote", "Estado Fidelização", "Estado Fidelização Cartões", "PERIODO_REFID"]);
                          const campaigns = [...new Set(rows.map((row) => row["Tipo de Campanha"]).filter((value): value is string => Boolean(value)))];
                          return (
                            <article key={service.id} className="overflow-hidden rounded-xl border border-slate-200">
                              <div className="flex flex-col justify-between gap-3 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">{serviceLabel(service.service_type)}</span>
                                  <span className="font-mono text-sm font-semibold text-slate-800">{service.service_number}</span>
                                  <span className={"rounded-full px-2.5 py-1 text-[11px] font-medium " + (service.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600")}>{service.is_active ? "Ativo" : "Inativo"}</span>
                                </div>
                                <div className="text-sm font-semibold text-slate-800">{packageLabel}</div>
                              </div>
                              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Fim fidelização atual</p><p className="mt-1 text-sm font-medium text-slate-800">{dateLabel(service.loyalty_end_date)}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Data conclusão</p><p className="mt-1 text-sm text-slate-800">{dateLabel(service.loyalty_conclusion_date)}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Estado fidelização</p><p className="mt-1 text-sm text-slate-800">{state ?? "Não indicado"}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Mensalidade</p><p className="mt-1 text-sm text-slate-800">{moneyLabel(service.current_monthly_fee) ?? "—"}</p></div>
                                {campaigns.length > 0 && <div className="sm:col-span-2 lg:col-span-4"><p className="text-[11px] uppercase tracking-wide text-slate-400">Tipo de campanha</p><div className="mt-1 flex flex-wrap gap-2">{campaigns.map((item) => <span key={item} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-800">{item}</span>)}</div></div>}
                              </div>
                              {rows.length > 0 && (
                                <details className="border-t border-slate-100">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-blue-700 hover:bg-slate-50">
                                    Todos os campos importados deste serviço <ChevronDown size={15} />
                                  </summary>
                                  <div className="space-y-4 px-4 pb-4">
                                    {rows.map((row, index) => <div key={index} className="rounded-lg bg-slate-50 p-3"><DataGrid data={row} /></div>)}
                                  </div>
                                </details>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">Administradores de conta</h3>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{details.administrators.length} registos</span>
                    </div>
                    {details.administrators.length === 0 ? (
                      <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">O Excel não contém administradores de conta para este cliente.</p>
                    ) : (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {details.administrators.map((administrator) => (
                          <article key={administrator.id} className="rounded-xl border border-slate-200 p-4">
                            <h4 className="font-semibold text-slate-800">{administrator.full_name ?? "Administrador sem nome"}</h4>
                            {administrator.email && <a href={"mailto:" + administrator.email} className="mt-2 flex items-center gap-2 break-all text-sm text-blue-700 hover:underline"><Mail size={14} />{administrator.email}</a>}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(administrator.phone_numbers ?? []).map((phone) => <a key={phone} href={"tel:" + phone} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700"><Phone size={12} />{phone}</a>)}
                            </div>
                            <p className="mt-3 text-xs text-slate-500">Permissão de marketing: {administrator.marketing_permission ?? "Não indicada"}</p>
                            {administrator.observations && <p className="mt-2 text-xs leading-5 text-amber-800">{administrator.observations}</p>}
                            {administrator.source_data && <details className="mt-3 border-t border-slate-100 pt-2"><summary className="cursor-pointer text-xs font-semibold text-blue-700">Todos os dados do Excel</summary><div className="mt-3"><DataGrid data={administrator.source_data} /></div></details>}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  {client.notes && <section><h3 className="text-sm font-semibold text-slate-900">Notas internas</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{client.notes}</p></section>}
                  <p className="text-[11px] text-slate-400">Ficha criada em {dateLabel(client.created_at.slice(0, 10))}</p>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
