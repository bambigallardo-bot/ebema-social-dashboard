// Borrador analítico de conclusiones con Claude.
// Escribe como el equipo: usa la guía de estilo, los datos del mes, lo que se dijo
// el mes anterior en esta misma sección y los textos más recientes que el equipo
// guardó en esa área en las otras marcas (se leen en vivo de sus /api/overrides).
// Además recibe el contexto que el equipo usa para explicar el porqué y que no está
// en los gráficos: calendario del mes (efemérides, Cyber, temporadas), lo que ya
// escribieron este mes en otras secciones y frases reales donde explican causas.
// Como los ejemplos son siempre lo último que el equipo dejó escrito, el borrador
// se va pareciendo cada vez más a cómo escriben ellos. Nunca guarda nada: el texto
// vuelve al cuadro de edición y una persona decide.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

// Dashboards de las marcas (para leer los ejemplos del equipo). El propio se excluye por nombre.
const DASHBOARDS = {
  "Ebema": "https://ebema-social-dashboard.vercel.app",
  "Más Center / Grupo IFB": "https://mascenter-social-dashboard-kmf5.vercel.app",
  "Selfie": "https://selfie-social-dashboard.vercel.app",
  "MyZoo": "https://myzoo-social-dashboard.vercel.app",
  "Tierra Calma": "https://tierracalma-social-dashboard.vercel.app",
  "PETRA": "https://petra-social-dashboard.vercel.app",
  "Traverso": "https://traverso-social-dashboard.vercel.app",
  "Grupo SGS": "https://sgs-group-dashboard.vercel.app",
};

// Rubro de cada marca, para saber qué fechas del calendario le importan.
const RUBROS = {
  "Ebema": "construccion",
  "Más Center / Grupo IFB": "mall",
  "Selfie": "peluqueria",
  "MyZoo": "mascotas",
  "Tierra Calma": "parcelas",
  "PETRA": "funeraria",
  "Traverso": "alimentos",
  "Grupo SGS": "b2b",
};

// Fechas que el equipo usa para explicar los resultados (efemérides, temporadas,
// eventos comerciales de Chile). Son POSIBLES causas: el borrador solo las usa si
// algo del mes las respalda (un post, una campaña, un salto en esas fechas).
const CALENDARIO = {
  "01": ["vacaciones de verano (baja actividad en Santiago)", "liquidaciones de verano"],
  "02": ["vacaciones de verano", "San Valentín (14)", "compras escolares a fin de mes"],
  "03": ["regreso a clases y gastos de inicio de año", "Día de la Mujer (8)"],
  "04": ["Semana Santa (fecha variable)", "Día del Libro (23)"],
  "05": ["Día del Trabajador (1)", "Día de la Madre (segundo domingo)", "Glorias Navales (21)", "CyberDay (fines de mayo o comienzos de junio, sube los costos de pauta en toda la industria)", "Día del Patrimonio (último fin de semana)"],
  "06": ["CyberDay (si cae a comienzos de junio, sube los costos de pauta en toda la industria)", "Día Mundial del Medio Ambiente (5)", "Día del Padre (tercer domingo)", "feriado de los Pueblos Indígenas (cerca del 20)", "inicio del invierno", "Mundial de fútbol 2026 (11 de junio al 19 de julio)"],
  "07": ["vacaciones de invierno escolares", "Virgen del Carmen (16)", "Mundial de fútbol hasta el 19", "frío y lluvias"],
  "08": ["Día del Niño (segundo domingo)", "Asunción (15)", "Mes de la Solidaridad"],
  "09": ["Fiestas Patrias (18 y 19; fondas y una semana de menor actividad)", "Mes de la Patria", "inicio de la primavera"],
  "10": ["Cyber Monday (suele ser a comienzos de octubre)", "Encuentro de Dos Mundos (12)", "Halloween (31)"],
  "11": ["Día de Todos los Santos (1)", "Black Friday (fines de noviembre)", "inicio de las compras de fin de año"],
  "12": ["Navidad y compras de fin de año", "Inmaculada Concepción (8)", "fin del año escolar", "aguinaldos"],
};
const CALENDARIO_RUBRO = {
  construccion: { "05": ["preparación para lluvias (impermeabilización, techumbre)"], "06": ["temporada de lluvias"], "07": ["temporada de lluvias"], "08": ["temporada de lluvias"], "09": ["primavera: pintura, jardín y terminaciones"], "10": ["primavera: pintura y jardín"], "11": ["temporada de obras de verano"] },
  mall: { "07": ["panoramas de vacaciones de invierno para niños"], "08": ["Día del Niño"], "10": ["Halloween en el mall"], "12": ["Viejito Pascuero y compras navideñas"] },
  peluqueria: { "08": ["Semana del Peluquero (fines de agosto)"], "09": ["cambio de look de primavera"], "12": ["peak de atenciones de fin de año"] },
  mascotas: { "07": ["Día Internacional del Perro (21)"], "08": ["Mes del Gato (Día Internacional del Gato, 8)"], "09": ["Fiestas Patrias: fuegos artificiales y estrés en mascotas"], "10": ["Día Mundial de los Animales (4)"], "12": ["fuegos artificiales de Año Nuevo"] },
  parcelas: { "01": ["verano: temporada de visitas a terreno"], "02": ["verano: temporada de visitas a terreno"], "12": ["aguinaldos y decisiones de inversión de fin de año"] },
  funeraria: { "05": ["Día de la Madre (recuerdo)"], "06": ["Día del Padre (recuerdo)", "invierno"], "07": ["invierno"], "11": ["Día de Todos los Santos (visitas a cementerios)"] },
  alimentos: { "09": ["Fiestas Patrias: empanadas, fondas y concursos de empanadas"] },
};

