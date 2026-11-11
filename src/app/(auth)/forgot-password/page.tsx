import Link from "next/link";
import { sendPasswordReset } from "@/lib/auth/actions";

type Props = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
      <p className="text-sm font-semibold text-blue-700">CRM Comercial</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Recuperar palavra-passe</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Indica o email da tua conta. Se existir, receberás uma ligação para definires uma nova palavra-passe.
      </p>
      {params.message === "sent" && (
        <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
          Pedido enviado. Verifica a tua caixa de entrada e a pasta de spam.
        </p>
      )}
      {params.error === "email" && (
        <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Indica um email válido.</p>
      )}
      <form action={sendPasswordReset} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <button type="submit" className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">
          Enviar ligação de recuperação
        </button>
      </form>
      <Link href="/login" className="mt-6 block text-center text-sm font-medium text-blue-700 hover:text-blue-900">
        Voltar ao início de sessão
      </Link>
    </section>
  );
}
