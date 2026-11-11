import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "A sessão expirou. Volta a iniciar sessão." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active) {
    return NextResponse.json({ error: "A conta não está ativa." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Identificador de cliente inválido." }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, full_name, nif, nic, ncc, phone, email, address, notes, created_at")
    .eq("id", id)
    .maybeSingle();

  if (clientError || !client) {
    return NextResponse.json({ error: "Não foi possível encontrar este cliente na tua carteira." }, { status: 404 });
  }

  const [servicesResult, detailsResult, administratorsResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, service_number, service_type, package_name, current_monthly_fee, loyalty_end_date, loyalty_conclusion_date, is_active, source_data")
      .eq("client_id", id)
      .order("service_type", { ascending: true })
      .order("service_number", { ascending: true }),
    supabase
      .from("client_import_details")
      .select("source_system, source_data, updated_at")
      .eq("client_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("client_administrators")
      .select("id, full_name, phone_numbers, email, marketing_permission, observations, source_data")
      .eq("client_id", id)
      .order("full_name", { ascending: true }),
  ]);

  const queryError = servicesResult.error || detailsResult.error || administratorsResult.error;
  if (queryError) {
    console.error("[CRM_CLIENT_DETAILS]", { clientId: id, message: queryError.message });
    return NextResponse.json({ error: "Não foi possível carregar todos os detalhes do cliente." }, { status: 500 });
  }

  return NextResponse.json({
    client,
    services: servicesResult.data ?? [],
    importDetails: detailsResult.data ?? [],
    administrators: administratorsResult.data ?? [],
  });
}
