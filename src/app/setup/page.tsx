import Link from "next/link";

export default function SetupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <p className="text-sm font-semibold text-blue-700">CRM Comercial</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Configuração da base de dados</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          A estrutura da aplicação já está preparada, mas ainda falta ligar um projeto Supabase.
          Não introduzas dados reais até terminares estes passos.
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
          <li>Cria um projeto em <Link className="font-semibold text-blue-700 underline" href="https://supabase.com/dashboard">Supabase Dashboard</Link>.</li>
          <li>No SQL Editor, executa <code className="rounded bg-slate-100 px-1">supabase/migrations/202611100001_initial_schema.sql</code> do repositório.</li>
          <li>Em Project Settings → API, copia o Project URL e a Publishable key.</li>
          <li>Na Vercel, em Settings → Environment Variables, cria <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> e <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> para Production, Preview e Development.</li>
          <li>Cria o teu utilizador em Authentication → Users, desativa os registos públicos e executa <code className="rounded bg-slate-100 px-1">supabase/bootstrap/01-first-admin.sql</code> com o teu email.</li>
        </ol>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          A chave Publishable pode estar no frontend; nunca coloques a Secret/Service Role key em variáveis NEXT_PUBLIC_ nem no browser.
        </div>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-blue-700 hover:text-blue-900">Voltar ao login</Link>
      </section>
    </main>
  );
}
