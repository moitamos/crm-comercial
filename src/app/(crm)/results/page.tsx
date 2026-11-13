import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleDollarSign, Target, TrendingUp, Trophy, Users } from "lucide-react";
import { MonthlyGoalForm } from "@/components/crm/monthly-goal-form";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ month?: string }> };
type ProfileRow = { id: string; full_name: string; role: string; is_active: boolean };
type GoalRow = { commercial_id: string; target_points: number | string };
type PointRow = { commercial_id: string; points: number | string };
type SaleRow = { id: string; deal_id: string; commercial_id: string; completed_at: string; sp_generated: number | string };
type DealRow = { id: string; client_id: string };
type ClientRow = { id: string; full_name: string; nif: string };

function validMonth(value: string | undefined) {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value));
}

function currentLisbonMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return year + "-" + month + "-01";
}

function lisbonMonthStartUtc(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  const sample = new Date(Date.UTC(year, month - 1, 15, 12));
  const offsetText = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Lisbon",
    timeZoneName: "longOffset",
  }).formatToParts(sample).find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);
  const sign = match?.[1] === "-" ? -1 : 1;
  const offsetMinutes = match ? sign * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(Date.UTC(year, month - 1, 1) - offsetMinutes * 60_000).toISOString();
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month;
  const nextYear = Math.floor(index / 12);
  const nextMonthNumber = index - nextYear * 12;
  return nextYear + "-" + String(nextMonthNumber).padStart(2, "0") + "-01";
}

