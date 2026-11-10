"use client";

import {
  Activity, ArrowUpRight, CalendarClock, CheckCircle2, CircleDollarSign,
  Clock3, LayoutDashboard, Menu, Search, Settings2, Users,
  BriefcaseBusiness, Target, TrendingUp, X
} from "lucide-react";
import { useState } from "react";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Clientes", icon: Users },
  { label: "Funil de vendas", icon: BriefcaseBusiness },
  { label: "Agenda", icon: CalendarClock },
  { label: "Resultados", icon: TrendingUp }
];
const pipeline = [
  { label: "Por contactar", tone: "bg-slate-400" },
  { label: "Em negociação", tone: "bg-blue-500" },
  { label: "Agendado", tone: "bg-violet-500" },
  { label: "Contactar futuramente", tone: "bg-amber-500" },
  { label: "Venda", tone: "bg-emerald-500" },
  { label: "Perdido", tone: "bg-rose-500" }
];

function MetricCard({ title, value, helper, icon: Icon }: {
  title: string; value: string; helper: string; icon: typeof Users;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Icon size={19} /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </section>
  );
}

export default function DashboardPage() {
  const [active, setActive] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-[var(--border)] bg-white transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-[var(--border)] px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white"><Activity size={22} /></div>
          <div><p className="font-semibold tracking-tight">CRM Comercial</p><p className="text-xs text-slate-500">Gestão de carteira</p></div>
          <button className="ml-auto text-slate-500 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <div className="px-4 pt-7">
          <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const selected = active === item.label;
              return <button key={item.label} onClick={() => { setActive(item.label); setMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${selected ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                <Icon size={18} />{item.label}
                {item.label === "Funil de vendas" && <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">CRM</span>}
              </button>;
            })}
          </nav>
        </div>
        <div className="mt-auto border-t border-[var(--border)] p-4">
          <button onClick={() => setActive("Definições")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600 hover:bg-slate-50"><Settings2 size={18} /> Definições</button>
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">Ambiente inicial</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Sem ligação à base de dados. Os indicadores serão preenchidos quando configurarmos o Supabase.</p>
          </div>
        </div>
      </aside>
      {menuOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <main className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-[var(--border)] bg-white/90 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3">
            <button className="text-slate-600 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
            <div><p className="text-xs text-slate-400">Workspace / {active}</p><h1 className="text-lg font-semibold tracking-tight">{active}</h1></div>
          </div>
          <div className="flex items-center gap-3">
            <button aria-label="Pesquisar" className="rounded-xl border border-[var(--border)] p-2.5 text-slate-500 hover:bg-slate-50"><Search size={18} /></button>
            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800 sm:flex">CM</div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl space-y-8 px-5 py-8 md:px-9">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><p className="text-sm text-slate-500">Visão geral da atividade comercial</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Bom trabalho. Vamos começar.</h2></div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"><Clock3 size={14} /> Configuração inicial</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Clientes na carteira" value="—" helper="À espera da ligação à base de dados" icon={Users} />
            <MetricCard title="Oportunidades ativas" value="—" helper="À espera da ligação à base de dados" icon={Target} />
            <MetricCard title="Vendas do mês" value="—" helper="À espera da ligação à base de dados" icon={CircleDollarSign} />
            <MetricCard title="Taxa de conversão" value="—" helper="À espera de histórico comercial" icon={TrendingUp} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm md:p-6">
              <div className="flex items-center justify-between">
                <div><h3 className="font-semibold text-slate-900">Funil de vendas</h3><p className="mt-1 text-xs text-slate-500">Fases comerciais definidas para o CRM</p></div>
                <button onClick={() => setActive("Funil de vendas")} className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">Abrir funil <ArrowUpRight size={14} /></button>
              </div>
              <div className="mt-6 space-y-4">
                {pipeline.map((stage) => <div key={stage.label} className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${stage.tone}`} /><span className="flex-1 text-sm text-slate-700">{stage.label}</span><span className="text-sm font-semibold text-slate-400">—</span></div>)}
              </div>
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">Os totais aparecerão aqui depois de configurarmos a base de dados e a importação inicial.</div>
            </section>
            <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm md:p-6">
              <div className="flex items-center gap-2"><CalendarClock size={18} className="text-blue-700" /><h3 className="font-semibold text-slate-900">Próximas tarefas</h3></div>
              <div className="mt-6 flex min-h-40 flex-col items-center justify-center rounded-xl bg-slate-50 px-5 text-center">
                <CheckCircle2 size={25} className="text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">Ainda sem tarefas</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">A agenda ficará disponível quando implementarmos contactos e lembretes.</p>
              </div>
            </section>
          </div>
          <section className="flex flex-col gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2 text-sm font-semibold text-blue-950"><Activity size={17} /> Próxima etapa: modelo de dados</div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-blue-900/70">Vamos estruturar clientes, carteiras, serviços, fidelizações, oportunidades, histórico e vendas antes de guardar informação real.</p></div>
            <span className="w-fit rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-800 shadow-sm">Etapa 1 de desenvolvimento</span>
          </section>
        </div>
      </main>
    </div>
  );
}
