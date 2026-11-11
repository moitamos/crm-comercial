import Link from "next/link";
import { Activity, ArrowRight, BriefcaseBusiness, CircleDollarSign, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

function MetricCard({ title, value, note, icon: Icon }: {
  title: string; value: number; note: string; icon: typeof Users;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
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
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [clients, deals, sales] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("deals").select("id", { count: "exact", head: true }).not("stage", "in", '("sale","lost")'),
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", monthStart),
  ]);

  const failed = clients.error || deals.error || sales.error;
  const clientCount = clients.count ?? 0;
  const dealCount = deals.count ?? 0;
  const saleCount = sales.count ?? 0;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Visão geral da atividade comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Os indicadores são calculados a partir dos dados da tua carteira.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            <Users size={16} /> Novo cliente
          </Link>
          <Link href="/import" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Activity size={16} /> Importar Excel
          </Link>
        </div>
      </div>

      {failed && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Não foi possível carregar todos os indicadores. Atualiza a página ou confirma as permissões da base de dados.
      </p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Clientes visíveis" value={clientCount} note="Clientes a que tens acesso" icon={Users} />
        <MetricCard title="Oportunidades ativas" value={dealCount} note="Negócios ainda em aberto" icon={BriefcaseBusiness} />
        <MetricCard title="Vendas este mês" value={saleCount} note="Vendas concluídas no mês atual" icon={CircleDollarSign} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Começar a trabalhar</h2>
            <p className="mt-1 text-sm text-slate-500">A gestão de clientes e os serviços são a base do funil de renovações.</p>
          </div>
          <Link href="/clients" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
            Ver clientes <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link href="/clients" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40">
            <Users size={20} className="text-blue-700" />
            <h3 className="mt-3 font-semibold text-slate-900">Consultar carteira</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Pesquisa clientes por nome, NIF, NIC ou NCC e consulta todos os serviços associados.</p>
          </Link>
          <Link href="/import" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40">
            <Activity size={20} className="text-blue-700" />
            <h3 className="mt-3 font-semibold text-slate-900">Importar ficheiro Excel</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Pré-visualiza os registos, valida NIFs e importa clientes e serviços sem duplicações.</p>
          </Link>
        </div>
      </section>
    </main>
  );
}
