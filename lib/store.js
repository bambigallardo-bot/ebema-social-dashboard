// Almacenamiento compartido en Vercel Blob (gratis en Hobby). Soporta dos modos de auth:
//  - OIDC (lo nuevo de Vercel): inyecta BLOB_STORE_ID y el SDK se autentica solo (sin token).
//  - Token clásico: BLOB_READ_WRITE_TOKEN.
import { put, list } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const NAME = "ebema-overrides.json";
// Si hay token estático se pasa; con OIDC se omite y el SDK usa las credenciales del runtime.
const auth = TOKEN ? { token: TOKEN } : {};

export function kvEnabled() {
  return !!(TOKEN || process.env.BLOB_STORE_ID);
}

export async function readStore() {
  if (!kvEnabled()) return {};
  try {
    const { blobs } = await list({ prefix: NAME, limit: 1, ...auth });
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
  if (!kvEnabled()) throw new Error("Blob no configurado");
  await put(NAME, JSON.stringify(obj), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
    ...auth,
  });
  return true;
}
