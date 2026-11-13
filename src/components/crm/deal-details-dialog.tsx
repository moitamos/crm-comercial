"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock3,
  Mail,
  MessageSquarePlus,
  Phone,
  PhoneCall,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteDealActivityEntriesAction,
  editDealActivityEntryAction,
  markDealLostAction,
  markDealSaleAction,
  recordDealActivityAction,
} from "@/lib/crm/actions";
import { getServicePackageFamily, getServicePackageLabel, SERVICE_PACKAGE_GROUPS } from "@/lib/crm/packages";
import { DealServicesInvoices } from "@/components/crm/deal-services-invoices";
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
  current_monthly_fee: number | string | null;
  loyalty_end_date: string | null;
  source_data: unknown;
};
type Deal = {
  id: string;
  created_at: string;
  eligibility_month: string | null;
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
    case "deal_lost": return "Negócio marcado como perdido";
    default: return "Atividade registada";
  }
}
function eventDescription(activity: Activity) {
  if (activity.event_type === "stage_changed") {
    return "Fase: " + stageLabel(activity.event_data?.old_stage) + " → " + stageLabel(activity.event_data?.new_stage);
  }
  if (activity.event_type === "deal_updated") return "Dados de acompanhamento atualizados.";
  if (activity.event_type === "deal_lost") return activity.description;
  return activity.description;
}
function servicePackage(service: Service) {
  return getServicePackageLabel(service) ?? service.package_name ?? (
    service.service_type === "meo" ? "MEO" :
    service.service_type === "mobile" ? "Móvel" :
    service.service_type === "gcp" ? "GCP" : "Outro serviço"
  );
}
type LostServiceDecision = { decision: "" | "recycle" | "close"; loyalty_end_date: string };
type SaleServiceDecision = {
  decision: "" | "renew" | "keep_active" | "cancel";
  before_monthly_fee: string;
  after_monthly_fee: string;
  after_package: string;
};
function defaultRecycledEndDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 24;
  const day = today.getDate();
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = month % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const target = new Date(targetYear, targetMonth, Math.min(day, lastDay));
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-");
}
function returnToFunnelMonth(endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return "";
  const [year, month, day] = endDate.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 - 6;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
  return date.toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "UTC" });
}
function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function defaultSaleServiceDecision(service: Service): SaleServiceDecision {
  const currentFee = service.current_monthly_fee === null ? "" : String(service.current_monthly_fee);
  const currentPackage = servicePackage(service);
  return {
    decision: "",
    before_monthly_fee: currentFee,
    after_monthly_fee: currentFee,
    after_package: SERVICE_PACKAGE_GROUPS.includes(currentPackage as (typeof SERVICE_PACKAGE_GROUPS)[number]) ? currentPackage : "",
  };
}
function estimateSalePoints(service: Service, decision: SaleServiceDecision) {
  if (!decision.decision) return 0;
  const packageGroup = decision.decision === "renew" ? decision.after_package : servicePackage(service);
  const family = getServicePackageFamily(packageGroup);
  if (family === "other") return 0;
  const before = Number(decision.before_monthly_fee.replace(",", "."));
  const after = decision.decision === "cancel"
    ? 0
    : decision.decision === "keep_active"
      ? before
      : Number(decision.after_monthly_fee.replace(",", "."));
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  const rates = family === "mxo"
    ? { increase: 0.04, reduction: 0.02, maintenance: 0.03 }
    : { increase: 0.033, reduction: 0.018, maintenance: 0.025 };
  if (after > before) return Math.round((after - before) * rates.increase * 100) / 100;
  if (after < before) return Math.round((before - after) * rates.reduction * 100) / 100;
  return Math.round(before * rates.maintenance * 100) / 100;
}

