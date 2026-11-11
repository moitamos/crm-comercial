import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, Clock3, Search, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServicePackageLabel } from "@/lib/crm/packages";
import { PipelineBoard, type PipelineDeal } from "@/components/crm/pipeline-board";

type Props = { searchParams: Promise<{ q?: string; type?: string }> };
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

const STAGES = [
  { value: "to_contact", label: "Por contactar" },
  { value: "negotiation", label: "Em negociação" },
  { value: "scheduled", label: "Agendado" },
  { value: "future_contact", label: "Contactar futuramente" },
  { value: "sale", label: "Venda" },
  { value: "lost", label: "Perdido" },
] as const;
const DEAL_TYPES = [
  { value: "portfolio_renewal", label: "Renovação de carteira" },
  { value: "new_sale", label: "Nova venda" },
  { value: "package_change", label: "Alteração de pacote" },
];

async function loadChunks<T>(
  ids: string[],
  loader: (batch: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>
) {
  const batches: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += 80) batches.push(ids.slice(offset, offset + 80));
  const results = await Promise.all(batches.map(loader));
  return {
    data: results.flatMap((result) => result.data ?? []),
    error: results.find((result) => result.error)?.error ?? null,
  };
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
  const selectedType = DEAL_TYPES.some((item) => item.value === params.type) ? params.type ?? "" : "";

  const supabase = await createClient();
  const dealsResult = await supabase.from("deals")
    .select("id, client_id, commercial_id, deal_type, stage, created_at, last_contact_at, next_contact_at, lost_reason, notes, eligibility_month", { count: "exact" })
    .order("eligibility_month", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5000);

  const allDeals = (dealsResult.data ?? []) as DealRow[];
  const dealIds = allDeals.map((deal) => deal.id);
  const clientIds = Array.from(new Set(allDeals.map((deal) => deal.client_id)));
  const [clientsResult, dealServicesResult] = await Promise.all([
    loadChunks<ClientRow>(clientIds, async (batch) =>
      await supabase.from("clients").select("id, full_name, nif").in("id", batch)
    ),
    loadChunks<DealServiceRow>(dealIds, async (batch) =>
      await supabase.from("deal_services").select("id, deal_id, service_id, decision, future_package").in("deal_id", batch)
    ),
  ]);

  const dealServices = dealServicesResult.data;
  const serviceIds = Array.from(new Set(dealServices.map((item) => item.service_id)));
  const servicesResult = await loadChunks<ServiceRow>(serviceIds, async (batch) =>
    await supabase.from("services").select("id, service_number, service_type, package_name").in("id", batch)
  );

  const clients = new Map(clientsResult.data.map((client) => [client.id, client]));
  const services = new Map(servicesResult.data.map((service) => [service.id, service]));
  const servicesByDeal = new Map<string, ServiceRow[]>();
  for (const link of dealServices) {
    const service = services.get(link.service_id);
    if (!service) continue;
    const current = servicesByDeal.get(link.deal_id) ?? [];
    current.push(service);
    servicesByDeal.set(link.deal_id, current);
  }

  const allDealViews: PipelineDeal[] = allDeals.map((deal) => ({
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

  const queryError = dealsResult.error || clientsResult.error || dealServicesResult.error || servicesResult.error;
  const truncated = (dealsResult.count ?? allDeals.length) > allDeals.length;

  return (
    <main className="mx-auto max-w-none space-y-5 px-4 py-6 sm:px-6 xl:px-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Gestão de oportunidades comerciais</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Funil de vendas</h1>
          <p className="mt-1 text-sm text-slate-500">Organiza os negócios por fase e acompanha a evolução de cada oportunidade.</p>
        </div>
        <Link href="/clients" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:self-auto">
          <Users size={16} /> Consultar clientes
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
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

      <form method="get" className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row">
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
          <Link href="/pipeline" className="rounded-lg px-3 py-2 text-center text-sm font-medium text-slate-500 hover:bg-slate-50">Limpar</Link>
        )}
      </form>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {filtered.length.toLocaleString("pt-PT")} negócios encontrados
          {(query || selectedType) ? " · Filtros aplicados" : " · Todas as fases"}
        </p>
        <p className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
          <BriefcaseBusiness size={13} /> {STAGES.length} fases
        </p>
      </div>

      <PipelineBoard deals={filtered} />
    </main>
  );
}
