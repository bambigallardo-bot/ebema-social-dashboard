import { readStore } from "../../../lib/store";
import { draftConclusion } from "../../../lib/draft";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MARCA = "Ebema";

// Borrador analítico de una conclusión (solo en modo edición). No guarda nada:
// devuelve el texto para que el equipo lo revise en el editor.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const pass = process.env.EDIT_PASSWORD;
  if (!pass || body.password !== pass) return Response.json({ error: "Clave incorrecta" }, { status: 401 });
  if (!body.id || typeof body.id !== "string") return Response.json({ error: "falta id" }, { status: 400 });

  const origin = new URL(req.url).origin;
  let store = {};
  let dashboard = null;
  try {
    [store, dashboard] = await Promise.all([
      readStore().catch(() => ({})),
      fetch(`${origin}/api/dashboard`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const text = await draftConclusion({
      marca: MARCA,
      id: body.id,
      autoText: typeof body.autoText === "string" ? body.autoText : "",
      currentText: typeof body.currentText === "string" ? body.currentText : "",
      store: store || {},
      dashboard,
    });
    return Response.json({ text });
  } catch (e) {
    console.error("[draft]", e);
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
