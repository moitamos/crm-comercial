"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquarePlus,
  Phone,
  PhoneCall,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteDealActivityEntriesAction,
  recordDealActivityAction,
} from "@/lib/crm/actions";
import { getServicePackageLabel } from "@/lib/crm/packages";
import type { DealActivityStateItem, DealSnapshotState, FormActionState } from "@/lib/crm/types";

const STAGES = [
  { value: "to_contact", label: "Por contactar", style: "border-slate-300 bg-slate-50 text-slate-700", active: "border-slate-500 bg-slate-100 text-slate-900 ring-2 ring-slate-200" },
  { value: "negotiation", label: "Em negociação", style: "border-violet-200 bg-violet-50 text-violet-700", active: "border-violet-400 bg-violet-100 text-violet-900 ring-2 ring-violet-100" },
  { value: "scheduled", label: "Agendado", style: "border-amber-200 bg-amber-50 text-amber-700", active: "border-amber-400 bg-amber-100 text-amber-900 ring-2 ring-amber-100" },
  { value: "future_contact", label: "Contactar futuramente", style: "border-sky-200 bg-sky-50 text-sky-700", active: "border-sky-400 bg-sky-100 text-sky-900 ring-2 ring-sky-100" },
  { value: "sale", label: "Venda", style: "border-emerald-200 bg-emerald-50 text-emerald-700", active: "border-emerald-400 bg-emerald-100 text-emerald-900 ring-2 ring-emerald-100" },
  { value: "lost", label: "Perdido", style: "border-rose-200 bg-rose-50 text-rose-700", active: "border-rose-400 bg-rose-100 text-rose-900 ring-2 ring-rose-100" },
] as const;

