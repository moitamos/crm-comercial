"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock3, MessageSquarePlus, PhoneCall, X } from "lucide-react";
import { recordDealActivityAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

const STAGES = [
  { value: "to_contact", label: "Por contactar" },
  { value: "negotiation", label: "Em negociação" },
  { value: "scheduled", label: "Agendado" },
  { value: "future_contact", label: "Contactar futuramente" },
  { value: "sale", label: "Venda" },
  { value: "lost", label: "Perdido" },
] as const;

type Activity = {
  id: string;
  event_type: string;
  description: string | null;
  event_data: Record<string, unknown> | null;
  occurred_at: string;
};
type Service = {
  id: string;
  service_number: string;
  service_type: string;
  package_name: string | null;
  loyalty_end_date: string | null;
};
type Deal = {
  id: string;
  stage: string;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  client: { id: string; full_name: string; nif: string; phone: string | null; email: string | null } | null;
  services: Service[];
  activities: Activity[];
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Lisbon",
  });
}
function dateTimeLabel(value: string | null) {
  if (!value) return "Ainda não registado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
  });
}
function stageLabel(value: unknown) {
  return STAGES.find((item) => item.value === value)?.label ?? String(value ?? "—");
}
function eventTitle(activity: Activity) {
  switch (activity.event_type) {
    case "observation": return "Observação";
    case "contact_attempt": return "Tentativa de contacto";
    case "stage_changed": return "Fase alterada";
    case "deal_updated": return "Dados de acompanhamento atualizados";
    case "month_moved": return "Mês do negócio alterado";
    default: return "Atividade registada";
  }
}
function eventDescription(activity: Activity) {
  if (activity.event_type === "stage_changed") {
    return "Fase: " + stageLabel(activity.event_data?.old_stage) + " → " + stageLabel(activity.event_data?.new_stage);
  }
  if (activity.event_type === "deal_updated") return "Dados de acompanhamento atualizados.";
  return activity.description;
}

