import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, Clock3, Search, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DealUpdateForm } from "@/components/crm/deal-update-form";
import { getServicePackageLabel } from "@/lib/crm/packages";

type Props = { searchParams: Promise<{ q?: string; stage?: string; type?: string; page?: string }> };
type DealRow = {
  id: string;
  client_id: string;
  commercial_id: string | null;
  deal_type: string;
  stage: string;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  eligibility_month: string | null;
};
type ClientRow = { id: string; full_name: string; nif: string };
type DealServiceRow = { id: string; deal_id: string; service_id: string; decision: string | null; future_package: string | null };
type ServiceRow = { id: string; service_number: string; service_type: string; package_name: string | null };
type DealView = DealRow & { client: ClientRow | null; services: ServiceRow[] };

const STAGES = [
  { value: "to_contact", label: "Por contactar", tone: "bg-slate-100 text-slate-700" },
  { value: "negotiation", label: "Em negociação", tone: "bg-violet-100 text-violet-800" },
  { value: "scheduled", label: "Agendado", tone: "bg-amber-100 text-amber-800" },
  { value: "future_contact", label: "Contactar futuramente", tone: "bg-sky-100 text-sky-800" },
  { value: "sale", label: "Venda", tone: "bg-emerald-100 text-emerald-800" },
  { value: "lost", label: "Perdido", tone: "bg-rose-100 text-rose-800" },
] as const;
const DEAL_TYPES = [
  { value: "portfolio_renewal", label: "Renovação de carteira" },
  { value: "new_sale", label: "Nova venda" },
  { value: "package_change", label: "Alteração de pacote" },
];
const PAGE_SIZE = 30;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const normalizedValue = value.length === 10 ? value + "T12:00:00Z" : value;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
}

function stageInfo(value: string) {
  return STAGES.find((stage) => stage.value === value) ?? STAGES[0];
}

function dealTypeLabel(value: string) {
  return DEAL_TYPES.find((item) => item.value === value)?.label ?? value;
}

function queryHref(params: { q: string; type: string; stage: string; page: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.type) search.set("type", params.type);
  if (params.stage) search.set("stage", params.stage);
  search.set("page", String(params.page));
  return "/pipeline?" + search.toString();
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span className="rounded-lg bg-blue-50 p-1.5 text-blue-700"><Icon size={16} /></span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-500">{label}</span>
      <strong className="text-base font-semibold tabular-nums text-slate-900">{value.toLocaleString("pt-PT")}</strong>
    </div>
  );
}

