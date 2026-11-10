import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

export async function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Supabase não está configurado. Define NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The Next.js proxy refreshes
          // the session and writes refreshed cookies on the response instead.
        }
      },
    },
  });
}