// Frases del equipo que explican el PORQUÉ con algo que pasó fuera del gráfico.
const CONTEXTO_RE = /(efem[ée]ride|d[ií]a (del|de la|de los|mundial|internacional)|mes del|semana del|fiestas patrias|cyber|black friday|navidad|vacaciones|invierno|verano|primavera|feriado|concurso|sorteo|lanzamiento|evento|colaboraci|alianza|influencer|temporada|aniversario|apertura|inaugur|mundial|feria|fonda|activaci|contingencia|se decidi|decidimos|cambi[oó] (el|de) objetivo|sin pauta|se paus|stock)/i;

const BASE = `Eres parte del equipo de Grupo CopyLab, agencia chilena de marketing digital. Escribes el borrador de una conclusión del informe mensual que ve el cliente. El equipo lo revisa antes de guardarlo: tu trabajo es dejarlo lo más cerca posible de cómo ellos escriben. Para eso recibes ejemplos reales del equipo; imita su manera de razonar, su largo y su tono, no su contenido.

CÓMO ESCRIBE EL EQUIPO
- Analítico: qué se ve → qué significa → por qué pasó → qué hacemos. Cada número va con su comparación (mes anterior, meta, otra pieza o campaña de la cuenta) y con lo que significa.
- Explica la causa antes de opinar: cuántas publicaciones hubo, cuánto vino de pauta y cuánto de orgánico, una fecha del calendario, un cambio de objetivo o de presupuesto, un concurso o colaboración.

EL PORQUÉ ESTÁ FUERA DEL GRÁFICO
Lo que más separa al equipo de un texto automático es que no se quedan en describir los números: dicen QUÉ PASÓ en el mes. "Tras el mes de alta intensidad de mayo (colaboraciones y ExpoMascotas), junio funcionó como un período de consolidación". "El Cyber de la primera semana de junio subió los costos en toda la industria". "En junio no tuvimos campaña de tráfico a la web, sino a Instagram, por eso bajaron las visitas al sitio". "El concurso de $300.000 fue el gran impulso del mes". "Un acierto fue aprovechar el Día Mundial del Medio Ambiente".
Antes de escribir, busca ese contexto en:
- los textos de las publicaciones (caption) y los nombres de campañas y anuncios: concursos, sorteos, colaboraciones, influencers, eventos, ferias, aperturas, aniversarios, efemérides, promociones;
- las fechas del mes que te llegan en "calendario_del_mes" (efemérides, temporadas, Cyber, feriados): úsalas solo si algo de los datos las respalda (una publicación sobre esa fecha, una campaña, un salto o caída en esos días). Si una fecha probablemente influyó pero no hay cómo comprobarlo, dilo con prudencia ("coincidió con la semana de Fiestas Patrias");
- lo que el equipo ya escribió este mes en otras secciones de esta marca ("lo_que_el_equipo_ya_escribio_este_mes"): si en Meta Ads contaron que hubo concurso, úsalo para explicar Instagram, sin contradecirlo;
- las notas que el equipo haya dejado en el editor.
Cada cifra importante tiene que ir con su porqué. Si no encuentras la causa, no la inventes: di qué se ve y qué habría que confirmar.
- Construcción típica: "X responde a A, no a B". "Menos personas vieron el contenido, pero las que lo vieron interactuaron más."
- Nombra publicaciones, campañas, anuncios y keywords con fecha y número, y explica POR QUÉ funcionaron o no (formato, gancho, personas reales, dato práctico, colaboración).
- Retoma lo que dijo el mes anterior: "Se cumplió la recomendación de agosto de…", "por tercer mes consecutivo", series como "217 → 216 → 188 → 113".
- Cierra con "Para [mes siguiente]…" y 2 a 4 acciones concretas que salgan de lo que se ve.
- Primera persona plural para la agencia ("proponemos", "vamos a", "invertimos") y "ustedes" para el cliente. Nunca órdenes en tú.
- Prosa en 2 a 4 párrafos separados por una línea en blanco. Sin títulos, viñetas, emojis, asteriscos ni markdown.
- Español de Chile: miles con punto (1.234), decimales con coma (0,28%), montos $1.234.567. Variación entre paréntesis después del número: "318.874 (+91,3%)" o "(agosto: 4,97)". Meses en minúscula.

QUÉ NO HACER (el equipo lo borra siempre)
- Benchmarks de industria, metas, proyecciones o porcentajes que no estén en los datos. Si no está en los datos o en los textos anteriores, no existe.
- Frases genéricas que servirían para cualquier marca ("reforzaremos contenidos participativos y tendencias"). Toda recomendación tiene que apoyarse en algo que pasó este mes.
- Recomendar reactivar algo que está apagado sin saber por qué.
- Copiar frases del mes anterior.

DATOS
- "texto_automatico" trae las cifras del mes ya calculadas (incluye correcciones manuales del equipo): úsalas como fuente de verdad para los números.
- "datos" trae el detalle del mes y el anterior (publicaciones, campañas, etc.).
- Si un dato no está, no lo inventes; puedes decir qué falta para leerlo completo, en una frase al final.`;

