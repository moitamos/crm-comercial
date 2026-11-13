"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  BriefcaseBusiness,
  CalendarClock,
  TrendingUp,
  FileDown,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/import", label: "Importar Excel", icon: FileSpreadsheet },
  { href: "/pipeline", label: "Funil de vendas", icon: BriefcaseBusiness },
  { href: "/agenda", label: "Agenda", icon: CalendarClock },
  { href: "/results", label: "Resultados", icon: TrendingUp },
];

export function CrmSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
      <Link href="/dashboard" className="flex h-16 items-center gap-3 px-5 lg:h-20 lg:border-b lg:border-slate-200">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white">
          <Activity size={21} />
        </span>
        <span>
          <span className="block font-semibold tracking-tight text-slate-900">CRM Comercial</span>
          <span className="block text-xs text-slate-500">Gestão de carteira</span>
        </span>
      </Link>

      <nav aria-label="Navegação principal" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-4 lg:pt-7">
        {[...links, ...(isAdmin ? [{ href: "/invoice-import", label: "Faturas CRM ONE", icon: FileDown }] : [])].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const disabled = ["/agenda"].includes(item.href);

          if (disabled) {
            return (
              <span key={item.href} title="Disponível numa próxima fase"
                className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-300 lg:w-full">
                <Icon size={17} />{item.label}
                <span className="ml-auto hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 lg:inline">Brevemente</span>
              </span>
            );
          }

          return (
            <Link key={item.href} href={item.href}
              className={"inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition lg:w-full " +
                (active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50")}>
              <Icon size={17} />{item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
