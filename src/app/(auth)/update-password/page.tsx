import Link from "next/link";
import { updatePassword } from "@/lib/auth/actions";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function UpdatePasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
      <p className="text-sm font-semibold text-blue-700">CRM Comercial</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Nova palavra-passe</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Escolhe uma palavra-passe com pelo menos 12 caracteres.
      </p>
      {params.error === "password" && (
        <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          As palavras-passe têm de coincidir e conter pelo menos 12 caracteres.
        </p>
      )}
      {params.error === "update" && (
        <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível atualizar a palavra-passe. Pede uma nova ligação de recuperação.
        </p>
      )}
      <form action={updatePassword} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Nova palavra-passe</label>
          <input id="password" name="password" type="password" minLength={12} autoComplete="new-password" required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Confirmar palavra-passe</label>
          <input id="confirmPassword" name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <button type="submit" className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">
          Guardar palavra-passe
        </button>
      </form>
      <Link href="/login" className="mt-6 block text-center text-sm font-medium text-blue-700 hover:text-blue-900">
        Voltar ao início de sessão
      </Link>
    </section>
  );
}
