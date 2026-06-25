// Almacenamiento compartido (Vercel KV / Upstash Redis REST) para lo que el equipo edita
// en modo edición: overrides de conclusiones y la tabla de competencia. Así el cliente ve
// la versión editada en el link normal. Si KV no está configurado, el route lo informa y
// el front cae a localStorage (por dispositivo).
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = "ebema:overrides";

export function kvEnabled() {
  return !!(URL && TOKEN);
}

export async function readStore() {
  if (!kvEnabled()) return {};
  try {
    const res = await fetch(`${URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    const j = await res.json();
    if (j && j.result) return JSON.parse(j.result);
  } catch (_) {}
  return {};
}

export async function writeStore(obj) {
  if (!kvEnabled()) throw new Error("KV no configurado");
  const res = await fetch(`${URL}/set/${KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`KV write ${res.status}`);
  return true;
}
