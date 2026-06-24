// Google Ads (API REST en vivo) para el bloque de performance/paid.
// Sin librería pesada: se mintea un access token desde el refresh token y se
// consulta el endpoint googleAds:search con GAQL.
//
// Variables de entorno:
//   GOOGLE_ADS_DEVELOPER_TOKEN     (obligatoria)
//   GOOGLE_ADS_CUSTOMER_ID         (obligatoria) id de la cuenta Ebema, solo dígitos
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID   (opcional) id de la MCC, solo dígitos
//   OAuth (caen a GOOGLE_OAUTH_* si no se definen los GOOGLE_ADS_*):
//     GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN
//   GOOGLE_ADS_API_VERSION         (opcional) por defecto v18

const VERSION = process.env.GOOGLE_ADS_API_VERSION || "v18";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (s) => (s || "").replace(/\D/g, "");

const round = (n, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
};
const div = (a, b, d = 1) => (b ? round((a / b) * 100, d) : 0);

let _token = { value: null, exp: 0 };
async function accessToken() {
  if (_token.value && Date.now() < _token.exp) return _token.value;
  const client_id = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const client_secret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token = process.env.GOOGLE_ADS_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error("Faltan credenciales OAuth de Google Ads (CLIENT_ID/SECRET/REFRESH_TOKEN)");
  }
  const body = new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth Google Ads falló: ${json.error_description || json.error || res.status}`);
  }
  _token = { value: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
  return _token.value;
}

async function gaqlSearch(query, attempt = 0) {
  const cid = onlyDigits(process.env.GOOGLE_ADS_CUSTOMER_ID);
  if (!cid) throw new Error("Falta GOOGLE_ADS_CUSTOMER_ID");
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!dev) throw new Error("Falta GOOGLE_ADS_DEVELOPER_TOKEN");
  const login = onlyDigits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  const token = await accessToken();
  const headers = {
    authorization: `Bearer ${token}`,
    "developer-token": dev,
    "content-type": "application/json",
  };
  if (login) headers["login-customer-id"] = login;

  const rows = [];
  let pageToken;
  for (let p = 0; p < 20; p++) {
    const res = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${cid}/googleAds:search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, pageToken }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(1000 * Math.pow(2, attempt));
        return gaqlSearch(query, attempt + 1);
      }
      throw new Error(`Google Ads ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    rows.push(...(json.results || []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
    await sleep(120);
  }
  return rows;
}

const monthKeyOf = (m) => (m && m.length >= 7 ? m.slice(0, 7) : null); // "2026-05-01" -> "2026-05"
const micros = (v) => (Number(v) || 0) / 1e6;

export async function getGoogleAds(months) {
  const since = months[0].since;
  const endParts = months[months.length - 1].until.split("-").map(Number);
  const endD = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  endD.setUTCDate(endD.getUTCDate() - 1);
  const until = endD.toISOString().slice(0, 10);

  // 1) Campañas por mes (de aquí salen también los totales mensuales).
  const campRows = await gaqlSearch(
    `SELECT campaign.name, segments.month, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros ` +
      `FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`
  );

  const campaignsByMonth = {};
  for (const r of campRows) {
    const key = monthKeyOf(r.segments?.month);
    if (!key) continue;
    const m = r.metrics || {};
    const cost = micros(m.costMicros);
    const clicks = Number(m.clicks) || 0;
    const impressions = Number(m.impressions) || 0;
    const conversions = round(Number(m.conversions) || 0, 1);
    (campaignsByMonth[key] = campaignsByMonth[key] || []).push({
      name: r.campaign?.name || "(sin nombre)",
      cost: round(cost),
      impressions,
      clicks,
      conversions,
      ctr: div(clicks, impressions, 2),
      costPerConv: conversions ? round(cost / conversions) : null,
    });
  }
  for (const k of Object.keys(campaignsByMonth)) campaignsByMonth[k].sort((a, b) => b.conversions - a.conversions);

  const monthly = months.map((mm) => {
    const camps = campaignsByMonth[mm.key] || [];
    const sum = (k) => camps.reduce((a, c) => a + (c[k] || 0), 0);
    const cost = sum("cost");
    const clicks = sum("clicks");
    const impressions = sum("impressions");
    const conversions = round(sum("conversions"), 1);
    return {
      key: mm.key,
      cost: round(cost),
      impressions,
      clicks,
      conversions,
      ctr: div(clicks, impressions, 2),
      cpc: clicks ? round(cost / clicks) : null,
      costPerConv: conversions ? round(cost / conversions) : null,
    };
  });

  // 2) Keywords por mes (top por conversiones).
  const keywordsByMonth = {};
  try {
    const kwRows = await gaqlSearch(
      `SELECT ad_group_criterion.keyword.text, segments.month, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros ` +
        `FROM keyword_view WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.impressions > 0 ` +
        `ORDER BY metrics.conversions DESC`
    );
    for (const r of kwRows) {
      const key = monthKeyOf(r.segments?.month);
      if (!key) continue;
      const m = r.metrics || {};
      const clicks = Number(m.clicks) || 0;
      const impressions = Number(m.impressions) || 0;
      (keywordsByMonth[key] = keywordsByMonth[key] || []).push({
        text: r.adGroupCriterion?.keyword?.text || "(sin keyword)",
        impressions,
        clicks,
        conversions: round(Number(m.conversions) || 0, 1),
        ctr: div(clicks, impressions, 2),
        cost: round(micros(m.costMicros)),
      });
    }
    for (const k of Object.keys(keywordsByMonth)) {
      keywordsByMonth[k].sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);
      keywordsByMonth[k] = keywordsByMonth[k].slice(0, 12);
    }
  } catch (_) {}

  return { currency: "CLP", monthly, campaignsByMonth, keywordsByMonth };
}
