import { getImportAdminClient, getPortalAdmin, createImportToken, tokenDigest, sameSiteRequest, privateJson } from "@/lib/crm-one/import-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameSiteRequest(request)) return privateJson({ error: "Origem não autorizada." }, 403);
  const actor = await getPortalAdmin();
  if (!actor) return privateJson({ error: "Apenas administradores ativos podem gerar autorizações." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({ error: "Pedido inválido." }, 400); }
  const requested = (body as { duration_minutes?: unknown } | null)?.duration_minutes;
  if (![30, 60, 120].includes(Number(requested)) || !Number.isInteger(Number(requested))) {
    return privateJson({ error: "Duração permitida: 30, 60 ou 120 minutos." }, 422);
  }

  const admin = getImportAdminClient();
  const expires = new Date(Date.now() + Number(requested) * 60000).toISOString();
  const token = createImportToken();
  // A new token revokes the previous grants for the same admin.
  const { error: revokeError } = await admin.from("crm_one_import_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("created_by", actor.userId).is("revoked_at", null);
  if (revokeError) return privateJson({ error: "Não foi possível substituir a autorização anterior." }, 500);

  const { error } = await admin.from("crm_one_import_tokens").insert({
    token_hash: tokenDigest(token), created_by: actor.userId, expires_at: expires,
  });
  if (error) return privateJson({ error: "Não foi possível gerar a autorização." }, 500);

  return privateJson({ token, expires_at: expires, duration_minutes: Number(requested) });
}

export async function DELETE(request: Request) {
  if (!sameSiteRequest(request)) return privateJson({ error: "Origem não autorizada." }, 403);
  const actor = await getPortalAdmin();
  if (!actor) return privateJson({ error: "Sem permissão." }, 403);
  const admin = getImportAdminClient();
  const { error } = await admin.from("crm_one_import_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("created_by", actor.userId).is("revoked_at", null);
  if (error) return privateJson({ error: "Não foi possível revogar." }, 500);
  return privateJson({ ok: true });
}
