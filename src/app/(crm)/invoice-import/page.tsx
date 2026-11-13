import Link from "next/link";
import { redirect } from "next/navigation";
import { FileDown, ShieldCheck } from "lucide-react";
import { getPortalAdmin } from "@/lib/crm-one/import-auth";
import { ImportTokenManager } from "@/components/crm/import-token-manager";

export const dynamic = "force-dynamic";

export default async function InvoiceImportPage() {
  const authorized = await getPortalAdmin();
  if (!authorized) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-7">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
          <FileDown size={15} /> Importação de documentos
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Faturas CRM ONE</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Gera uma autorização temporária para o gestor de faturas executado nas consolas do CRM MEO.
          As Invoice são associadas ao serviço do cliente e aparecem nos detalhes do negócio.
        </p>
      </div>
      <ImportTokenManager />
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck size={17} className="text-blue-700" /> Como usar
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Gera o token e copia-o. Este valor é apresentado uma única vez e não fica guardado no browser.</li>
          <li>No CRM ONE/Siebel autenticado, cola o script principal na consola F12.</li>
          <li>Na janela autenticada da Invoice (oso.telecom.pt), executa o script worker na consola F12.</li>
          <li>Cola o token no gestor, carrega NIF;N.º Serviço ou apenas N.º Serviço e inicia com um serviço de teste.</li>
          <li>Confirma a fatura no negócio correspondente no funil antes de processar um lote maior.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-blue-700">
          <Link target="_blank" rel="noopener noreferrer" className="hover:underline"
            href="https://github.com/moitamos/crm-comercial/blob/main/docs/crm-one-console-main.js">
            Script principal (F12)
          </Link>
          <Link target="_blank" rel="noopener noreferrer" className="hover:underline"
            href="https://github.com/moitamos/crm-comercial/blob/main/docs/crm-one-console-popup.js">
            Script Invoice (F12)
          </Link>
        </div>
      </section>
      <p className="text-xs leading-5 text-slate-500">
        Apenas administradores podem emitir autorizações. Os documentos pertencem aos clientes do CRM e
        devem ser consultados e partilhados apenas com autorização da organização responsável.
      </p>
    </main>
  );
}
