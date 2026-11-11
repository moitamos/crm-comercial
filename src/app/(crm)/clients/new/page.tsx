import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "@/components/crm/client-form";

export default async function NewClientPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: memberships } = await supabase
    .from("portfolio_members")
    .select("portfolio_id")
    .eq("user_id", userId);

  const ids = (memberships ?? []).map((item) => item.portfolio_id);
  const { data: portfolios } = ids.length
    ? await supabase.from("portfolios").select("id, name").in("id", ids).order("name")
    : { data: [] };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-7">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700">
        <ArrowLeft size={16} /> Voltar à carteira
      </Link>
      <div>
        <p className="text-sm text-slate-500">Carteira comercial</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Novo cliente</h1>
        <p className="mt-2 text-sm text-slate-500">O NIF identifica o cliente de forma única em todo o CRM.</p>
      </div>
      {(!portfolios || portfolios.length === 0) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          A tua conta ainda não está associada a uma carteira. Pede ao administrador para te adicionar a uma carteira antes de criares clientes.
        </div>
      ) : <ClientForm portfolios={portfolios} />}
    </main>
  );
}