const AREAS = {
  ig: `ÁREA: Instagram orgánico. Abre con las métricas del mes (alcance, visualizaciones, interacciones, engagement, seguidores nuevos, visitas al perfil, clics a la web) con su variación, explica la causa, nombra las 2 o 3 mejores publicaciones con fecha y alcance y por qué funcionaron, y si se puede la que peor rindió y qué le faltó. Si hay datos de comentarios o mensajes, qué pregunta la gente y en qué proporción.`,
  fb: `ÁREA: Facebook. Misma lógica que Instagram. Distingue cuánto viene de la pauta y cuánto del orgánico. Si la página tiene poca base, dilo y propone su rol (respaldo de marca, contenido propio de esa audiencia en vez de réplica de Instagram).`,
  li: `ÁREA: LinkedIn. Lectura B2B: qué temas movieron (equipo, hitos, capacitaciones, visión de industria, documentos o carruseles), qué formato rindió menos, menciones de la industria y propuesta de línea editorial.`,
  ads: `ÁREA: Meta Ads. Formato del equipo desde septiembre 2026: la primera frase dice el objetivo o meta del mes y cuánto se logró contra el mes anterior ("En septiembre de 2026 el objetivo era llegar a 500 conversaciones… y cerramos el mes con 519, un 38% más que las 377 de agosto"). Luego cuánto costó cada resultado contra el mes anterior, "Lo que más destacó fue…" (campaña o pieza, con números y por qué) y "Lo que anduvo menos bien…" con la causa en simple. Lenguaje de cliente: nada de CTR, CPM, CPC, ROAS; di "de cada 100 personas que vieron el anuncio, 3 hicieron clic", "mostrar los anuncios mil veces costó $3.642". Ubica si el problema está antes o después del clic. 90 a 180 palabras salvo que el mes traiga un hallazgo grande.`,
  aprendizajes: `ÁREA: Aprendizajes de Meta / mejores anuncios. Un párrafo por pieza relevante: cuánto se llevó de la inversión, qué logró, por qué Meta la prefirió o la dejó de mostrar (Meta concentra la inversión en el anuncio que consigue resultados más baratos), en qué se nota (de cada 100 que la vieron cuántos hicieron clic, cuántos vieron el primer cuarto del video) y qué mejorar. Cierra con el aprendizaje que sirve para el próximo mes.`,
  gads: `ÁREA: Google Ads. Qué rol cumplió la búsqueda (acompañar a quien ya busca la marca, captar búsquedas genéricas), resultados y su costo contra el mes anterior, qué keywords trajeron resultados y cuáles gastaron sin traer, y si se pierden búsquedas por presupuesto o por ranking cuando hay datos. Lenguaje de cliente.`,
  tip: `ÁREA: Recomendación breve de Google Ads (2 o 3 frases): la palanca principal del próximo mes con el dato que la justifica.`,
  ga4: `ÁREA: Sitio web (GA4). Sesiones y usuarios con variación, de dónde viene el tráfico, qué canal convierte mejor (tasa de conversión por canal), qué páginas se ven, y dónde está el cuello de botella después del clic. Distingue tráfico pagado del orgánico y la dependencia de la pauta.`,
  comp: `ÁREA: Competencia. Posición de la marca (crecimiento o engagement) contra cada competidor nombrado con su número; qué hizo cada competidor que explique su resultado si está en los datos; el patrón que separa a quien creció ("el formato, no el presupuesto"); y la oportunidad accesible para la marca. Cuida los promedios inflados por una marca mucho más grande.`,
  email: `ÁREA: Email marketing. Si hay ingresos (ecommerce): parte por los ingresos atribuidos contra el mes anterior y CÓMO se lograron (envíos, volumen, apertura, ingreso por mensaje), los correos que concentraron el ingreso, y las alertas. Si no hay ingresos: un párrafo por métrica en orden (apertura, clics, rebote, desuscritos) con el valor, el del mes anterior y la explicación ("Esta reducción responde a…, no a…"), comparando los envíos del mes entre sí.`,
  "email-auto": `ÁREA: Automatizaciones de email. Ingreso total de automatizaciones contra el mes anterior y luego flujo por flujo (carrito, bienvenida, onboarding, reseñas, recompra…): cuánto aportó, si sube o baja y por qué, retomando lo que se dijo el mes anterior de cada flujo.`,
  "email-rfm": `ÁREA: Base de clientes (segmentos RFM). Qué segmentos suben o bajan contra el mes anterior (Champions, Loyalists, Recent, At Risk, About to Lose…), qué significa para el negocio y la alerta principal, más el desglose de ventas por cliente nuevo y frecuente si está.`,
  wa: `ÁREA: Campañas de WhatsApp (envíos masivos). Resultados contra el mes anterior, la campaña que mejor funcionó y por qué, lo que no funcionó.`,
  leads: `ÁREA: Leads del CRM. Cuántos leads llegaron por canal contra el mes anterior, calidad si está, costo si se puede cruzar con la inversión, y dónde se pierden.`,
  resumen: `ÁREA: Resumen del mes. 3 a 5 frases: qué pasó con el objetivo principal, por qué y qué viene.`,
};

