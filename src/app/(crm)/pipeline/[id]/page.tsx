import { notFound } from "next/navigation";
import { DealDetailsDialog } from "@/components/crm/deal-details-dialog";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
};
type ClientRow = {
  id: string;
  full_name: string;
  nif: string;
  phone: string | null;
  email: string | null;
};
type AdminContactRow = {
  id: string;
  phone_numbers: string[] | null;
  email: string | null;
};
type DealServiceLink = { service_id: string };
type ServiceRow = {
  id: string;
  service_number: string;
  service_type: string;
  package_name: string | null;
  loyalty_end_date: string | null;
  source_data: unknown;
};
type ActivityRow = {
  id: string;
  deal_id: string;
  commercial_id: string;
  event_type: string;
  description: string | null;
  event_data: Record<string, unknown> | null;
  occurred_at: string;
};

export default async function DealDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const dealResult = await supabase.from("deals")
    .select("id, client_id, stage, created_at, eligibility_month, last_contact_at, next_contact_at, lost_reason, notes")
    .eq("id", id)
    .maybeSingle();

  if (dealResult.error || !dealResult.data) notFound();
  const deal = dealResult.data;

  const [clientResult, linksResult, activitiesResult] = await Promise.all([
    supabase.from("clients")
      .select("id, full_name, nif, phone, email")
      .eq("id", deal.client_id)
      .maybeSingle(),
    supabase.from("deal_services")
      .select("service_id")
      .eq("deal_id", deal.id),
    supabase.from("interactions")
      .select("id, deal_id, commercial_id, event_type, description, event_data, occurred_at")
      .eq("deal_id", deal.id)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  const serviceIds = Array.from(new Set((linksResult.data ?? []).map((item) => item.service_id)));
  const [servicesResult, adminsResult] = await Promise.all([
    serviceIds.length
      ? supabase.from("services")
          .select("id, service_number, service_type, package_name, loyalty_end_date, source_data")
          .in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("client_administrators")
      .select("id, phone_numbers, email")
      .eq("client_id", deal.client_id),
  ]);

  const client = clientResult.data as ClientRow | null;
  const adminContacts = (adminsResult.data ?? []) as AdminContactRow[];
  const phoneNumbers = client?.phone
    ? [client.phone]
    : Array.from(new Set(adminContacts.flatMap((item) => item.phone_numbers ?? []).map((item) => item.trim()).filter(Boolean)));
  const emails = client?.email
    ? [client.email]
    : Array.from(new Set(adminContacts.map((item) => item.email?.trim()).filter((item): item is string => Boolean(item))));
  const services = (servicesResult.data ?? []) as ServiceRow[];
  const activities = (activitiesResult.data ?? []) as ActivityRow[];

  if (linksResult.error || activitiesResult.error || servicesResult.error || adminsResult.error) {
    throw new Error("Não foi possível carregar todos os dados deste negócio.");
  }

  const returnMonth = query.month || deal.eligibility_month || "unassigned";
  const backHref = "/pipeline?month=" + encodeURIComponent(returnMonth);

  return (
    <DealDetailsDialog
      deal={{
        id: deal.id,
        created_at: deal.created_at,
        eligibility_month: deal.eligibility_month,
        stage: deal.stage,
        last_contact_at: deal.last_contact_at,
        next_contact_at: deal.next_contact_at,
        lost_reason: deal.lost_reason,
        notes: deal.notes,
        client: client
          ? { ...client, phone_numbers: phoneNumbers, emails }
          : null,
        services,
        activities,
      }}
      initialStage={deal.stage}
      displayMode="page"
      backHref={backHref}
    />
  );
}
