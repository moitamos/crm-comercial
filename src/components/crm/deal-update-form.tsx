"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { updateDealAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

const STAGES = [
  { value: "to_contact", label: "Por contactar" },
  { value: "negotiation", label: "Em negociação" },
  { value: "scheduled", label: "Agendado" },
  { value: "future_contact", label: "Contactar futuramente" },
  { value: "sale", label: "Venda" },
  { value: "lost", label: "Perdido" },
];

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function DealUpdateForm({ deal, initialStage, onClose }: {
  deal: {
    id: string;
    stage: string;
    next_contact_at: string | null;
    lost_reason: string | null;
    notes: string | null;
  };
  initialStage: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage || deal.stage);
  const [nextContactDate, setNextContactDate] = React.useState(dateInputValue(deal.next_contact_at));
  const [state, formAction, pending] = useActionState(updateDealAction, {} as FormActionState);

  useEffect(() => {
    if (state.success) {
      onClose();
      router.refresh();
    }
  }, [state.success, router, onClose]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="edit-deal-title"
        className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Gestão do funil</p>
            <h2 id="edit-deal-title" className="mt-1 text-lg font-semibold text-slate-900">Atualizar negócio</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </header>

        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="deal_id" value={deal.id} />
          <div>
            <label htmlFor={"deal_stage_" + deal.id} className="mb-1.5 block text-sm font-medium text-slate-700">Fase do negócio</label>
            <select id={"deal_stage_" + deal.id} name="stage" value={stage} onChange={(event) => setStage(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
              {STAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          {["scheduled", "future_contact"].includes(stage) && (
            <div>
              <label htmlFor={"deal_next_contact_" + deal.id} className="mb-1.5 block text-sm font-medium text-slate-700">
                <CalendarClock size={14} className="mr-1 inline" /> Data para voltar a contactar *
              </label>
              <input id={"deal_next_contact_" + deal.id} name="next_contact_date" type="date" value={nextContactDate}
                onChange={(event) => setNextContactDate(event.target.value)} required
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
            </div>
          )}

          {stage === "lost" && (
            <div>
              <label htmlFor={"deal_lost_reason_" + deal.id} className="mb-1.5 block text-sm font-medium text-slate-700">Motivo da perda *</label>
              <textarea id={"deal_lost_reason_" + deal.id} name="lost_reason" rows={3} defaultValue={deal.lost_reason ?? ""} required maxLength={1000}
                placeholder="Ex.: cliente recusou, concorrência, sem interesse..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
            </div>
          )}
          {stage !== "lost" && <input type="hidden" name="lost_reason" value="" />}

          <div>
            <label htmlFor={"deal_notes_" + deal.id} className="mb-1.5 block text-sm font-medium text-slate-700">Notas do negócio</label>
            <textarea id={"deal_notes_" + deal.id} name="notes" rows={4} defaultValue={deal.notes ?? ""} maxLength={5000}
              placeholder="Regista o resultado da conversa, proposta apresentada ou próximos passos..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" name="register_contact" className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
            Registar que houve contacto com o cliente agora
          </label>

          {state.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={pending}
              className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {pending ? "A guardar..." : "Guardar negócio"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