function monthLabel(value: string) {
  return new Date(value + "T12:00:00Z").toLocaleDateString("pt-PT", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

function pointsLabel(value: number) {
  return value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MetricCard({ title, value, note, icon: Icon }: {
  title: string; value: string; note: string; icon: typeof Target;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <span className="rounded-lg bg-blue-50 p-1.5 text-blue-700"><Icon size={16} /></span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{note}</p>
    </section>
  );
}

export default async function ResultsPage({ searchParams }: Props) {
  const params = await searchParams;
  const referenceMonth = validMonth(params.month) ? params.month as string : currentLisbonMonth();
  const nextReferenceMonth = nextMonth(referenceMonth);
  const startIso = lisbonMonthStartUtc(referenceMonth);
  const endIso = lisbonMonthStartUtc(nextReferenceMonth);
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const [profileResult, profilesResult, goalsResult, pointsResult, salesResult] = await Promise.all([
    userId
      ? supabase.from("profiles").select("id, full_name, role, is_active").eq("id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: { message: "Sessão inválida." } }),
    supabase.from("profiles").select("id, full_name, role, is_active").eq("is_active", true).order("full_name"),
    supabase.from("monthly_goals").select("commercial_id, target_points").eq("reference_month", referenceMonth),
    supabase.from("points_ledger").select("commercial_id, points").eq("reference_month", referenceMonth),
    supabase.from("sales").select("id, deal_id, commercial_id, completed_at, sp_generated")
      .eq("status", "completed").gte("completed_at", startIso).lt("completed_at", endIso)
      .order("completed_at", { ascending: false }).limit(500),
  ]);

  const isAdmin = profileResult.data?.role === "admin";
  const profiles = ((profilesResult.data ?? []) as ProfileRow[]).filter((profile) =>
    isAdmin || profile.id === userId
  );
  const goals = (goalsResult.data ?? []) as GoalRow[];
  const points = (pointsResult.data ?? []) as PointRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];

  const targetByCommercial = new Map(goals.map((goal) => [goal.commercial_id, Number(goal.target_points)]));
  const pointsByCommercial = new Map<string, number>();
  for (const point of points) {
    pointsByCommercial.set(point.commercial_id, (pointsByCommercial.get(point.commercial_id) ?? 0) + Number(point.points));
  }
  const salesByCommercial = new Map<string, number>();
  for (const sale of sales) {
    salesByCommercial.set(sale.commercial_id, (salesByCommercial.get(sale.commercial_id) ?? 0) + 1);
  }

  const totalPoints = points.reduce((sum, item) => sum + Number(item.points), 0);
  const totalTarget = profiles.reduce((sum, profile) => sum + (targetByCommercial.get(profile.id) ?? 0), 0);
  const totalSales = sales.length;
  const progress = totalTarget > 0 ? Math.min(100, (totalPoints / totalTarget) * 100) : 0;

  const dealIds = Array.from(new Set(sales.map((sale) => sale.deal_id)));
  const dealsResult = dealIds.length
    ? await supabase.from("deals").select("id, client_id").in("id", dealIds)
    : { data: [], error: null };
  const clientIds = Array.from(new Set(((dealsResult.data ?? []) as DealRow[]).map((deal) => deal.client_id)));
  const clientsResult = clientIds.length
    ? await supabase.from("clients").select("id, full_name, nif").in("id", clientIds)
    : { data: [], error: null };
  const dealsById = new Map(((dealsResult.data ?? []) as DealRow[]).map((deal) => [deal.id, deal]));
  const clientsById = new Map(((clientsResult.data ?? []) as ClientRow[]).map((client) => [client.id, client]));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  const loadError = profileResult.error || profilesResult.error || goalsResult.error
    || pointsResult.error || salesResult.error || dealsResult.error || clientsResult.error;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Desempenho comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Resultados e objectivos</h1>
          <p className="mt-1 text-sm text-slate-500">Vendas concluídas, pontos gerados e progresso mensal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pipeline" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Abrir funil</Link>
          <Link href="/dashboard" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Dashboard</Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="results_month" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <CalendarDays size={16} className="text-blue-700" /> Mês de referência
        </label>
        <form method="get" className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <input id="results_month" type="month" name="month" defaultValue={referenceMonth.slice(0, 7)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Ver mês</button>
        </form>
      </div>

      {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Não foi possível carregar todos os indicadores. Confirma as permissões e actualiza a página.</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Pontos gerados" value={pointsLabel(totalPoints) + " SP"} note="Soma dos pontos registados no mês" icon={Trophy} />
        <MetricCard title="Objectivo total" value={pointsLabel(totalTarget) + " SP"} note="Soma dos objectivos definidos" icon={Target} />
        <MetricCard title="Progresso do objectivo" value={totalTarget > 0 ? progress.toLocaleString("pt-PT", { maximumFractionDigits: 1 }) + "%" : "Sem objectivo"} note={totalTarget > 0 ? pointsLabel(totalPoints) + " de " + pointsLabel(totalTarget) + " SP" : "Define um objectivo para acompanhar o progresso"} icon={TrendingUp} />
        <MetricCard title="Vendas concluídas" value={totalSales.toLocaleString("pt-PT")} note="Negócios concluídos em " + monthLabel(referenceMonth) icon={CircleDollarSign} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Objectivos por comercial</h2>
            <p className="mt-1 text-xs text-slate-500">Pontos acumulados comparados com o objectivo definido para o mês.</p>
          </div>
          {isAdmin && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Gestão de objectivos</span>}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-3 py-3 font-semibold">Comercial</th>
                <th className="px-3 py-3 text-right font-semibold">Vendas</th>
                <th className="px-3 py-3 text-right font-semibold">Pontos</th>
                <th className="px-3 py-3 text-right font-semibold">Objectivo</th>
                <th className="px-3 py-3 font-semibold">Progresso</th>
                {isAdmin && <th className="px-3 py-3 font-semibold">Definir objectivo</th>}
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const earned = pointsByCommercial.get(profile.id) ?? 0;
                const target = targetByCommercial.get(profile.id) ?? null;
                const ratio = target && target > 0 ? (earned / target) * 100 : 0;
                return (
                  <tr key={profile.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-800">{profile.full_name}</p>
                      <p className="text-[11px] text-slate-400">{profile.role === "admin" ? "Administrador" : "Comercial"}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{(salesByCommercial.get(profile.id) ?? 0).toLocaleString("pt-PT")}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{pointsLabel(earned)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{target === null ? "—" : pointsLabel(target)}</td>
                    <td className="px-3 py-3">
                      {target !== null && target > 0 ? (
                        <div className="min-w-32">
                          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                            <span>{Math.min(100, ratio).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</span>
                            <span>{ratio >= 100 ? "Concluído" : "Em curso"}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-600" style={{ width: Math.min(100, ratio) + "%" }} />
                          </div>
                        </div>
                      ) : <span className="text-xs text-slate-400">Sem objectivo</span>}
                    </td>
                    {isAdmin && <td className="px-3 py-3">
                      <MonthlyGoalForm commercialId={profile.id} commercialName={profile.full_name}
                        referenceMonth={referenceMonth} targetPoints={target} />
                    </td>}
                  </tr>
                );
              })}
              {profiles.length === 0 && <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-8 text-center text-sm text-slate-500">Não existem comerciais activos para apresentar.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Vendas do mês</h2>
            <p className="mt-1 text-xs text-slate-500">Histórico das vendas concluídas e dos respectivos pontos.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Users size={14} /> {sales.length} registos</span>
        </div>
        {sales.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-3 font-semibold">Data</th>
                  <th className="px-3 py-3 font-semibold">Cliente</th>
                  <th className="px-3 py-3 font-semibold">Comercial</th>
                  <th className="px-3 py-3 text-right font-semibold">SP gerados</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const deal = dealsById.get(sale.deal_id);
                  const client = deal ? clientsById.get(deal.client_id) : null;
                  return (
                    <tr key={sale.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 text-xs tabular-nums text-slate-500">{new Date(sale.completed_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">{client?.full_name ?? "Cliente"}</p>
                        <p className="text-[11px] text-slate-400">NIF {client?.nif ?? "—"}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{profilesById.get(sale.commercial_id)?.full_name ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{pointsLabel(Number(sale.sp_generated))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
            <CircleDollarSign size={24} className="text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">Ainda não há vendas concluídas neste mês.</p>
            <p className="mt-1 text-xs text-slate-500">Quando concluíres um negócio no funil, os pontos aparecem aqui.</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <p className="text-xs font-semibold text-blue-900">Como são calculados os SP</p>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          Para M5/M4: aumento 0,04; redução 0,02; manutenção 0,03. Para M3/M2: aumento 0,033; redução 0,018; manutenção 0,025.
          Aumento e redução aplicam o coeficiente à diferença das mensalidades; manutenção aplica-o à mensalidade mantida.
          Outros pacotes ficam sem pontuação nesta regra.
        </p>
      </section>
    </main>
  );
}
