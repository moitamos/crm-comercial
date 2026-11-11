import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseWorkbook } from "@/lib/crm/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return NextResponse.json({ error: "A sessão expirou. Volta a iniciar sessão." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!profile?.is_active) return NextResponse.json({ error: "A conta não está ativa." }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o ficheiro enviado." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Seleciona um ficheiro Excel." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "O ficheiro não pode ultrapassar 10 MB." }, { status: 413 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Nesta primeira versão, utiliza um ficheiro .xlsx." }, { status: 415 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await parseWorkbook(buffer);
    if (preview.errors.some((message) => message.startsWith("Faltam colunas") || message.startsWith("O ficheiro"))) {
      return NextResponse.json({ error: preview.errors[0] }, { status: 422 });
    }
    return NextResponse.json({
      fileName: file.name.slice(0, 180),
      rowCount: preview.rowCount,
      rows: preview.rows,
      warnings: preview.errors,
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível abrir este Excel. Confirma que é um ficheiro .xlsx válido." }, { status: 422 });
  }
}
