import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExcelImportForm } from "@/components/crm/excel-import-form";

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: memberships } = await supabase
    .from("portfolio_members")
    .select("portfolio_id")
    .eq("user_id", userId);
  const portfolioIds = (memberships ?? []).map((item) => item.portfolio_id);
  const { data: portfolios } = portfolioIds.length
    ? await supabase.from("portfolios").select("id, name").in("id", portfolioIds).order("name")
    : { data: [] };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-7">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700">
        <ArrowLeft size={16} /> Voltar aos clientes
      </Link>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Carregamento de dados</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Importar clientes e serviços</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Importa ficheiros .csv, .xls e .xlsx. O CRM reconhece cabeçalhos, propõe a correspondência e permite confirmar antes de importar; também reconhece a extração PIU com cinco folhas: Clientes, Refid MEO, Cartoes Moveis, GC Pack e Administradores.</p>
        </div>
        <a href="/api/import/template" className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Download size={16} /> Descarregar modelo Excel
        </a>
      </div>
      <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-950"><FileSpreadsheet size={17} /> Campos que o CRM tenta reconhecer</div>
        <p className="mt-2 text-sm leading-6 text-blue-900/80">Importa os dados de cliente, serviços MEO, cartões móveis, GCP e administradores de conta, incluindo todos os campos originais de cada folha.</p>
        <p className="mt-2 text-xs leading-5 text-blue-900/70">Os nomes das colunas podem ser diferentes dos exemplos. Antes da importação podes confirmar e alterar as associações sugeridas. O mesmo cliente pode ter vários serviços e vários administradores, todos associados pelo NIF; também é possível importar um cliente sem serviço. Quando existe “Data conclusão”, essa data é considerada o início da fidelização em vigor e o CRM soma 24 meses para calcular o novo fim de fidelização; o funil é atualizado no final da importação.</p>
      </section>
      <ExcelImportForm portfolios={portfolios ?? []} />
    </main>
  );
}
