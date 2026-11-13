import { createHash, randomBytes } from "node:crypto";
import { createClient as supabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const CRM_ONE_ORIGIN = "https://oso.telecom.pt";
export const CRM_ONE_MAX_BYTES = 15 * 1024 * 1024;
export const CRM_ONE_UPLOAD_TTL_MS = 15 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function getImportAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CRM ONE import: Supabase service role is not configured.");
  return supabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
export type AdminDb = ReturnType<typeof getImportAdminClient>;
export function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function createImportToken() {
  return randomBytes(32).toString("base64url");
}

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function externalJson(data: unknown, status = 200) {
  const response = privateJson(data, status);
  response.headers.set("Access-Control-Allow-Origin", CRM_ONE_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.headers.set("Vary", "Origin");
  return response;
}
export function externalOptions(request: Request) {
  if (request.headers.get("origin") !== CRM_ONE_ORIGIN) return privateJson({ error: "Origem não permitida." }, 403);
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", CRM_ONE_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.headers.set("Access-Control-Max-Age", "300");
  response.headers.set("Vary", "Origin");
  return response;
}
export function externalOriginAllowed(request: Request) {
  return request.headers.get("origin") === CRM_ONE_ORIGIN;
}
export function sameSiteRequest(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export async function checkConsoleImportGrant(request: Request): Promise<
  | { error: NextResponse; admin?: never; grant?: never }
  | { error?: never; admin: AdminDb; grant: { id: string; created_by: string; expires_at: string; revoked_at: string | null } }
> {
  if (!externalOriginAllowed(request)) return { error: externalJson({ error: "Origem não permitida." }, 403) };
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header)?.[1];
  if (!token || !TOKEN_RE.test(token)) return { error: externalJson({ error: "Autorização em falta." }, 401) };

  let admin: AdminDb;
  try { admin = getImportAdminClient(); }
  catch {
    return { error: externalJson({ error: "Integração de faturas ainda não configurada no servidor." }, 503) };
  }
  const now = new Date().toISOString();
  const { data: grant, error } = await admin.from("crm_one_import_tokens")
    .select("id,created_by,expires_at,revoked_at")
    .eq("token_hash", tokenDigest(token))
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error || !grant) return { error: externalJson({ error: "Autorização expirada ou revogada." }, 401) };

  // Check the current role on every call: deactivated or demoted users lose access.
  const { data: profile } = await admin.from("profiles")
    .select("role,is_active").eq("id", grant.created_by).maybeSingle();
  if (!profile?.is_active || profile.role !== "admin") {
    return { error: externalJson({ error: "Utilizador sem permissão para importar." }, 403) };
  }
  return { admin, grant };
}
export async function getPortalAdmin() {
  const supabase = await createSessionClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (error || !userId) return null;
  const { data: profile } = await supabase.from("profiles")
    .select("role,is_active").eq("id", userId).maybeSingle();
  if (!profile?.is_active || profile.role !== "admin") return null;
  return { userId };
}
export const validNif = (value: unknown): value is string => typeof value === "string" && /^\d{9}$/.test(value);
export const validService = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(value);
export const validNcc = (value: unknown): value is string => typeof value === "string" && /^\d{1,30}$/.test(value);
export const validDocument = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(value);
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function serviceNccCandidates(source: unknown): string[] {
  const data = Array.isArray(source) ? source : [source];
  const keys = /^(ncc|numeroconta|nconta|numerodeconta|contafaturacao|contadefaturacao)$/;
  const results: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const [name, raw] of Object.entries(row)) {
      const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const value = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
      if (keys.test(normalized) && /^\d{1,30}$/.test(value)) results.push(value);
    }
  }
  return [...new Set(results)];
}
