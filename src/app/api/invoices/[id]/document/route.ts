import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Fatura inválida." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("is_active").eq("id", userId).maybeSingle();
  if (!profile?.is_active) return NextResponse.json({ error: "Conta inativa." }, { status: 403 });

  // RLS checks that the invoice belongs to a client this user may access.
  const { data: invoice, error } = await supabase.from("client_invoices")
    .select("id, document_number, storage_path").eq("id", id).maybeSingle();
  if (error || !invoice) return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = invoice.document_number.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) + ".pdf";
  const { data: signed, error: signingError } = await supabase.storage.from("crm-invoices")
    .createSignedUrl(invoice.storage_path, 60, download ? { download: safeName } : undefined);
  if (signingError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Não foi possível abrir o documento." }, { status: 404 });
  }

  const response = NextResponse.redirect(signed.signedUrl, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
