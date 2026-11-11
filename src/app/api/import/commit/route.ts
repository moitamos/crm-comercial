import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ImportRow } from "@/lib/crm/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommitBody = { fileName?: string; portfolioId?: string; rows?: ImportRow[] };
type ExistingService = {
  client_id: string;
  service_number: string;
  package_name: string | null;
  loyalty_end_date: string | null;
};

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
      email: row.email ? String(row.email).trim().slice(0, 254).toLowerCase() : null,
      address: row.address ? String(row.address).trim().slice(0, 300) : null,
      serviceNumber: row.serviceNumber ? String(row.serviceNumber).trim().slice(0, 100) : null,
      packageName: row.packageName ? String(row.packageName).trim().slice(0, 60) : null,
      loyaltyEndDate: row.loyaltyEndDate ? String(row.loyaltyEndDate) : null,
      loyaltyConclusionDate: row.loyaltyConclusionDate ? String(row.loyaltyConclusionDate) : null,
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

function mergeRows(existing: ImportRow, incoming: ImportRow): ImportRow {
  return {
    ...existing,
    fullName: existing.fullName || incoming.fullName,
    nic: existing.nic || incoming.nic,
    ncc: existing.ncc || incoming.ncc,
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    address: existing.address || incoming.address,
    packageName: existing.packageName || incoming.packageName,
    loyaltyEndDate: existing.loyaltyEndDate || incoming.loyaltyEndDate,
    loyaltyConclusionDate: existing.loyaltyConclusionDate || incoming.loyaltyConclusionDate,
    errors: [...new Set([...existing.errors, ...incoming.errors])],
  };
}

