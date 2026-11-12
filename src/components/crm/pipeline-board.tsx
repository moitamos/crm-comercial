"use client";

import { useCallback, useMemo, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  GripVertical,
  PencilLine,
  Users,
} from "lucide-react";
import { getServicePackageLabel } from "@/lib/crm/packages";
import { DealDetailsDialog } from "@/components/crm/deal-details-dialog";
import { PipelineMonthMove } from "@/components/crm/pipeline-month-move";

export type PipelineActivity = {
  id: string;
  deal_id: string;
  commercial_id: string;
  event_type: string;
  description: string | null;
  event_data: Record<string, unknown> | null;
  occurred_at: string;
};

export type PipelineDeal = {
  id: string;
  client_id: string;
  commercial_id: string | null;
  deal_type: string;
  stage: string;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  eligibility_month: string | null;
  client: { id: string; full_name: string; nif: string; phone: string | null; email: string | null; phone_numbers: string[]; emails: string[] } | null;
  services: { id: string; service_number: string; service_type: string; package_name: string | null; loyalty_end_date: string | null; source_data: unknown }[];
  activities: PipelineActivity[];
};

const STAGES = [
  { value: "to_contact", label: "Por contactar", dot: "bg-slate-400", line: "border-t-slate-400" },
  { value: "negotiation", label: "Em negociação", dot: "bg-violet-500", line: "border-t-violet-500" },
  { value: "scheduled", label: "Agendado", dot: "bg-amber-500", line: "border-t-amber-500" },
  { value: "future_contact", label: "Contactar futuramente", dot: "bg-sky-500", line: "border-t-sky-500" },
  { value: "sale", label: "Venda", dot: "bg-emerald-500", line: "border-t-emerald-500" },
  { value: "lost", label: "Perdido", dot: "bg-rose-500", line: "border-t-rose-500" },
] as const;

const DEAL_TYPES = [
  { value: "portfolio_renewal", label: "Renovação de carteira" },
  { value: "new_sale", label: "Nova venda" },
  { value: "package_change", label: "Alteração de pacote" },
];

function dealTypeLabel(value: string) {
  return DEAL_TYPES.find((item) => item.value === value)?.label ?? value;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const normalized = value.length === 10 ? value + "T12:00:00Z" : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Lisbon" });
}

function isOverdue(deal: PipelineDeal) {
  if (!deal.next_contact_at || ["sale", "lost"].includes(deal.stage)) return false;
  return new Date(deal.next_contact_at).getTime() < Date.now();
}

