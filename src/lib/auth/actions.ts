"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/login?error=credentials");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect("/login?error=credentials");

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }

  revalidatePath("/", "layout");
  redirect("/login?message=signed-out");
}

export async function sendPasswordReset(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=email");

  const requestHeaders = await headers();
  const forwardedHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? forwardedHost.startsWith("localhost")
        ? \`http://\${forwardedHost}\`
        : \`\${forwardedProtocol}://\${forwardedHost}\`
      : "http://localhost:3000");

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: \`\${origin}/auth/callback?next=/update-password\`,
  });

  // Same response whether or not the address belongs to an account.
  redirect("/forgot-password?message=sent");
}

export async function updatePassword(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (password.length < 12 || password !== confirmation) {
    redirect("/update-password?error=password");
  }

  const supabase = await createClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !data.claims?.sub) redirect("/login?error=reset-session");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/update-password?error=update");

  revalidatePath("/", "layout");
  redirect("/login?message=password-updated");
}