function validateAndConsolidate(rows: ImportRow[]) {
  const rejectedRows: ImportRow[] = [];
  const acceptedServices = new Map<string, ImportRow>();
  const clientOnlyRows = new Map<string, ImportRow>();
  const namesByNif = new Map<string, string>();

  for (const row of rows) {
    const errors = [...row.errors];
    if (!row.fullName) errors.push("Nome em falta.");
    if (!/^\d{9}$/.test(row.nif)) errors.push("NIF inválido.");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Email inválido.");
    if (row.phone && !/^\+?[0-9]+$/.test(row.phone)) errors.push("Telefone inválido.");
    if (!isIsoDate(row.loyaltyEndDate) || !isIsoDate(row.loyaltyConclusionDate)) errors.push("Data de fidelização inválida.");

    if (errors.length) {
      rejectedRows.push({ ...row, errors: [...new Set(errors)] });
      continue;
    }

    const normalizedName = row.fullName.toLocaleLowerCase("pt-PT");
    const previousName = namesByNif.get(row.nif);
    if (previousName && previousName !== normalizedName) {
      rejectedRows.push({ ...row, errors: ["O mesmo NIF aparece associado a nomes diferentes no ficheiro."] });
      continue;
    }
    namesByNif.set(row.nif, normalizedName);

    if (!row.serviceNumber) {
      const previous = clientOnlyRows.get(row.nif);
      clientOnlyRows.set(row.nif, previous ? mergeRows(previous, row) : row);
      continue;
    }

    const key = row.nif + ":" + row.serviceNumber.toLocaleLowerCase("pt-PT");
    const previous = acceptedServices.get(key);
    acceptedServices.set(key, previous ? mergeRows(previous, row) : row);
  }

  for (const [key, service] of acceptedServices) {
    const client = clientOnlyRows.get(service.nif);
    if (client) acceptedServices.set(key, mergeRows(service, client));
  }

  const serviceNifs = new Set(Array.from(acceptedServices.values()).map((row) => row.nif));
  const accepted = [
    ...acceptedServices.values(),
    ...Array.from(clientOnlyRows.values()).filter((row) => !serviceNifs.has(row.nif)),
  ];
  return { accepted, rejectedRows };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "A sessão expirou. Volta a iniciar sessão." }, { status: 401 });
  }

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
  const fileName = String(body.fileName ?? "importacao").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
  if (!portfolioId || rows.length === 0) {
    return NextResponse.json({ error: "Não existem linhas válidas para importar." }, { status: 400 });
  }

  const { accepted: validRows, rejectedRows: validationRejections } = validateAndConsolidate(rows);
  if (validRows.length === 0) {
    return NextResponse.json({ error: "Todas as linhas têm erros. Corrige os dados e volta a pré-visualizar." }, { status: 422 });
  }

  const { data: membership } = await supabase
    .from("portfolio_members")
    .select("portfolio_id")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Não tens acesso à carteira selecionada." }, { status: 403 });

  const groups = new Map<string, ImportRow[]>();
  for (const row of validRows) {
    const group = groups.get(row.nif) ?? [];
    group.push(row);
    groups.set(row.nif, group);
  }

  const batchInsert = await supabase.from("import_batches").insert({
    file_name: fileName,
    source: "excel",
    rows_read: rows.length,
    rows_imported: 0,
    rows_rejected: validationRejections.length,
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
      nic: items.find((item) => item.nic)?.nic ?? null,
      ncc: items.find((item) => item.ncc)?.ncc ?? null,
      phone: items.find((item) => item.phone)?.phone ?? null,
      email: items.find((item) => item.email)?.email ?? null,
      address: items.find((item) => item.address)?.address ?? null,
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

  const rejectedClientNifs = nifList.filter((nif) => !clientIds.has(nif));
  const unavailableClientRows = rejectedClientNifs.reduce((total, nif) => total + (groups.get(nif)?.length ?? 0), 0);
  const serviceGroups = Array.from(groups.entries()).flatMap(([nif, items]) => {
    const clientId = clientIds.get(nif);
    if (!clientId) return [];
    return items
      .filter((row) => Boolean(row.serviceNumber))
      .map((row) => ({ clientId, row }));
  });

  const serviceClientIds = Array.from(new Set(serviceGroups.map((item) => item.clientId)));
  const serviceNumbers = Array.from(new Set(serviceGroups.map((item) => item.row.serviceNumber as string)));
  const { data: existingServices, error: serviceCheckError } = serviceClientIds.length
    ? await supabase.from("services")
      .select("client_id, service_number, package_name, loyalty_end_date")
      .in("client_id", serviceClientIds)
      .in("service_number", serviceNumbers)
    : { data: [], error: null };

  if (serviceCheckError) {
    await supabase.from("import_batches").update({ rows_rejected: rows.length }).eq("id", batchId);
    return NextResponse.json({ error: "Não foi possível verificar os serviços já registados." }, { status: 500 });
  }

  const existingByKey = new Map<string, ExistingService>(
    (existingServices ?? []).map((service) => [service.client_id + ":" + service.service_number, service as ExistingService]),
  );
  const serviceRows = serviceGroups.map(({ clientId, row }) => {
    const existing = existingByKey.get(clientId + ":" + row.serviceNumber);
    return {
      client_id: clientId,
      service_number: row.serviceNumber as string,
      package_name: row.packageName ?? existing?.package_name ?? null,
      loyalty_end_date: row.loyaltyEndDate ?? existing?.loyalty_end_date ?? null,
      source: "excel" as const,
      import_batch_id: batchId,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
  });

  let servicesCreated = 0;
  let servicesUpdated = 0;
  if (serviceRows.length) {
    const upsertedServices = await supabase
      .from("services")
      .upsert(serviceRows, { onConflict: "client_id,service_number", ignoreDuplicates: false })
      .select("id, client_id, service_number");

    if (upsertedServices.error) {
      await supabase.from("import_batches").update({
        rows_rejected: rows.length,
        summary: { clients_created: clientsCreated, error: "Falha ao gravar serviços." },
      }).eq("id", batchId);
      return NextResponse.json({ error: "Os clientes foram criados, mas ocorreu um erro ao gravar os serviços. A importação ficou registada para análise." }, { status: 500 });
    }

    servicesUpdated = serviceRows.filter((row) => existingByKey.has(row.client_id + ":" + row.service_number)).length;
    servicesCreated = Math.max(0, (upsertedServices.data?.length ?? 0) - servicesUpdated);
  }

  const rejectedTotal = validationRejections.length + unavailableClientRows;
  const clientsReused = Math.max(0, groups.size - clientsCreated - rejectedClientNifs.length);
  const importedRows = clientsCreated + servicesCreated + servicesUpdated;
  const summary = {
    clients_created: clientsCreated,
    clients_reused: clientsReused,
    services_created: servicesCreated,
    services_updated: servicesUpdated,
    clients_not_available_in_selected_portfolio: rejectedClientNifs.length,
    invalid_rows: validationRejections.length,
    distinct_services_received: serviceRows.length,
  };

  await supabase.from("import_batches").update({
    rows_imported: importedRows,
    rows_rejected: rejectedTotal,
    summary,
  }).eq("id", batchId);

  let dealsCreated = 0;
  let funnelRefreshWarning: string | null = null;
  const refresh = await supabase.rpc("refresh_my_due_renewal_deals");
  if (refresh.error) {
    funnelRefreshWarning = "Os clientes e serviços foram importados, mas não foi possível atualizar o funil automaticamente. Atualiza o funil ou contacta o administrador.";
  } else {
    dealsCreated = Number(refresh.data ?? 0);
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/funnel");
  revalidatePath("/import");

  return NextResponse.json({
    success: true,
    batchId,
    clientsCreated,
    clientsReused,
    servicesCreated,
    servicesUpdated,
    rejectedRows: rejectedTotal,
    dealsCreated,
    funnelRefreshWarning,
  });
}