export function PipelineBoard({ deals }: { deals: PipelineDeal[] }) {
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ deal: PipelineDeal; targetStage: string } | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);

  const groupedDeals = useMemo(() => {
    const grouped: Record<string, PipelineDeal[]> = {};
    for (const stage of STAGES) grouped[stage.value] = [];
    for (const deal of deals) {
      (grouped[deal.stage] ?? grouped.to_contact).push(deal);
    }
    return grouped;
  }, [deals]);

  function startDrag(event: DragEvent<HTMLElement>, deal: PipelineDeal) {
    setDraggedDealId(deal.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", deal.id);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetStage: string) {
    event.preventDefault();
    const dealId = event.dataTransfer.getData("text/plain") || draggedDealId;
    setDropStage(null);
    setDraggedDealId(null);
    if (!dealId) return;

    const deal = deals.find((item) => item.id === dealId);
    if (!deal || deal.stage === targetStage) return;
    setEditing({ deal, targetStage });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <GripVertical size={16} className="text-slate-400" />
          <span>Arrasta os cartões entre fases para atualizar o negócio.</span>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tabular-nums text-slate-600">
          {deals.length.toLocaleString("pt-PT")} {deals.length === 1 ? "negócio" : "negócios"}
        </span>
      </div>

      <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[1536px] grid-cols-6 items-start gap-3">
          {STAGES.map((stage) => {
            const items = groupedDeals[stage.value] ?? [];
            const activeDrop = dropStage === stage.value;
            return (
              <div
                key={stage.value}
                role="region"
                aria-label={stage.label}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropStage(stage.value);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) setDropStage(null);
                }}
                onDrop={(event) => handleDrop(event, stage.value)}
                className={
                  "min-h-[480px] rounded-2xl border border-slate-200 border-t-4 bg-slate-100/75 p-2.5 transition " +
                  stage.line +
                  (activeDrop ? " bg-blue-50 ring-2 ring-blue-300 ring-inset" : "")
                }
              >
                <header className="mb-2.5 flex items-center justify-between gap-2 px-1 py-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + stage.dot} />
                    <h2 className="truncate text-[13px] font-bold text-slate-800">{stage.label}</h2>
                  </div>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">
                    {items.length}
                  </span>
                </header>

                <div className="space-y-2.5">
                  {items.map((deal) => {
                    const overdue = isOverdue(deal);
                    const serviceLabels = deal.services.map((service) =>
                      getServicePackageLabel(service) || service.package_name || service.service_type
                    );
                    const nearestLoyaltyEnd = deal.services
                      .map((service) => service.loyalty_end_date)
                      .filter((date): date is string => Boolean(date))
                      .sort()[0] ?? null;
                    return (
                      <article
                        key={deal.id}
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-label={"Abrir negócio de " + (deal.client?.full_name ?? "cliente sem nome")}
                        onClick={(event) => {
                          const target = event.target as HTMLElement;
                          if (target.closest("a,button,input,select,textarea")) return;
                          setEditing({ deal, targetStage: deal.stage });
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setEditing({ deal, targetStage: deal.stage });
                          }
                        }}
                        onDragStart={(event) => startDrag(event, deal)}
                        onDragEnd={() => {
                          setDraggedDealId(null);
                          setDropStage(null);
                        }}
                        className={
                          "group rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md active:cursor-grabbing " +
                          (draggedDealId === deal.id ? "opacity-45 ring-2 ring-blue-300" : "cursor-grab")
                        }
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical size={15} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => setEditing({ deal, targetStage: deal.stage })}
                              className="block w-full text-left"
                              aria-label={"Abrir negócio de " + (deal.client?.full_name ?? "cliente sem nome")}
                            >
                              <h3 className="break-words text-[13px] font-semibold leading-5 text-blue-800 hover:underline">
                                {deal.client?.full_name ?? "Cliente sem nome"}
                              </h3>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                NIF {deal.client?.nif ?? "—"}
                              </p>
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                            {dealTypeLabel(deal.deal_type)}
                          </span>
                          {nearestLoyaltyEnd && (
                            <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                              Fidelização até {dateLabel(nearestLoyaltyEnd)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {deal.services.slice(0, 3).map((service, index) => (
                            <span key={service.id} className="max-w-full truncate rounded-md border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600">
                              {serviceLabels[index]} · {service.service_number}
                              {service.loyalty_end_date ? " · Fidelização até " + dateLabel(service.loyalty_end_date) : ""}
                            </span>
                          ))}
                          {deal.services.length > 3 && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] text-slate-500">
                              +{deal.services.length - 3} serviços
                            </span>
                          )}
                          {deal.services.length === 0 && (
                            <span className="text-[10px] text-slate-400">Sem serviços associados</span>
                          )}
                        </div>

                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                          {deal.next_contact_at && (
                            <p className={overdue ? "font-semibold text-rose-700" : ""}>
                              <CalendarClock size={12} className="mr-1 inline" />
                              Próximo contacto: {dateLabel(deal.next_contact_at)}
                              {overdue ? " · Em atraso" : ""}
                            </p>
                          )}
                          {deal.lost_reason && <p className="line-clamp-2 text-rose-700">Motivo: {deal.lost_reason}</p>}
                          {deal.notes && <p className="line-clamp-2 whitespace-pre-wrap leading-4">{deal.notes}</p>}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Link
                            href={"/clients/" + deal.client_id}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            <Users size={12} /> Ficha
                          </Link>
                          <button
                            type="button"
                            onClick={() => setEditing({ deal, targetStage: deal.stage })}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                          >
                            <PencilLine size={12} /> Abrir negócio
                          </button>
                        </div>
                        <PipelineMonthMove
                          dealId={deal.id}
                          currentMonth={deal.eligibility_month}
                        />
                      </article>
                    );
                  })}

                  {items.length === 0 && (
                    <div className={"flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed px-3 text-center " +
                      (activeDrop ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-400")}>
                      {activeDrop ? <CheckCircle2 size={18} /> : <BriefcaseBusiness size={18} />}
                      <p className="mt-2 text-[11px] font-medium">
                        {activeDrop ? "Larga aqui o negócio" : "Sem negócios nesta fase"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <DealDetailsDialog
          key={editing.deal.id + ":" + editing.targetStage}
          deal={editing.deal}
          initialStage={editing.targetStage}
          onClose={closeEditor}
        />
      )}
    </section>
  );
}
