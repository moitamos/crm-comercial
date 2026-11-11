"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/lib/crm/types";

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
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
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
  const nif = String(formData.get("nif") ?? "").replace(/\\D/g, "");
  const nic = String(formData.get("nic") ?? "").trim() || null;
  const ncc = String(formData.get("ncc") ?? "").trim() || null;
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? rawPhone.replace(/[\\s().-]/g, "") : null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const portfolioId = String(formData.get("portfolio_id") ?? "").trim();

  if (!fullName || fullName.length > 200) return { error: "Indica o nome do cliente (máximo 200 caracteres)." };
  if (!/^\\d{9}$/.test(nif)) return { error: "O NIF tem de conter exatamente 9 algarismos." };
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
    if (feeRaw && (!/^\\d+(?:[.,]\\d{1,2})?$/.test(feeRaw) || Number(feeRaw.replace(",", ".")) < 0)) {
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
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? rawPhone.replace(/[\\s().-]/g, "") : null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!clientId) return { error: "Cliente inválido." };
  if (!fullName || fullName.length > 200) return { error: "Indica o nome do cliente (máximo 200 caracteres)." };
  if (phone && !isValidPhone(phone)) return { error: "O telefone deve conter apenas algarismos e, opcionalmente, o prefixo +." };
  if (!isValidEmail(email)) return { error: "Indica um email válido." };

  const { error } = await context.supabase
    .from("clients")
    .update({ full_name: fullName, phone, email, address, notes, updated_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) return { error: "Não foi possível guardar as alterações. Confirma se o cliente pertence à tua carteira." };

  revalidatePath("/clients");
  revalidatePath("/clients/" + clientId);
  return { success: "Dados do cliente atualizados." };
}
