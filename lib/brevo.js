// Cliente de Brevo (solo Email Marketing) para la sección "Ebema Click · Email".
// Misma lógica defensiva que el dashboard de Brevo: reintentos ante 429/IP/5xx.

const BASE = "https://api.brevo.com/v3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_PAGES = Number(process.env.MAX_PAGES || 3);

async function brevoGet(path, attempt = 0) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("Falta la variable BREVO_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "api-key": key, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const transient =
      /unauthorized|unrecognised|unrecognized/i.test(text) || res.status === 429 || res.status >= 500;
    if (transient && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 600 * Math.pow(2, attempt);
      await sleep(wait);
      return brevoGet(path, attempt + 1);
    }
    const err = new Error(`Brevo ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function brevoGetAll(pathBase, key, limit = 50) {
  const all = [];
  let offset = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const data = await brevoGet(`${pathBase}${sep}limit=${limit}&offset=${offset}`);
    const batch = data[key] || [];
    all.push(...batch);
    const count = data.count || 0;
    offset += limit;
    if (batch.length < limit || (count && offset >= count)) break;
    await sleep(250);
  }
  return all;
}

const pct = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);

export async function getEmail() {
  const raw = await brevoGetAll("/emailCampaigns?statistics=globalStats&sort=desc", "campaigns");
  const campaigns = raw
    .map((c) => {
      const s = (c.statistics && c.statistics.globalStats) || {};
      const sent = s.sent || 0;
      const delivered = s.delivered || 0;
      const opens = s.uniqueViews || 0;
      const clicks = s.uniqueClicks || 0;
      const clickers = s.uniqueClicks || 0;
      const softBounces = s.softBounces || 0;
      const hardBounces = s.hardBounces || 0;
      const bounces = softBounces + hardBounces;
      const unsubs = s.unsubscriptions || 0;
      const date = c.sentDate || c.scheduledAt || null;
      return {
        id: c.id,
        name: c.name,
        subject: c.subject || "",
        date,
        monthKey: date ? `${new Date(date).getUTCFullYear()}-${String(new Date(date).getUTCMonth() + 1).padStart(2, "0")}` : null,
        sent,
        delivered,
        opens,
        clicks,
        bounces,
        unsubs,
        openRate: pct(opens, delivered),
        clickRate: pct(clicks, delivered),
        ctor: pct(clickers, opens), // click-to-open rate, el KPI del informe
        bounceRate: pct(bounces, sent),
        deliveryRate: pct(delivered, sent),
      };
    })
    .filter((c) => c.date);

  return { campaigns };
}
