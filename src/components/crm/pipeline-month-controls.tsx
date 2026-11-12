"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { createMonthlyRenewalDealsAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

export type PipelineMonthOption = { value: string; label: string };

export function PipelineMonthControls({
  months,
  selectedMonth,
  candidateCount,
  query,
  type,
}: {
  months: PipelineMonthOption[];
  selectedMonth: string;
  candidateCount: number;
  query: string;
  type: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createMonthlyRenewalDealsAction,
    {} as FormActionState
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  function changeMonth(nextMonth: string) {
    const params = new URLSearchParams();
    if (nextMonth) params.set("month", nextMonth);
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    router.push("/pipeline?" + params.toString());
  }

  const canCreate = selectedMonth !== "unassigned" && candidateCount > 0;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <label htmlFor="pipeline_month" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-700">
          <CalendarDays size={16} className="text-blue-700" /> Mês dos negócios
        </label>
        <select
          id="pipeline_month"
          value={selectedMonth}
          onChange={(event) => changeMonth(event.target.value)}
          className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium capitalize text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:max-w-xs"
        >
          {months.map((month) => (
            <option key={month.value} value={month.value}>{month.label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {candidateCount > 0
            ? candidateCount + (candidateCount === 1 ? " cliente entra em período de renovação" : " clientes entram em período de renovação") + " neste mês"
            : selectedMonth === "unassigned" ? "Negócios sem mês atribuído" : "Não há novos negócios por criar neste mês"}
        </span>
      </div>

      <form action={formAction} className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="eligibility_month" value={selectedMonth} />
        <button
          type="submit"
          disabled={!canCreate || pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {pending ? (
            "A criar negócios..."
          ) : canCreate ? (
            <><Plus size={16} /> Criar +{candidateCount} negócios</>
          ) : (
            "Sem negócios novos"
          )}
        </button>
      </form>
      {state.error && <p role="alert" className="text-xs font-medium text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs font-medium text-emerald-700">{state.success}</p>}
    </section>
  );
}