export function DealDetailsDialog({ deal, initialStage, onClose }: {
  deal: Deal;
  initialStage: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage || deal.stage);
  const [nextContactDate, setNextContactDate] = useState(deal.next_contact_at?.slice(0, 10) ?? "");
  const [updateState, updateAction, updatePending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [contactState, contactAction, contactPending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [noteState, noteAction, notePending] = useActionState(recordDealActivityAction, {} as FormActionState);

  useEffect(() => {
    setStage(initialStage || deal.stage);
    setNextContactDate(deal.next_contact_at?.slice(0, 10) ?? "");
  }, [deal.id, deal.stage, deal.next_contact_at, initialStage]);

  useEffect(() => {
    if (updateState.success || contactState.success || noteState.success) router.refresh();
  }, [updateState, contactState, noteState, router]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="deal-details-title"
        className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Detalhes do negócio</p>
            <h2 id="deal-details-title" className="mt-1 break-words text-xl font-semibold text-slate-900">{deal.client?.full_name ?? "Cliente sem nome"}</h2>
            <p className="mt-1 text-xs text-slate-500">NIF {deal.client?.nif ?? "—"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button>
        </header>

        <div className="max-h-[calc(100vh-110px)] space-y-5 overflow-y-auto p-5 sm:p-6">
          <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div><p className="text-[11px] font-semibold uppercase text-slate-500">Criado em</p><p className="mt-1 text-sm text-slate-800">{dateTimeLabel(deal.created_at)}</p></div>
            <div><p className="text-[11px] font-semibold uppercase text-slate-500">Último contacto</p><p className="mt-1 text-sm text-slate-800">{dateTimeLabel(deal.last_contact_at)}</p></div>
            <div><p className="text-[11px] font-semibold uppercase text-slate-500">Telefone</p><p className="mt-1 text-sm text-slate-800">{deal.client?.phone ?? "—"}</p></div>
            <div><p className="text-[11px] font-semibold uppercase text-slate-500">Email</p><p className="mt-1 break-all text-sm text-slate-800">{deal.client?.email ?? "—"}</p></div>
            {deal.next_contact_at && <div className="sm:col-span-2"><p className="text-[11px] font-semibold uppercase text-slate-500">Próximo contacto</p><p className="mt-1 text-sm text-slate-800">{dateTimeLabel(deal.next_contact_at)}</p></div>}
          </section>

          {(deal.notes || deal.lost_reason) && (
            <section className="space-y-2 rounded-xl border border-slate-200 p-3">
              {deal.notes && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notas existentes</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{deal.notes}</p></div>}
              {deal.lost_reason && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Motivo da perda</p><p className="mt-1 whitespace-pre-wrap text-sm text-rose-800">{deal.lost_reason}</p></div>}
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Serviços associados</h3><span className="text-xs text-slate-500">{deal.services.length} serviços</span></div>
            {deal.services.length ? <div className="grid gap-2 sm:grid-cols-2">
              {deal.services.map((service) => <div key={service.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{service.package_name || service.service_type}</p>
                <p className="mt-0.5 text-xs text-slate-500">N.º {service.service_number}</p>
                <p className="mt-2 text-xs text-slate-600"><CalendarClock size={13} className="mr-1 inline" />Fidelização até <strong>{dateLabel(service.loyalty_end_date)}</strong></p>
              </div>)}
            </div> : <p className="rounded-xl border border-dashed p-3 text-sm text-slate-500">Sem serviços associados.</p>}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Fase do negócio</h3>
            <form action={updateAction} className="space-y-3">
              <input type="hidden" name="deal_id" value={deal.id} />
              <input type="hidden" name="action" value="update" />
              <label htmlFor={"deal_stage_" + deal.id} className="block text-xs font-semibold text-slate-600">Selecionar fase</label>
              <select id={"deal_stage_" + deal.id} name="stage" value={stage} onChange={(event) => setStage(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600">
                {STAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setStage("negotiation")} className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (stage === "negotiation" ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600")}>Em negociação</button>
                <button type="button" onClick={() => setStage("sale")} className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (stage === "sale" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600")}>Marcar como venda</button>
                <button type="button" onClick={() => setStage("lost")} className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (stage === "lost" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600")}>Marcar como perdido</button>
              </div>
              {["scheduled", "future_contact"].includes(stage) && <div>
                <label htmlFor={"deal_next_contact_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-600">Data para voltar a contactar *</label>
                <input id={"deal_next_contact_" + deal.id} name="next_contact_date" type="date" value={nextContactDate} onChange={(event) => setNextContactDate(event.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
              </div>}
              {stage === "lost" && <div>
                <label htmlFor={"deal_lost_reason_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-600">Motivo da perda *</label>
                <textarea id={"deal_lost_reason_" + deal.id} name="lost_reason" rows={2} defaultValue={deal.lost_reason ?? ""} required maxLength={1000}
                  placeholder="Ex.: cliente recusou, concorrência, sem interesse..." className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
              </div>}
              <div>
                <label htmlFor={"deal_update_note_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-600">Observação sobre esta alteração (opcional)</label>
                <textarea id={"deal_update_note_" + deal.id} name="description" rows={2} maxLength={5000} placeholder="Contexto ou resultado desta alteração..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
              </div>
              {updateState.error && <p role="alert" className="text-xs text-rose-700">{updateState.error}</p>}
              {updateState.success && <p role="status" className="text-xs text-emerald-700">{updateState.success}</p>}
              <div className="flex justify-end"><button type="submit" disabled={updatePending} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{updatePending ? "A guardar..." : "Guardar alterações"}</button></div>
            </form>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2"><PhoneCall size={16} className="text-blue-700" /><h3 className="text-sm font-semibold text-slate-900">Tentativa de contacto</h3></div>
              <p className="mb-3 text-xs leading-5 text-slate-500">A data e hora são registadas automaticamente.</p>
              <form action={contactAction} className="space-y-2">
                <input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="action" value="contact_attempt" />
                <textarea name="description" rows={2} maxLength={5000} placeholder="Resultado da tentativa (opcional)..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                {contactState.error && <p role="alert" className="text-xs text-rose-700">{contactState.error}</p>}
                {contactState.success && <p role="status" className="text-xs text-emerald-700">{contactState.success}</p>}
                <button type="submit" disabled={contactPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60"><PhoneCall size={14} />{contactPending ? "A registar..." : "Registar tentativa"}</button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2"><MessageSquarePlus size={16} className="text-blue-700" /><h3 className="text-sm font-semibold text-slate-900">Adicionar observação</h3></div>
              <p className="mb-3 text-xs leading-5 text-slate-500">Cada observação fica como entrada independente no histórico.</p>
              <form action={noteAction} className="space-y-2">
                <input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="action" value="observation" />
                <textarea name="description" rows={2} maxLength={5000} required placeholder="Escreve a observação..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                {noteState.error && <p role="alert" className="text-xs text-rose-700">{noteState.error}</p>}
                {noteState.success && <p role="status" className="text-xs text-emerald-700">{noteState.success}</p>}
                <button type="submit" disabled={notePending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><MessageSquarePlus size={14} />{notePending ? "A guardar..." : "Adicionar observação"}</button>
              </form>
            </section>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Histórico do negócio</h3><span className="text-xs text-slate-500">{deal.activities.length} registos</span></div>
            {deal.activities.length ? <ol className="space-y-3">
              {deal.activities.map((activity) => <li key={activity.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">{eventTitle(activity)}</p>
                  <p className="inline-flex items-center gap-1 text-[11px] tabular-nums text-slate-500"><Clock3 size={12} />{dateTimeLabel(activity.occurred_at)}</p>
                </div>
                {eventDescription(activity) && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-600">{eventDescription(activity)}</p>}
              </li>)}
            </ol> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Ainda não existem atividades registadas neste negócio.</p>}
          </section>
          <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fechar</button></div>
        </div>
      </section>
    </div>
  );
}
