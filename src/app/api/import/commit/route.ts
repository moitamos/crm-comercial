import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ImportRow } from "@/lib/crm/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommitBody = { fileName?: string; portfolioId?: string; rows?: ImportRow[] };

function normalizeRows(input: unknown): ImportRow[] {
  if (!Array.isArray(input) || input.length > 1500) return [];
  return input.map((raw) => {
    const row = raw as Partial<ImportRow>;
    return {
      rowNumber: Number(row.rowNumber) || 0,
      fullName: String(row.fullName ?? "").trim().slice(0, 200),
      nif: String(row.nif ?? "").replace(/\D/g, ""),
      nic: row.nic ? String(row.nic).trim().slice(0, 80) : null,
      ncc: row.ncc ? String(row.ncc).trim().slice(0, 80) : null,
      phone: row.phone ? String(row.phone).trim().slice(0, 40) : null,
      email: row.email ? String(row.email).trim().slice(0, 254) : null,
      address: row.address ? String(row.address).trim().slice(0, 300) : null,
      serviceNumber: String(row.serviceNumber ?? "").trim().slice(0, 100),
      packageName: row.packageName ? String(row.packageName).trim().slice(0, 60) : null,
      loyaltyEndDate: row.loyaltyEndDate ? String(row.loyaltyEndDate) : null,
      errors: Array.isArray(row.errors) ? row.errors.map(String).slice(0, 10) : [],
    };
  });
}

