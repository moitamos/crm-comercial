import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, Clock3, Search, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PipelineBoard, type PipelineActivity, type PipelineDeal } from "@/components/crm/pipeline-board";
import { PipelineMonthControls } from "@/components/crm/pipeline-month-controls";

type Props = { searchParams: Promise<{ q?: string; sort?: string; month?: string }> };
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
type ClientRow = { id: string; full_name: string; nif: string; phone: string | null; email: string | null };
type ClientAdminContactRow = { id: string; client_id: string; phone_numbers: string[] | null; email: string | null };
type DealServiceRow = {
  id: string;
  deal_id: string;
  service_id: string;
  decision: string | null;
  future_package: string | null;
  loss_decision: "recycle" | "close" | null;
  loss_decided_at: string | null;
};
type InteractionRow = {
  id: string;
  deal_id: string;
  commercial_id: string;
  event_type: string;
  description: string | null;
  event_data: Record<string, unknown> | null;
  occurred_at: string;
};
type ServiceRow = { id: string; service_number: string; service_type: string; package_name: string | null; loyalty_end_date: string | null; source_data: unknown };
type CandidateServiceRow = { id: string; client_id: string; loyalty_end_date: string };

const STAGES = [
  { value: "to_contact", label: "Por contactar" },
  { value: "negotiation", label: "Em negociação" },
  { value: "scheduled", label: "Agendado" },
  { value: "future_contact", label: "Contactar futuramente" },
  { value: "sale", label: "Venda" },
  { value: "lost", label: "Perdido" },
] as const;
const DEAL_SORTS = [
  { value: "created_desc", label: "Criação: mais recente para mais antiga" },
  { value: "created_asc", label: "Criação: mais antiga para mais recente" },
  { value: "loyalty_asc", label: "Fidelização: mais próxima primeiro" },
  { value: "loyalty_desc", label: "Fidelização: mais distante primeiro" },
  { value: "contact_desc", label: "Contacto: mais recente primeiro" },
  { value: "contact_asc", label: "Contacto: mais antigo primeiro" },
] as const;

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

async function loadCandidateServices(supabase: Awaited<ReturnType<typeof createClient>>) {
  const rows: CandidateServiceRow[] = [];
  let offset = 0;
  while (true) {
    const batch = await supabase.from("services")
      .select("id, client_id, loyalty_end_date")
      .eq("is_active", true)
      .not("loyalty_end_date", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (batch.error) return { data: rows, error: batch.error };
    rows.push(...((batch.data ?? []) as CandidateServiceRow[]));
    if ((batch.data ?? []).length < 1000) break;
    offset += 1000;
  }
  return { data: rows, error: null };
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

function currentMonthStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return year + "-" + month + "-01";
}

// The exact six-month date keeps the day of the loyalty end date.
// We group it into a month so dates on day 1 and day 20 enter the same monthly batch.
function eligibilityMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const monthIndex = year * 12 + month - 1 - 6;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return targetYear + "-" + String(targetMonth).padStart(2, "0") + "-01";
}