export function DealDetailsDialog({ deal, initialStage, onClose, displayMode = "dialog", backHref = "/pipeline" }: {
  deal: Deal;
  initialStage: string;
  onClose?: () => void;
  displayMode?: "dialog" | "page";
  backHref?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage || deal.stage);
  const [nextContactDate, setNextContactDate] = useState(deal.next_contact_at?.slice(0, 10) ?? "");
  const [lostReason, setLostReason] = useState(deal.lost_reason ?? "");
  const [lastContactAt, setLastContactAt] = useState(deal.last_contact_at);
  const [nextContactAt, setNextContactAt] = useState(deal.next_contact_at);
  const [activities, setActivities] = useState<Activity[]>(deal.activities ?? []);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [lostServiceDecisions, setLostServiceDecisions] = useState<Record<string, LostServiceDecision>>(() =>
    Object.fromEntries(deal.services.map((service) => [service.id, { decision: "", loyalty_end_date: defaultRecycledEndDate() }]))
  );
  const [saleServiceDecisions, setSaleServiceDecisions] = useState<Record<string, SaleServiceDecision>>(() =>
    Object.fromEntries(deal.services.map((service) => [service.id, defaultSaleServiceDecision(service)]))
  );

  const [updateState, updateAction, updatePending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [lostState, lostAction, lostPending] = useActionState(markDealLostAction, {} as FormActionState);
  const [saleState, saleAction, salePending] = useActionState(markDealSaleAction, {} as FormActionState);
  const [contactState, contactAction, contactPending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [noteState, noteAction, notePending] = useActionState(recordDealActivityAction, {} as FormActionState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteDealActivityEntriesAction, {} as FormActionState);
  const [editState, editAction, editPending] = useActionState(editDealActivityEntryAction, {} as FormActionState);
  const isPage = displayMode === "page";
  const returnMonthQuery = deal.eligibility_month ?? "unassigned";
  const dedicatedPageHref = "/pipeline/" + deal.id + "?month=" + encodeURIComponent(returnMonthQuery);

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
    setEditingActivityId(null);
    setEditDescription("");
    setLostServiceDecisions(Object.fromEntries(deal.services.map((service) => [
      service.id,
      { decision: "", loyalty_end_date: defaultRecycledEndDate() },
    ])));
    setSaleServiceDecisions(Object.fromEntries(deal.services.map((service) => [
      service.id,
      defaultSaleServiceDecision(service),
    ])));
  }, [deal.id, deal.stage, deal.last_contact_at, deal.next_contact_at, deal.lost_reason, deal.activities, deal.services, initialStage]);

  useEffect(() => {
    if (!updateState.success) return;
    applySnapshot(updateState.dealSnapshot, updateState.activities);
    router.refresh();
  }, [updateState, router]);

  useEffect(() => {
    if (!lostState.success) return;
    applySnapshot(lostState.dealSnapshot, lostState.activities);
    router.refresh();
  }, [lostState, router]);

  useEffect(() => {
    if (!saleState.success) return;
    applySnapshot(saleState.dealSnapshot, saleState.activities);
    router.refresh();
  }, [saleState, router]);

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
    setEditingActivityId(null);
    router.refresh();
  }, [deleteState, router]);

  useEffect(() => {
    if (!editState.success) return;
    applySnapshot(editState.dealSnapshot, editState.activities);
    setSelectedActivityIds([]);
    setEditingActivityId(null);
    setEditDescription("");
    router.refresh();
  }, [editState, router]);

  useEffect(() => {
    if (isPage || !onClose) return;
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose, isPage]);

  function toggleActivity(id: string) {
    setEditingActivityId(null);
    setSelectedActivityIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 50) return current;
      return [...current, id];
    });
  }

  const allSelected = activities.length > 0 && selectedActivityIds.length === Math.min(activities.length, 50);
  const selectedActivity = selectedActivityIds.length === 1
    ? activities.find((activity) => activity.id === selectedActivityIds[0]) ?? null
    : null;
  const canEditSelected = Boolean(selectedActivity &&
    ["observation", "contact_attempt"].includes(selectedActivity.event_type));

  return (
    <div
      className={isPage
        ? "min-h-screen bg-slate-50 px-4 py-6 sm:px-6"
        : "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"}
      role={isPage ? undefined : "presentation"}
      onMouseDown={isPage ? undefined : (event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <section role={isPage ? undefined : "dialog"} aria-modal={isPage ? undefined : true} aria-labelledby="deal-details-title"
        className={(isPage ? "mx-auto w-full max-w-5xl" : "my-auto w-full max-w-3xl") + " overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Detalhes do negócio</p>
            <h2 id="deal-details-title" className="mt-1 break-words text-xl font-semibold text-slate-900">{deal.client?.full_name ?? "Cliente sem nome"}</h2>
            <p className="mt-1 text-xs text-slate-500">NIF {deal.client?.nif ?? "—"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isPage ? (
              <Link href={backHref} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Voltar ao funil</Link>
            ) : (
              <>
                <Link href={dedicatedPageHref} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">Abrir em página</Link>
                <button type="button" onClick={() => onClose?.()} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button>
              </>
            )}
          </div>
        </header>

        <div className={(isPage ? "space-y-5 p-5 sm:p-6" : "max-h-[calc(100vh-110px)] space-y-5 overflow-y-auto p-5 sm:p-6")}>
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

          <DealServicesInvoices dealId={deal.id} services={deal.services.map((service) => ({
            id: service.id,
            service_number: service.service_number,
            label: servicePackage(service),
            loyalty_end_date: service.loyalty_end_date,
          }))} />

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-700" /><h3 className="text-sm font-semibold text-slate-900">Fase do negócio</h3></div>
            <form action={stage === "lost" && deal.stage !== "lost" ? lostAction : stage === "sale" && deal.stage !== "sale" ? saleAction : updateAction} className="space-y-3">
              <input type="hidden" name="deal_id" value={deal.id} />
              <input type="hidden" name="action" value="update" />
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="service_decisions" value={JSON.stringify(deal.services.map((service) => ({
                service_id: service.id,
                decision: lostServiceDecisions[service.id]?.decision ?? "",
                loyalty_end_date: lostServiceDecisions[service.id]?.decision === "recycle"
                  ? lostServiceDecisions[service.id]?.loyalty_end_date ?? ""
                  : null,
              })))} />
              <input type="hidden" name="sale_decisions" value={JSON.stringify(deal.services.map((service) => {
                const decision = saleServiceDecisions[service.id] ?? defaultSaleServiceDecision(service);
                return {
                  service_id: service.id,
                  decision: decision.decision,
                  before_monthly_fee: decision.before_monthly_fee,
                  after_monthly_fee: decision.decision === "cancel"
                    ? "0"
                    : decision.decision === "keep_active"
                      ? decision.before_monthly_fee
                      : decision.after_monthly_fee,
                  after_package: decision.decision === "renew"
                    ? decision.after_package
                    : decision.decision === "keep_active"
                      ? servicePackage(service)
                      : null,
                };
              }))} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STAGES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={deal.stage === "sale"}
                    aria-pressed={stage === item.value}
                    onClick={() => setStage(item.value)}
                    className={"rounded-lg border px-2.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50 " +
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
              {stage === "lost" && <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                <div>
                  <label htmlFor={"deal_lost_reason_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-700">Motivo da perda *</label>
                  <textarea id={"deal_lost_reason_" + deal.id} name="lost_reason" rows={2} value={lostReason} onChange={(event) => setLostReason(event.target.value)} required maxLength={1000}
                    placeholder="Ex.: cliente recusou, concorrência, sem interesse..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
                </div>
                {deal.stage === "lost" ? (
                  <p className="text-xs text-slate-600">Este negócio já está marcado como perdido. Seleciona outra fase para o reabrir.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">O que queres fazer com cada serviço?</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">A decisão é individual. O cliente fica guardado em qualquer dos casos.</p>
                    </div>
                    {deal.services.length ? deal.services.map((service) => {
                      const choice = lostServiceDecisions[service.id]?.decision ?? "";
                      const endDate = lostServiceDecisions[service.id]?.loyalty_end_date ?? defaultRecycledEndDate();
                      return (
                        <div key={service.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2">
                            <p className="text-sm font-semibold text-slate-800">{servicePackage(service)}</p>
                            <p className="text-xs text-slate-500">N.º {service.service_number}</p>
                          </div>
                          <label htmlFor={"lost_decision_" + service.id} className="mb-1 block text-xs font-medium text-slate-600">Destino deste serviço *</label>
                          <select
                            id={"lost_decision_" + service.id}
                            required
                            value={choice}
                            onChange={(event) => setLostServiceDecisions((current) => ({
                              ...current,
                              [service.id]: {
                                decision: event.target.value as LostServiceDecision["decision"],
                                loyalty_end_date: current[service.id]?.loyalty_end_date || defaultRecycledEndDate(),
                              },
                            }))}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                          >
                            <option value="">Selecionar decisão</option>
                            <option value="recycle">Reciclar — voltar ao funil mais tarde</option>
                            <option value="close">Perder definitivamente este serviço</option>
                          </select>
                          {choice === "recycle" && (
                            <div className="mt-3 rounded-lg bg-blue-50 p-3">
                              <label htmlFor={"lost_date_" + service.id} className="mb-1 block text-xs font-semibold text-blue-900">Nova data de fim de fidelização *</label>
                              <input
                                id={"lost_date_" + service.id}
                                type="date"
                                min={tomorrowIsoDate()}
                                required
                                value={endDate}
                                onChange={(event) => setLostServiceDecisions((current) => ({
                                  ...current,
                                  [service.id]: { decision: "recycle", loyalty_end_date: event.target.value },
                                }))}
                                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600"
                              />
                              <p className="mt-2 text-xs leading-5 text-blue-800">
                                Com esta data, o serviço volta a aparecer nos negócios de renovação em <strong>{returnToFunnelMonth(endDate) || "—"}</strong>, seis meses antes do fim da fidelização.
                              </p>
                            </div>
                          )}
                          {choice === "close" && (
                            <p className="mt-2 text-xs leading-5 text-slate-600">O serviço fica inactivo e deixa de gerar oportunidades. O cliente e o histórico continuam guardados.</p>
                          )}
                        </div>
                      );
                    }) : (
                      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">Este negócio não tem serviços associados. Podes concluir a perda apenas com o motivo.</p>
                    )}
                  </div>
                )}
              </div>}
              {stage !== "lost" && <input type="hidden" name="lost_reason" value="" />}
              {stage === "sale" && deal.stage !== "sale" && <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Registar o resultado de cada serviço</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Escolhe se renovou, se se mantém activo ou se foi cancelado. Preenche a mensalidade actual; para renovações indica também o novo pacote e a nova mensalidade.</p>
                </div>
                {deal.services.length ? deal.services.map((service) => {
                  const choice = saleServiceDecisions[service.id] ?? defaultSaleServiceDecision(service);
                  const points = estimateSalePoints(service, choice);
                  return (
                    <div key={service.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{servicePackage(service)}</p>
                        <p className="text-xs text-slate-500">N.º {service.service_number}</p>
                      </div>
                      <div>
                        <label htmlFor={"sale_decision_" + service.id} className="mb-1 block text-xs font-medium text-slate-600">Resultado deste serviço *</label>
                        <select
                          id={"sale_decision_" + service.id}
                          required
                          value={choice.decision}
                          onChange={(event) => setSaleServiceDecisions((current) => {
                            const previous = current[service.id] ?? defaultSaleServiceDecision(service);
                            const decision = event.target.value as SaleServiceDecision["decision"];
                            return {
                              ...current,
                              [service.id]: {
                                ...previous,
                                decision,
                                after_monthly_fee: decision === "keep_active" ? previous.before_monthly_fee : decision === "cancel" ? "0" : previous.after_monthly_fee,
                                after_package: decision === "keep_active" ? servicePackage(service) : previous.after_package,
                              },
                            };
                          })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        >
                          <option value="">Selecionar resultado</option>
                          <option value="renew">Renovado / pacote alterado</option>
                          <option value="keep_active">Mantido activo, sem alteração</option>
                          <option value="cancel">Cancelado</option>
                        </select>
                      </div>
                      {choice.decision && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor={"sale_before_fee_" + service.id} className="mb-1 block text-xs font-medium text-slate-600">Mensalidade actual (€) *</label>
                            <input
                              id={"sale_before_fee_" + service.id}
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={choice.before_monthly_fee}
                              onChange={(event) => setSaleServiceDecisions((current) => {
                                const previous = current[service.id] ?? defaultSaleServiceDecision(service);
                                return {
                                  ...current,
                                  [service.id]: {
                                    ...previous,
                                    before_monthly_fee: event.target.value,
                                    after_monthly_fee: previous.decision === "keep_active" ? event.target.value : previous.after_monthly_fee,
                                  },
                                };
                              })}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                            />
                          </div>
                          {choice.decision === "renew" && <>
                            <div>
                              <label htmlFor={"sale_after_package_" + service.id} className="mb-1 block text-xs font-medium text-slate-600">Novo pacote *</label>
                              <select
                                id={"sale_after_package_" + service.id}
                                required
                                value={choice.after_package}
                                onChange={(event) => setSaleServiceDecisions((current) => ({
                                  ...current,
                                  [service.id]: { ...(current[service.id] ?? defaultSaleServiceDecision(service)), after_package: event.target.value },
                                }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                              >
                                <option value="">Selecionar pacote</option>
                                {SERVICE_PACKAGE_GROUPS.map((packageName) => <option key={packageName} value={packageName}>{packageName}</option>)}
                                <option value="Outro">Outro (sem pontuação)</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor={"sale_after_fee_" + service.id} className="mb-1 block text-xs font-medium text-slate-600">Nova mensalidade (€) *</label>
                              <input
                                id={"sale_after_fee_" + service.id}
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={choice.after_monthly_fee}
                                onChange={(event) => setSaleServiceDecisions((current) => ({
                                  ...current,
                                  [service.id]: { ...(current[service.id] ?? defaultSaleServiceDecision(service)), after_monthly_fee: event.target.value },
                                }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                              />
                            </div>
                          </>}
                        </div>
                      )}
                      {choice.decision === "keep_active" && <p className="text-xs text-slate-600">O serviço mantém-se activo com a mesma mensalidade e o mesmo pacote.</p>}
                      {choice.decision === "cancel" && <p className="text-xs text-slate-600">O serviço fica inactivo. O cliente e o histórico permanecem no CRM.</p>}
                      {choice.decision && <p className="text-xs font-semibold text-emerald-700">Pontos estimados: {points.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP</p>}
                    </div>
                  );
                }) : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">Este negócio não tem serviços associados. A venda será registada sem pontos de serviço.</p>}
              </div>}
              {stage === "sale" && deal.stage === "sale" && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Venda concluída. Os serviços e os pontos já estão registados.</p>}
              <div>
                <label htmlFor={"deal_update_note_" + deal.id} className="mb-1.5 block text-xs font-semibold text-slate-600">Observação sobre esta alteração (opcional)</label>
                <textarea id={"deal_update_note_" + deal.id} name="description" rows={2} maxLength={5000} placeholder="Contexto ou resultado desta alteração..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
              </div>
              {updateState.error && <p role="alert" className="text-xs text-rose-700">{updateState.error}</p>}
              {updateState.success && <p role="status" className="text-xs text-emerald-700">{updateState.success}</p>}
              {lostState.error && <p role="alert" className="text-xs text-rose-700">{lostState.error}</p>}
              {lostState.success && <p role="status" className="text-xs text-emerald-700">{lostState.success}</p>}
              {saleState.error && <p role="alert" className="text-xs text-rose-700">{saleState.error}</p>}
              {saleState.success && <p role="status" className="text-xs text-emerald-700">{saleState.success}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updatePending || lostPending || salePending || (stage === "lost" && deal.stage === "lost") || (stage === "sale" && deal.stage === "sale")}
                  className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {lostPending ? "A registar perda..." : salePending ? "A registar venda..." : updatePending ? "A guardar..." : stage === "lost" && deal.stage !== "lost" ? "Confirmar negócio perdido" : stage === "sale" && deal.stage !== "sale" ? "Confirmar venda" : "Guardar alterações"}
                </button>
              </div>
            </form>
          </section>

          <div className="grid items-stretch gap-3 sm:grid-cols-2">
            <section className="flex h-full flex-col rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2"><PhoneCall size={16} className="text-blue-700" /><h3 className="text-sm font-semibold text-slate-900">Tentativa de contacto</h3></div>
              <p className="mb-3 min-h-10 text-xs leading-5 text-slate-500">A data e a hora são registadas automaticamente.</p>
              <form action={contactAction} className="mt-auto space-y-2">
                <input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="action" value="contact_attempt" />
                <textarea name="description" rows={2} maxLength={5000} placeholder="Resultado da tentativa (opcional)..." className="min-h-16 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                {contactState.error && <p role="alert" className="text-xs text-rose-700">{contactState.error}</p>}
                {contactState.success && <p role="status" className="text-xs text-emerald-700">{contactState.success}</p>}
                <button type="submit" disabled={contactPending} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60"><PhoneCall size={14} />{contactPending ? "A registar..." : "Registar tentativa"}</button>
              </form>
            </section>

            <section className="flex h-full flex-col rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2"><MessageSquarePlus size={16} className="text-blue-700" /><h3 className="text-sm font-semibold text-slate-900">Adicionar observação</h3></div>
              <p className="mb-3 min-h-10 text-xs leading-5 text-slate-500">Cada observação fica como entrada independente no histórico.</p>
              <form action={noteAction} className="mt-auto space-y-2">
                <input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="action" value="observation" />
                <textarea name="description" rows={2} maxLength={5000} required placeholder="Escreve a observação..." className="min-h-16 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                {noteState.error && <p role="alert" className="text-xs text-rose-700">{noteState.error}</p>}
                {noteState.success && <p role="status" className="text-xs text-emerald-700">{noteState.success}</p>}
                <button type="submit" disabled={notePending} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><MessageSquarePlus size={14} />{notePending ? "A guardar..." : "Adicionar observação"}</button>
              </form>
            </section>
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-semibold text-slate-900">Histórico do negócio</h3><span className="text-xs text-slate-500">{activities.length} registos · clica numa entrada para a selecionar</span></div>
              {activities.length > 0 && <button type="button" onClick={() => setSelectedActivityIds(allSelected ? [] : activities.slice(0, 50).map((activity) => activity.id))} className="text-xs font-semibold text-blue-700 hover:underline">{allSelected ? "Limpar seleção" : activities.length > 50 ? "Selecionar primeiros 50" : "Selecionar todos"}</button>}
            </div>

            {activities.length > 0 && (
              <form action={deleteAction} onSubmit={(event) => {
                if (!window.confirm("Eliminar " + selectedActivityIds.length + " registo(s) do histórico? Esta ação não pode ser desfeita na linha temporal.")) event.preventDefault();
              }} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input type="hidden" name="deal_id" value={deal.id} />
                <input type="hidden" name="activity_ids" value={JSON.stringify(selectedActivityIds)} />
                <p className="text-xs text-slate-600">{selectedActivityIds.length} selecionado(s)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => {
                    if (!selectedActivity) return;
                    setEditingActivityId(selectedActivity.id);
                    setEditDescription(selectedActivity.description ?? "");
                  }} disabled={!canEditSelected || editPending} title={canEditSelected ? "Editar esta entrada" : "Seleciona uma observação ou tentativa de contacto"} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                    <Pencil size={13} />Editar entrada
                  </button>
                  <button type="submit" disabled={deletePending || selectedActivityIds.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 size={13} />{deletePending ? "A eliminar..." : "Eliminar selecionados"}
                  </button>
                </div>
              </form>
            )}
            {deleteState.error && <p role="alert" className="mb-3 text-xs text-rose-700">{deleteState.error}</p>}
            {deleteState.success && <p role="status" className="mb-3 text-xs text-emerald-700">{deleteState.success}</p>}
            {editState.error && <p role="alert" className="mb-3 text-xs text-rose-700">{editState.error}</p>}
            {editState.success && <p role="status" className="mb-3 text-xs text-emerald-700">{editState.success}</p>}

            {activities.length ? <ol className="space-y-2">
              {activities.map((activity) => {
                const selected = selectedActivityIds.includes(activity.id);
                const editingThis = editingActivityId === activity.id;
                return (
                  <li key={activity.id} className="space-y-2">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleActivity(activity.id)}
                      className={"flex w-full items-start gap-2 rounded-xl border p-3 text-left transition " +
                        (selected ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50")}
                    >
                      <span className={"mt-0.5 shrink-0 " + (selected ? "text-blue-700" : "text-slate-300")}>
                        {selected ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">{eventTitle(activity)}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-slate-500"><Clock3 size={12} />{dateTimeLabel(activity.occurred_at)}</span>
                        </span>
                        {eventDescription(activity) && <span className="mt-1.5 block whitespace-pre-wrap text-sm leading-5 text-slate-600">{eventDescription(activity)}</span>}
                      </span>
                    </button>
                    {editingThis && (
                      <form action={editAction} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                        <input type="hidden" name="deal_id" value={deal.id} />
                        <input type="hidden" name="activity_id" value={activity.id} />
                        <label htmlFor={"edit_activity_" + activity.id} className="block text-xs font-semibold text-slate-700">Editar texto da entrada</label>
                        <textarea id={"edit_activity_" + activity.id} name="description" rows={3} maxLength={5000} required value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600" />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingActivityId(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                          <button type="submit" disabled={editPending} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"><Save size={13} />{editPending ? "A guardar..." : "Guardar edição"}</button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Ainda não existem atividades registadas neste negócio.</p>}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">Criado em {dateTimeLabel(deal.created_at)}</p>
            {isPage ? (
              <Link href={backHref} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Voltar ao funil</Link>
            ) : (
              <button type="button" onClick={() => onClose?.()} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fechar</button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
