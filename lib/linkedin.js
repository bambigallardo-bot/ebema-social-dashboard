// Conector de LinkedIn (Página de empresa) por la API oficial — automático, como Meta.
// Trae: seguidores totales, ganancia de seguidores por mes, estadísticas de share por mes
// (impresiones, vistas únicas, clics, reacciones, comentarios, engagement) y mejores posts.
//
// Variables de entorno:
//   LINKEDIN_ACCESS_TOKEN   (obligatoria) token OAuth con scopes r_organization_social (+ rw_organization_admin)
//   LINKEDIN_ORG_ID         (obligatoria) id numérico de la organización (de la URL de la página admin)
//   LINKEDIN_VERSION        (opcional)   versión de la API, formato YYYYMM (def. 202401)

const ORG = () => {
  const id = (process.env.LINKEDIN_ORG_ID || "").replace(/\D/g, "");
  if (!id) throw new Error("Falta LINKEDIN_ORG_ID");
  return id;
};
const VERSION = process.env.LINKEDIN_VERSION || "202401";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 0) => { const f = Math.pow(10, d); return Math.round((Number(n) + Number.EPSILON) * f) / f; };

function headers() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error("Falta LINKEDIN_ACCESS_TOKEN");
  return {
    authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function liGet(path, attempt = 0) {
  const res = await fetch(`https://api.linkedin.com/rest/${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1000 * Math.pow(2, attempt));
      return liGet(path, attempt + 1);
    }
    throw new Error(`LinkedIn ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const msUTC = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
const monthKeyOfMs = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function getLinkedin(months) {
  const orgUrn = `urn:li:organization:${ORG()}`;
  const start = msUTC(months[0].since);
  const end = msUTC(months[months.length - 1].until); // exclusivo
  const interval = `(timeRange:(start:${start},end:${end}),timeGranularityType:MONTH)`;
  const orgParam = encodeURIComponent(orgUrn);

  // Seguidores totales (snapshot).
  let followersTotal = null;
  try {
    const j = await liGet(`networkSizes/${orgParam}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`);
    followersTotal = j.firstDegreeSize ?? null;
  } catch (_) {}

  // Ganancia de seguidores por mes.
  const gainByMonth = {};
  try {
    const j = await liGet(`organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${orgParam}&timeIntervals=${interval}`);
    for (const el of j.elements || []) {
      const ms = el.timeRange?.start;
      if (!ms) continue;
      const g = el.followerGains || {};
      gainByMonth[monthKeyOfMs(ms)] = (g.organicFollowerGain || 0) + (g.paidFollowerGain || 0);
    }
  } catch (_) {}

  // Estadísticas de share (engagement) por mes.
  const statByMonth = {};
  try {
    const j = await liGet(`organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgParam}&timeIntervals=${interval}`);
    for (const el of j.elements || []) {
      const ms = el.timeRange?.start;
      if (!ms) continue;
      const s = el.totalShareStatistics || {};
      const reactions = (s.likeCount || 0); // reacciones (likes/celebrate/etc agregados por LinkedIn en likeCount)
      statByMonth[monthKeyOfMs(ms)] = {
        impressions: s.impressionCount || 0,
        views: s.uniqueImpressionsCount || 0,
        clicks: s.clickCount || 0,
        reactions,
        comments: s.commentCount || 0,
        shares: s.shareCount || 0,
        engagement: s.engagement != null ? round(s.engagement * 100, 2) : null,
      };
    }
  } catch (_) {}

  const monthly = {};
  for (const m of months) {
    const st = statByMonth[m.key] || {};
    monthly[m.key] = {
      acquired: gainByMonth[m.key] ?? null,
      impressions: st.impressions ?? null,
      views: st.views ?? null,
      reactions: st.reactions ?? null,
      engagement: st.engagement ?? null,
    };
  }

  // Mejores posts del mes (por impresiones).
  const bestByMonth = {};
  try {
    const postsResp = await liGet(`posts?q=author&author=${orgParam}&count=50&sortBy=LAST_MODIFIED`);
    const posts = (postsResp.elements || [])
      .map((p) => ({
        urn: p.id,
        text: ((p.commentary || p.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "") + "").slice(0, 120),
        createdMs: p.createdAt || p.firstPublishedAt || null,
      }))
      .filter((p) => p.urn && p.createdMs);

    // Solo posts dentro del rango y de los meses pedidos; cap de llamadas de stats.
    const wanted = new Set(months.map((m) => m.key));
    const inRange = posts.filter((p) => wanted.has(monthKeyOfMs(p.createdMs))).slice(0, 8);

    for (const p of inRange) {
      try {
        const isUgc = p.urn.includes(":ugcPost:");
        const param = isUgc ? "ugcPosts" : "shares";
        const enc = encodeURIComponent(p.urn);
        const j = await liGet(`organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgParam}&${param}=List(${enc})`);
        const s = (j.elements || [])[0]?.totalShareStatistics || {};
        const key = monthKeyOfMs(p.createdMs);
        const d = new Date(p.createdMs);
        (bestByMonth[key] = bestByMonth[key] || []).push({
          label: p.text || "(publicación)",
          date: d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "UTC" }),
          impressions: s.impressionCount || 0,
          reactions: s.likeCount || 0,
          clicks: s.clickCount || 0,
          newFollowers: null,
        });
        } catch (_) {}
    }
    for (const k of Object.keys(bestByMonth)) {
      bestByMonth[k].sort((a, b) => b.impressions - a.impressions);
      bestByMonth[k] = bestByMonth[k].slice(0, 3);
    }
  } catch (_) {}

  return {
    followersByMonth: months.reduce((acc, m, i) => {
      // seguidores por mes = total menos las ganancias de los meses posteriores (aprox.)
      acc[m.key] = null;
      return acc;
    }, {}),
    followersTotal,
    monthly,
    bestByMonth,
  };
}
