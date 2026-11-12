"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, X } from "lucide-react";
import { moveDealToMonthAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";
import type { PipelineMonthOption } from "@/components/crm/pipeline-month-controls";

export function PipelineMonthMove({
  dealId,
  currentMonth,
  months,
}: {
  dealId: string;
  currentMonth: string | null;
  months: PipelineMonthOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState(currentMonth ?? "unassigned");
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
            setTargetMonth(currentMonth ?? "unassigned");
            setOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <ArrowLeftRight size={12} /> Mover para outro mês
        </button>
      ) : (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="deal_id" value={dealId} />
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Novo mês
          </label>
          <select
            name="target_month"
            value={targetMonth}
            onChange={(event) => setTargetMonth(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="unassigned">Sem mês definido</option>
            {months.filter((month) => month.value !== "unassigned").map((month) => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
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
              disabled={pending || targetMonth === (currentMonth ?? "unassigned")}
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
