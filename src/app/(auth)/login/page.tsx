import Link from "next/link";
import { Activity, LockKeyhole, ShieldCheck } from "lucide-react";
import { signIn } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
      <div className="bg-slate-950 px-8 py-8 text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
          <Activity size={25} />
        </div>
        <p className="mt-6 text-sm font-medium text-blue-200">Área privada</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">CRM Comercial</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Inicia sessão para aceder à tua carteira e atividade comercial.
        </p>
      </div>

      <div className="space-y-5 px-8 py-8">
        {!configured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            A autenticação ainda não está configurada. Primeiro é necessário criar
            o projeto Supabase e adicionar as respetivas variáveis na Vercel.{" "}
            <Link className="font-semibold underline" href="/setup">Ver instruções</Link>.
          </div>
        )}

        {params.error === "credentials" && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Não foi possível iniciar sessão. Confirma o email e a palavra-passe.
          </p>
        )}
        {params.error === "inactive" && (
          <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Esta conta não está ativa ou ainda não tem perfil autorizado. Contacta o administrador.
          </p>
        )}
        {params.error === "auth-callback" && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            A ligação de autenticação expirou ou já foi utilizada. Pede um novo email de recuperação.
          </p>
        )}
        {params.error === "reset-session" && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            A sessão de recuperação não é válida. Pede uma nova ligação.
          </p>
        )}
        {params.message === "signed-out" && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Sessão terminada com sucesso.
          </p>
        )}
        {params.message === "password-updated" && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Palavra-passe atualizada. Já podes iniciar sessão.
          </p>
        )}

        <form action={signIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required disabled={!configured}
              placeholder="o-teu-email@exemplo.pt"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100" />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Palavra-passe</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required disabled={!configured}
              placeholder="A tua palavra-passe"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100" />
          </div>
          <button type="submit" disabled={!configured}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            <LockKeyhole size={17} /> Entrar no CRM
          </button>
        </form>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={15} className="text-emerald-600" />
          Acesso privado. Não existe registo público.
        </div>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm font-medium text-blue-700 hover:text-blue-900">
            Esqueci-me da palavra-passe
          </Link>
        </div>
      </div>
    </section>
  );
}
