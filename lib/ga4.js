// GA4 (Google Analytics) para la sección de performance del sitio.
// Reutiliza las mismas credenciales que el dashboard de Brevo:
//   GA4_PROPERTY_ID  + (GOOGLE_OAUTH_* refresh token)  ó  (GA_SERVICE_ACCOUNT_JSON)

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { OAuth2Client } from "google-auth-library";

let _client;
function getClient() {
  if (_client) return _client;

  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (refresh) {
    const oauth = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    oauth.setCredentials({ refresh_token: refresh });
    _client = new BetaAnalyticsDataClient({ authClient: oauth });
    return _client;
  }

  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const creds = JSON.parse(raw);
    _client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: creds.client_email,
        private_key: (creds.private_key || "").replace(/\\n/g, "\n"),
      },
    });
    return _client;
  }
  return null;
}

const ym = (v) => (v && v.length >= 6 ? `${v.slice(0, 4)}-${v.slice(4, 6)}` : null);
const round = (n, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
};

export async function getGA4(months) {
  const propertyRaw = process.env.GA4_PROPERTY_ID;
  const client = getClient();
  if (!client || !propertyRaw) return null;
  const property = `properties/${propertyRaw.replace(/^properties\//, "")}`;

  const startDate = months[0].since;
  const endParts = months[months.length - 1].until.split("-").map(Number);
  const endD = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  endD.setUTCDate(endD.getUTCDate() - 1);
  const endDate = endD.toISOString().slice(0, 10);
  const dateRanges = [{ startDate, endDate }];

  // --- Métricas mensuales del sitio ---
  // keyEvents puede no existir en propiedades antiguas -> fallback a conversions.
  const baseMetrics = ["activeUsers", "sessions", "screenPageViews", "eventCount", "averageSessionDuration"];
  async function siteReport(convMetric) {
    const [resp] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "yearMonth" }],
      metrics: [...baseMetrics, { name: convMetric }].map((m) => (typeof m === "string" ? { name: m } : m)),
    });
    return resp;
  }
  let convName = "keyEvents";
  let siteResp;
  try {
    siteResp = await siteReport("keyEvents");
  } catch (_) {
    convName = "conversions";
    try {
      siteResp = await siteReport("conversions");
    } catch (e) {
      throw new Error(`GA4 runReport falló: ${e.message || e}`);
    }
  }

  const byMonth = {};
  for (const row of siteResp.rows || []) {
    const key = ym(row.dimensionValues?.[0]?.value);
    if (!key) continue;
    const m = row.metricValues || [];
    byMonth[key] = {
      key,
      activeUsers: round(m[0]?.value || 0),
      sessions: round(m[1]?.value || 0),
      views: round(m[2]?.value || 0),
      events: round(m[3]?.value || 0),
      avgEngagementSec: round(m[4]?.value || 0),
      keyEvents: round(m[5]?.value || 0),
    };
  }
  const monthly = months.map((mm) => byMonth[mm.key] || { key: mm.key, activeUsers: 0, sessions: 0, views: 0, events: 0, avgEngagementSec: 0, keyEvents: 0 });

  // --- Fuentes de tráfico por canal y por mes ---
  const channelsByMonth = {};
  try {
    const [resp] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "yearMonth" }],
      metrics: [{ name: "sessions" }, { name: convName }],
      limit: 500,
    });
    for (const row of resp.rows || []) {
      const channel = row.dimensionValues?.[0]?.value || "(sin canal)";
      const key = ym(row.dimensionValues?.[1]?.value);
      if (!key) continue;
      (channelsByMonth[key] = channelsByMonth[key] || []).push({
        channel,
        sessions: round(row.metricValues?.[0]?.value || 0),
        keyEvents: round(row.metricValues?.[1]?.value || 0),
      });
    }
    for (const k of Object.keys(channelsByMonth)) {
      channelsByMonth[k].sort((a, b) => b.keyEvents - a.keyEvents || b.sessions - a.sessions);
    }
  } catch (_) {}

  return { monthly, channelsByMonth };
}
