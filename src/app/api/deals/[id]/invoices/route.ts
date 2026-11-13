import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Negócio inválido." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("is_active").eq("id", userId).maybeSingle();
  if (!profile?.is_active) return NextResponse.json({ error: "Conta inativa." }, { status: 403 });

  // All reads use the logged-in user's Supabase client; RLS remains authoritative.
  const { data: deal, error: dealError } = await supabase.from("deals")
    .select("id, client_id").eq("id", id).maybeSingle();
  if (dealError) return NextResponse.json({ error: "Erro ao consultar o negócio." }, { status: 500 });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const { data: links, error: linksError } = await supabase.from("deal_services")
    .select("service_id").eq("deal_id", deal.id);
  if (linksError) return NextResponse.json({ error: "Erro ao consultar os serviços." }, { status: 500 });

  const serviceIds = Array.from(new Set((links ?? []).map((link) => link.service_id)));
  if (!serviceIds.length) {
    return NextResponse.json({ invoices: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data: invoices, error } = await supabase.from("client_invoices")
    .select("id, service_id, document_number, issued_at, created_at")
    .eq("client_id", deal.client_id).in("service_id", serviceIds)
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.error("[CRM_DEAL_INVOICES]", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: "Não foi possível consultar as faturas. Verifica a migração." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ invoices: invoices ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