const DATA_KEYS = {
  ig: ["instagram"], fb: ["facebook"], li: ["linkedin"],
  ads: ["ads", "bestAds", "breakdowns", "mtd", "config"], aprendizajes: ["ads", "bestAds", "breakdowns"],
  gads: ["googleAds", "brands"], tip: ["googleAds", "brands"], ga4: ["ga4", "brands"],
  comp: ["instagram", "facebook"], email: ["email"], wa: ["whatsapp"], leads: ["leads", "ads", "googleAds"],
};
const STORE_KEYS = {
  ig: ["instagram", "social", "metrics"], fb: ["facebook", "social", "metrics"], li: ["linkedin"],
  ads: ["ads", "budget"], aprendizajes: ["ads"], comp: ["competencia"], email: ["email"],
  "email-auto": ["email"], "email-rfm": ["email"],
};

const areaOf = (id) => id.replace(/-\d{4}-\d{2}$/, "");
const familyOf = (area) => area.split("-")[0];
const monthOf = (id) => (id.match(/(\d{4}-\d{2})$/) || [])[1];
const words = (t) => String(t || "").split(/\s+/).filter(Boolean).length;
const numbers = (t) => (String(t || "").match(/\d[\d.,]*/g) || []).length;

function prevMonth(m, n = 1) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_RE = /^\d{4}-\d{2}/;
// Recorta el JSON de datos a los meses que importan para no mandar todo el histórico.
function trim(v, months, depth = 0) {
  if (depth > 6) return undefined;
  if (Array.isArray(v)) {
    const objs = v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
    if (objs.length && objs.length === v.length) {
      const mk = (x) => [x.key, x.month, x.monthKey, x.date, x.sentAt, x.sent_at, x.timestamp, x.created_time, x.createdAt]
        .find((s) => typeof s === "string" && MONTH_RE.test(s));
      if (objs.some((x) => mk(x))) v = objs.filter((x) => { const k = mk(x); return !k || months.some((m) => k.startsWith(m)); });
    }
    return v.slice(0, 30).map((x) => trim(x, months, depth + 1));
  }
  if (v && typeof v === "object") {
    const out = {};
    const keys = Object.keys(v);
    const monthKeyed = keys.length > 0 && keys.every((k) => /^\d{4}-\d{2}(-\d{2})?$/.test(k));
    for (const k of keys) {
      if (k === "debug" || k === "picture" || k === "_instrucciones") continue;
      if (monthKeyed && !months.some((m) => k.startsWith(m))) continue;
      const t = trim(v[k], months, depth + 1);
      if (t !== undefined) out[k] = t;
    }
    return out;
  }
  if (typeof v === "string" && /^https?:\/\//.test(v)) return undefined; // URLs de imágenes: no aportan
  return v;
}

function capSize(obj, maxChars = 60000) {
  let s = JSON.stringify(obj);
  let n = 30;
  while (s.length > maxChars && n > 3) {
    n = Math.floor(n / 2);
    const shrink = (v) => Array.isArray(v) ? v.slice(0, n).map(shrink)
      : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shrink(x)])) : v;
    obj = shrink(obj);
    s = JSON.stringify(obj);
  }
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}

