import { createHash } from "node:crypto";
import { checkConsoleImportGrant, externalJson, externalOptions, CRM_ONE_MAX_BYTES } from "@/lib/crm-one/import-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = externalOptions;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await checkConsoleImportGrant(request);
  if (auth.error) return auth.error;
  const { admin, grant } = auth;
  let body: unknown;
  try { body = await request.json(); } catch { return externalJson({ error: "Pedido JSON inválido." }, 400); }
  const uploadId = (body as { upload_id?: unknown } | null)?.upload_id;
  if (typeof uploadId !== "string" || !UUID.test(uploadId)) {
    return externalJson({ error: "Identificador de upload inválido." }, 422);
  }

  const { data: intent, error: intentError } = await admin.from("crm_one_import_uploads")
    .select("*").eq("id", uploadId).eq("token_id", grant.id)
    .eq("created_by", grant.created_by).maybeSingle();
  if (intentError || !intent) return externalJson({ error: "Upload não encontrado nesta autorização." }, 404);

  if (intent.status === "completed" && intent.invoice_id) {
    return externalJson({ ok: true, id: intent.invoice_id, already_exists: true });
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return externalJson({ error: "Reserva expirada. Verifica o estado antes de tentar novamente." }, 409);
  }

  // Recheck ownership and the existing invoice to guard against changes while uploading.
  const { data: client } = await admin.from("clients")
    .select("id,nif").eq("id", intent.client_id).maybeSingle();
  const { data: service } = await admin.from("services")
    .select("id,service_number,client_id").eq("id", intent.service_id)
    .eq("client_id", intent.client_id).maybeSingle();
  if (!client || client.nif !== intent.nif ||
      !service || service.service_number !== intent.service_number) {
    return externalJson({ error: "O cliente ou serviço foi alterado durante a importação." }, 409);
  }

  const { data: prior } = await admin.from("client_invoices")
    .select("id").eq("nif", intent.nif).eq("service_number", intent.service_number)
    .eq("document_number", intent.document_number).maybeSingle();
  if (prior) {
    await admin.from("crm_one_import_uploads").update({
      status: "completed", invoice_id: prior.id, completed_at: new Date().toISOString(),
    }).eq("id", intent.id);
    return externalJson({ ok: true, id: prior.id, already_exists: true });
  }

  const { data: file, error: downloadError } = await admin.storage
    .from("crm-invoices").download(intent.storage_path);
  if (downloadError || !file) return externalJson({ error: "O PDF ainda não foi recebido pelo Supabase." }, 409);

  const buffer = Buffer.from(await file.arrayBuffer());
  const signature = buffer.subarray(0, 5).toString("ascii");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (signature !== "%PDF-" ||
      buffer.length < 100 || buffer.length > CRM_ONE_MAX_BYTES ||
      buffer.length !== intent.expected_bytes || sha256 !== intent.expected_sha256) {
    await admin.storage.from("crm-invoices").remove([intent.storage_path]);
    return externalJson({ error: "O ficheiro não corresponde ao PDF validado na origem." }, 422);
  }

  const { error: insertError } = await admin.from("client_invoices").insert({
    id: intent.id,
    client_id: intent.client_id, service_id: intent.service_id,
    nif: intent.nif, service_number: intent.service_number, ncc: intent.ncc,
    document_number: intent.document_number, issued_at: intent.issued_at,
    storage_path: intent.storage_path, file_size_bytes: buffer.length,
    sha256, source: "crm_one", created_by: grant.created_by,
  });

  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("[CRM_ONE_IMPORT_FINISH]", { code: insertError.code, message: insertError.message });
      return externalJson({ error: "Não foi possível registar a fatura. Confirma o estado antes de repetir." }, 500);
    }
    const { data: already } = await admin.from("client_invoices")
      .select("id").eq("nif", intent.nif).eq("service_number", intent.service_number)
      .eq("document_number", intent.document_number).maybeSingle();
    if (!already) return externalJson({ error: "Conflito ao guardar o documento." }, 409);
    await admin.from("crm_one_import_uploads").update({
      status: "completed", invoice_id: already.id, completed_at: new Date().toISOString(),
    }).eq("id", intent.id);
    return externalJson({ ok: true, id: already.id, already_exists: true });
  }

  await admin.from("crm_one_import_uploads").update({
    status: "completed", invoice_id: intent.id, completed_at: new Date().toISOString(),
  }).eq("id", intent.id);
  return externalJson({ ok: true, id: intent.id, already_exists: false });
}