function isIsoDate(value: string | null): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateRows(rows: ImportRow[]) {
  const accepted: ImportRow[] = [];
  const rejected = new Set<number>();
  const namesByNif = new Map<string, string>();
  const serviceKeys = new Set<string>();

  for (const row of rows) {
    if (row.errors.length > 0 || !row.fullName || !/^\d{9}$/.test(row.nif) || !row.serviceNumber || !isIsoDate(row.loyaltyEndDate)) {
      rejected.add(row.rowNumber);
      continue;
    }

    const normalizedName = row.fullName.toLocaleLowerCase("pt-PT");
    const previousName = namesByNif.get(row.nif);
    if (previousName && previousName !== normalizedName) {
      rejected.add(row.rowNumber);
      continue;
    }
    namesByNif.set(row.nif, normalizedName);

    const serviceKey = row.nif + ":" + row.serviceNumber.toLocaleLowerCase("pt-PT");
    if (serviceKeys.has(serviceKey)) {
      rejected.add(row.rowNumber);
      continue;
    }
    serviceKeys.add(serviceKey);
    accepted.push(row);
  }

  return { accepted, rejectedCount: rejected.size };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return NextResponse.json({ error: "A sessão expirou. Volta a iniciar sessão." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!profile?.is_active) return NextResponse.json({ error: "A conta não está ativa." }, { status: 403 });

  let body: CommitBody;
  try {
    body = await request.json() as CommitBody;
  } catch {
    return NextResponse.json({ error: "Pedido de importação inválido." }, { status: 400 });
  }

  const portfolioId = String(body.portfolioId ?? "");
  const rows = normalizeRows(body.rows);
  const fileName = String(body.fileName ?? "importacao.xlsx").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
  if (!portfolioId || rows.length === 0) return NextResponse.json({ error: "Não existem linhas válidas para importar." }, { status: 400 });

  const { accepted: validRows, rejectedCount: invalidRows } = validateRows(rows);
  if (validRows.length === 0) return NextResponse.json({ error: "Todas as linhas têm erros. Corrige o Excel e volta a pré-visualizar." }, { status: 422 });

  const { data: membership } = await supabase
    .from("portfolio_members")
    .select("portfolio_id")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Não tens acesso à carteira selecionada." }, { status: 403 });

  const groups = new Map<string, ImportRow[]>();
  for (const row of validRows) {
    const current = groups.get(row.nif) ?? [];
    current.push(row);
    groups.set(row.nif, current);
  }

  const batchInsert = await supabase.from("import_batches").insert({
    file_name: fileName,
    source: "excel",
    rows_read: rows.length,
    rows_imported: 0,
    rows_rejected: invalidRows,
    summary: {},
    created_by: userId,
  }).select("id").single();

  if (batchInsert.error || !batchInsert.data) {
    return NextResponse.json({ error: "Não foi possível iniciar o registo desta importação." }, { status: 500 });
  }

  const batchId = batchInsert.data.id;
  const nifList = Array.from(groups.keys());
  const { data: existingClients, error: existingError } = await supabase
    .from("clients")
    .select("id, nif, portfolio_id")
    .in("nif", nifList);

  if (existingError) {
    await supabase.from("import_batches").update({ rows_rejected: rows.length }).eq("id", batchId);
    return NextResponse.json({ error: "Não foi possível verificar os NIFs existentes. Nenhum cliente foi importado." }, { status: 500 });
  }

  const clientIds = new Map<string, string>();
  for (const client of existingClients ?? []) {
    if (client.portfolio_id === portfolioId) clientIds.set(client.nif, client.id);
  }

  const newClients = Array.from(groups.entries())
    .filter(([nif]) => !clientIds.has(nif))
    .map(([nif, items]) => ({
      full_name: items[0].fullName,
      nif,
      nic: items[0].nic,
      ncc: items[0].ncc,
      phone: items[0].phone,
      email: items[0].email,
      address: items[0].address,
      portfolio_id: portfolioId,
      commercial_id: userId,
      created_by: userId,
      import_batch_id: batchId,
    }));

  let clientsCreated = 0;
  if (newClients.length) {
    const inserted = await supabase
      .from("clients")
      .upsert(newClients, { onConflict: "nif", ignoreDuplicates: true })
      .select("id, nif");

    if (inserted.error) {
      await supabase.from("import_batches").update({
        rows_rejected: rows.length,
        summary: { error: "Falha ao criar os clientes." },
      }).eq("id", batchId);
      return NextResponse.json({ error: "Não foi possível criar os clientes. Verifica se algum NIF já existe noutra carteira." }, { status: 409 });
    }

    clientsCreated = inserted.data?.length ?? 0;
    for (const item of inserted.data ?? []) clientIds.set(item.nif, item.id);

    const { data: resolvedClients, error: resolveError } = await supabase
      .from("clients")
      .select("id, nif, portfolio_id")
      .in("nif", nifList);

    if (resolveError) {
      await supabase.from("import_batches").update({ rows_rejected: rows.length }).eq("id", batchId);
      return NextResponse.json({ error: "Não foi possível confirmar os clientes após a criação. Consulta a carteira antes de repetires a importação." }, { status: 500 });
    }

    for (const client of resolvedClients ?? []) {
      if (client.portfolio_id === portfolioId) clientIds.set(client.nif, client.id);
    }
  }

  const rejectedNifs = nifList.filter((nif) => !clientIds.has(nif));
  const unavailableClientRows = rejectedNifs.reduce((total, nif) => total + (groups.get(nif)?.length ?? 0), 0);

  const serviceRows: Array<{
    client_id: string;
    service_number: string;
    package_name: string | null;
    loyalty_end_date: string | null;
    source: "excel";
    import_batch_id: string;
    is_active: boolean;
    updated_at: string;
  }> = [];

  for (const [nif, items] of groups.entries()) {
    const clientId = clientIds.get(nif);
    if (!clientId) continue;
    for (const row of items) {
      serviceRows.push({
        client_id: clientId,
        service_number: row.serviceNumber,
        package_name: row.packageName,
        loyalty_end_date: row.loyaltyEndDate,
        source: "excel",
        import_batch_id: batchId,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const serviceClientIds = Array.from(new Set(serviceRows.map((row) => row.client_id)));
  const serviceNumbers = Array.from(new Set(serviceRows.map((row) => row.service_number)));
  const { data: existingServices, error: serviceCheckError } = serviceClientIds.length
    ? await supabase.from("services").select("client_id, service_number").in("client_id", serviceClientIds).in("service_number", serviceNumbers)
    : { data: [], error: null };

  if (serviceCheckError) {
    await supabase.from("import_batches").update({ rows_rejected: rows.length }).eq("id", batchId);
    return NextResponse.json({ error: "Não foi possível verificar os serviços já registados." }, { status: 500 });
  }

  const existingServiceKeys = new Set((existingServices ?? []).map((item) => item.client_id + ":" + item.service_number));
  const servicesUpdatedBeforeImport = serviceRows.filter((row) => existingServiceKeys.has(row.client_id + ":" + row.service_number)).length;

  let servicesCreated = 0;
  let servicesUpdated = 0;
  if (serviceRows.length) {
    const upsertedServices = await supabase
      .from("services")
      .upsert(serviceRows, {
        onConflict: "client_id,service_number",
        ignoreDuplicates: false,
      })
      .select("id, client_id, service_number");

    if (upsertedServices.error) {
      await supabase.from("import_batches").update({
        rows_rejected: rows.length,
        summary: { clients_created: clientsCreated, error: "Falha ao gravar serviços." },
      }).eq("id", batchId);
      return NextResponse.json({ error: "Os clientes foram criados, mas ocorreu um erro ao gravar os serviços. A importação ficou registada para análise." }, { status: 500 });
    }

    servicesUpdated = Math.min(servicesUpdatedBeforeImport, upsertedServices.data?.length ?? 0);
    servicesCreated = Math.max(0, (upsertedServices.data?.length ?? 0) - servicesUpdated);
  }

  const importedRows = servicesCreated + servicesUpdated;
  const rejectedTotal = rows.length - importedRows;
  const clientsReused = Math.max(0, groups.size - clientsCreated - rejectedNifs.length);
  const summary = {
    clients_created: clientsCreated,
    clients_reused: clientsReused,
    services_created: servicesCreated,
    services_updated: servicesUpdated,
    clients_not_available_in_selected_portfolio: rejectedNifs.length,
    invalid_rows: invalidRows,
  };

  await supabase.from("import_batches").update({
    rows_imported: importedRows,
    rows_rejected: rejectedTotal,
    summary,
  }).eq("id", batchId);

  return NextResponse.json({
    success: true,
    batchId,
    clientsCreated,
    clientsReused,
    servicesCreated,
    servicesUpdated,
    rejectedRows: rejectedTotal,
  });
}