export default async function PipelinePage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const selectedStage = STAGES.some((item) => item.value === params.stage) ? params.stage ?? "" : "";
  const selectedType = DEAL_TYPES.some((item) => item.value === params.type) ? params.type ?? "" : "";
  let currentPage = positiveInteger(params.page, 1);

  const supabase = await createClient();
  const dealsResult = await supabase.from("deals")
    .select("id, client_id, commercial_id, deal_type, stage, created_at, last_contact_at, next_contact_at, lost_reason, notes, eligibility_month", { count: "exact" })
    .order("eligibility_month", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5000);

  const allDeals = (dealsResult.data ?? []) as DealRow[];
  const dealIds = allDeals.map((deal) => deal.id);
  const clientIds = Array.from(new Set(allDeals.map((deal) => deal.client_id)));
  const [clientsResult, dealServicesResult] = dealIds.length
    ? await Promise.all([
      supabase.from("clients").select("id, full_name, nif").in("id", clientIds),
      supabase.from("deal_services").select("id, deal_id, service_id, decision, future_package").in("deal_id", dealIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const dealServices = (dealServicesResult.data ?? []) as DealServiceRow[];
  const serviceIds = Array.from(new Set(dealServices.map((item) => item.service_id)));
  const servicesResult = serviceIds.length
    ? await supabase.from("services").select("id, service_number, service_type, package_name").in("id", serviceIds)
    : { data: [], error: null };

  const clients = new Map(((clientsResult.data ?? []) as ClientRow[]).map((client) => [client.id, client]));
  const services = new Map(((servicesResult.data ?? []) as ServiceRow[]).map((service) => [service.id, service]));
  const servicesByDeal = new Map<string, ServiceRow[]>();
  for (const link of dealServices) {
    const service = services.get(link.service_id);
    if (!service) continue;
    const current = servicesByDeal.get(link.deal_id) ?? [];
    current.push(service);
    servicesByDeal.set(link.deal_id, current);
  }

  const allDealViews: DealView[] = allDeals.map((deal) => ({
    ...deal,
    client: clients.get(deal.client_id) ?? null,
    services: servicesByDeal.get(deal.id) ?? [],
  }));

  const stageCounts = new Map<string, number>(STAGES.map((stage) => [stage.value, 0]));
  for (const deal of allDeals) stageCounts.set(deal.stage, (stageCounts.get(deal.stage) ?? 0) + 1);
  const openCount = allDeals.filter((deal) => !["sale", "lost"].includes(deal.stage)).length;
  const followUpCount = allDeals.filter((deal) => ["scheduled", "future_contact"].includes(deal.stage)).length;
  const now = Date.now();
  const overdueCount = allDeals.filter((deal) =>
    !["sale", "lost"].includes(deal.stage) && deal.next_contact_at && new Date(deal.next_contact_at).getTime() < now
  ).length;

  const searchNeedle = normalized(query);
  const filtered = allDealViews.filter((deal) => {
    if (selectedStage && deal.stage !== selectedStage) return false;
    if (selectedType && deal.deal_type !== selectedType) return false;
    if (!searchNeedle) return true;
    const searchable = [
      deal.client?.full_name ?? "",
      deal.client?.nif ?? "",
      ...deal.services.map((service) => service.service_number),
      ...deal.services.map((service) => service.package_name ?? ""),
    ].join(" ");
    return normalized(searchable).includes(searchNeedle);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageDeals = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const queryError = dealsResult.error || clientsResult.error || dealServicesResult.error || servicesResult.error;
  const truncated = (dealsResult.count ?? allDeals.length) > allDeals.length;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Gestão de oportunidades comerciais</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Funil de vendas</h1>
          <p className="mt-1 text-sm text-slate-500">Acompanha cada negócio, regista contactos e atualiza a fase da oportunidade.</p>
        </div>
        <Link href="/clients" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:self-auto">
          <Users size={16} /> Consultar clientes
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Negócios em aberto" value={openCount} icon={BriefcaseBusiness} />
        <Metric label="Com contacto agendado" value={followUpCount} icon={CalendarClock} />
        <Metric label="Contactos em atraso" value={overdueCount} icon={Clock3} />
        <Metric label="Vendas concluídas" value={stageCounts.get("sale") ?? 0} icon={TrendingUp} />
      </div>

      {queryError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Não foi possível carregar todos os dados do funil. Confirma as permissões da carteira e atualiza a página.
        </p>
      )}
      {truncated && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Estão a ser apresentados os primeiros 5.000 negócios. Aplica filtros para reduzir os resultados.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fases do funil</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link href={queryHref({ q: query, type: selectedType, stage: "", page: 1 })}
            className={"shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold " + (!selectedStage ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
            Todas <span className="ml-1 tabular-nums">{allDeals.length.toLocaleString("pt-PT")}</span>
          </Link>
          {STAGES.map((stage) => (
            <Link key={stage.value} href={queryHref({ q: query, type: selectedType, stage: stage.value, page: 1 })}
              className={"shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold " + (selectedStage === stage.value ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
              {stage.label} <span className="ml-1 tabular-nums">{(stageCounts.get(stage.value) ?? 0).toLocaleString("pt-PT")}</span>
            </Link>
          ))}
        </div>
      </section>

      <form method="get" className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row">
        <input type="hidden" name="stage" value={selectedStage} />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input name="q" defaultValue={query} placeholder="Pesquisar por cliente, NIF, serviço ou pacote"
            className="w-full border-0 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400" />
        </div>
        <select name="type" defaultValue={selectedType} aria-label="Tipo de negócio"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-600">
          <option value="">Todos os tipos</option>
          {DEAL_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Pesquisar</button>
        {(query || selectedType) && (
          <Link href={queryHref({ q: "", type: "", stage: selectedStage, page: 1 })}
            className="rounded-lg px-3 py-2 text-center text-sm font-medium text-slate-500 hover:bg-slate-50">Limpar</Link>
        )}
      </form>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {filtered.length.toLocaleString("pt-PT")} negócios encontrados
          {selectedStage ? " · " + stageInfo(selectedStage).label : ""}
        </p>
        <p className="text-xs text-slate-400">Página {currentPage} de {totalPages}</p>
      </div>

      {pageDeals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <BriefcaseBusiness size={26} className="mx-auto text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-800">Não foram encontrados negócios</h2>
          <p className="mt-1 text-sm text-slate-500">Altera a pesquisa ou seleciona outra fase do funil.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {pageDeals.map((deal) => {
              const status = stageInfo(deal.stage);
              const nextDate = deal.next_contact_at ? new Date(deal.next_contact_at).getTime() : null;
              const overdue = Boolean(nextDate && nextDate < now && !["sale", "lost"].includes(deal.stage));
              const services = deal.services;
              return (
                <article key={deal.id} className="flex flex-col gap-3 p-4 transition hover:bg-slate-50/60 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{deal.client?.full_name ?? "Cliente sem nome"}</h3>
                      <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + status.tone}>{status.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      NIF {deal.client?.nif ?? "—"} · {dealTypeLabel(deal.deal_type)}
                      {deal.eligibility_month ? " · Elegível desde " + dateLabel(deal.eligibility_month) : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {services.slice(0, 6).map((service) => (
                        <span key={service.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                          {getServicePackageLabel(service) || service.package_name || service.service_type} · {service.service_number}
                        </span>
                      ))}
                      {services.length > 6 && <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">+{services.length - 6} serviços</span>}
                      {services.length === 0 && <span className="text-xs text-slate-400">Sem serviços associados</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Último contacto: {dateLabel(deal.last_contact_at)}</span>
                      {deal.next_contact_at && (
                        <span className={overdue ? "font-semibold text-rose-700" : ""}>
                          Próximo contacto: {dateLabel(deal.next_contact_at)}{overdue ? " · Em atraso" : ""}
                        </span>
                      )}
                      <span>Criado em {dateLabel(deal.created_at)}</span>
                    </div>
                    {deal.lost_reason && <p className="mt-2 text-xs text-rose-700">Motivo da perda: {deal.lost_reason}</p>}
                    {deal.notes && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{deal.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <Link href={"/clients/" + deal.client_id} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Ficha do cliente</Link>
                    <DealUpdateForm deal={{
                      id: deal.id,
                      stage: deal.stage,
                      next_contact_at: deal.next_contact_at,
                      lost_reason: deal.lost_reason,
                      notes: deal.notes,
                    }} />
                  </div>
                </article>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              A mostrar {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString("pt-PT")}–{Math.min(currentPage * PAGE_SIZE, filtered.length).toLocaleString("pt-PT")} de {filtered.length.toLocaleString("pt-PT")}
            </p>
            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link href={queryHref({ q: query, type: selectedType, stage: selectedStage, page: currentPage - 1 })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Anterior</Link>
              ) : <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-xs text-slate-300">Anterior</span>}
              {currentPage < totalPages ? (
                <Link href={queryHref({ q: query, type: selectedType, stage: selectedStage, page: currentPage + 1 })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Seguinte</Link>
              ) : <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-xs text-slate-300">Seguinte</span>}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
