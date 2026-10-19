import { readStore, writeStore, kvEnabled } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lectura pública: el cliente carga las ediciones guardadas (conclusiones + competencia).
export async function GET() {
  let store;
  try {
    store = await readStore();
  } catch (e) {
    // Sin datos falsos vacíos: el navegador se queda con lo que ya tenía.
    return Response.json({ error: String(e.message || e) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { conclusions: store.conclusions || {}, competencia: store.competencia || null, linkedin: store.linkedin || null, facebook: store.facebook || null, instagram: store.instagram || null, kv: kvEnabled() },
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

  let store;
  try {
    store = await readStore();
  } catch (e) {
    // Si no se pudo leer lo guardado, NO se escribe: guardar encima de un store vacío borraba todo.
    return Response.json({ error: "No se pudo leer lo guardado, intenta de nuevo en unos segundos (" + String(e.message || e) + ")" }, { status: 503 });
  }
  store.conclusions = store.conclusions || {};
  if (body.type === "conclusion") {
    if (body.value == null || body.value === "") delete store.conclusions[body.key];
    else store.conclusions[body.key] = body.value;
  } else if (body.type === "competencia") {
    store.competencia = body.value;
  } else if (body.type === "linkedin") {
    store.linkedin = body.value;
  } else if (body.type === "facebook") {
    store.facebook = body.value;
  } else if (body.type === "instagram") {
    store.instagram = body.value;
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
