import { readStore, writeStore, kvEnabled } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lectura pública: el cliente carga las ediciones guardadas (conclusiones + competencia).
export async function GET() {
  const store = await readStore();
  return Response.json(
    { conclusions: store.conclusions || {}, competencia: store.competencia || null, linkedin: store.linkedin || null, kv: kvEnabled() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Escritura: requiere la clave (EDIT_PASSWORD). Guarda en KV.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const pass = process.env.EDIT_PASSWORD;
  if (!pass) return Response.json({ error: "Falta EDIT_PASSWORD en el servidor" }, { status: 400 });
  if (body.password !== pass) return Response.json({ error: "Clave incorrecta" }, { status: 401 });
  if (body.action === "check") return Response.json({ ok: true, kv: kvEnabled() });
  if (!kvEnabled()) return Response.json({ error: "Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN)" }, { status: 400 });

  const store = await readStore();
  store.conclusions = store.conclusions || {};
  if (body.type === "conclusion") {
    if (body.value == null || body.value === "") delete store.conclusions[body.key];
    else store.conclusions[body.key] = body.value;
  } else if (body.type === "competencia") {
    store.competencia = body.value;
  } else if (body.type === "linkedin") {
    store.linkedin = body.value;
  } else {
    return Response.json({ error: "tipo inválido" }, { status: 400 });
  }
  try {
    await writeStore(store);
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
  return Response.json({ ok: true });
}
