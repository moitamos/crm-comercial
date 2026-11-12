"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CalendarDays, X } from "lucide-react";
import { moveDealToMonthAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";
export function PipelineMonthMove({
  dealId,
  currentMonth,
}: {
  dealId: string;
  currentMonth: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState(currentMonth ? currentMonth.slice(0, 7) : "unassigned");
  const [state, formAction, pending] = useActionState(
    moveDealToMonthAction,
    {} as FormActionState
  );

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setTargetMonth(currentMonth ? currentMonth.slice(0, 7) : "unassigned");
            setOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <ArrowLeftRight size={12} /> Mover para outro mês
        </button>
      ) : (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="deal_id" value={dealId} />
          <input
            type="hidden"
            name="target_month"
            value={targetMonth === "unassigned" ? "unassigned" : targetMonth + "-01"}
          />
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Novo mês
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 focus-within:border-blue-500">
              <CalendarDays size={14} className="shrink-0 text-slate-400" />
              <input
                type="month"
                value={targetMonth === "unassigned" ? "" : targetMonth}
                onChange={(event) => setTargetMonth(event.target.value || "unassigned")}
                aria-label="Selecionar novo mês e ano"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setTargetMonth("unassigned")}
              aria-pressed={targetMonth === "unassigned"}
              className={"rounded-lg border px-2.5 py-2 text-[11px] font-semibold " +
                (targetMonth === "unassigned"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            >
              Sem mês
            </button>
          </div>
          {state.error && <p role="alert" className="text-[10px] leading-4 text-rose-700">{state.error}</p>}
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
            >
              <X size={12} /> Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || targetMonth === (currentMonth ? currentMonth.slice(0, 7) : "unassigned")}
              className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "A guardar..." : "Guardar mês"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
