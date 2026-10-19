// Almacenamiento compartido en Vercel Blob (gratis en Hobby). Soporta dos modos de auth:
//  - OIDC (lo nuevo de Vercel): inyecta BLOB_STORE_ID y el SDK se autentica solo (sin token).
//  - Token clásico: BLOB_READ_WRITE_TOKEN.
//
// Cada guardado crea un archivo NUEVO en `ebema-overrides/` (URL única) y se lee siempre el
// más reciente. Antes se sobrescribía un solo `ebema-overrides.json`, y eso borraba ediciones:
//  1) el CDN del Blob sigue sirviendo la versión vieja hasta ~60 s después de sobrescribir, así que
//     dos guardados seguidos partían del mismo estado viejo y el segundo pisaba al primero;
//  2) si la lectura fallaba se devolvía {} y el guardado escribía un store casi vacío encima de todo.
// Ahora una lectura fallida lanza error (no se guarda nada) y se conservan las últimas versiones
// como historial para poder recuperar.
import { put, list, del } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const LEGACY_NAME = "ebema-overrides.json";
const PREFIX = "ebema-overrides/";
const KEEP_VERSIONS = 40;
// Si hay token estático se pasa; con OIDC se omite y el SDK usa las credenciales del runtime.
const auth = TOKEN ? { token: TOKEN } : {};

export function kvEnabled() {
  return !!(TOKEN || process.env.BLOB_STORE_ID);
}

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, limit: 1000, cursor, ...auth });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function listVersions() {
  const blobs = await listAll(PREFIX);
  return blobs
    .filter((b) => b.pathname.endsWith(".json"))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer el store (${res.status})`);
  return await res.json();
}

// Lanza error si no puede leer: quien guarda NO debe seguir con un store vacío.
export async function readStore() {
  if (!kvEnabled()) return {};
  const versions = await listVersions();
  if (versions.length) return await fetchJson(versions[0].url);
  // Todavía no hay versiones: partir desde el archivo único de antes.
  const { blobs } = await list({ prefix: LEGACY_NAME, limit: 1, ...auth });
  const legacy = blobs.find((x) => x.pathname === LEGACY_NAME);
  if (!legacy) return {};
  return await fetchJson(`${legacy.url}?t=${Date.now()}`);
}

export async function writeStore(obj) {
  if (!kvEnabled()) throw new Error("Blob no configurado");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await put(`${PREFIX}${stamp}.json`, JSON.stringify(obj), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
    ...auth,
  });
  // Podar versiones viejas; si falla no importa, el guardado ya quedó.
  try {
    const versions = await listVersions();
    const old = versions.slice(KEEP_VERSIONS).map((b) => b.url);
    if (old.length) await del(old, auth);
  } catch (_) {}
  return true;
}
