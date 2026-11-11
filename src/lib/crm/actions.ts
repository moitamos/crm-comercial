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

  const { data: membership, error: membershipError } = await context.supabase
    .from("portfolio_members")
    .select("portfolio_id")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (membershipError || !membership) return { error: "Não tens acesso à carteira selecionada. Pede ao administrador para te associar." };

  const { data, error } = await context.supabase
    .from("clients")
    .insert({
      full_name: fullName,
      nif,
      nic,
      ncc,
      phone,
      email,
      address,
      notes,
      portfolio_id: portfolioId,
      commercial_id: context.userId,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Já existe um cliente com este NIF. Pesquisa-o na carteira antes de criar outro." };
    if (error.code === "23503") return { error: "A carteira deixou de estar associada à tua conta. Atualiza a página e tenta novamente." };
    return { error: "Não foi possível criar o cliente. Confirma os dados e tenta novamente." };
  }

  revalidatePath("/clients");
  redirect("/clients/" + data.id + "?created=1");
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
