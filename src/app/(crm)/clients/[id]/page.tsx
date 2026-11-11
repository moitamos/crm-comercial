import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClientEditForm } from "@/components/crm/client-edit-form";
import { getServicePackageLabel } from "@/lib/crm/packages";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };
type SourceRow = Record<string, unknown>;
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

function sourceRows(value: unknown): SourceRow[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is SourceRow => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }
  return typeof value === "object" ? [value as SourceRow] : [];
}

function normalizedKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFrom(rows: SourceRow[], names: string[]): string | null {
  const wanted = new Set(names.map(normalizedKey));
  for (const row of rows) {
    for (const [key, raw] of Object.entries(row)) {
      if (!wanted.has(normalizedKey(key)) || raw === null || raw === undefined) continue;
      const value = String(raw).trim();
      if (value) return value;
    }
  }
  return null;
}

function dateLabel(value: string | null) {
  if (!value) return "Sem data registada";
  const normalized = /^\d{8}$/.test(value)
    ? value.slice(0, 4) + "-" + value.slice(4, 6) + "-" + value.slice(6, 8)
    : value;
  const date = new Date(normalized + (normalized.length === 10 ? "T12:00:00" : ""));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-PT");
}

function moneyLabel(value: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";
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
          <dd className="mt-1 break-words text-xs leading-5 text-slate-700">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const search = await searchParams;
  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, full_name, nif, nic, ncc, phone, email, address, notes")
    .eq("id", id)
    .maybeSingle();

  if (error || !client) notFound();

  const [servicesResult, administratorsResult, importDetailsResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, service_number, service_type, package_name, current_monthly_fee, loyalty_end_date, loyalty_conclusion_date, is_active, source_data")
      .eq("client_id", id)
      .order("service_type", { ascending: true })
      .order("service_number", { ascending: true }),
    supabase
      .from("client_administrators")
      .select("id, full_name, phone_numbers, email, marketing_permission, observations, source_data")
      .eq("client_id", id)
      .order("full_name", { ascending: true }),
    supabase
      .from("client_import_details")
      .select("source_data")
      .eq("client_id", id)
      .eq("source_system", "PIU")
      .maybeSingle(),
  ]);

  const services = (servicesResult.data ?? []) as Service[];
  const administrators = (administratorsResult.data ?? []) as Administrator[];
  const activeServices = services.filter((service) => service.is_active);
  const sourceRowsForClient = [
    ...sourceRows(importDetailsResult.data?.source_data),
    ...services.flatMap((service) => sourceRows(service.source_data)),
    ...administrators.flatMap((administrator) => sourceRows(administrator.source_data)),
  ];

  const nic = client.nic?.trim() || valueFrom(sourceRowsForClient, ["NIC", "N.º cliente", "Nº cliente", "N cliente"]) || "—";
  const ncc = client.ncc?.trim() || valueFrom(sourceRowsForClient, ["NCC", "N.º conta", "Nº conta", "N conta"]) || "—";
  const administratorPhones = Array.from(new Set(
    administrators.flatMap((item) => item.phone_numbers ?? []).map((item) => item.trim()).filter(Boolean)
  ));
  const administratorEmails = Array.from(new Set(
    administrators.map((item) => item.email?.trim()).filter((item): item is string => Boolean(item))
  ));
  const contactPhones = client.phone ? [client.phone] : administratorPhones;
  const contactEmails = client.email ? [client.email] : administratorEmails;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-7">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700">
        <ArrowLeft size={16} /> Voltar aos clientes
      </Link>

      {search.created === "1" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Cliente criado com sucesso.</p>}
      {(servicesResult.error || administratorsResult.error || importDetailsResult.error) && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não foi possível carregar toda a informação de serviços ou detalhes importados. Atualiza a página ou contacta o administrador.
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><UserRound size={23} /></span>
            <div>
              <p className="text-sm text-slate-500">Ficha de cliente</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{client.full_name}</h1>
              <p className="mt-2 font-mono text-sm text-slate-600">NIF {client.nif}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              {activeServices.length} serviços ativos · {services.length} no total
            </span>
            <ClientEditForm client={{ ...client, nic: nic === "—" ? null : nic, ncc: ncc === "—" ? null : ncc }} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div><p className="text-xs text-slate-400">NIC · N.º cliente</p><p className="mt-1 text-sm font-medium text-slate-800">{nic}</p></div>
          <div><p className="text-xs text-slate-400">NCC · N.º conta</p><p className="mt-1 text-sm font-medium text-slate-800">{ncc}</p></div>
          <div>
            <p className="text-xs text-slate-400">Telefone / Telemóvel</p>
            <div className="mt-1 flex flex-col items-start gap-1.5">
              {contactPhones.length ? contactPhones.map((phone) => (
                <a key={phone} href={"tel:" + phone} className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"><Phone size={14} />{phone}</a>
              )) : <span className="text-sm text-slate-700">—</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400">Email</p>
            <div className="mt-1 flex flex-col items-start gap-1.5">
              {contactEmails.length ? contactEmails.map((email) => (
                <a key={email} href={"mailto:" + email} className="inline-flex max-w-full items-center gap-2 break-all text-sm text-blue-700 hover:underline"><Mail size={14} className="shrink-0" />{email}</a>
              )) : <span className="text-sm text-slate-700">—</span>}
            </div>
          </div>
          {client.address && <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs text-slate-400">Morada</p><p className="mt-1 inline-flex items-start gap-2 text-sm text-slate-700"><MapPin size={14} className="mt-0.5 shrink-0" />{client.address}</p></div>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Serviços e fidelizações</h2>
        </div>
        {services.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">Este cliente ainda não tem serviços registados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">N.º serviço</th>
                  <th className="px-5 py-3 font-semibold">Pacote</th>
                  <th className="px-5 py-3 font-semibold">Fidelização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((service) => {
                  const rows = sourceRows(service.source_data);
                  const packageLabel = getServicePackageLabel(service) ?? service.package_name ?? serviceLabel(service.service_type);
                  const fidelityEnd = service.loyalty_end_date ?? valueFrom(rows, ["Data Fim Fidelização", "DATA_FIM_FIDELIZAÇÃO", "Fim Fidelização"]);
                  const fidelityState = valueFrom(rows, ["Estado Fid. Pacote", "Estado Fidelização", "Estado Fidelização Cartões", "PERIODO_REFID"]);
                  return (
                    <tr key={service.id}>
                      <td className="px-5 py-3 font-medium text-slate-800">{service.service_number}</td>
                      <td className="px-5 py-3 font-semibold text-slate-800">{packageLabel}</td>
                      <td className="px-5 py-3 text-slate-700">
                        <span>{dateLabel(fidelityEnd)}</span>
                        {fidelityState && <span className="ml-2 text-xs text-slate-400">{fidelityState}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Administradores de conta</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{administrators.length} registos</span>
        </div>
        {administrators.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">O Excel não contém administradores de conta para este cliente.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {administrators.map((administrator) => (
              <article key={administrator.id} className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800">{administrator.full_name ?? "Administrador sem nome"}</h3>
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

      {client.notes && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Notas internas</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{client.notes}</p></section>}
    </main>
  );
}