type Activity = DealActivityStateItem;
type Service = {
  id: string;
  service_number: string;
  service_type: string;
  package_name: string | null;
  loyalty_end_date: string | null;
  source_data: unknown;
};
type Deal = {
  id: string;
  stage: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  client: {
    id: string;
    full_name: string;
    nif: string;
    phone: string | null;
    email: string | null;
    phone_numbers: string[];
    emails: string[];
  } | null;
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
function servicePackage(service: Service) {
  return getServicePackageLabel(service) ?? service.package_name ?? (
    service.service_type === "meo" ? "MEO" :
    service.service_type === "mobile" ? "Móvel" :
    service.service_type === "gcp" ? "GCP" : "Outro serviço"
  );
}

export function DealDetailsDialog({ deal, initialStage, onClose }: {
  deal: Deal;
  initialStage: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage || deal.stage);
  const [nextContactDate, setNextContactDate] = useState(deal.next_contact_at?.slice(0, 10) ?? "");
  const [lostReason, setLostReason] = useState(deal.lost_reason ?? "");
  const [lastContactAt, setLastContactAt] = useState(deal.last_contact_at);
  const [nextContactAt, setNextContactAt] = useState(deal.next_contact_at);
  const [activities, setActivities] = useState<Activity[]>(deal.activities ?? []);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);

  const [updateState, updateAction, updatePending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [contactState, contactAction, contactPending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [noteState, noteAction, notePending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteDealActivityEntriesAction, {} as FormActionState);

  function applySnapshot(snapshot?: DealSnapshotState, nextActivities?: Activity[]) {
    if (snapshot) {
      setStage(snapshot.stage);
      setLastContactAt(snapshot.last_contact_at);
      setNextContactAt(snapshot.next_contact_at);
      setNextContactDate(snapshot.next_contact_at?.slice(0, 10) ?? "");
      setLostReason(snapshot.lost_reason ?? "");
    }
    if (nextActivities) setActivities(nextActivities);
  }

  useEffect(() => {
    setStage(initialStage || deal.stage);
    setNextContactDate(deal.next_contact_at?.slice(0, 10) ?? "");
    setLostReason(deal.lost_reason ?? "");
    setLastContactAt(deal.last_contact_at);
    setNextContactAt(deal.next_contact_at);
    setActivities(deal.activities ?? []);
    setSelectedActivityIds([]);
  }, [deal.id, deal.stage, deal.last_contact_at, deal.next_contact_at, deal.lost_reason, deal.activities, initialStage]);

  useEffect(() => {
    if (!updateState.success) return;
    applySnapshot(updateState.dealSnapshot, updateState.activities);
    router.refresh();
  }, [updateState, router]);

  useEffect(() => {
    if (!contactState.success) return;
    applySnapshot(contactState.dealSnapshot, contactState.activities);
    router.refresh();
  }, [contactState, router]);

  useEffect(() => {
    if (!noteState.success) return;
    applySnapshot(noteState.dealSnapshot, noteState.activities);
    router.refresh();
  }, [noteState, router]);

  useEffect(() => {
    if (!deleteState.success) return;
    applySnapshot(deleteState.dealSnapshot, deleteState.activities);
    setSelectedActivityIds([]);
    router.refresh();
  }, [deleteState, router]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose]);

  function toggleActivity(id: string) {
    setSelectedActivityIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  const allSelected = activities.length > 0 && selectedActivityIds.length === activities.length;

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
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Último contacto</p>
              <p className="mt-1 text-sm text-slate-800">{dateTimeLabel(lastContactAt)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Próximo contacto</p>
              <p className="mt-1 text-sm text-slate-800">{dateTimeLabel(nextContactAt)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Telefone / telemóvel</p>
              <div className="mt-1 flex flex-col items-start gap-1.5">
                {(deal.client?.phone_numbers?.length ? deal.client.phone_numbers : deal.client?.phone ? [deal.client.phone] : []).map((phone) => (
                  <a key={phone} href={"tel:" + phone} className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline">
                    <Phone size={14} />{phone}
                  </a>
                ))}
                {!deal.client?.phone_numbers?.length && !deal.client?.phone && <span className="text-sm text-slate-500">—</span>}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Email</p>
              <div className="mt-1 flex flex-col items-start gap-1.5">
                {(deal.client?.emails?.length ? deal.client.emails : deal.client?.email ? [deal.client.email] : []).map((email) => (
                  <a key={email} href={"mailto:" + email} className="inline-flex max-w-full items-center gap-2 break-all text-sm text-blue-700 hover:underline">
                    <Mail size={14} className="shrink-0" />{email}
                  </a>
                ))}
                {!deal.client?.emails?.length && !deal.client?.email && <span className="text-sm text-slate-500">—</span>}
              </div>
            </div>
          </section>

          {(deal.notes || lostReason) && (
            <section className="space-y-2 rounded-xl border border-slate-200 p-3">
              {deal.notes && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notas existentes</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{deal.notes}</p></div>}
              {lostReason && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Motivo da perda</p><p className="mt-1 whitespace-pre-wrap text-sm text-rose-800">{lostReason}</p></div>}
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Serviços associados</h3><span className="text-xs text-slate-500">{deal.services.length} serviços</span></div>
            {deal.services.length ? <div className="grid gap-2 sm:grid-cols-2">
              {deal.services.map((service) => <div key={service.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{servicePackage(service)}</p>
                <p className="mt-0.5 text-xs text-slate-500">N.º {service.service_number}</p>
                <p className="mt-2 text-xs text-slate-600"><CalendarClock size={13} className="mr-1 inline" />Fidelização até <strong>{dateLabel(service.loyalty_end_date)}</strong></p>
              </div>)}
            </div> : <p className="rounded-xl border border-dashed p-3 text-sm text-slate-500">Sem serviços associados.</p>}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-700" /><h3 className="text-sm font-semibold text-slate-900">Fase do negócio</h3></div>
            <form action={updateAction} className="space-y-3">
              <input type="hidden" name="deal_id" value={deal.id} />
              <input type="hidden" name="action" value="update" />
              <input type="hidden" name="stage" value={stage} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STAGES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={stage === item.value}
                    onClick={() => setStage(item.value)}
                    className={"rounded-lg border px-2.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-300 " +
                      (stage === item.value ? item.active : item.style)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {["scheduled", "future_contact"].includes(stage) && <div>
                <label htmlFor={"deal_next_contact_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-600">Data para voltar a contactar *</label>
                <input id={"deal_next_contact_" + deal.id} name="next_contact_date" type="date" value={nextContactDate} onChange={(event) => setNextContactDate(event.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
              </div>}
              {stage === "lost" && <div>
                <label htmlFor={"deal_lost_reason_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-600">Motivo da perda *</label>
                <textarea id={"deal_lost_reason_" + deal.id} name="lost_reason" rows={2} value={lostReason} onChange={(event) => setLostReason(event.target.value)} required maxLength={1000}
                  placeholder="Ex.: cliente recusou, concorrência, sem interesse..." className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
              </div>}
              {stage !== "lost" && <input type="hidden" name="lost_reason" value="" />}
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
              <p className="mb-3 text-xs leading-5 text-slate-500">A data e a hora são registadas automaticamente.</p>
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-semibold text-slate-900">Histórico do negócio</h3><span className="text-xs text-slate-500">{activities.length} registos</span></div>
              {activities.length > 0 && <button type="button" onClick={() => setSelectedActivityIds(allSelected ? [] : activities.map((activity) => activity.id))} className="text-xs font-semibold text-blue-700 hover:underline">{allSelected ? "Limpar seleção" : "Selecionar todos"}</button>}
            </div>

            {activities.length > 0 && (
              <form action={deleteAction} onSubmit={(event) => {
                if (!window.confirm("Eliminar " + selectedActivityIds.length + " registo(s) do histórico? Esta ação não pode ser desfeita na linha temporal.")) event.preventDefault();
              }} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input type="hidden" name="deal_id" value={deal.id} />
                <input type="hidden" name="activity_ids" value={JSON.stringify(selectedActivityIds)} />
                <p className="text-xs text-slate-600">{selectedActivityIds.length} selecionado(s)</p>
                <button type="submit" disabled={deletePending || selectedActivityIds.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 size={13} />{deletePending ? "A eliminar..." : "Eliminar selecionados"}
                </button>
              </form>
            )}
            {deleteState.error && <p role="alert" className="mb-3 text-xs text-rose-700">{deleteState.error}</p>}
            {deleteState.success && <p role="status" className="mb-3 text-xs text-emerald-700">{deleteState.success}</p>}

            {activities.length ? <ol className="space-y-2">
              {activities.map((activity) => <li key={activity.id} className={"flex gap-2 rounded-xl border p-3 " + (selectedActivityIds.includes(activity.id) ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white")}>
                <label className="mt-0.5 flex shrink-0 items-start">
                  <input
                    type="checkbox"
                    checked={selectedActivityIds.includes(activity.id)}
                    onChange={() => toggleActivity(activity.id)}
                    aria-label={"Selecionar " + eventTitle(activity)}
                    className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{eventTitle(activity)}</p>
                    <p className="inline-flex items-center gap-1 text-[11px] tabular-nums text-slate-500"><Clock3 size={12} />{dateTimeLabel(activity.occurred_at)}</p>
                  </div>
                  {eventDescription(activity) && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-600">{eventDescription(activity)}</p>}
                </div>
              </li>)}
            </ol> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Ainda não existem atividades registadas neste negócio.</p>}
          </section>
          <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fechar</button></div>
        </div>
      </section>
    </div>
  );
}
