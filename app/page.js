"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const REFRESH_MS = 300000; // 5 min
const BRAND = "#e11d48"; // rojo de marca (personalización Ebema)
const BRAND_DARK = "#9f1239";
const COLORS = ["#fb7185", "#60a5fa", "#4ade80", "#a78bfa", "#fbbf24", "#22d3ee", "#fb923c", "#94a3b8"];

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("es-CL") : n ?? "—");
const fmtPct = (n) => (typeof n === "number" ? `${n}%`.replace(".", ",") : "—");
const fmtMoney = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("es-CL")}` : "—");
const fmtDuration = (s) => {
  if (typeof s !== "number") return "—";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const monthLabel = (key) => {
  if (!key) return "—";
  const [y, m] = key.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const monthName = (key) => {
  if (!key) return "el mes";
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CL", { month: "long", timeZone: "UTC" });
};

// Variación porcentual cur vs prev -> { pct, dir: 1|0|-1 }
function delta(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  return { pct, dir: pct > 0 ? 1 : pct < 0 ? -1 : 0 };
}

// ---------------- UI helpers ----------------
function Card({ label, value, accent, change }) {
  const arrow = change ? (change.dir > 0 ? "▲" : change.dir < 0 ? "▼" : "▬") : null;
  const color = change ? (change.dir > 0 ? "#4ade80" : change.dir < 0 ? "#f87171" : "#8aa0bf") : null;
  return (
    <div style={{ background: "#131c30", border: "1px solid #1f2b45", borderRadius: 14, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#8aa0bf", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || "#e6edf6" }}>{value}</div>
      {change && (
        <div style={{ fontSize: 12, color, marginTop: 4 }}>
          {arrow} {Math.abs(change.pct).toLocaleString("es-CL")}% <span style={{ color: "#5b6b84" }}>vs mes ant.</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, subtitle }) {
  return (
    <section style={{ marginTop: 44 }}>
      <h2 style={{ fontSize: 19, margin: 0 }}>{title}</h2>
      {subtitle && <div style={{ color: "#8aa0bf", fontSize: 13, margin: "4px 0 0" }}>{subtitle}</div>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 });
const panel = { background: "#131c30", border: "1px solid #1f2b45", borderRadius: 14, padding: 16 };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#131c30", borderRadius: 14, overflow: "hidden" };
const th = { textAlign: "left", padding: "10px 12px", color: "#8aa0bf", borderBottom: "1px solid #1f2b45", fontWeight: 600 };
const td = { padding: "10px 12px", borderBottom: "1px solid #1f2b45" };
const manualBadge = { fontSize: 11, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 6, padding: "2px 7px", marginLeft: 8, verticalAlign: "middle" };
const chromeBadge = { fontSize: 11, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 6, padding: "2px 7px", marginLeft: 8, verticalAlign: "middle" };
const autoBadge = { fontSize: 11, fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)", borderRadius: 6, padding: "2px 7px", marginLeft: 8, verticalAlign: "middle" };
const alertBox = { background: "#3a2e12", border: "1px solid #6b521f", color: "#f5d98b", padding: "12px 16px", borderRadius: 12, fontSize: 13.5 };
const toneColor = { good: "#4ade80", warn: "#fbbf24", bad: "#f87171", info: "#60a5fa" };

const miniBtn = { background: "#0b1220", color: "#cdd9ee", border: "1px solid #1f2b45", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12 };

// Conclusión auto-redactada, editable por el usuario (override guardado en localStorage).
function Conclusion({ id, text }) {
  const [override, setOverride] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const storeKey = id ? `concl:${id}` : null;
  useEffect(() => {
    if (!storeKey) return;
    try { setOverride(localStorage.getItem(storeKey)); } catch (_) {}
  }, [storeKey]);
  if (!text && !override) return null;
  const shown = (override ?? text) || "";
  const save = () => { try { localStorage.setItem(storeKey, draft); } catch (_) {} setOverride(draft); setEditing(false); };
  const reset = () => { try { localStorage.removeItem(storeKey); } catch (_) {} setOverride(null); setEditing(false); };
  return (
    <div style={{ ...panel, borderLeft: `3px solid ${override ? BRAND : "#a78bfa"}`, marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 11, color: override ? BRAND : "#a78bfa", fontWeight: 600, letterSpacing: 0.4 }}>📝 CONCLUSIÓN {override ? "· EDITADA" : "AUTOMÁTICA"}</div>
        {storeKey && !editing && (
          <button className="no-print" onClick={() => { setDraft(shown); setEditing(true); }} style={miniBtn}>✏️ Editar</button>
        )}
      </div>
      {editing ? (
        <div className="no-print">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ width: "100%", boxSizing: "border-box", background: "#0b1220", color: "#e6edf6", border: "1px solid #1f2b45", borderRadius: 8, padding: 10, fontSize: 14, fontFamily: "inherit", lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={save} style={{ ...miniBtn, background: BRAND, color: "#fff", border: "none" }}>Guardar</button>
            <button onClick={reset} style={miniBtn}>Restaurar automática</button>
            <button onClick={() => setEditing(false)} style={miniBtn}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "#dbe5f3", whiteSpace: "pre-wrap" }}>{shown}</div>
      )}
    </div>
  );
}

function ChartBox({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 8 }}>{title}</div>
      <div style={{ ...panel, height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

const axis = { tick: { fill: "#8aa0bf", fontSize: 11 } };
const tip = { contentStyle: { background: "#0b1220", border: "1px solid #1f2b45" } };

// ---------------- Conclusiones automáticas (voz del informe) ----------------
const trend = (d, up = "aumentó", down = "disminuyó", flat = "se mantuvo estable") =>
  !d ? flat : d.dir > 0 ? up : d.dir < 0 ? down : flat;
const absPct = (d) => (d ? `${Math.abs(d.pct).toLocaleString("es-CL")}%` : "");

function igConclusion(key, cur, prev, followers) {
  if (!cur) return null;
  const mes = monthName(key);
  const dReach = delta(cur.reach, prev?.reach);
  const dViews = delta(cur.views, prev?.views);
  const dInter = delta(cur.interactions, prev?.interactions);
  const dPosts = delta(cur.posts, prev?.posts);
  const p = [];
  p.push(
    `Durante ${mes}, la cuenta de Instagram ${dReach ? `registró ${trend(dReach, "una expansión", "una contracción", "estabilidad")} en su alcance del ${absPct(dReach)}` : `alcanzó ${fmt(cur.reach)} cuentas`}` +
    `${dViews ? ` y ${trend(dViews, "un alza", "una baja", "estabilidad")} en las visualizaciones de ${absPct(dViews)}` : ""}, con ${fmt(cur.posts)} publicaciones en el mes${dPosts ? ` (${trend(dPosts, "más", "menos", "igual")} que el período anterior)` : ""}.`
  );
  if (cur.engagement != null)
    p.push(`La participación de la comunidad ${trend(dInter, "creció", "se moderó", "se mantuvo plana")}${dInter ? ` (interacciones ${absPct(dInter)})` : ""}, situando el engagement en ${fmtPct(cur.engagement)}, lo que refleja el interés de la audiencia base.`);
  if (followers != null) p.push(`La cuenta llegó a ${fmt(followers)} seguidores${cur.newFollowers ? ` tras sumar ${fmt(cur.newFollowers)} nuevos en el mes` : ""}.`);
  if (cur.webClicks != null) p.push(`Los clics hacia la web fueron ${fmt(cur.webClicks)}, principal puente hacia la conversión.`);
  return p.join(" ");
}

function fbConclusion(key, cur, prev, followers) {
  if (!cur) return null;
  const mes = monthName(key);
  const dViews = delta(cur.impressions, prev?.impressions);
  const dInter = delta(cur.engagement, prev?.engagement);
  const p = [];
  p.push(
    `En Facebook, durante ${mes} la página ${followers != null ? `alcanzó los ${fmt(followers)} seguidores` : "mantuvo su comunidad"}${cur.fanAdds ? ` sumando ${fmt(cur.fanAdds)} nuevos` : ""}, ` +
    `con ${fmt(cur.impressions)} visualizaciones${dViews ? ` (${trend(dViews, "+", "−", "")}${absPct(dViews)})` : ""} e interacciones de ${fmt(cur.engagement)}${dInter ? ` (${trend(dInter, "al alza", "a la baja", "estables")})` : ""}, sobre ${fmt(cur.posts)} publicaciones.`
  );
  if (cur.profileViews != null) p.push(`Se registraron ${fmt(cur.profileViews)} visitas al perfil, una oportunidad para convertir en clientes potenciales con pauta de productos y precios claros.`);
  return p.join(" ");
}

function adsConclusion(key, cur, prev, currency) {
  if (!cur) return null;
  const mes = monthName(key);
  const dConv = delta(cur.conversations, prev?.conversations);
  const dCpr = delta(cur.cpr, prev?.cpr);
  const top = (cur.campaigns || []).slice(0, 4).map((c) => `${shortName(c.name)} (${fmt(c.conversations)})`).join(", ");
  const p = [];
  p.push(
    `Durante ${mes}, las campañas de Meta Ads generaron ${fmt(cur.conversations)} conversaciones iniciadas${dConv ? ` (${trend(dConv, "al alza", "a la baja", "estable")} ${absPct(dConv)} vs. el mes anterior)` : ""}, con una inversión de ${fmtMoney(cur.spend)} y un alcance de ${fmt(cur.reach)} personas.`
  );
  if (cur.cpr != null) p.push(`El costo por conversación se situó en ${fmtMoney(cur.cpr)}${dCpr ? `, ${trend(dCpr, "subiendo", "mejorando", "manteniéndose")} ${absPct(dCpr)}` : ""}.`);
  if (top) p.push(`Las campañas con más resultados fueron ${top}, principales motores de captación del período.`);
  return p.join(" ");
}

function googleAdsConclusion(key, cur, prev, topKw) {
  if (!cur) return null;
  const mes = monthName(key);
  const dConv = delta(cur.conversions, prev?.conversions);
  const dCost = delta(cur.cost, prev?.cost);
  const p = [];
  p.push(
    `Durante ${mes}, Google Ads generó ${fmt(cur.conversions)} conversiones${dConv ? ` (${trend(dConv, "al alza", "a la baja", "estable")} ${absPct(dConv)} vs. el mes anterior)` : ""}, ` +
    `con ${fmt(cur.clicks)} clics, un CTR de ${fmtPct(cur.ctr)} y una inversión de ${fmtMoney(cur.cost)}${dCost ? ` (${trend(dCost, "+", "−", "")}${absPct(dCost)})` : ""}.`
  );
  if (cur.costPerConv != null) p.push(`El costo por conversión se situó en ${fmtMoney(cur.costPerConv)} y el CPC promedio en ${fmtMoney(cur.cpc)}.`);
  if (topKw) p.push(`La keyword con más resultados fue «${topKw.text}» (${fmt(topKw.conversions)} conversiones, CTR ${fmtPct(topKw.ctr)}), reflejando tráfico calificado con intención de compra.`);
  return p.join(" ");
}

function ga4Conclusion(key, cur, prev, topChannel) {
  if (!cur) return null;
  const mes = monthName(key);
  const dUsers = delta(cur.activeUsers, prev?.activeUsers);
  const dKey = delta(cur.keyEvents, prev?.keyEvents);
  const p = [];
  p.push(
    `En ${mes}, el sitio registró ${fmt(cur.activeUsers)} usuarios activos${dUsers ? ` (${trend(dUsers, "+", "−", "")}${absPct(dUsers)})` : ""} y ${fmt(cur.sessions)} sesiones, con ${fmt(cur.views)} vistas de página.`
  );
  p.push(`Los eventos clave (conversiones) fueron ${fmt(cur.keyEvents)}${dKey ? `, ${trend(dKey, "creciendo", "disminuyendo", "estables")} ${absPct(dKey)}` : ""}, con una duración media de interacción de ${fmtDuration(cur.avgEngagementSec)}.`);
  if (topChannel) p.push(`${topChannel.channel} fue la principal fuente de conversiones del mes (${fmt(topChannel.keyEvents)} eventos clave sobre ${fmt(topChannel.sessions)} sesiones).`);
  return p.join(" ");
}

function emailConclusion(key, cur, prev, best) {
  if (!cur || !cur.campaigns?.length) return null;
  const mes = monthName(key);
  const dOpen = delta(cur.openRate, prev?.openRate);
  const p = [];
  p.push(
    `En ${mes}, Email Marketing (Ebema Click) entregó ${fmt(cur.delivered)} correos con ${fmt(cur.opens)} aperturas, alcanzando un Open Rate de ${fmtPct(cur.openRate)}${dOpen ? ` (${trend(dOpen, "+", "−", "")}${absPct(dOpen)} vs. el mes anterior)` : ""} y un CTOR de ${fmtPct(cur.ctor)}.`
  );
  if (best) p.push(`La campaña «${best.name}» destacó como el mejor envío del período, con ${fmtPct(best.openRate)} de apertura y ${fmtPct(best.clickRate)} de clic.`);
  p.push(`Los resultados confirman que los contenidos segmentados y relevantes generan mayor interacción aun con menor volumen de envíos.`);
  return p.join(" ");
}

const shortName = (s) => (s || "").replace(/^.*?[-–|]\s*/, "").slice(0, 26) || (s || "").slice(0, 26);

// Resumen ejecutivo: 1 línea por canal disponible para el mes.
function execSummary(sel, ig, fb, ads, gads, ga4, li, email) {
  const out = [];
  if (ig?.cur) out.push({ emoji: "📸", t: `Instagram: ${fmt(ig.followers)} seguidores · alcance ${fmt(ig.cur.reach)} · engagement ${fmtPct(ig.cur.engagement)}.` });
  if (fb?.cur) out.push({ emoji: "👍", t: `Facebook: ${fmt(fb.followers)} seguidores · ${fmt(fb.cur.impressions)} visualizaciones · ${fmt(fb.cur.engagement)} interacciones.` });
  if (li?.cur) out.push({ emoji: "💼", t: `LinkedIn: ${fmt(li.followers)} seguidores · ${fmt(li.cur.impressions)} impresiones · ${fmt(li.cur.reactions)} reacciones.` });
  if (ads?.cur) out.push({ emoji: "🎯", t: `Meta Ads: ${fmt(ads.cur.conversations)} conversaciones · inversión ${fmtMoney(ads.cur.spend)} · CPR ${fmtMoney(ads.cur.cpr)}.` });
  if (gads?.cur) out.push({ emoji: "🔎", t: `Google Ads: ${fmt(gads.cur.conversions)} conversiones · CTR ${fmtPct(gads.cur.ctr)} · inversión ${fmtMoney(gads.cur.cost)}.` });
  if (ga4?.cur) out.push({ emoji: "📊", t: `GA4: ${fmt(ga4.cur.activeUsers)} usuarios · ${fmt(ga4.cur.sessions)} sesiones · ${fmt(ga4.cur.keyEvents)} eventos clave.` });
  if (email?.cur) out.push({ emoji: "✉️", t: `Email: ${fmt(email.cur.delivered)} entregados · Open Rate ${fmtPct(email.cur.openRate)} · CTOR ${fmtPct(email.cur.ctor)}.` });
  return out;
}

// ---------------- LinkedIn (manual) ----------------
function linkedinConclusion(key, cur, prev, followers, fPrev, best) {
  if (!cur) return null;
  const mes = monthName(key);
  const dImp = delta(cur.impressions, prev?.impressions);
  const dReac = delta(cur.reactions, prev?.reactions);
  const dFoll = delta(followers, fPrev);
  const p = [];
  p.push(
    `Durante ${mes}, Ebema alcanzó los ${fmt(followers)} seguidores en LinkedIn${cur.acquired ? ` tras sumar ${fmt(cur.acquired)} nuevos` : ""}${dFoll ? ` (${trend(dFoll, "+", "−", "")}${absPct(dFoll)})` : ""}.`
  );
  p.push(`Las impresiones ${trend(dImp, "se elevaron", "bajaron", "se mantuvieron")}${dImp ? ` ${absPct(dImp)}` : ""} alcanzando las ${fmt(cur.impressions)}, y las reacciones ${trend(dReac, "subieron", "bajaron", "se mantuvieron")} a ${fmt(cur.reactions)}, situando el engagement en ${fmtPct(cur.engagement)}.`);
  if (best?.[0]) p.push(`El contenido más relevante fue «${best[0].label}» (${fmt(best[0].impressions)} impresiones), validando la respuesta de la comunidad profesional a los hitos institucionales.`);
  return p.join(" ");
}

// ---------------- Competencia (manual) ----------------
// Construye filas { brand, prev, cur, growth } ordenadas por seguidores actuales.
function competenciaRows(block, key, prevKey) {
  if (!block) return [];
  const cur = block[key] || null;
  const prev = block[prevKey] || null;
  if (!cur) return [];
  return Object.keys(cur)
    .map((brand) => {
      const c = cur[brand];
      const p = prev?.[brand] ?? null;
      const growth = p ? Math.round(((c - p) / p) * 1000) / 10 : null;
      return { brand, prev: p, cur: c, growth };
    })
    .sort((a, b) => b.cur - a.cur);
}

function competenciaConclusion(rows, redName = "EBEMA") {
  if (!rows.length) return null;
  const me = rows.find((r) => r.brand.toUpperCase().includes(redName));
  const others = rows.filter((r) => r !== me && r.growth != null);
  if (!me) return null;
  const avgOthers = others.length ? Math.round((others.reduce((a, r) => a + r.growth, 0) / others.length) * 10) / 10 : null;
  const faster = others.filter((r) => (r.growth ?? -Infinity) > (me.growth ?? 0)).sort((a, b) => b.growth - a.growth);
  const p = [];
  p.push(`Ebema creció ${me.growth != null ? `${me.growth.toLocaleString("es-CL")}%` : "—"} en el mes${avgOthers != null ? `, frente a un promedio de ${avgOthers.toLocaleString("es-CL")}% de la competencia` : ""}.`);
  if (faster.length) p.push(`Marcas como ${faster.slice(0, 3).map((r) => `${r.brand} (${r.growth.toLocaleString("es-CL")}%)`).join(", ")} crecieron más rápido; conviene observar su contenido y pauta.`);
  else p.push(`Ebema lideró o igualó el ritmo de crecimiento del set competitivo.`);
  return p.join(" ");
}

// ---------------- Plan del próximo mes (predictivo / prescriptivo) ----------------
function buildPlan(sel, ads, gads, ga4, ig, fb, email) {
  const out = [];
  const a = ads?.cur, g = gads?.cur;

  // Eficiencia comparada paid: CPR Meta vs costo/conv Google.
  if (a?.cpr != null && g?.costPerConv != null) {
    const cheaper = a.cpr <= g.costPerConv ? "Meta Ads" : "Google Ads";
    const ratio = Math.round((Math.max(a.cpr, g.costPerConv) / Math.max(1, Math.min(a.cpr, g.costPerConv))) * 10) / 10;
    out.push({ emoji: "⚖️", tone: "info", title: "Reasignar presupuesto al canal más eficiente", text: `${cheaper} rinde más barato por resultado (Meta CPR ${fmtMoney(a.cpr)} vs Google costo/conv ${fmtMoney(g.costPerConv)}, ~${ratio}×). Inclina ~10-15% del presupuesto hacia ${cheaper} y mide el efecto.` });
  }

  // Inversión sugerida (mantiene total, inclina al más eficiente).
  if (a?.spend != null && g?.cost != null) {
    const total = a.spend + g.cost;
    const metaEff = a.cpr || Infinity, gEff = g.costPerConv || Infinity;
    const tilt = metaEff <= gEff ? { meta: 0.57, google: 0.43 } : { meta: 0.43, google: 0.57 };
    out.push({ emoji: "💰", tone: "good", title: "Inversión sugerida próximo mes", text: `Total ${fmtMoney(total)} aprox: Meta ${fmtMoney(total * tilt.meta)} · Google ${fmtMoney(total * tilt.google)} (ponderado por eficiencia actual). Ajusta según objetivos del mes.` });
  }

  // Pausar / optimizar la sucursal/campaña Meta más cara.
  if (ads?.cur?.campaigns?.length) {
    const withCpr = ads.cur.campaigns.filter((c) => c.cpr != null && c.conversations > 0);
    if (withCpr.length) {
      const worst = [...withCpr].sort((a, b) => b.cpr - a.cpr)[0];
      const best = [...withCpr].sort((a, b) => a.cpr - b.cpr)[0];
      out.push({ emoji: "✂️", tone: "warn", title: "Revisar campaña Meta más cara", text: `«${worst.name}» tuvo el CPR más alto (${fmtMoney(worst.cpr)}). Revisa segmentación/creatividad o redistribuye hacia «${best.name}» (CPR ${fmtMoney(best.cpr)}).` });
    }
  }

  // Escalar las keywords de Google con mejor conversión.
  if (gads?.keywords?.length) {
    const top = gads.keywords.slice(0, 3).map((k) => `«${k.text}»`).join(", ");
    out.push({ emoji: "🔑", tone: "good", title: "Escalar keywords ganadoras", text: `Sube pujas/presupuesto en ${top}, que concentran las conversiones de Search con buen CTR.` });
  }

  // Canal de mayor conversión en GA4.
  if (ga4?.channels?.length) {
    const top = ga4.channels[0];
    out.push({ emoji: "🌐", tone: "info", title: "Apoyar el canal que más convierte", text: `${top.channel} fue la principal fuente de eventos clave (${fmt(top.keyEvents)}). Refuerza landing y remarketing para ese tráfico.` });
  }

  // Orgánico: foco de contenido según engagement.
  if (ig?.cur || fb?.cur) {
    out.push({ emoji: "🖼️", tone: "info", title: "Contenido orgánico con producto y precio", text: `Sumar publicaciones de productos con precios visibles en IG/FB para reactivar clics a la web y convertir las visitas al perfil en clientes.` });
  }

  // Email: próxima acción según open/ctor.
  if (email?.cur) {
    const low = email.cur.clickRate != null && email.cur.clickRate < 2;
    out.push({ emoji: "✉️", tone: low ? "warn" : "good", title: low ? "Reforzar el CTA del email" : "Mantener segmentación del email", text: low ? `El clic está bajo (${fmtPct(email.cur.clickRate)}). Usa un CTA único y claro y segmenta por comuna/necesidad operativa.` : `La segmentación operativa rinde (Open ${fmtPct(email.cur.openRate)}, CTOR ${fmtPct(email.cur.ctor)}). Reincorpora gradualmente campañas comerciales con beneficio claro.` });
  }

  return out;
}

// ---------------- Puntos de mejora (qué optimizar / qué se hizo mal) ----------------
function buildImprovements(sel, ig, fb, ads, gads, ga4, li, email, comp) {
  const out = [];
  const dn = (c, p) => { const d = delta(c, p); return d && d.dir < 0; };

  if (ig?.cur && dn(ig.cur.reach, ig.prev?.reach)) out.push({ emoji: "📉", tone: "warn", title: "Instagram: alcance a la baja", text: `El alcance cayó ${absPct(delta(ig.cur.reach, ig.prev?.reach))}. Sube la frecuencia de publicación y prueba formatos de mayor alcance (reels, colaboraciones).` });
  if (ig?.cur && ig.cur.engagement != null && ig.cur.engagement < 1) out.push({ emoji: "💬", tone: "warn", title: "Instagram: engagement bajo", text: `El engagement (${fmtPct(ig.cur.engagement)}) está bajo. Más CTAs, preguntas y contenido de producto con precio para activar interacción.` });

  if (fb?.cur && dn(fb.cur.impressions, fb.prev?.impressions)) out.push({ emoji: "📉", tone: "warn", title: "Facebook: visualizaciones a la baja", text: `Las visualizaciones bajaron ${absPct(delta(fb.cur.impressions, fb.prev?.impressions))}. Recupera frecuencia y refuerza con pauta de bajo costo los mejores posts.` });

  if (li?.cur && dn(li.cur.impressions, li.prev?.impressions)) out.push({ emoji: "📉", tone: "warn", title: "LinkedIn: impresiones a la baja", text: `Impresiones ${absPct(delta(li.cur.impressions, li.prev?.impressions))} menos. Publica más hitos institucionales y efemérides, que es lo que mejor responde en este canal.` });

  if (ads?.cur && delta(ads.cur.cpr, ads.prev?.cpr)?.dir > 0) out.push({ emoji: "💸", tone: "warn", title: "Meta Ads: CPR al alza", text: `El costo por conversación subió ${absPct(delta(ads.cur.cpr, ads.prev?.cpr))} (${fmtMoney(ads.cur.cpr)}). Revisa segmentación y creatividades de las sucursales más caras.` });
  if (ads?.cur?.campaigns?.length) {
    const worst = [...ads.cur.campaigns].filter((c) => c.cpr != null && c.conversations > 0).sort((a, b) => b.cpr - a.cpr)[0];
    if (worst) out.push({ emoji: "🎯", tone: "warn", title: "Meta Ads: sucursal ineficiente", text: `«${worst.name}» tuvo el CPR más alto (${fmtMoney(worst.cpr)}). Optimiza o redistribuye su presupuesto.` });
  }

  if (gads?.cur && delta(gads.cur.costPerConv, gads.prev?.costPerConv)?.dir > 0) out.push({ emoji: "💸", tone: "warn", title: "Google Ads: costo/conv. al alza", text: `El costo por conversión subió ${absPct(delta(gads.cur.costPerConv, gads.prev?.costPerConv))} (${fmtMoney(gads.cur.costPerConv)}). Pausa keywords caras sin conversión y sube pujas en las ganadoras.` });
  if (gads?.cur && gads.cur.ctr != null && gads.cur.ctr < 5) out.push({ emoji: "🔎", tone: "warn", title: "Google Ads: CTR mejorable", text: `El CTR (${fmtPct(gads.cur.ctr)}) tiene espacio. Ajusta titulares y extensiones; prioriza términos de marca y de alta intención.` });

  if (ga4?.cur && dn(ga4.cur.activeUsers, ga4.prev?.activeUsers)) out.push({ emoji: "📊", tone: "warn", title: "GA4: caída de usuarios", text: `Usuarios activos ${absPct(delta(ga4.cur.activeUsers, ga4.prev?.activeUsers))} menos. Refuerza el tráfico del canal más eficiente y revisa velocidad/experiencia del sitio.` });
  if (ga4?.cur && ga4.cur.avgEngagementSec != null && ga4.cur.avgEngagementSec < 40) out.push({ emoji: "⏱️", tone: "warn", title: "GA4: interacción corta", text: `La duración media (${fmtDuration(ga4.cur.avgEngagementSec)}) es baja. Mejora landing pages, claridad de la oferta y enlaces internos.` });

  if (email?.cur && email.cur.clickRate != null && email.cur.clickRate < 2) out.push({ emoji: "✉️", tone: "warn", title: "Email: clics bajos", text: `La tasa de clic (${fmtPct(email.cur.clickRate)}) está bajo referencia. CTA único y claro, menos enlaces compitiendo y segmentación por necesidad operativa.` });

  if (comp?.instagram?.length) {
    const rows = comp.instagram;
    const me = rows.find((r) => r.brand.toUpperCase().includes("EBEMA"));
    const others = rows.filter((r) => r !== me && r.growth != null);
    const avg = others.length ? others.reduce((a, r) => a + r.growth, 0) / others.length : null;
    if (me && avg != null && me.growth != null && me.growth < avg) out.push({ emoji: "🥊", tone: "warn", title: "Competencia: crecemos más lento", text: `Ebema creció ${me.growth.toLocaleString("es-CL")}% en IG vs un promedio de ${(Math.round(avg * 10) / 10).toLocaleString("es-CL")}% de la competencia. Observa el contenido y la pauta de quienes crecen más rápido.` });
  }

  if (out.length === 0) out.push({ emoji: "✅", tone: "good", title: "Sin alertas relevantes", text: "Las métricas del mes están en rangos sanos. Mantén la consistencia y sigue testeando contenidos, audiencias y keywords." });
  return out;
}

// ---------------- Page ----------------
export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const months = data?.months || [];
  // Selecciona por defecto el último mes con datos.
  useEffect(() => {
    if (!sel && months.length) setSel(months[months.length - 1]);
  }, [months, sel]);

  const prevKey = useMemo(() => {
    const i = months.indexOf(sel);
    return i > 0 ? months[i - 1] : null;
  }, [months, sel]);

  // --- Instagram ---
  const ig = useMemo(() => {
    const m = data?.instagram;
    if (!m) return null;
    const cur = m.monthly?.find((x) => x.key === sel) || null;
    const prev = m.monthly?.find((x) => x.key === prevKey) || null;
    return { followers: m.followers, username: m.username, cur, prev, best: m.bestByMonth?.[sel] || [], series: m.monthly || [] };
  }, [data, sel, prevKey]);

  // --- Facebook ---
  const fb = useMemo(() => {
    const m = data?.facebook;
    if (!m) return null;
    const cur = m.monthly?.find((x) => x.key === sel) || null;
    const prev = m.monthly?.find((x) => x.key === prevKey) || null;
    return { followers: m.followers, name: m.name, cur, prev, best: m.bestByMonth?.[sel] || [], series: m.monthly || [] };
  }, [data, sel, prevKey]);

  // --- Meta Ads ---
  const ads = useMemo(() => {
    const m = data?.ads;
    if (!m) return null;
    const cur = m.monthly?.find((x) => x.key === sel) || null;
    const prev = m.monthly?.find((x) => x.key === prevKey) || null;
    return { currency: m.currency, cur, prev, series: m.monthly || [] };
  }, [data, sel, prevKey]);

  // --- Google Ads ---
  const gads = useMemo(() => {
    const m = data?.googleAds;
    if (!m) return null;
    const cur = m.monthly?.find((x) => x.key === sel) || null;
    const prev = m.monthly?.find((x) => x.key === prevKey) || null;
    return {
      currency: m.currency,
      cur,
      prev,
      series: m.monthly || [],
      keywords: m.keywordsByMonth?.[sel] || [],
      campaigns: m.campaignsByMonth?.[sel] || [],
    };
  }, [data, sel, prevKey]);

  // --- GA4 ---
  const ga4 = useMemo(() => {
    const m = data?.ga4;
    if (!m) return null;
    const cur = m.monthly?.find((x) => x.key === sel) || null;
    const prev = m.monthly?.find((x) => x.key === prevKey) || null;
    return { cur, prev, series: m.monthly || [], channels: m.channelsByMonth?.[sel] || [] };
  }, [data, sel, prevKey]);

  // --- LinkedIn (API en vivo, con fallback a datos sembrados en data/manual.json) ---
  const li = useMemo(() => {
    const api = data?.linkedin;
    const man = data?.manual?.linkedin;
    if (!api && !man) return null;
    const monthlyOf = (k) => api?.monthly?.[k] || man?.monthly?.[k] || null;
    const cur = monthlyOf(sel);
    const prev = monthlyOf(prevKey);
    const followersMap = man?.followers || {};
    const isLatest = months.length && sel === months[months.length - 1];
    let followers = followersMap[sel] ?? null;
    if (api?.followersTotal != null && isLatest) followers = api.followersTotal;
    const fPrev = followersMap[prevKey] ?? null;
    const best = (api?.bestByMonth?.[sel]?.length ? api.bestByMonth[sel] : man?.best?.[sel]) || [];
    const series = months.map((k) => ({ key: k, ...(monthlyOf(k) || {}), followers: followersMap[k] ?? null }));
    return { cur, prev, followers, fPrev, best, series, hasMonth: !!cur, connected: !!api };
  }, [data, sel, prevKey, months]);

  // --- Competencia (manual) ---
  const comp = useMemo(() => {
    const m = data?.manual?.competencia;
    if (!m) return null;
    return {
      instagram: competenciaRows(m.instagram, sel, prevKey),
      meta: competenciaRows(m.meta, sel, prevKey),
      hasMonth: !!(m.instagram?.[sel] || m.meta?.[sel]),
    };
  }, [data, sel, prevKey]);

  // --- Email (agregado por mes desde campañas) ---
  const emailAgg = useMemo(() => {
    const camps = data?.email?.campaigns || [];
    if (!camps.length) return null;
    const byMonth = {};
    for (const c of camps) {
      if (!c.monthKey) continue;
      const b = (byMonth[c.monthKey] = byMonth[c.monthKey] || { delivered: 0, opens: 0, clicks: 0, sent: 0, list: [] });
      b.delivered += c.delivered; b.opens += c.opens; b.clicks += c.clicks; b.sent += c.sent; b.list.push(c);
    }
    const agg = (b) => b ? {
      ...b,
      openRate: b.delivered ? Math.round((b.opens / b.delivered) * 1000) / 10 : 0,
      clickRate: b.delivered ? Math.round((b.clicks / b.delivered) * 1000) / 10 : 0,
      ctor: b.opens ? Math.round((b.clicks / b.opens) * 1000) / 10 : 0,
    } : null;
    const cur = agg(byMonth[sel]);
    const prev = agg(byMonth[prevKey]);
    const best = cur?.list?.length ? [...cur.list].filter((c) => c.delivered >= 10).sort((a, b) => b.openRate - a.openRate)[0] : null;
    const series = months.map((k) => ({ key: k, ...(agg(byMonth[k]) || { openRate: 0, ctor: 0 }) }));
    return { cur, prev, best, series, all: byMonth };
  }, [data, sel, prevKey, months]);

  const exec = useMemo(() => (sel ? execSummary(sel, ig, fb, ads, gads, ga4, li, emailAgg) : []), [sel, ig, fb, ads, gads, ga4, li, emailAgg]);
  const plan = useMemo(() => (sel ? buildPlan(sel, ads, gads, ga4, ig, fb, emailAgg) : []), [sel, ads, gads, ga4, ig, fb, emailAgg]);
  const improvements = useMemo(() => (sel ? buildImprovements(sel, ig, fb, ads, gads, ga4, li, emailAgg, comp) : []), [sel, ig, fb, ads, gads, ga4, li, emailAgg, comp]);
  const liSeries = (li?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], Impresiones: x.impressions || 0, Reacciones: x.reactions || 0 }));

  // Series para gráficos de evolución (todos los meses, ascendente).
  const igSeries = (ig?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], Alcance: x.reach, Interacciones: x.interactions }));
  const fbSeries = (fb?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], Visualizaciones: x.impressions, Interacciones: x.engagement }));
  const adsSeries = (ads?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], Conversaciones: x.conversations, CPR: x.cpr }));
  const emailSeries = (emailAgg?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], "Open Rate": x.openRate, CTOR: x.ctor }));
  const gadsSeries = (gads?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], Conversiones: x.conversions, "Costo/conv.": x.costPerConv }));
  const ga4Series = (ga4?.series || []).map((x) => ({ name: monthLabel(x.key).split(" ")[0], Usuarios: x.activeUsers, "Eventos clave": x.keyEvents }));

  const selStyle = { background: "#0b1220", color: "#e6edf6", border: "1px solid #1f2b45", borderRadius: 8, padding: "8px 12px", fontSize: 14 };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <div style={{ height: 5, background: `linear-gradient(90deg, ${BRAND}, ${BRAND_DARK})`, borderRadius: 6, marginBottom: 18 }} />
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25 }}>
            <span style={{ color: BRAND }}>Ebema</span> · Informe de Redes
          </h1>
          <div style={{ color: "#8aa0bf", fontSize: 13, marginTop: 4 }}>
            {loading ? "Cargando…" : data?.updatedAt ? `Actualizado: ${new Date(data.updatedAt).toLocaleString("es-CL")}${data?.stale ? " · última copia disponible" : ""}` : ""}
          </div>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {months.length > 0 && (
            <select value={sel || ""} onChange={(e) => setSel(e.target.value)} style={selStyle}>
              {[...months].reverse().map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </select>
          )}
          <button onClick={() => window.print()} style={{ background: "#0b1220", color: "#e6edf6", border: "1px solid #1f2b45", borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 14 }}>🖨️ Exportar PDF</button>
          <button onClick={load} style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontSize: 14 }}>Actualizar</button>
        </div>
      </header>

      {error && <div style={{ marginTop: 20, background: "#3b1620", border: "1px solid #6b2333", color: "#ffb4c0", padding: "12px 16px", borderRadius: 12 }}>{error}</div>}

      {/* CÓMO LEER ESTE INFORME — Automático vs Manual */}
      <details className="no-print" style={{ ...panel, marginTop: 20, padding: 0 }}>
        <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 16px", fontWeight: 600, fontSize: 14 }}>
          📋 Cómo leer este informe — <span style={{ color: "#4ade80" }}>Automático</span> vs <span style={{ color: "#fbbf24" }}>Manual</span>
        </summary>
        <div style={{ padding: "0 16px 16px", fontSize: 13.5, lineHeight: 1.5, color: "#cdd9ee" }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: "#4ade80", fontWeight: 600, marginBottom: 4 }}>✅ AUTOMÁTICO — no necesitas tocar</div>
            KPIs del mes y comparativas vs. mes anterior · gráficos de tendencia (6 meses) · top keywords de Google · resultados Meta Ads por campaña/sucursal · GA4 y fuentes de tráfico · conclusiones redactadas por canal · <b>Plan del próximo mes</b> con acciones priorizadas e inversión sugerida.
          </div>
          <div>
            <div style={{ color: "#fbbf24", fontWeight: 600, marginBottom: 4 }}>⚠️ MANUAL — revisar antes de enviar al cliente</div>
Actualizar a inicio de mes: <b>LinkedIn</b> (con Claude para Chrome, extrae de LinkedIn → Análisis) y <b>Competencia</b> (Not Just Analytics) · leer las conclusiones IA y corregir si algo suena impreciso · validar el Plan del próximo mes según contexto del cliente (lanzamientos, eventos, cambios de mando que la IA no conoce) · exportar a PDF si el cliente pide formato formal.
          </div>
        </div>
      </details>

      {/* RESUMEN EJECUTIVO */}
      {exec.length > 0 && (
        <Section title={`🧠 Resumen ejecutivo · ${monthLabel(sel)}`} subtitle="Lo más destacado del mes, por canal">
          <div style={grid(280)}>
            {exec.map((it, i) => (
              <div key={i} style={{ ...panel, borderLeft: "3px solid #60a5fa" }}>
                <div style={{ fontSize: 14.5, lineHeight: 1.45 }}><span style={{ marginRight: 6 }}>{it.emoji}</span>{it.t}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* INSTAGRAM */}
      <Section title="📸 Instagram (orgánico)" subtitle={ig?.username ? `@${ig.username}` : undefined}>
        {data?.errors?.instagram && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>Instagram: {data.errors.instagram}</div>}
        {ig?.cur ? (
          <>
            <div style={grid(150)}>
              <Card label="Seguidores" value={fmt(ig.followers)} accent="#a78bfa" />
              <Card label="Nuevos seguidores" value={fmt(ig.cur.newFollowers)} change={delta(ig.cur.newFollowers, ig.prev?.newFollowers)} />
              <Card label="Posts" value={fmt(ig.cur.posts)} change={delta(ig.cur.posts, ig.prev?.posts)} />
              <Card label="Alcance" value={fmt(ig.cur.reach)} accent="#60a5fa" change={delta(ig.cur.reach, ig.prev?.reach)} />
              <Card label="Visualizaciones" value={fmt(ig.cur.views)} change={delta(ig.cur.views, ig.prev?.views)} />
              <Card label="Interacciones" value={fmt(ig.cur.interactions)} change={delta(ig.cur.interactions, ig.prev?.interactions)} />
              <Card label="Clics a la web" value={fmt(ig.cur.webClicks)} accent="#4ade80" change={delta(ig.cur.webClicks, ig.prev?.webClicks)} />
              <Card label="Engagement" value={fmtPct(ig.cur.engagement)} change={delta(ig.cur.engagement, ig.prev?.engagement)} />
            </div>
            {igSeries.length > 1 && (
              <div style={{ ...grid(320), marginTop: 16 }}>
                <ChartBox title="Evolución de alcance">
                  <LineChart data={igSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Legend />
                    <Line type="monotone" dataKey="Alcance" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartBox>
                <ChartBox title="Evolución de interacciones">
                  <BarChart data={igSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} />
                    <Bar dataKey="Interacciones" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBox>
              </div>
            )}
            {ig.best?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>🏆 Mejores publicaciones del mes (por alcance)</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>#</th><th style={th}>Publicación</th><th style={th}>Tipo</th><th style={th}>Fecha</th><th style={th}>Alcance</th><th style={th}>Likes</th><th style={th}>Coment.</th></tr></thead>
                    <tbody>
                      {ig.best.map((p, i) => (
                        <tr key={p.id}>
                          <td style={{ ...td, color: "#fbbf24", fontWeight: 700 }}>{i + 1}</td>
                          <td style={td}><a href={p.permalink} target="_blank" rel="noreferrer" style={{ color: "#cdd9ee" }}>{p.caption || "(sin texto)"}</a></td>
                          <td style={td}>{p.type}</td>
                          <td style={td}>{fmtDate(p.date)}</td>
                          <td style={{ ...td, color: "#60a5fa", fontWeight: 600 }}>{fmt(p.reach)}</td>
                          <td style={td}>{fmt(p.likes)}</td>
                          <td style={td}>{fmt(p.comments)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Conclusion id={`ig-${sel}`} text={igConclusion(sel, ig.cur, ig.prev, ig.followers)} />
          </>
        ) : !data?.errors?.instagram && <div style={{ color: "#8aa0bf", fontSize: 13 }}>Sin datos de Instagram para {monthLabel(sel)}.</div>}
      </Section>

      {/* FACEBOOK */}
      <Section title="👍 Facebook / Meta (orgánico)">
        {data?.errors?.facebook && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>Facebook: {data.errors.facebook}</div>}
        {fb?.cur ? (
          <>
            <div style={grid(150)}>
              <Card label="Seguidores" value={fmt(fb.followers)} accent="#a78bfa" />
              <Card label="Nuevos seguidores" value={fmt(fb.cur.fanAdds)} change={delta(fb.cur.fanAdds, fb.prev?.fanAdds)} />
              <Card label="Posts" value={fmt(fb.cur.posts)} change={delta(fb.cur.posts, fb.prev?.posts)} />
              <Card label="Espectadores (alcance)" value={fmt(fb.cur.reach)} accent="#60a5fa" change={delta(fb.cur.reach, fb.prev?.reach)} />
              <Card label="Visualizaciones" value={fmt(fb.cur.impressions)} change={delta(fb.cur.impressions, fb.prev?.impressions)} />
              <Card label="Interacciones" value={fmt(fb.cur.engagement)} change={delta(fb.cur.engagement, fb.prev?.engagement)} />
              <Card label="Visitas al perfil" value={fmt(fb.cur.profileViews)} accent="#4ade80" change={delta(fb.cur.profileViews, fb.prev?.profileViews)} />
            </div>
            {fbSeries.length > 1 && (
              <div style={{ ...grid(320), marginTop: 16 }}>
                <ChartBox title="Evolución de visualizaciones">
                  <LineChart data={fbSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Legend />
                    <Line type="monotone" dataKey="Visualizaciones" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartBox>
                <ChartBox title="Evolución de interacciones">
                  <BarChart data={fbSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} />
                    <Bar dataKey="Interacciones" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBox>
              </div>
            )}
            {fb.best?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>🏆 Mejores publicaciones del mes (por alcance)</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>#</th><th style={th}>Publicación</th><th style={th}>Fecha</th><th style={th}>Alcance</th></tr></thead>
                    <tbody>
                      {fb.best.map((p, i) => (
                        <tr key={p.id}>
                          <td style={{ ...td, color: "#fbbf24", fontWeight: 700 }}>{i + 1}</td>
                          <td style={td}><a href={p.permalink} target="_blank" rel="noreferrer" style={{ color: "#cdd9ee" }}>{p.message || "(sin texto)"}</a></td>
                          <td style={td}>{fmtDate(p.date)}</td>
                          <td style={{ ...td, color: "#60a5fa", fontWeight: 600 }}>{fmt(p.reach)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Conclusion id={`fb-${sel}`} text={fbConclusion(sel, fb.cur, fb.prev, fb.followers)} />
          </>
        ) : !data?.errors?.facebook && <div style={{ color: "#8aa0bf", fontSize: 13 }}>Sin datos de Facebook para {monthLabel(sel)}.</div>}
      </Section>

      {/* LINKEDIN (MANUAL) */}
      {li && (
        <Section title={<span>💼 LinkedIn <span style={li.connected ? autoBadge : chromeBadge}>{li.connected ? "AUTO · API" : "DATOS DE EJEMPLO"}</span></span>} subtitle="Conectado por la API de LinkedIn (en vivo). Solo Competencia queda manual.">
          {data?.errors?.linkedin && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>LinkedIn: {data.errors.linkedin}</div>}
          {!li.connected && (
            <div style={{ ...alertBox, marginBottom: 12 }}>ℹ️ Aún sin token de LinkedIn: mostrando datos de ejemplo. Para datos en vivo, configura <code>LINKEDIN_ACCESS_TOKEN</code> y <code>LINKEDIN_ORG_ID</code> (pasos en el README).</div>
          )}
          {!li.hasMonth ? (
            <div style={alertBox}>⚠️ Sin datos de LinkedIn para {monthLabel(sel)} todavía.</div>
          ) : (
            <>
              <div style={grid(150)}>
                <Card label="Seguidores" value={fmt(li.followers)} accent="#a78bfa" change={delta(li.followers, li.fPrev)} />
                <Card label="Adquiridos" value={fmt(li.cur.acquired)} change={delta(li.cur.acquired, li.prev?.acquired)} />
                <Card label="Impresiones" value={fmt(li.cur.impressions)} accent="#60a5fa" change={delta(li.cur.impressions, li.prev?.impressions)} />
                <Card label="Visualizaciones" value={fmt(li.cur.views)} change={delta(li.cur.views, li.prev?.views)} />
                <Card label="Reacciones" value={fmt(li.cur.reactions)} accent="#4ade80" change={delta(li.cur.reactions, li.prev?.reactions)} />
                <Card label="Engagement" value={fmtPct(li.cur.engagement)} change={delta(li.cur.engagement, li.prev?.engagement)} />
              </div>
              {liSeries.length > 1 && (
                <div style={{ ...grid(320), marginTop: 16 }}>
                  <ChartBox title="Evolución de impresiones">
                    <LineChart data={liSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                      <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Legend />
                      <Line type="monotone" dataKey="Impresiones" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartBox>
                  <ChartBox title="Evolución de reacciones">
                    <BarChart data={liSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                      <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} />
                      <Bar dataKey="Reacciones" fill="#4ade80" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartBox>
                </div>
              )}
              {li.best?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>🏆 Mejores publicaciones del mes (por impresiones)</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead><tr><th style={th}>#</th><th style={th}>Publicación</th><th style={th}>Fecha</th><th style={th}>Impresiones</th><th style={th}>Reacciones</th><th style={th}>Clics</th><th style={th}>Nuevos seg.</th></tr></thead>
                      <tbody>
                        {li.best.map((p, i) => (
                          <tr key={i}>
                            <td style={{ ...td, color: "#fbbf24", fontWeight: 700 }}>{i + 1}</td>
                            <td style={td}>{p.label}</td>
                            <td style={td}>{p.date}</td>
                            <td style={{ ...td, color: "#60a5fa", fontWeight: 600 }}>{fmt(p.impressions)}</td>
                            <td style={td}>{fmt(p.reactions)}</td>
                            <td style={td}>{fmt(p.clicks)}</td>
                            <td style={td}>{fmt(p.newFollowers)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <Conclusion id={`li-${sel}`} text={linkedinConclusion(sel, li.cur, li.prev, li.followers, li.fPrev, li.best)} />
            </>
          )}
        </Section>
      )}

      {/* COMPETENCIA (MANUAL) */}
      {comp && (
        <Section title={<span>🥊 Competencia <span style={manualBadge}>MANUAL</span></span>} subtitle="Seguidores de la competencia (Not Just Analytics / Meta Business Suite). Lo carga el CM a inicio de mes.">
          {!comp.hasMonth ? (
            <div style={alertBox}>⚠️ Faltan los datos de competencia de {monthLabel(sel)}. El CM debe cargarlos en <code>data/manual.json</code>.</div>
          ) : (
            <div style={{ ...grid(380) }}>
              {[{ key: "instagram", label: "📸 Instagram" }, { key: "meta", label: "👍 Facebook / Meta" }].map((blk) => (
                comp[blk.key]?.length > 0 && (
                  <div key={blk.key}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{blk.label}</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead><tr><th style={th}>Marca</th><th style={th}>Mes ant.</th><th style={th}>{monthName(sel)}</th><th style={th}>Crec.</th></tr></thead>
                        <tbody>
                          {comp[blk.key].map((r) => {
                            const mine = r.brand.toUpperCase().includes("EBEMA");
                            return (
                              <tr key={r.brand} style={mine ? { background: "rgba(225,29,72,0.12)" } : undefined}>
                                <td style={{ ...td, fontWeight: mine ? 700 : 400, color: mine ? BRAND : "#e6edf6" }}>{r.brand}</td>
                                <td style={td}>{fmt(r.prev)}</td>
                                <td style={{ ...td, fontWeight: 600 }}>{fmt(r.cur)}</td>
                                <td style={{ ...td, color: r.growth == null ? "#8aa0bf" : r.growth >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                                  {r.growth == null ? "—" : `${r.growth >= 0 ? "▲" : "▼"} ${Math.abs(r.growth).toLocaleString("es-CL")}%`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Conclusion id={`comp-${blk.key}-${sel}`} text={competenciaConclusion(comp[blk.key])} />
                  </div>
                )
              ))}
            </div>
          )}
        </Section>
      )}

      {/* META ADS (PAID) */}
      <Section title="🎯 Meta Ads (paid)" subtitle="Conversaciones iniciadas, inversión y costo por resultado (CPR) por sucursal">
        {data?.errors?.ads && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>Meta Ads: {data.errors.ads}</div>}
        {ads?.cur ? (
          <>
            <div style={grid(150)}>
              <Card label="Inversión" value={fmtMoney(ads.cur.spend)} accent="#fbbf24" change={delta(ads.cur.spend, ads.prev?.spend)} />
              <Card label="Conversaciones" value={fmt(ads.cur.conversations)} accent="#4ade80" change={delta(ads.cur.conversations, ads.prev?.conversations)} />
              <Card label="CPR (costo/conv.)" value={fmtMoney(ads.cur.cpr)} change={delta(ads.cur.cpr, ads.prev?.cpr)} />
              <Card label="Alcance" value={fmt(ads.cur.reach)} accent="#60a5fa" change={delta(ads.cur.reach, ads.prev?.reach)} />
              <Card label="Clics" value={fmt(ads.cur.clicks)} change={delta(ads.cur.clicks, ads.prev?.clicks)} />
              <Card label="CTR" value={fmtPct(ads.cur.ctr)} change={delta(ads.cur.ctr, ads.prev?.ctr)} />
            </div>
            {adsSeries.length > 1 && (
              <div style={{ ...grid(320), marginTop: 16 }}>
                <ChartBox title="Conversaciones por mes">
                  <BarChart data={adsSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} />
                    <Bar dataKey="Conversaciones" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBox>
                <ChartBox title="Costo por conversación (CPR)">
                  <LineChart data={adsSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} formatter={(v) => fmtMoney(v)} />
                    <Line type="monotone" dataKey="CPR" stroke="#fbbf24" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartBox>
              </div>
            )}
            {ads.cur.campaigns?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>📍 Resultados por campaña / sucursal · {monthLabel(sel)}</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>Campaña</th><th style={th}>Conversaciones</th><th style={th}>Inversión</th><th style={th}>CPR</th><th style={th}>Alcance</th><th style={th}>Clics</th><th style={th}>CTR</th></tr></thead>
                    <tbody>
                      {ads.cur.campaigns.map((c) => (
                        <tr key={c.id}>
                          <td style={td}>{c.name}</td>
                          <td style={{ ...td, color: "#4ade80", fontWeight: 600 }}>{fmt(c.conversations)}</td>
                          <td style={td}>{fmtMoney(c.spend)}</td>
                          <td style={td}>{fmtMoney(c.cpr)}</td>
                          <td style={td}>{fmt(c.reach)}</td>
                          <td style={td}>{fmt(c.clicks)}</td>
                          <td style={td}>{fmtPct(c.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Conclusion id={`ads-${sel}`} text={adsConclusion(sel, ads.cur, ads.prev, ads.currency)} />
          </>
        ) : !data?.errors?.ads && <div style={{ color: "#8aa0bf", fontSize: 13 }}>Sin datos de Meta Ads para {monthLabel(sel)}.</div>}
      </Section>

      {/* GOOGLE ADS (PAID) */}
      <Section title="🔎 Google Ads (paid)" subtitle="Conversiones, CTR, inversión y top keywords del Search">
        {data?.errors?.googleAds && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>Google Ads: {data.errors.googleAds}</div>}
        {gads?.cur ? (
          <>
            <div style={grid(150)}>
              <Card label="Inversión" value={fmtMoney(gads.cur.cost)} accent="#fbbf24" change={delta(gads.cur.cost, gads.prev?.cost)} />
              <Card label="Conversiones" value={fmt(gads.cur.conversions)} accent="#4ade80" change={delta(gads.cur.conversions, gads.prev?.conversions)} />
              <Card label="Costo / conv." value={fmtMoney(gads.cur.costPerConv)} change={delta(gads.cur.costPerConv, gads.prev?.costPerConv)} />
              <Card label="Clics" value={fmt(gads.cur.clicks)} accent="#60a5fa" change={delta(gads.cur.clicks, gads.prev?.clicks)} />
              <Card label="CTR" value={fmtPct(gads.cur.ctr)} change={delta(gads.cur.ctr, gads.prev?.ctr)} />
              <Card label="CPC" value={fmtMoney(gads.cur.cpc)} change={delta(gads.cur.cpc, gads.prev?.cpc)} />
            </div>
            {gadsSeries.length > 1 && (
              <div style={{ ...grid(320), marginTop: 16 }}>
                <ChartBox title="Conversiones por mes">
                  <BarChart data={gadsSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} />
                    <Bar dataKey="Conversiones" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBox>
                <ChartBox title="Costo por conversión">
                  <LineChart data={gadsSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} formatter={(v) => fmtMoney(v)} />
                    <Line type="monotone" dataKey="Costo/conv." stroke="#fbbf24" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartBox>
              </div>
            )}
            {gads.keywords?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>🔑 Keywords más relevantes · {monthLabel(sel)}</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>Keyword</th><th style={th}>Conversiones</th><th style={th}>Clics</th><th style={th}>CTR</th><th style={th}>Inversión</th></tr></thead>
                    <tbody>
                      {gads.keywords.map((k, i) => (
                        <tr key={i}>
                          <td style={td}>{k.text}</td>
                          <td style={{ ...td, color: "#4ade80", fontWeight: 600 }}>{fmt(k.conversions)}</td>
                          <td style={td}>{fmt(k.clicks)}</td>
                          <td style={td}>{fmtPct(k.ctr)}</td>
                          <td style={td}>{fmtMoney(k.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {gads.campaigns?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>📂 Campañas · {monthLabel(sel)}</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>Campaña</th><th style={th}>Conversiones</th><th style={th}>Clics</th><th style={th}>CTR</th><th style={th}>Costo/conv.</th><th style={th}>Inversión</th></tr></thead>
                    <tbody>
                      {gads.campaigns.map((c, i) => (
                        <tr key={i}>
                          <td style={td}>{c.name}</td>
                          <td style={{ ...td, color: "#4ade80", fontWeight: 600 }}>{fmt(c.conversions)}</td>
                          <td style={td}>{fmt(c.clicks)}</td>
                          <td style={td}>{fmtPct(c.ctr)}</td>
                          <td style={td}>{fmtMoney(c.costPerConv)}</td>
                          <td style={td}>{fmtMoney(c.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Conclusion id={`gads-${sel}`} text={googleAdsConclusion(sel, gads.cur, gads.prev, gads.keywords?.[0])} />
          </>
        ) : !data?.errors?.googleAds && <div style={{ color: "#8aa0bf", fontSize: 13 }}>Sin datos de Google Ads para {monthLabel(sel)}.</div>}
      </Section>

      {/* GA4 */}
      <Section title="📊 Google Analytics (GA4)" subtitle="Rendimiento del sitio y fuentes de tráfico">
        {data?.errors?.ga4 && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>GA4: {data.errors.ga4}</div>}
        {ga4?.cur ? (
          <>
            <div style={grid(150)}>
              <Card label="Usuarios activos" value={fmt(ga4.cur.activeUsers)} accent="#a78bfa" change={delta(ga4.cur.activeUsers, ga4.prev?.activeUsers)} />
              <Card label="Sesiones" value={fmt(ga4.cur.sessions)} change={delta(ga4.cur.sessions, ga4.prev?.sessions)} />
              <Card label="Vistas" value={fmt(ga4.cur.views)} change={delta(ga4.cur.views, ga4.prev?.views)} />
              <Card label="Eventos clave" value={fmt(ga4.cur.keyEvents)} accent="#4ade80" change={delta(ga4.cur.keyEvents, ga4.prev?.keyEvents)} />
              <Card label="Eventos totales" value={fmt(ga4.cur.events)} change={delta(ga4.cur.events, ga4.prev?.events)} />
              <Card label="Duración media" value={fmtDuration(ga4.cur.avgEngagementSec)} change={delta(ga4.cur.avgEngagementSec, ga4.prev?.avgEngagementSec)} />
            </div>
            {ga4Series.length > 1 && (
              <div style={{ ...grid(320), marginTop: 16 }}>
                <ChartBox title="Usuarios activos por mes">
                  <LineChart data={ga4Series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Legend />
                    <Line type="monotone" dataKey="Usuarios" stroke="#a78bfa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartBox>
                <ChartBox title="Eventos clave por mes">
                  <BarChart data={ga4Series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} />
                    <Bar dataKey="Eventos clave" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartBox>
              </div>
            )}
            {ga4.channels?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>🌐 Fuentes de tráfico · {monthLabel(sel)}</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>Canal</th><th style={th}>Sesiones</th><th style={th}>Eventos clave</th><th style={th}>% conv.</th></tr></thead>
                    <tbody>
                      {ga4.channels.map((c, i) => (
                        <tr key={i}>
                          <td style={td}>{c.channel}</td>
                          <td style={td}>{fmt(c.sessions)}</td>
                          <td style={{ ...td, color: "#4ade80", fontWeight: 600 }}>{fmt(c.keyEvents)}</td>
                          <td style={td}>{fmtPct(c.sessions ? Math.round((c.keyEvents / c.sessions) * 1000) / 10 : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Conclusion id={`ga4-${sel}`} text={ga4Conclusion(sel, ga4.cur, ga4.prev, ga4.channels?.[0])} />
          </>
        ) : !data?.errors?.ga4 && <div style={{ color: "#8aa0bf", fontSize: 13 }}>Sin datos de GA4 para {monthLabel(sel)}.</div>}
      </Section>

      {/* EMAIL MARKETING */}
      <Section title="✉️ Email Marketing (Ebema Click)">
        {data?.errors?.email && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>Email: {data.errors.email}</div>}
        {emailAgg?.cur ? (
          <>
            <div style={grid(150)}>
              <Card label="Entregados" value={fmt(emailAgg.cur.delivered)} change={delta(emailAgg.cur.delivered, emailAgg.prev?.delivered)} />
              <Card label="Aperturas" value={fmt(emailAgg.cur.opens)} change={delta(emailAgg.cur.opens, emailAgg.prev?.opens)} />
              <Card label="Open Rate" value={fmtPct(emailAgg.cur.openRate)} accent="#4ade80" change={delta(emailAgg.cur.openRate, emailAgg.prev?.openRate)} />
              <Card label="CTOR" value={fmtPct(emailAgg.cur.ctor)} accent="#60a5fa" change={delta(emailAgg.cur.ctor, emailAgg.prev?.ctor)} />
              <Card label="Campañas" value={fmt(emailAgg.cur.list?.length)} />
            </div>
            {emailSeries.length > 1 && (
              <div style={{ ...grid(320), marginTop: 16 }}>
                <ChartBox title="Open Rate y CTOR por mes">
                  <LineChart data={emailSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" {...axis} /><YAxis {...axis} unit="%" /><Tooltip {...tip} /><Legend />
                    <Line type="monotone" dataKey="Open Rate" stroke="#4ade80" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="CTOR" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartBox>
              </div>
            )}
            {emailAgg.cur.list?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>📋 Campañas del mes</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead><tr><th style={th}>Campaña</th><th style={th}>Fecha</th><th style={th}>Entregados</th><th style={th}>Open Rate</th><th style={th}>Clic</th><th style={th}>CTOR</th></tr></thead>
                    <tbody>
                      {[...emailAgg.cur.list].sort((a, b) => b.openRate - a.openRate).map((c) => (
                        <tr key={c.id}>
                          <td style={td}>{c.name}</td>
                          <td style={td}>{fmtDate(c.date)}</td>
                          <td style={td}>{fmt(c.delivered)}</td>
                          <td style={{ ...td, color: "#4ade80", fontWeight: 600 }}>{fmtPct(c.openRate)}</td>
                          <td style={td}>{fmtPct(c.clickRate)}</td>
                          <td style={td}>{fmtPct(c.ctor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Conclusion id={`email-${sel}`} text={emailConclusion(sel, emailAgg.cur, emailAgg.prev, emailAgg.best)} />
          </>
        ) : !data?.errors?.email && <div style={{ color: "#8aa0bf", fontSize: 13 }}>Sin campañas de email para {monthLabel(sel)}.</div>}
      </Section>

      {/* PUNTOS DE MEJORA */}
      {improvements.length > 0 && (
        <Section title="🛠️ Puntos de mejora" subtitle="Qué optimizar este mes, detectado automáticamente a partir de las métricas">
          <div style={grid(300)}>
            {improvements.map((it, i) => (
              <div key={i} style={{ ...panel, borderLeft: `3px solid ${toneColor[it.tone] || "#fbbf24"}` }}>
                <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 6 }}>
                  <span style={{ marginRight: 6 }}>{it.emoji}</span>{it.title}
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.45 }}>{it.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* PLAN DEL PRÓXIMO MES (predictivo) */}
      {plan.length > 0 && (
        <Section title="🔮 Plan del próximo mes" subtitle="Acciones priorizadas y sugerencias automáticas según los datos del mes — valida según el contexto del cliente">
          <div style={grid(300)}>
            {plan.map((it, i) => (
              <div key={i} style={{ ...panel, borderLeft: `3px solid ${toneColor[it.tone] || "#60a5fa"}` }}>
                <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 6 }}>
                  <span style={{ marginRight: 6 }}>{it.emoji}</span>{it.title}
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.45 }}>{it.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <footer style={{ marginTop: 50, color: "#5b6b84", fontSize: 12, textAlign: "center" }}>
        Datos vía Meta Graph API (IG, FB, Meta Ads), Google Ads, GA4 y Brevo · LinkedIn y Competencia manuales · Ebema · Copywriters
      </footer>
    </main>
  );
}
