"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, ShieldX } from "lucide-react";

type Grant = { token: string; expires_at: string; duration_minutes: number };

export function ImportTokenManager() {
  const [duration, setDuration] = useState(30);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const clear = () => { setGrant(null); setCopied(false); };
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, []);

  async function generate() {
    setPending(true);
    setError(null);
    setGrant(null);
    setCopied(false);
    try {
      const response = await fetch("/api/crm-one/token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_minutes: duration }), cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || !body?.token) throw new Error(body?.error ?? "Não foi possível gerar o token.");
      setGrant(body as Grant);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro de ligação.");
    } finally { setPending(false); }
  }
  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/crm-one/token", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível revogar a autorização.");
      setGrant(null);
      setCopied(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro de ligação."); }
    finally { setPending(false); }
  }
  async function copyToken() {
    if (!grant) return;
    try {
      await navigator.clipboard.writeText(grant.token);
      setCopied(true);
    } catch {
      setError("Copia o token manualmente. Não o partilhes por mensagem ou e-mail.");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <KeyRound size={17} className="text-blue-700" /> Autorização temporária
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-semibold text-slate-600">
          <span className="block">Validade</span>
          <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800">
            <option value={30}>30 minutos</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
          </select>
        </label>
        <button type="button" disabled={pending} onClick={generate}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
          {pending ? "A processar…" : "Gerar autorização"}
        </button>
      </div>
      {grant && (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs text-blue-900">
            Válida até {new Date(grant.expires_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}.
            Gerar um novo token invalida o anterior.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input aria-label="Token temporário" type="text" readOnly value={grant.token}
              className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white p-2 font-mono text-xs text-slate-800" />
            <button type="button" onClick={copyToken}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">
              <Copy size={14} /> {copied ? "Copiado" : "Copiar"}
            </button>
            <button type="button" disabled={pending} onClick={revoke}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
              <ShieldX size={14} /> Revogar
            </button>
          </div>
          <p className="text-xs text-slate-600">O token é uma credencial: cola-o apenas no gestor da consola do CRM ONE.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </section>
  );
}
