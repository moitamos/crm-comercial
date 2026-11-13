import { randomUUID } from "node:crypto";
import {
  checkConsoleImportGrant, externalJson, externalOptions, CRM_ONE_MAX_BYTES,
  CRM_ONE_UPLOAD_TTL_MS, validDate, validDocument, validNcc, validNif,
  validService, serviceNccCandidates,
} from "@/lib/crm-one/import-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = externalOptions;

type PrepareBody = {
  nif?: unknown; numero_servico?: unknown; ncc?: unknown;
  numero_documento?: unknown; data_documento?: unknown;
  tamanho?: unknown; sha256?: unknown;
};
const hashPattern = /^[a-f0-9]{64}$/;

export async function POST(request: Request) {
  const auth = await checkConsoleImportGrant(request);
  if (auth.error) return auth.error;
  const { admin, grant } = auth;
  let body: PrepareBody;
  try { body = await request.json() as PrepareBody; }
  catch { return externalJson({ error: "Pedido JSON inválido." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return externalJson({ error: "Pedido inválido." }, 400);
  }
  const { nif, numero_servico: serviceNumber, ncc, numero_documento: doc, data_documento: date, tamanho: bytes, sha256 } = body;
  if (!validNif(nif) || !validService(serviceNumber) || !validNcc(ncc) ||
      !validDocument(doc) || !validDate(date) ||
      typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 100 || bytes > CRM_ONE_MAX_BYTES ||
      typeof sha256 !== "string" || !hashPattern.test(sha256)) {
    return externalJson({ error: "Identificadores, data ou ficheiro inválidos." }, 422);
  }
  const { data: client, error: clientError } = await admin.from("clients")
    .select("id,nif,ncc").eq("nif", nif).maybeSingle();
  if (clientError) return externalJson({ error: "Não foi possível consultar o cliente." }, 500);
  if (!client) return externalJson({ error: "Este NIF não existe no CRM Comercial." }, 404);
  const { data: service, error: serviceError } = await admin.from("services")
    .select("id,client_id,service_number,source_data")
    .eq("client_id", client.id).eq("service_number", serviceNumber).maybeSingle();
  if (serviceError) return externalJson({ error: "Não foi possível consultar o serviço." }, 500);
  if (!service) return externalJson({ error: "Este serviço não está associado ao NIF no CRM Comercial." }, 409);

  // Match a known service-specific NCC if the PIU import already contains one.
  // A client-level NCC cannot be trusted for all services of a multi-account client.
  const knownNcc = serviceNccCandidates(service.source_data);
  if (knownNcc.length && !knownNcc.includes(ncc)) {
    return externalJson({ error: "NCC da Invoice não corresponde ao NCC do serviço importado." }, 409);
  }

  const { data: existing, error: existingError } = await admin.from("client_invoices")
    .select("id").eq("nif", nif).eq("service_number", serviceNumber)
    .eq("document_number", doc).maybeSingle();
  if (existingError) return externalJson({ error: "Erro ao verificar duplicados." }, 500);
  if (existing) return externalJson({ ok: true, already_exists: true, id: existing.id });

  const { count, error: countError } = await admin.from("crm_one_import_uploads")
    .select("id", { count: "exact", head: true }).eq("token_id", grant.id);
  if (countError) return externalJson({ error: "Não foi possível verificar limites do lote." }, 500);
  if ((count ?? 0) >= 1500) return externalJson({ error: "Limite da autorização atingido. Gera outra autorização." }, 429);

  const id = randomUUID();
  const storagePath = [client.id, service.id, id + ".pdf"].join("/");
  const { error: reserveError } = await admin.from("crm_one_import_uploads").insert({
    id, token_id: grant.id, created_by: grant.created_by,
    client_id: client.id, service_id: service.id,
    nif, service_number: serviceNumber, ncc,
    document_number: doc, issued_at: date,
    expected_bytes: bytes, expected_sha256: sha256,
    storage_path: storagePath,
    expires_at: new Date(Date.now() + CRM_ONE_UPLOAD_TTL_MS).toISOString(),
  });
  if (reserveError) {
    if (reserveError.code === "23505") {
      return externalJson({
        error: "Já existe uma importação pendente para esta Invoice. Confirma no CRM antes de repetir.",
      }, 409);
    }
    return externalJson({ error: "Não foi possível reservar a importação." }, 500);
  }

  const { data: signed, error: signingError } = await admin.storage.from("crm-invoices")
    .createSignedUploadUrl(storagePath);
  if (signingError || !signed) {
    await admin.from("crm_one_import_uploads").delete().eq("id", id);
    return externalJson({ error: "Não foi possível autorizar o upload." }, 500);
  }

  return externalJson({
    ok: true, already_exists: false, upload_id: id,
    upload_url: signed.signedUrl,
    // Signed URL has bucket + fixed path + short-lived scoped Storage token.
    expires_at: new Date(Date.now() + CRM_ONE_UPLOAD_TTL_MS).toISOString(),
  });
}
