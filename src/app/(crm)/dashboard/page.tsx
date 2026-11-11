import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  Layers3,
  Smartphone,
  Users,
  Wifi,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type DashboardMetrics = {
  client_count?: number;
  active_client_count?: number;
  open_deal_count?: number;
  sales_this_month?: number;
  meo_service_count?: number;
  mobile_service_count?: number;
  gcp_service_count?: number;
  due_deal_count?: number;
};

function MetricCard({ title, value, note, icon: Icon }: {
  title: string; value: number; note: string; icon: typeof Users;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Icon size={19} /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value.toLocaleString("pt-PT")}</p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_dashboard_metrics");
  const metrics = (data ?? {}) as DashboardMetrics;

  const clientCount = Number(metrics.client_count ?? 0);
  const activeClientCount = Number(metrics.active_client_count ?? 0);
  const dealCount = Number(metrics.open_deal_count ?? 0);
  const salesThisMonth = Number(metrics.sales_this_month ?? 0);
  const meoCount = Number(metrics.meo_service_count ?? 0);
  const mobileCount = Number(metrics.mobile_service_count ?? 0);
  const gcpCount = Number(metrics.gcp_service_count ?? 0);
  const dueDeals = Number(metrics.due_deal_count ?? 0);

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Visão geral da atividade comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Resumo da carteira, serviços, renovações e vendas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            <Users size={16} /> Novo cliente
          </Link>
          <Link href="/import" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Activity size={16} /> Importar ficheiro
          </Link>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Não foi possível carregar todos os indicadores. Confirma as permissões da base de dados e atualiza a página.
      </p>}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Carteira e atividade comercial</h2>
          <span className="text-xs text-slate-400">Atualizado com os dados atuais do CRM</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Clientes na carteira" value={clientCount} note="Total de clientes visíveis na tua carteira" icon={Users} />
          <MetricCard title="Clientes ativos" value={activeClientCount} note="Com venda concluída ou Data conclusão registada" icon={Layers3} />
          <MetricCard title="Negócios no funil" value={dealCount} note="Oportunidades ainda não ganhas nem perdidas" icon={BriefcaseBusiness} />
          <MetricCard title="Renovações elegíveis" value={dueDeals} note="Negócios abertos cujo mês de elegibilidade já chegou" icon={CalendarClock} />
          <MetricCard title="Vendas este mês" value={salesThisMonth} note="Vendas concluídas no mês atual" icon={CircleDollarSign} />
          <MetricCard title="Serviços MEO" value={meoCount} note="Serviços ativos da folha Refid MEO" icon={Wifi} />
          <MetricCard title="Cartões M Móvel" value={mobileCount} note="Cartões ativos da folha Cartoes Moveis" icon={Smartphone} />
          <MetricCard title="Soluções GCP" value={gcpCount} note="Soluções ativas da folha GC Pack" icon={BriefcaseBusiness} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Próximas áreas do CRM</h2>
            <p className="mt-1 text-sm text-slate-500">A carteira e a importação ficam como base para as próximas ferramentas comerciais.</p>
          </div>
          <Link href="/clients" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
            Ver clientes <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Link href="/clients" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40">
            <Users size={20} className="text-blue-700" />
            <h3 className="mt-3 font-semibold text-slate-900">Consultar carteira</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Pesquisa por nome ou NIF e abre a ficha detalhada com serviços e administradores.</p>
          </Link>
          <Link href="/import" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40">
            <Activity size={20} className="text-blue-700" />
            <h3 className="mt-3 font-semibold text-slate-900">Importar clientes</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Importa as folhas de clientes, MEO, cartões móveis, GCP e administradores.</p>
          </Link>
          <div className="rounded-xl border border-dashed border-slate-300 p-5">
            <CalendarClock size={20} className="text-slate-400" />
            <h3 className="mt-3 font-semibold text-slate-700">Objetivos comerciais</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Próxima fase: objetivos mensais, pontos e evolução de resultados.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
