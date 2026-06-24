// Cliente de la Graph API de Meta (Instagram orgánico + Facebook orgánico + Meta Ads).
// Toda la lógica corre server-side; el token nunca llega al navegador.
//
// Variables de entorno:
//   META_ACCESS_TOKEN     (obligatoria) token de larga duración / system user con permisos
//   META_AD_ACCOUNT_ID    (paid)   id de la cuenta publicitaria, con o sin "act_"
//   META_PAGE_ID          (FB org) id de la página de Facebook
//   META_IG_USER_ID       (IG org) id de la cuenta de IG Business. Si falta, se resuelve desde la página.
//   META_GRAPH_VERSION    (opc.)   por defecto v21.0
//   SOCIAL_MONTHS         (opc.)   meses de historial a traer (def. 6)

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;
const MONTHS = Math.max(1, Number(process.env.SOCIAL_MONTHS || 6));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Devuelve los últimos N meses (incluido el actual) como { key:"2026-05", since, until, label }.
// `since` es el día 1; `until` es el día 1 del mes siguiente (exclusivo, como pide la Graph API).
function lastMonths(n) {
  const out = [];
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 1));
    const key = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`;
    out.push({ key, since: ymd(start), until: ymd(end) });
  }
  return out;
}

const monthKeyOf = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("Falta la variable META_ACCESS_TOKEN");
  return t;
}

// GET a la Graph API con reintentos ante errores transitorios (rate limit / 5xx).
async function metaGet(path, params = {}, attempt = 0) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("access_token", token());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  let res;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch (e) {
    if (attempt < 4) {
      await sleep(600 * Math.pow(2, attempt));
      return metaGet(path, params, attempt + 1);
    }
    throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = json.error || {};
    // Códigos de rate limit de Meta: 4, 17, 32, 613, 80001…; o HTTP 429/5xx.
    const transient =
      res.status === 429 ||
      res.status >= 500 ||
      [4, 17, 32, 613, 80001, 80002, 80003, 80004].includes(err.code);
    if (transient && attempt < 4) {
      await sleep(1000 * Math.pow(2, attempt));
      return metaGet(path, params, attempt + 1);
    }
    const e = new Error(`Meta ${res.status} (${err.code || "?"}): ${err.message || JSON.stringify(json)}`);
    e.status = res.status;
    e.code = err.code;
    throw e;
  }
  return json;
}

const round = (n, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
};
const div = (a, b, d = 1) => (b ? round((a / b) * 100, d) : 0);

// ---------------- Instagram (orgánico) ----------------

// Métrica agregada del rango (reach, views, profile_views, etc.) usando metric_type=total_value.
async function igTotal(igId, metric, since, until) {
  try {
    const j = await metaGet(`/${igId}/insights`, { metric, metric_type: "total_value", period: "day", since, until });
    const row = (j.data || [])[0];
    const v = row?.total_value?.value;
    return typeof v === "number" ? v : null;
  } catch (_) {
    return null;
  }
}

// Métrica serie-de-tiempo (un valor por día); se suma sobre el rango. Ej: follower_count.
async function igSum(igId, metric, since, until) {
  try {
    const j = await metaGet(`/${igId}/insights`, { metric, period: "day", since, until });
    const values = (j.data || [])[0]?.values || [];
    return values.reduce((a, v) => a + (Number(v.value) || 0), 0);
  } catch (_) {
    return null;
  }
}

// Resuelve el id de la cuenta de IG Business conectada a la página de FB.
async function resolveIgId() {
  if (process.env.META_IG_USER_ID) return process.env.META_IG_USER_ID;
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) return null;
  const j = await metaGet(`/${pageId}`, { fields: "instagram_business_account{id,username}" });
  return j.instagram_business_account?.id || null;
}

async function getInstagram(months) {
  const igId = await resolveIgId();
  if (!igId) throw new Error("No hay META_IG_USER_ID ni IG vinculado a la página (instagram_business_account).");

  const profile = await metaGet(`/${igId}`, { fields: "username,followers_count,media_count" });

  // Media reciente para contar posts del mes y elegir los mejores por alcance.
  const media = [];
  try {
    let next = `/${igId}/media`;
    let params = { fields: "id,caption,media_type,timestamp,permalink,like_count,comments_count,insights.metric(reach)", limit: 50 };
    for (let p = 0; p < 4 && next; p++) {
      const j = await metaGet(next, params);
      for (const it of j.data || []) {
        const reach = (it.insights?.data || []).find((m) => m.name === "reach")?.values?.[0]?.value ?? null;
        media.push({
          id: it.id,
          caption: (it.caption || "").slice(0, 140),
          type: it.media_type,
          date: it.timestamp,
          permalink: it.permalink,
          likes: it.like_count || 0,
          comments: it.comments_count || 0,
          reach,
          monthKey: monthKeyOf(it.timestamp),
        });
      }
      const after = j.paging?.cursors?.after;
      if (after && j.paging?.next) { next = `/${igId}/media`; params = { ...params, after }; }
      else next = null;
      await sleep(150);
    }
  } catch (_) {}

  const monthly = [];
  for (const m of months) {
    const [reach, views, interactions, profileViews, webClicks, newFollowers] = [
      await igTotal(igId, "reach", m.since, m.until),
      (await igTotal(igId, "views", m.since, m.until)) ?? (await igTotal(igId, "impressions", m.since, m.until)),
      await igTotal(igId, "total_interactions", m.since, m.until),
      await igTotal(igId, "profile_views", m.since, m.until),
      await igTotal(igId, "website_clicks", m.since, m.until),
      await igSum(igId, "follower_count", m.since, m.until),
    ];
    const posts = media.filter((x) => x.monthKey === m.key).length;
    const engagement = reach ? div(interactions || 0, reach, 2) : null;
    monthly.push({
      key: m.key,
      reach,
      views,
      interactions,
      profileViews,
      webClicks,
      newFollowers,
      posts,
      engagement,
    });
    await sleep(120);
  }

  const bestByMonth = {};
  for (const m of months) {
    const inMonth = media.filter((x) => x.monthKey === m.key && x.reach != null);
    inMonth.sort((a, b) => (b.reach || 0) - (a.reach || 0));
    bestByMonth[m.key] = inMonth.slice(0, 3);
  }

  return {
    username: profile.username || null,
    followers: profile.followers_count ?? null,
    mediaCount: profile.media_count ?? null,
    monthly,
    bestByMonth,
  };
}

// ---------------- Facebook (orgánico) ----------------

async function fbSum(pageId, metric, since, until) {
  try {
    const j = await metaGet(`/${pageId}/insights`, { metric, period: "day", since, until });
    const values = (j.data || [])[0]?.values || [];
    return values.reduce((a, v) => a + (Number(v.value) || 0), 0);
  } catch (_) {
    return null;
  }
}

async function getFacebook(months) {
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) throw new Error("Falta la variable META_PAGE_ID");

  const profile = await metaGet(`/${pageId}`, { fields: "name,followers_count,fan_count" });

  // Posts recientes para contar publicaciones del mes y mejores por alcance.
  const posts = [];
  try {
    const j = await metaGet(`/${pageId}/published_posts`, {
      fields: "message,created_time,permalink_url,insights.metric(post_impressions_unique,post_impressions)",
      limit: 50,
    });
    for (const it of j.data || []) {
      const ins = it.insights?.data || [];
      const reach = ins.find((m) => m.name === "post_impressions_unique")?.values?.[0]?.value
        ?? ins.find((m) => m.name === "post_impressions")?.values?.[0]?.value ?? null;
      posts.push({
        id: it.id,
        message: (it.message || "").slice(0, 140),
        date: it.created_time,
        permalink: it.permalink_url,
        reach,
        monthKey: monthKeyOf(it.created_time),
      });
    }
  } catch (_) {}

  const monthly = [];
  for (const m of months) {
    const [impressions, reach, engagement, fanAdds, views] = [
      await fbSum(pageId, "page_impressions", m.since, m.until),
      await fbSum(pageId, "page_impressions_unique", m.since, m.until),
      await fbSum(pageId, "page_post_engagements", m.since, m.until),
      await fbSum(pageId, "page_fan_adds", m.since, m.until),
      await fbSum(pageId, "page_views_total", m.since, m.until),
    ];
    const count = posts.filter((p) => p.monthKey === m.key).length;
    monthly.push({
      key: m.key,
      impressions, // "visualizaciones"
      reach, // "espectadores"
      engagement, // "interacciones"
      fanAdds, // "nuevos seguidores"
      profileViews: views, // "visitas al perfil"
      posts: count,
    });
    await sleep(120);
  }

  const bestByMonth = {};
  for (const m of months) {
    const inMonth = posts.filter((p) => p.monthKey === m.key && p.reach != null);
    inMonth.sort((a, b) => (b.reach || 0) - (a.reach || 0));
    bestByMonth[m.key] = inMonth.slice(0, 3);
  }

  return {
    name: profile.name || null,
    followers: profile.followers_count ?? profile.fan_count ?? null,
    monthly,
    bestByMonth,
  };
}

// ---------------- Meta Ads (paid) ----------------

const MSG_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];

function pickAction(actions, types) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) total += Number(a.value) || 0;
  }
  return total;
}

async function getMetaAds(months) {
  const acc = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  if (!acc) throw new Error("Falta la variable META_AD_ACCOUNT_ID");

  const since = months[0].since;
  const lastEnd = new Date(months[months.length - 1].until);
  lastEnd.setUTCDate(lastEnd.getUTCDate() - 1); // until exclusivo -> último día real
  const until = ymd(lastEnd);

  // Una sola llamada: nivel campaña, desglose mensual. Cada fila = campaña × mes.
  const rows = [];
  try {
    let path = `/act_${acc}/insights`;
    let params = {
      level: "campaign",
      time_increment: "monthly",
      time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,actions",
      limit: 200,
    };
    for (let p = 0; p < 6 && path; p++) {
      const j = await metaGet(path, params);
      rows.push(...(j.data || []));
      if (j.paging?.next) {
        const u = new URL(j.paging.next);
        path = u.pathname.replace(`/${VERSION}`, "");
        params = {};
        for (const [k, v] of u.searchParams.entries()) if (k !== "access_token") params[k] = v;
      } else path = null;
      await sleep(150);
    }
  } catch (e) {
    throw e;
  }

  const byMonth = new Map();
  for (const r of rows) {
    const key = monthKeyOf(r.date_start);
    if (!key) continue;
    const conv = pickAction(r.actions, MSG_ACTIONS);
    const spend = Number(r.spend) || 0;
    const campaign = {
      id: r.campaign_id,
      name: r.campaign_name || "(sin nombre)",
      spend,
      impressions: Number(r.impressions) || 0,
      reach: Number(r.reach) || 0,
      clicks: Number(r.clicks) || 0,
      ctr: r.ctr != null ? round(Number(r.ctr), 2) : null,
      cpc: r.cpc != null ? round(Number(r.cpc)) : null,
      conversations: conv,
      cpr: conv ? round(spend / conv) : null,
    };
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(campaign);
  }

  const monthly = months.map((m) => {
    const camps = (byMonth.get(m.key) || []).sort((a, b) => b.conversations - a.conversations);
    const sum = (k) => camps.reduce((a, c) => a + (c[k] || 0), 0);
    const spend = sum("spend");
    const conversations = sum("conversations");
    return {
      key: m.key,
      spend: round(spend),
      impressions: sum("impressions"),
      reach: sum("reach"),
      clicks: sum("clicks"),
      conversations,
      cpr: conversations ? round(spend / conversations) : null,
      ctr: sum("impressions") ? div(sum("clicks"), sum("impressions"), 2) : null,
      campaigns: camps,
    };
  });

  return { currency: "CLP", monthly };
}

// ---------------- Orquestador ----------------

export async function getMetaDashboard() {
  const months = lastMonths(MONTHS);

  const settle = async (fn) => {
    try {
      return { value: await fn() };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  };

  // Secuencial para no gatillar el rate limit de la Graph API.
  const ig = await settle(() => getInstagram(months));
  await sleep(300);
  const fb = await settle(() => getFacebook(months));
  await sleep(300);
  const ads = await settle(() => getMetaAds(months));

  return {
    months: months.map((m) => m.key),
    instagram: ig.value || null,
    facebook: fb.value || null,
    ads: ads.value || null,
    errors: {
      instagram: ig.error || null,
      facebook: fb.error || null,
      ads: ads.error || null,
    },
  };
}
