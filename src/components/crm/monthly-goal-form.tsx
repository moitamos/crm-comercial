"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveMonthlyGoalAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

export function MonthlyGoalForm({
  commercialId,
  commercialName,
  referenceMonth,
  targetPoints,
}: {
  commercialId: string;
  commercialName: string;
  referenceMonth: string;
  targetPoints: number | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveMonthlyGoalAction, {} as FormActionState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex min-w-[250px] items-center gap-2">
      <input type="hidden" name="commercial_id" value={commercialId} />
      <input type="hidden" name="reference_month" value={referenceMonth} />
      <label className="sr-only" htmlFor={"goal_" + commercialId}>Objectivo mensal de {commercialName} em pontos</label>
      <input
        id={"goal_" + commercialId}
        name="target_points"
        type="number"
        min="0"
        max="1000000"
        step="0.01"
        required
        defaultValue={targetPoints === null ? "" : targetPoints}
        placeholder="Definir SP"
        className="w-28 rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-blue-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "A guardar..." : "Guardar"}
      </button>
      {state.error && <span role="alert" className="text-xs text-rose-700">{state.error}</span>}
      {state.success && <span role="status" className="text-xs text-emerald-700">{state.success}</span>}
    </form>
  );
}
