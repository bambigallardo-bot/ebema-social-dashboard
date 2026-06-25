import { getMetaDashboard } from "../../../lib/meta";
import { getEmail, getWhatsapp } from "../../../lib/brevo";
import { getGoogleAds } from "../../../lib/googleads";
import { getGA4 } from "../../../lib/ga4";
import { getLinkedin } from "../../../lib/linkedin";
import manual from "../../../data/manual.json";

// Más tiempo de ejecución (muchas APIs externas). Hobby admite hasta 60s.
export const maxDuration = 60;

// Devuelve los últimos N meses (incluido el actual) como { key, since, until }.
function lastMonths(n) {
  const out = [];
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const p = (x) => String(x).padStart(2, "0");
  const ymd = (d) => `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 1));
    out.push({ key: `${start.getUTCFullYear()}-${p(start.getUTCMonth() + 1)}`, since: ymd(start), until: ymd(end) });
  }
  return out;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Caché en memoria para no golpear las APIs en cada visita.
let _cache = { at: 0, data: null };
const CACHE_MS = Number(process.env.DASHBOARD_CACHE_MS || 600000); // 10 min

export async function GET() {
  const now = Date.now();
  if (_cache.data && now - _cache.at < CACHE_MS) {
    return Response.json(_cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const months = lastMonths(Number(process.env.SOCIAL_MONTHS || 12));

    // Corta una fuente lenta para que la función nunca exceda el límite de Vercel y siempre devuelva JSON.
    const withTimeout = (p, ms, label) =>
      Promise.race([
        Promise.resolve().then(p),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: tardó más de ${ms / 1000}s`)), ms)),
      ]);
    const settle = async (fn, ms, label) => {
      try { return { value: await withTimeout(fn, ms, label) }; }
      catch (e) { return { error: String(e && e.message ? e.message : e) }; }
    };

    // En paralelo: cada fuente pega a una API distinta, así el tiempo total = la más lenta.
    // Cada una con su propio timeout para que ninguna tumbe la respuesta completa.
    const [meta, email, whatsapp, googleAds, ga4, linkedin] = await Promise.all([
      settle(getMetaDashboard, 55000, "Meta"),
      settle(getEmail, 25000, "Email"),
      settle(getWhatsapp, 25000, "WhatsApp"),
      settle(() => getGoogleAds(months), 35000, "Google Ads"),
      settle(() => getGA4(months), 35000, "GA4"),
      settle(() => getLinkedin(months), 25000, "LinkedIn"),
    ]);
    const m = meta.value || {};

    const result = {
      updatedAt: new Date().toISOString(),
      months: m.months || months.map((x) => x.key),
      instagram: m.instagram || null,
      facebook: m.facebook || null,
      ads: m.ads || null,
      googleAds: googleAds.value || null,
      ga4: ga4.value || null,
      linkedin: linkedin.value || null,
      email: email.value || null,
      whatsapp: whatsapp.value || null,
      manual: manual || null,
      errors: {
        ...(m.errors || {}),
        meta: meta.error || null,
        email: email.error || null,
        whatsapp: whatsapp.error || null,
        googleAds: googleAds.error || null,
        ga4: ga4.error || null,
        linkedin: linkedin.error || null,
      },
    };

    // Si una fuente falló esta vez pero teníamos datos buenos en caché, conserva los previos (no mostrar vacío).
    if (_cache.data) {
      for (const k of ["instagram", "facebook", "ads", "googleAds", "ga4", "linkedin", "email", "whatsapp"]) {
        if (result[k] == null && _cache.data[k] != null) result[k] = _cache.data[k];
      }
    }

    // Solo cachea si al menos una fuente vino bien (no cachear fallos totales/transitorios).
    const anyOk = result.instagram || result.facebook || result.ads || result.googleAds || result.ga4 || result.linkedin || result.email || result.whatsapp;
    // NO congelar un estado sin Meta (IG/FB/Ads): si Meta no trajo nada esta vez, devuelve lo que haya
    // pero no lo cachees, así la próxima carga reintenta Meta en vez de quedarse vacío 10 min.
    const metaPresent = !!(result.instagram || result.facebook || result.ads);
    if (anyOk) {
      if (metaPresent) _cache = { at: Date.now(), data: result };
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (_cache.data) {
      return Response.json({ ..._cache.data, stale: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (_cache.data) {
      return Response.json({ ..._cache.data, stale: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(
      { error: String(err && err.message ? err.message : err) },
      { status: 500 }
    );
  }
}
