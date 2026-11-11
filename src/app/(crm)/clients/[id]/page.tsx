import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClientEditForm } from "@/components/crm/client-edit-form";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

function dateLabel(value: string | null) {
  if (!value) return "Sem data registada";
  return new Date(value + "T12:00:00").toLocaleDateString("pt-PT");
}

function moneyLabel(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const search = await searchParams;
  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, full_name, nif, nic, ncc, phone, email, address, notes, created_at, services(id, service_number, package_name, current_monthly_fee, loyalty_end_date, is_active, source)")
    .eq("id", id)
    .maybeSingle();

  if (error || !client) notFound();
  const services = client.services ?? [];
  const activeServices = services.filter((service) => service.is_active);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-7">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700">
        <ArrowLeft size={16} /> Voltar aos clientes
      </Link>

      {search.created === "1" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Cliente criado com sucesso.</p>}

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
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {activeServices.length} serviços ativos · {services.length} no total
          </span>
        </div>
        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-slate-400">NIC · N.º cliente</p><p className="mt-1 text-sm font-medium text-slate-800">{client.nic ?? "—"}</p></div>
          <div><p className="text-xs text-slate-400">NCC · N.º conta</p><p className="mt-1 text-sm font-medium text-slate-800">{client.ncc ?? "—"}</p></div>
          <div><p className="text-xs text-slate-400">Criado em</p><p className="mt-1 text-sm font-medium text-slate-800">{new Date(client.created_at).toLocaleDateString("pt-PT")}</p></div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400">Contacto</p>
            <p className="inline-flex items-center gap-2 text-sm text-slate-700"><Phone size={14} />{client.phone ?? "—"}</p>
            <p className="inline-flex items-center gap-2 text-sm text-slate-700"><Mail size={14} />{client.email ?? "—"}</p>
          </div>
        </div>
        {client.address && <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600"><MapPin size={15} />{client.address}</p>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Serviços e fidelizações</h2>
          <p className="mt-1 text-xs text-slate-500">A data de fim de fidelização importada é a referência para as renovações.</p>
        </div>
        {services.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">Este cliente ainda não tem serviços registados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">N.º serviço</th>
                  <th className="px-5 py-3 font-semibold">Serviço / Pacote</th>
                  <th className="px-5 py-3 font-semibold">Fim fidelização</th>
                  <th className="px-5 py-3 font-semibold">Mensalidade</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((service) => (
                  <tr key={service.id}>
                    <td className="px-5 py-4 font-mono text-slate-700">{service.service_number}</td>
                    <td className="px-5 py-4 font-medium text-slate-800">{service.package_name ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{dateLabel(service.loyalty_end_date)}</td>
                    <td className="px-5 py-4 text-slate-600">{moneyLabel(service.current_monthly_fee)}</td>
                    <td className="px-5 py-4"><span className={"rounded-full px-2.5 py-1 text-xs font-medium " + (service.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{service.is_active ? "Ativo" : "Inativo"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ClientEditForm client={client} />
    </main>
  );
}
