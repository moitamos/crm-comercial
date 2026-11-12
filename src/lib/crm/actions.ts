"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DealActivityStateItem, DealSnapshotState, FormActionState } from "@/lib/crm/types";

function isValidPhone(value: string | null) { return !value || /^\+?[0-9]+$/.test(value); }
function isValidEmail(value: string | null) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

async function getActiveUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) return { supabase, userId: null, error: "A sessão expirou. Volta a iniciar sessão." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return { supabase, userId: null, error: "A conta não está ativa ou não tem permissões." };
  }

  return { supabase, userId, error: null };
}

type ManualServiceInput = {
  service_number: string;
  service_type: "meo" | "mobile" | "gcp" | "other";
  package_name: string | null;
  current_monthly_fee: string | null;
  loyalty_conclusion_date: string | null;
  loyalty_end_date: string | null;
};

function validIsoDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addMonths(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export async function createClientAction(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const nif = String(formData.get("nif") ?? "").replace(/\D/g, "");
  const nic = String(formData.get("nic") ?? "").trim() || null;
  const ncc = String(formData.get("ncc") ?? "").trim() || null;
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? rawPhone.replace(/[\s().-]/g, "") : null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const portfolioId = String(formData.get("portfolio_id") ?? "").trim();

  if (!fullName || fullName.length > 200) return { error: "Indica o nome do cliente (máximo 200 caracteres)." };
  if (!/^\d{9}$/.test(nif)) return { error: "O NIF tem de conter exatamente 9 algarismos." };
  if (!portfolioId) return { error: "Seleciona uma carteira." };
  if (phone && !isValidPhone(phone)) return { error: "O telefone deve conter apenas algarismos e, opcionalmente, o prefixo +." };
  if (!isValidEmail(email)) return { error: "Indica um email válido." };

  let rawServices: unknown;
  try {
    rawServices = JSON.parse(String(formData.get("services_json") ?? "[]"));
  } catch {
    return { error: "Não foi possível ler os serviços preenchidos. Revê os dados e tenta novamente." };
  }
  if (!Array.isArray(rawServices) || rawServices.length > 50) {
    return { error: "A lista de serviços é inválida ou ultrapassa o limite de 50 serviços." };
  }

  const services: ManualServiceInput[] = [];
  const seenNumbers = new Set<string>();
  for (const raw of rawServices) {
    if (!raw || typeof raw !== "object") return { error: "Um dos serviços preenchidos não é válido." };
    const item = raw as Record<string, unknown>;
    const serviceNumber = String(item.service_number ?? "").trim();
    const serviceType = String(item.service_type ?? "meo");
    const packageName = String(item.package_name ?? "").trim() || null;
    const feeRaw = String(item.current_monthly_fee ?? "").trim();
    const conclusionDate = String(item.loyalty_conclusion_date ?? "").trim();
    const endDate = String(item.loyalty_end_date ?? "").trim();

    const hasDetails = Boolean(serviceNumber || packageName || feeRaw || conclusionDate || endDate);
    if (!hasDetails) continue;
    if (!serviceNumber || serviceNumber.length > 100) {
      return { error: "Cada serviço preenchido tem de ter um número de serviço ou cartão (máximo 100 caracteres)." };
    }
    if (!["meo", "mobile", "gcp", "other"].includes(serviceType)) {
      return { error: "Seleciona um tipo válido para cada serviço." };
    }
    const normalizedNumber = serviceNumber.toLocaleLowerCase("pt-PT");
    if (seenNumbers.has(normalizedNumber)) {
      return { error: "O número de serviço/cartão " + serviceNumber + " está repetido. Cada serviço deve ter um número único." };
    }
    seenNumbers.add(normalizedNumber);
    if (packageName && packageName.length > 120) return { error: "O tarifário/oferta não pode ultrapassar 120 caracteres." };
    if (feeRaw && (!/^\d+(?:[.,]\d{1,2})?$/.test(feeRaw) || Number(feeRaw.replace(",", ".")) < 0)) {
      return { error: "Indica uma mensalidade válida e não negativa para o serviço " + serviceNumber + "." };
    }
    if (!validIsoDate(conclusionDate) || !validIsoDate(endDate)) {
      return { error: "Uma das datas de fidelização do serviço " + serviceNumber + " é inválida." };
    }

    services.push({
      service_number: serviceNumber,
      service_type: serviceType as ManualServiceInput["service_type"],
      package_name: packageName,
      current_monthly_fee: feeRaw ? feeRaw.replace(",", ".") : null,
      loyalty_conclusion_date: conclusionDate || null,
      loyalty_end_date: conclusionDate ? addMonths(conclusionDate, 24) : endDate || null,
    });
  }

  const { data: clientId, error } = await context.supabase.rpc("create_client_with_services", {
    p_client: {
      full_name: fullName,
      nif,
      nic,
      ncc,
      phone,
      email,
      address,
      notes,
      portfolio_id: portfolioId,
    },
    p_services: services,
  });

  if (error || !clientId) {
    if (error?.code === "23505") return { error: "Já existe um cliente com este NIF. Pesquisa-o na carteira antes de criar outro." };
    if (error?.code === "23503") return { error: "A carteira ou o utilizador deixou de estar associado. Atualiza a página e tenta novamente." };
    const message = error?.message ?? "";
    if (message.includes("acesso à carteira")) return { error: "Não tens acesso à carteira selecionada. Pede ao administrador para te associar." };
    if (message.includes("número de serviço") || message.includes("mensalidade") || message.includes("Tipo de serviço")) return { error: message };
    console.error("[CRM_CREATE_CLIENT]", { code: error?.code, message });
    return { error: "Não foi possível criar o cliente e os serviços. Confirma os dados e tenta novamente." };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  redirect("/clients/" + clientId + "?created=1");
}

export async function updateClientAction(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const clientId = String(formData.get("client_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const nic = String(formData.get("nic") ?? "").trim() || null;
  const ncc = String(formData.get("ncc") ?? "").trim() || null;
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? rawPhone.replace(/[\\s().-]/g, "") : null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!clientId) return { error: "Cliente inválido." };
  if (!fullName || fullName.length > 200) return { error: "Indica o nome do cliente (máximo 200 caracteres)." };
  if ((nic && nic.length > 80) || (ncc && ncc.length > 80)) return { error: "O NIC e o NCC não podem ultrapassar 80 caracteres." };
  if (phone && !isValidPhone(phone)) return { error: "O telefone deve conter apenas algarismos e, opcionalmente, o prefixo +." };
  if (!isValidEmail(email)) return { error: "Indica um email válido." };

  const { error } = await context.supabase
    .from("clients")
    .update({ full_name: fullName, nic, ncc, phone, email, address, notes, updated_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) return { error: "Não foi possível guardar as alterações. Confirma se o cliente pertence à tua carteira." };

  revalidatePath("/clients");
  revalidatePath("/clients/" + clientId);
  return { success: "Dados do cliente atualizados." };
}


const DEAL_STAGES = ["to_contact", "negotiation", "scheduled", "future_contact", "sale", "lost"] as const;

function toNextContactTimestamp(value: string) {
  return value ? new Date(value + "T12:00:00.000Z").toISOString() : null;
}

function dealActivityError(message: string) {
  if (message.includes("Não tens acesso") || message.includes("Negócio não encontrado")) {
    return "Não tens acesso a este negócio ou ele já não existe.";
  }
  if (message.includes("Seleciona uma fase válida")) return "Seleciona uma fase válida do funil.";
  if (message.includes("voltar a contactar")) return "Indica a data em que devemos voltar a contactar o cliente.";
  if (message.includes("motivo")) return "Indica o motivo pelo qual o negócio foi perdido.";
  if (message.includes("observação") || message.includes("observacao")) return "Escreve a observação antes de guardar.";
  if (message.includes("1 e 50")) return "Seleciona entre 1 e 50 registos do histórico.";
  if (message.includes("já não existem")) return "Um ou mais registos já foram eliminados ou não pertencem a este negócio.";
  if (message.includes("5.000")) return "O texto não pode ultrapassar 5.000 caracteres.";
  if (message.includes("não pode ficar vazia")) return "A observação não pode ficar vazia.";
  if (message.includes("Só podes editar")) return "Só podes editar observações e tentativas de contacto.";
  if (message.includes("já não existe") || message.includes("não pertence a este negócio")) return "Esta entrada já não existe ou não pertence a este negócio.";
  if (message.includes("destino de cada serviço") || message.includes("individualmente")) return "Tens de escolher o destino de todos os serviços associados.";
  if (message.includes("fidelização") || message.includes("data de fim")) return "Indica uma data de fidelização futura para cada serviço que vais reciclar.";
  if (message.includes("já está marcado como perdido")) return "Este negócio já está marcado como perdido.";
  return "Não foi possível registar a atividade. Atualiza a página e tenta novamente.";
}

async function loadDealActivitySnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string
): Promise<{ activities?: DealActivityStateItem[]; dealSnapshot?: DealSnapshotState }> {
  const [activitiesResult, dealResult] = await Promise.all([
    supabase.from("interactions")
      .select("id, deal_id, commercial_id, event_type, description, event_data, occurred_at")
      .eq("deal_id", dealId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("deals")
      .select("stage, last_contact_at, next_contact_at, lost_reason")
      .eq("id", dealId)
      .maybeSingle(),
  ]);
  if (activitiesResult.error) {
    console.error("[CRM_LOAD_DEAL_ACTIVITIES]", activitiesResult.error.message);
  }
  if (dealResult.error) {
    console.error("[CRM_LOAD_DEAL_SNAPSHOT]", dealResult.error.message);
  }
  return {
    activities: activitiesResult.error ? undefined : (activitiesResult.data ?? []) as DealActivityStateItem[],
    dealSnapshot: dealResult.error || !dealResult.data
      ? undefined
      : dealResult.data as DealSnapshotState,
  };
}

export async function recordDealActivityAction(
  _previous: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const dealId = String(formData.get("deal_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const nextContactDate = String(formData.get("next_contact_date") ?? "").trim();
  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId)) {
    return { error: "Negócio inválido." };
  }
  if (!["update", "observation", "contact_attempt"].includes(action)) {
    return { error: "Seleciona uma ação válida." };
  }
  if (description.length > 5000) return { error: "O texto não pode ultrapassar 5.000 caracteres." };

  if (action === "update") {
    if (!DEAL_STAGES.includes(stage as (typeof DEAL_STAGES)[number])) {
      return { error: "Seleciona uma fase válida do funil." };
    }
    if (stage === "lost") {
      return { error: "Para marcar como perdido, indica o destino de cada serviço associado." };
    }
    if (["scheduled", "future_contact"].includes(stage) &&
      (!nextContactDate || !validIsoDate(nextContactDate))) {
      return { error: "Indica a data em que devemos voltar a contactar o cliente." };
    }
    if (stage === "lost" && !lostReason) return { error: "Indica o motivo pelo qual o negócio foi perdido." };
    if (lostReason.length > 1000) return { error: "O motivo de perda não pode ultrapassar 1.000 caracteres." };
  }

  if (action === "observation" && !description) {
    return { error: "Escreve a observação antes de guardar." };
  }

  const { error } = await context.supabase.rpc("record_deal_activity", {
    p_deal_id: dealId,
    p_action: action,
    p_stage: action === "update" ? stage : null,
    p_next_contact_at: action === "update" ? toNextContactTimestamp(nextContactDate) : null,
    p_lost_reason: action === "update" ? lostReason || null : null,
    p_description: description || null,
  });

  if (error) {
    console.error("[CRM_RECORD_DEAL_ACTIVITY]", { code: error.code, message: error.message });
    return { error: dealActivityError(error.message ?? "") };
  }

  const snapshot = await loadDealActivitySnapshot(context.supabase, dealId);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/" + dealId);
  revalidatePath("/dashboard");

  if (action === "observation") return { success: "Observação registada com data e hora.", ...snapshot };
  if (action === "contact_attempt") return { success: "Tentativa de contacto registada.", ...snapshot };
  return { success: "Negócio atualizado e alteração registada.", ...snapshot };
}

export async function markDealLostAction(
  _previous: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const dealId = String(formData.get("deal_id") ?? "").trim();
  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  let serviceDecisions: unknown;

  try {
    serviceDecisions = JSON.parse(String(formData.get("service_decisions") ?? "[]"));
  } catch {
    return { error: "As decisões dos serviços são inválidas." };
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(dealId)) return { error: "Negócio inválido." };
  if (!lostReason) return { error: "Indica o motivo pelo qual o negócio foi perdido." };
  if (lostReason.length > 1000) return { error: "O motivo de perda não pode ultrapassar 1.000 caracteres." };
  if (description.length > 5000) return { error: "O texto não pode ultrapassar 5.000 caracteres." };

  if (!Array.isArray(serviceDecisions) || serviceDecisions.length > 50) {
    return { error: "A lista de decisões dos serviços é inválida." };
  }

  const seen = new Set<string>();
  for (const raw of serviceDecisions) {
    if (!raw || typeof raw !== "object") return { error: "Uma das decisões dos serviços é inválida." };
    const item = raw as Record<string, unknown>;
    const serviceId = String(item.service_id ?? "");
    const decision = String(item.decision ?? "");
    const date = String(item.loyalty_end_date ?? "");
    if (!uuidPattern.test(serviceId) || seen.has(serviceId)) {
      return { error: "Cada serviço deve ter uma decisão individual válida." };
    }
    seen.add(serviceId);
    if (!["recycle", "close"].includes(decision)) {
      return { error: "Escolhe entre reciclar ou encerrar cada serviço." };
    }
    if (decision === "recycle" && (!validIsoDate(date) || !date || date <= new Date().toISOString().slice(0, 10))) {
      return { error: "Indica uma data de fidelização futura para cada serviço que vais reciclar." };
    }
  }

  const { error } = await context.supabase.rpc("mark_deal_lost_with_service_decisions", {
    p_deal_id: dealId,
    p_lost_reason: lostReason,
    p_service_decisions: serviceDecisions,
    p_description: description || null,
  });

  if (error) {
    console.error("[CRM_MARK_DEAL_LOST]", { code: error.code, message: error.message });
    return { error: dealActivityError(error.message ?? "") };
  }

  const snapshot = await loadDealActivitySnapshot(context.supabase, dealId);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/" + dealId);
  revalidatePath("/dashboard");
  return { success: "Negócio marcado como perdido. As decisões dos serviços foram guardadas.", ...snapshot };
}

export async function deleteDealActivityEntriesAction(
  _previous: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const dealId = String(formData.get("deal_id") ?? "").trim();
  let activityIds: unknown;
  try {
    activityIds = JSON.parse(String(formData.get("activity_ids") ?? "[]"));
  } catch {
    return { error: "A seleção do histórico é inválida." };
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(dealId)) return { error: "Negócio inválido." };
  if (!Array.isArray(activityIds) || activityIds.length < 1 || activityIds.length > 50 ||
      !activityIds.every((id) => typeof id === "string" && uuidPattern.test(id)) ||
      new Set(activityIds).size !== activityIds.length) {
    return { error: "Seleciona entre 1 e 50 registos válidos do histórico." };
  }

  const { data, error } = await context.supabase.rpc("delete_deal_activity_entries", {
    p_deal_id: dealId,
    p_activity_ids: activityIds,
  });
  if (error) {
    console.error("[CRM_DELETE_DEAL_ACTIVITY_ENTRIES]", { code: error.code, message: error.message });
    return { error: dealActivityError(error.message ?? "") };
  }

  const snapshot = await loadDealActivitySnapshot(context.supabase, dealId);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/" + dealId);
  revalidatePath("/dashboard");

  const deleted = typeof data === "number" ? data : Number(data ?? activityIds.length);
  return {
    success: deleted === 1 ? "1 registo eliminado do histórico." : deleted + " registos eliminados do histórico.",
    removedActivityIds: activityIds as string[],
    ...snapshot,
  };
}

export async function editDealActivityEntryAction(
  _previous: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const dealId = String(formData.get("deal_id") ?? "").trim();
  const activityId = String(formData.get("activity_id") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(dealId) || !uuidPattern.test(activityId)) {
    return { error: "Negócio ou registo do histórico inválido." };
  }
  if (!description) return { error: "A observação não pode ficar vazia." };
  if (description.length > 5000) return { error: "O texto não pode ultrapassar 5.000 caracteres." };

  const { error } = await context.supabase.rpc("edit_deal_activity_entry", {
    p_deal_id: dealId,
    p_activity_id: activityId,
    p_description: description,
  });

  if (error) {
    console.error("[CRM_EDIT_DEAL_ACTIVITY_ENTRY]", { code: error.code, message: error.message });
    return { error: dealActivityError(error.message ?? "") };
  }

  const snapshot = await loadDealActivitySnapshot(context.supabase, dealId);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/" + dealId);
  revalidatePath("/dashboard");
  return { success: "Entrada do histórico atualizada.", ...snapshot };
}

// Keep the previous form action compatible with the new timestamped activity log.
export async function updateDealAction(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const dealId = String(formData.get("deal_id") ?? "").trim();
  const stage = String(formData.get("stage") ?? "");
  const nextContactDate = String(formData.get("next_contact_date") ?? "").trim();
  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const registerContact = formData.get("register_contact") === "on";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId)) {
    return { error: "Negócio inválido." };
  }
  if (!DEAL_STAGES.includes(stage as (typeof DEAL_STAGES)[number])) {
    return { error: "Seleciona uma fase válida do funil." };
  }
  if (["scheduled", "future_contact"].includes(stage) &&
    (!nextContactDate || !validIsoDate(nextContactDate))) {
    return { error: "Indica a data em que devemos voltar a contactar o cliente." };
  }
  if (stage === "lost" && !lostReason) return { error: "Indica o motivo pelo qual o negócio foi perdido." };

  const { error } = await context.supabase.rpc("record_deal_activity", {
    p_deal_id: dealId,
    p_action: "update",
    p_stage: stage,
    p_next_contact_at: toNextContactTimestamp(nextContactDate),
    p_lost_reason: lostReason || null,
    p_description: notes || null,
  });
  if (error) return { error: dealActivityError(error.message ?? "") };

  if (registerContact) {
    const contactResult = await context.supabase.rpc("record_deal_activity", {
      p_deal_id: dealId,
      p_action: "contact_attempt",
      p_stage: null,
      p_next_contact_at: null,
      p_lost_reason: null,
      p_description: "Contacto registado através do formulário de atualização.",
    });
    if (contactResult.error) return { error: dealActivityError(contactResult.error.message ?? "") };
  }

  revalidatePath("/pipeline");
  revalidatePath("/pipeline/" + dealId);
  revalidatePath("/dashboard");
  return { success: "Negócio atualizado." };
}

function validMonthStart(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function createMonthlyRenewalDealsAction(
  _previous: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const month = String(formData.get("eligibility_month") ?? "").trim();
  if (!validMonthStart(month)) return { error: "Seleciona um mês válido." };

  const { data, error } = await context.supabase.rpc("create_renewal_deals_for_month", {
    p_month: month,
  });

  if (error) {
    console.error("[CRM_CREATE_MONTHLY_RENEWAL_DEALS]", { code: error.code, message: error.message });
    return { error: "Não foi possível criar os negócios deste mês. Atualiza a página e tenta novamente." };
  }

  const created = typeof data === "number" ? data : Number(data ?? 0);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");

  if (created === 0) {
    return { success: "Não havia novos negócios por criar neste mês." };
  }
  return { success: created + (created === 1 ? " negócio criado." : " negócios criados.") };
}

export async function moveDealToMonthAction(
  _previous: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const context = await getActiveUser();
  if (!context.userId) return { error: context.error ?? "Sessão inválida." };

  const dealId = String(formData.get("deal_id") ?? "").trim();
  const targetMonthRaw = String(formData.get("target_month") ?? "").trim();
  const targetMonth = targetMonthRaw === "unassigned" ? null : targetMonthRaw;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId)) {
    return { error: "Negócio inválido." };
  }
  if (targetMonth && !validMonthStart(targetMonth)) {
    return { error: "Seleciona um mês válido." };
  }

  const { error } = await context.supabase.rpc("move_renewal_deal_to_month", {
    p_deal_id: dealId,
    p_month: targetMonth,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("já tem um negócio de renovação")) {
      return { error: "Este cliente já tem um negócio de renovação nesse mês." };
    }
    if (message.includes("Só podes mover negócios")) return { error: message };
    console.error("[CRM_MOVE_DEAL_MONTH]", { code: error.code, message });
    return { error: "Não foi possível mudar o mês do negócio. Confirma se pertence à tua carteira." };
  }

  revalidatePath("/pipeline");
  revalidatePath("/pipeline/" + dealId);
  revalidatePath("/dashboard");
  return { success: targetMonth ? "Negócio transferido para o novo mês." : "Negócio retirado da organização mensal." };
}
