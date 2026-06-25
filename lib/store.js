// Almacenamiento compartido en Vercel Blob (gratis en plan Hobby) para lo que el equipo
// edita en modo edición: overrides de conclusiones y la tabla de competencia. Así el
// cliente ve la versión editada en el link normal.
// Variable: BLOB_READ_WRITE_TOKEN (se setea solo al crear un store Blob en Vercel).
import { put, list } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const NAME = "ebema-overrides.json";

export function kvEnabled() {
  return !!TOKEN;
}

export async function readStore() {
  if (!TOKEN) return {};
  try {
    const { blobs } = await list({ prefix: NAME, token: TOKEN, limit: 1 });
    const b = blobs.find((x) => x.pathname === NAME) || blobs[0];
    if (!b) return {};
    const res = await fetch(`${b.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return {};
    return await res.json();
  } catch (_) {
    return {};
  }
}

export async function writeStore(obj) {
  if (!TOKEN) throw new Error("Blob no configurado");
  await put(NAME, JSON.stringify(obj), {
    access: "public",
    token: TOKEN,
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
  return true;
}