function validMonth(value: string | undefined) {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value));
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
  const selectedSort = DEAL_SORTS.some((item) => item.value === params.sort)
    ? params.sort ?? "created_desc"
    : "created_desc";
  const supabase = await createClient();

  const [dealsResult, candidateServicesResult] = await Promise.all([
    supabase.from("deals")
      .select("id, client_id, commercial_id, deal_type, stage, created_at, last_contact_at, next_contact_at, lost_reason, notes, eligibility_month", { count: "exact" })
      .order("eligibility_month", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5000),
    loadCandidateServices(supabase),
  ]);

  const allDeals = (dealsResult.data ?? []) as DealRow[];
  const dealIds = allDeals.map((deal) => deal.id);
  const clientIds = Array.from(new Set(allDeals.map((deal) => deal.client_id)));
  const [clientsResult, dealServicesResult, interactionsResult, clientAdminContactsResult] = await Promise.all([
    loadChunks<ClientRow>(clientIds, async (batch) =>
      await supabase.from("clients").select("id, full_name, nif, phone, email").in("id", batch)
    ),
    loadChunks<DealServiceRow>(dealIds, async (batch) =>
      await supabase.from("deal_services").select("id, deal_id, service_id, decision, future_package, loss_decision, loss_decided_at").in("deal_id", batch)
    ),
    loadChunks<InteractionRow>(dealIds, async (batch) =>
      await supabase.from("interactions")
        .select("id, deal_id, commercial_id, event_type, description, event_data, occurred_at")
        .in("deal_id", batch)
        .order("occurred_at", { ascending: false })
    ),
    loadChunks<ClientAdminContactRow>(clientIds, async (batch) =>
      await supabase.from("client_administrators")
        .select("id, client_id, phone_numbers, email")
        .in("client_id", batch)
        .order("full_name", { ascending: true })
    ),
  ]);

  const dealServices = dealServicesResult.data;
  const serviceIds = Array.from(new Set(dealServices.map((item) => item.service_id)));
  const servicesResult = await loadChunks<ServiceRow>(serviceIds, async (batch) =>
    await supabase.from("services").select("id, service_number, service_type, package_name, loyalty_end_date, source_data").in("id", batch)
  );

  const clients = new Map(clientsResult.data.map((client) => [client.id, client]));
  const services = new Map(servicesResult.data.map((service) => [service.id, service]));
  const adminContactsByClient = new Map<string, ClientAdminContactRow[]>();
  for (const contact of clientAdminContactsResult.data) {
    const current = adminContactsByClient.get(contact.client_id) ?? [];
    current.push(contact);
    adminContactsByClient.set(contact.client_id, current);
  }
  const activitiesByDeal = new Map<string, PipelineActivity[]>();
  for (const activity of interactionsResult.data) {
    const current = activitiesByDeal.get(activity.deal_id) ?? [];
    current.push(activity);
    activitiesByDeal.set(activity.deal_id, current);
  }

  const servicesByDeal = new Map<string, ServiceRow[]>();
  for (const link of dealServices) {
    const service = services.get(link.service_id);
    if (!service) continue;
    const current = servicesByDeal.get(link.deal_id) ?? [];
    current.push(service);
    servicesByDeal.set(link.deal_id, current);
  }

  const allDealViews: PipelineDeal[] = allDeals.map((deal) => {
    const client = clients.get(deal.client_id) ?? null;
    const administratorContacts = adminContactsByClient.get(deal.client_id) ?? [];
    const phoneNumbers = client?.phone
      ? [client.phone]
      : Array.from(new Set(administratorContacts.flatMap((item) => item.phone_numbers ?? []).map((item) => item.trim()).filter(Boolean)));
    const emails = client?.email
      ? [client.email]
      : Array.from(new Set(administratorContacts.map((item) => item.email?.trim()).filter((item): item is string => Boolean(item))));
    return {
      ...deal,
      client: client ? { ...client, phone_numbers: phoneNumbers, emails } : null,
      services: servicesByDeal.get(deal.id) ?? [],
      activities: activitiesByDeal.get(deal.id) ?? [],
    };
  });

  const currentMonth = currentMonthStart();
  const existingMonthDeals = new Set(
    allDeals
      .filter((deal) => deal.deal_type === "portfolio_renewal" && deal.eligibility_month)
      .map((deal) => deal.client_id + "|" + deal.eligibility_month)
  );
  const stageByDealId = new Map(allDeals.map((deal) => [deal.id, deal.stage]));
  const linksByServiceId = new Map<string, DealServiceRow[]>();
  for (const link of dealServices) {
    const current = linksByServiceId.get(link.service_id) ?? [];
    current.push(link);
    linksByServiceId.set(link.service_id, current);
  }
  const linkedServiceIds = new Set<string>();
  for (const [serviceId, links] of linksByServiceId) {
    const hasOpenDeal = links.some((link) => stageByDealId.get(link.deal_id) !== "lost");
    const latestDecision = links
      .filter((link) => link.loss_decision)
      .sort((left, right) => (right.loss_decided_at ?? "").localeCompare(left.loss_decided_at ?? ""))[0]?.loss_decision;
    if (hasOpenDeal || (links.length > 0 && latestDecision !== "recycle")) {
      linkedServiceIds.add(serviceId);
    }
  }
  const candidatesByMonth = new Map<string, Set<string>>();
  for (const service of (candidateServicesResult.data ?? []) as CandidateServiceRow[]) {
    if (!service.loyalty_end_date || linkedServiceIds.has(service.id)) continue;
    const month = eligibilityMonth(service.loyalty_end_date);
    if (existingMonthDeals.has(service.client_id + "|" + month)) continue;
    const clientsInMonth = candidatesByMonth.get(month) ?? new Set<string>();
    clientsInMonth.add(service.client_id);
    candidatesByMonth.set(month, clientsInMonth);
  }

  const selectedMonth = params.month === "unassigned"
    ? "unassigned"
    : validMonth(params.month)
      ? params.month as string
      : currentMonth;
  const monthDeals = allDealViews.filter((deal) =>
    selectedMonth === "unassigned"
      ? !deal.eligibility_month
      : deal.eligibility_month === selectedMonth
  );

  const searchNeedle = normalized(query);
  const filtered = monthDeals.filter((deal) => {
    if (!searchNeedle) return true;
    const searchable = [
      deal.client?.full_name ?? "",
      deal.client?.nif ?? "",
      ...deal.services.map((service) => service.service_number),
      ...deal.services.map((service) => service.package_name ?? ""),
    ].join(" ");
    return normalized(searchable).includes(searchNeedle);
  });
  const sortedFiltered = [...filtered].sort((left, right) => {
    const createdDesc = right.created_at.localeCompare(left.created_at);
    const createdAsc = left.created_at.localeCompare(right.created_at);
    if (selectedSort === "created_asc") return createdAsc;
    if (selectedSort === "loyalty_asc") {
      const leftDate = left.services.map((service) => service.loyalty_end_date).filter((date): date is string => Boolean(date)).sort()[0] ?? null;
      const rightDate = right.services.map((service) => service.loyalty_end_date).filter((date): date is string => Boolean(date)).sort()[0] ?? null;
      if (!leftDate && !rightDate) return createdDesc;
      if (!leftDate) return 1;
      if (!rightDate) return -1;
      return leftDate.localeCompare(rightDate) || createdDesc;
    }
    if (selectedSort === "loyalty_desc") {
      const leftDates = left.services.map((service) => service.loyalty_end_date).filter((date): date is string => Boolean(date)).sort();
      const rightDates = right.services.map((service) => service.loyalty_end_date).filter((date): date is string => Boolean(date)).sort();
      const leftDate = leftDates[leftDates.length - 1] ?? null;
      const rightDate = rightDates[rightDates.length - 1] ?? null;
      if (!leftDate && !rightDate) return createdDesc;
      if (!leftDate) return 1;
      if (!rightDate) return -1;
      return rightDate.localeCompare(leftDate) || createdDesc;
    }
    if (selectedSort === "contact_desc") {
      if (!left.last_contact_at && !right.last_contact_at) return createdDesc;
      if (!left.last_contact_at) return 1;
      if (!right.last_contact_at) return -1;
      return right.last_contact_at.localeCompare(left.last_contact_at) || createdDesc;
    }
    if (selectedSort === "contact_asc") {
      if (!left.last_contact_at && !right.last_contact_at) return createdDesc;
      if (!left.last_contact_at) return 1;
      if (!right.last_contact_at) return -1;
      return left.last_contact_at.localeCompare(right.last_contact_at) || createdDesc;
    }
    return createdDesc;
  });

  const stageCounts = new Map<string, number>(STAGES.map((stage) => [stage.value, 0]));
  for (const deal of monthDeals) stageCounts.set(deal.stage, (stageCounts.get(deal.stage) ?? 0) + 1);
  const openCount = monthDeals.filter((deal) => !["sale", "lost"].includes(deal.stage)).length;
  const followUpCount = monthDeals.filter((deal) => ["scheduled", "future_contact"].includes(deal.stage)).length;
  const now = Date.now();
  const overdueCount = monthDeals.filter((deal) =>
    !["sale", "lost"].includes(deal.stage) && deal.next_contact_at && new Date(deal.next_contact_at).getTime() < now
  ).length;
  const candidateCount = selectedMonth === "unassigned"
    ? 0
    : candidatesByMonth.get(selectedMonth)?.size ?? 0;

  const queryError = dealsResult.error || clientsResult.error || dealServicesResult.error
    || interactionsResult.error || clientAdminContactsResult.error || servicesResult.error || candidateServicesResult.error;
  const truncated = (dealsResult.count ?? allDeals.length) > allDeals.length;

  return (
    <main className="mx-auto max-w-none space-y-5 px-4 py-6 sm:px-6 xl:px-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Funil de vendas</h1>
        </div>
        <Link href="/clients" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:self-auto">
          <Users size={16} /> Consultar clientes
        </Link>
      </div>

      <PipelineMonthControls
        selectedMonth={selectedMonth}
        candidateCount={candidateCount}
        query={query}
        sort={selectedSort}
      />

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Metric label="Negócios em aberto neste mês" value={openCount} icon={BriefcaseBusiness} />
        <Metric label="Com contacto agendado" value={followUpCount} icon={CalendarClock} />
        <Metric label="Contactos em atraso" value={overdueCount} icon={Clock3} />
        <Metric label="Vendas concluídas neste mês" value={stageCounts.get("sale") ?? 0} icon={TrendingUp} />
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
        <input type="hidden" name="month" value={selectedMonth} />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input name="q" defaultValue={query} placeholder="Pesquisar por cliente, NIF, serviço ou pacote"
            className="w-full border-0 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400" />
        </div>
        <select name="sort" defaultValue={selectedSort} aria-label="Ordenar negócios"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-600">
          {DEAL_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Pesquisar</button>
        {(query || selectedSort !== "created_desc") && (
          <Link href={"/pipeline?month=" + encodeURIComponent(selectedMonth)} className="rounded-lg px-3 py-2 text-center text-sm font-medium text-slate-500 hover:bg-slate-50">Limpar</Link>
        )}
      </form>

      <PipelineBoard deals={sortedFiltered} />
    </main>
  );
}