// Ejemplos del equipo en otras marcas (cacheados 1 hora por instancia).
let _ext = { at: 0, data: null };
async function otherBrandsConclusions(selfMarca) {
  if (_ext.data && Date.now() - _ext.at < 3600_000) return _ext.data;
  const entries = Object.entries(DASHBOARDS).filter(([m]) => m !== selfMarca);
  const res = await Promise.all(entries.map(async ([marca, url]) => {
    try {
      const r = await fetch(`${url}/api/overrides`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      const j = await r.json();
      return Object.entries(j.conclusions || {}).map(([id, texto]) => ({ marca, id, texto: typeof texto === "string" ? texto : "" }));
    } catch (_) { return []; }
  }));
  _ext = { at: Date.now(), data: res.flat() };
  return _ext.data;
}

// Biblioteca viva de cómo el equipo explica las causas: crece sola cada mes que escriben.
function contextSentences(all, month, max = 14) {
  const out = [];
  const seen = new Set();
  const sorted = all
    .map((x) => ({ ...x, mes: monthOf(x.id) || "" }))
    .filter((x) => x.texto && (!month || x.mes <= month))
    .sort((a, b) => b.mes.localeCompare(a.mes));
  const perMarca = {};
  for (const x of sorted) {
    for (const f of x.texto.split(/(?<=[.!?])\s+/)) {
      const t = f.trim();
      if (t.length < 60 || t.length > 400 || !CONTEXTO_RE.test(t) || seen.has(t)) continue;
      if ((perMarca[x.marca] || 0) >= 3) break;
      seen.add(t);
      perMarca[x.marca] = (perMarca[x.marca] || 0) + 1;
      out.push(`[${x.marca} · ${x.id}] ${t}`);
      break; // una frase por texto, para que haya variedad
    }
    if (out.length >= max) break;
  }
  return out;
}

function calendarFor(marca, month) {
  if (!month) return [];
  const mm = month.slice(5, 7);
  return [...(CALENDARIO[mm] || []), ...((CALENDARIO_RUBRO[RUBROS[marca]] || {})[mm] || [])];
}

function pickExamples(all, area, month, max = 6) {
  const fam = familyOf(area);
  const scored = all
    .filter((x) => x.texto && familyOf(areaOf(x.id)) === fam && words(x.texto) >= 50 && numbers(x.texto) >= 4)
    .map((x) => ({ ...x, mes: monthOf(x.id) || "", exacta: areaOf(x.id) === area }))
    .filter((x) => !month || x.mes <= month)
    .sort((a, b) => (b.exacta - a.exacta) || b.mes.localeCompare(a.mes) || (numbers(b.texto) - numbers(a.texto)));
  const out = [];
  const marcas = new Set();
  for (const x of scored) { if (out.length < max && !marcas.has(x.marca)) { out.push(x); marcas.add(x.marca); } }
  for (const x of scored) { if (out.length < max && !out.includes(x)) out.push(x); }
  return out.map(({ marca, id, texto }) => ({ marca, seccion: id, texto }));
}

export async function draftConclusion({ marca, id, autoText, currentText, store, dashboard }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en Vercel (Settings → Environment Variables)");
  const area = areaOf(id);
  const fam = familyOf(area);
  const month = monthOf(id);
  const months = month ? [month, prevMonth(month), prevMonth(month, 2)] : [];

  const own = Object.entries(store.conclusions || {})
    .filter(([k, t]) => areaOf(k) === area && k !== id && typeof t === "string" && (!month || monthOf(k) < month))
    .sort(([a], [b]) => (monthOf(b) || "").localeCompare(monthOf(a) || ""))
    .slice(0, 3)
    .map(([k, t]) => ({ seccion: k, texto: t }));
  const otherAll = await otherBrandsConclusions(marca);
  const others = pickExamples(otherAll, area, month);
  const ownAll = Object.entries(store.conclusions || {})
    .filter(([, t]) => typeof t === "string")
    .map(([k, t]) => ({ marca, id: k, texto: t }));
  const mismoMes = ownAll
    .filter((x) => month && monthOf(x.id) === month && x.id !== id && words(x.texto) >= 20)
    .map(({ id: seccion, texto }) => ({ seccion, texto }));
  const frasesContexto = contextSentences([...ownAll.filter((x) => x.id !== id), ...otherAll], month);

  const datos = {};
  for (const k of DATA_KEYS[fam] || Object.keys(dashboard || {})) if (dashboard?.[k] != null) datos[k] = dashboard[k];
  if (dashboard?.manual) datos.manual = dashboard.manual;
  const ediciones = {};
  for (const k of STORE_KEYS[area] || STORE_KEYS[fam] || []) if (store[k] != null) ediciones[k] = store[k];

  const payload = {
    marca,
    seccion: id,
    mes: month,
    texto_automatico: autoText || null,
    texto_actual_en_el_editor: currentText && currentText !== autoText ? currentText : null,
    conclusiones_anteriores_de_esta_seccion: own,
    lo_que_el_equipo_ya_escribio_este_mes: mismoMes,
    calendario_del_mes: calendarFor(marca, month),
    datos: trim(datos, months),
    ediciones_manuales_del_equipo: trim(ediciones, months),
  };

  const ejemplos = others.length
    ? others.map((e) => `[${e.marca} · ${e.seccion}]\n${e.texto}`).join("\n\n---\n\n")
    : "(sin ejemplos de otras marcas para esta área)";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 200_000, maxRetries: 1 });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: BASE, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content:
        `${AREAS[area] || AREAS[fam] || AREAS.resumen}\n\n` +
        `EJEMPLOS RECIENTES DEL EQUIPO EN ESTA ÁREA (otras marcas; imita cómo razonan y escriben):\n\n${ejemplos}\n\n` +
        (frasesContexto.length ? `CÓMO EL EQUIPO EXPLICA EL PORQUÉ CON LO QUE PASÓ EN EL MES (frases reales; busca el equivalente para esta marca y este mes, no las copies):\n${frasesContexto.join("\n")}\n\n` : "") +
        `En "conclusiones_anteriores_de_esta_seccion" están los textos de esta misma marca en meses anteriores: mantén un largo y tono parecidos, retoma lo que se recomendó y no repitas frases.\n` +
        `Si "texto_actual_en_el_editor" no es null, el equipo ya empezó a escribir o dejó notas sueltas de lo que pasó en el mes (por ejemplo "hubo concurso y Fiestas Patrias, se pausó la pauta el 10"): respeta sus ideas, úsalas como contexto y redáctalas con los datos.\n\n` +
        `DATOS:\n${capSize(payload)}\n\n` +
        `Escribe solo el texto de la conclusión, listo para pegar.`,
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("La IA no pudo escribir este borrador");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) throw new Error("Respuesta vacía");
  return text;
}
