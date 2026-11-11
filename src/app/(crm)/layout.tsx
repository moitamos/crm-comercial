import { LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { CrmSidebar } from "@/components/crm/sidebar";

export default async function CrmLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=inactive");
  }

  return (
    <div className="min-h-screen lg:flex">
      <CrmSidebar />
      <div className="min-w-0 flex-1 lg:pl-64">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-7">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} className="text-emerald-600" />
            Sessão protegida
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-600 sm:inline">
              {profile.full_name} · {profile.role === "admin" ? "Administrador" : "Comercial"}
            </span>
            <form action={signOut}>
              <button type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <LogOut size={14} /> Terminar sessão
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
