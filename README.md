# Ebema · Informe de Redes (Dashboard)

Dashboard web (Next.js + recharts) tipo **informe de fin de mes con conclusiones automáticas** para Ebema, conectado a:

- **Instagram orgánico** (alcance, visualizaciones, interacciones, engagement, clics a la web, nuevos seguidores, mejores publicaciones)
- **Facebook / Meta orgánico** (espectadores, visualizaciones, interacciones, visitas al perfil, nuevos seguidores, mejores publicaciones)
- **Meta Ads (paid)** (conversaciones iniciadas, inversión, CPR, alcance, clics, CTR — por campaña/sucursal)
- **Google Ads (paid)** (conversiones, CTR, CPC, costo/conversión, inversión, top keywords y campañas — API en vivo)
- **GA4 / Google Analytics** (usuarios activos, sesiones, vistas, eventos clave, duración media, fuentes de tráfico)
- **LinkedIn** (seguidores, nuevos, impresiones, reacciones, engagement y **mejores posts del mes** — API en vivo)
- **Email Marketing** vía Brevo (entregados, aperturas, Open Rate, CTOR, mejores campañas)

Además: **Puntos de mejora** y **Plan del próximo mes** (predictivo) automáticos, **conclusiones editables** (botón ✏️, se guardan en el navegador), tema rojo, banner Automático/Manual y **Exportar PDF**.

> **Competencia** es el único bloque **manual** (Not Just Analytics no tiene API pública): se edita en `data/manual.json`.

## Cómo conectar LinkedIn (pasos)

LinkedIn entrega la analítica de página por su **API oficial** (Community Management). Pasos para el token:

1. Entra a **LinkedIn Developers** → *Create app*, asóciala a la **página de empresa de Ebema** (tú eres admin).
2. En la app, pestaña **Products**, solicita **Community Management API** (acceso self-serve para admins de la página; se habilita para tu propia organización).
3. En **Auth**, genera un token OAuth de usuario con los scopes `r_organization_social` y `rw_organization_admin` (autorizándote como admin de la página). Guarda el **access token** (los de usuario duran ~60 días; renovable, o usa un flujo de refresh).
4. Saca el **ID numérico de la organización**: en LinkedIn admin, la URL es `linkedin.com/company/<ID>/admin` → ese `<ID>`.
5. En Vercel, carga `LINKEDIN_ACCESS_TOKEN` y `LINKEDIN_ORG_ID`. Listo: la sección LinkedIn pasa a **AUTO · API** y trae métricas y mejores posts del mes.

Mientras no esté el token, la sección muestra **datos de ejemplo** (los de mayo, ya sembrados) sin romper nada.

Todo agrupado **por mes**, con un selector de mes, scorecards que muestran la **variación vs. el mes anterior** y un párrafo de **conclusión auto-redactada** por canal, al estilo del informe mensual. Mismo enfoque y arquitectura que el dashboard de Brevo (datos server-side, key oculta, caché en memoria, auto-refresh).

## Arquitectura

- `lib/meta.js` — cliente de la Graph API de Meta (IG + FB + Ads), con reintentos ante rate limit, agrupación por mes y degradación elegante por métrica.
- `lib/googleads.js` — Google Ads API REST en vivo (totales mensuales, campañas y top keywords).
- `lib/ga4.js` — GA4 (rendimiento del sitio y fuentes de tráfico), reutilizando las credenciales del dashboard de Brevo.
- `lib/brevo.js` — campañas de email desde la API de Brevo.
- `app/api/dashboard/route.js` — orquesta todo con caché en memoria (10 min) y sirve la última copia buena si una API falla.
- `app/page.js` — la UI del informe.
- `middleware.js` — protección opcional por usuario/contraseña.

## Variables de entorno (en Vercel)

Ver `.env.example`. Las claves:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `META_ACCESS_TOKEN` | sí (redes/paid) | Token de larga duración / System User |
| `META_AD_ACCOUNT_ID` | paid | `823470930601959` (Ebema 2026) |
| `META_PAGE_ID` | FB/IG | `102254444856912` (página Ebema) |
| `META_IG_USER_ID` | opcional | Solo si no se resuelve solo desde la página |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads | Developer token (Google Ads API) |
| `GOOGLE_ADS_CUSTOMER_ID` | Google Ads | Cuenta Ebema, solo dígitos |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | opcional | MCC, solo dígitos |
| `GOOGLE_ADS_CLIENT_ID/SECRET/REFRESH_TOKEN` | Google Ads | OAuth (con scope Ads); cae a `GOOGLE_OAUTH_*` |
| `GA4_PROPERTY_ID` + (`GOOGLE_OAUTH_*` ó `GA_SERVICE_ACCOUNT_JSON`) | GA4 | Mismas credenciales del dashboard de Brevo |
| `BREVO_API_KEY` | email | Misma key del otro dashboard |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | opcional | Protegen el link |

### Credenciales de Google Ads

La Google Ads API requiere un **developer token** (se solicita en el API Center de la cuenta MCC; puede tardar en aprobarse), un cliente **OAuth** (client id/secret) y un **refresh token** con el scope `https://www.googleapis.com/auth/adwords`. Si la cuenta de Ebema cuelga de una MCC, define también `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

### Permisos del token de Meta

El token (de un usuario con acceso al Business de Ebema, o un **System User** del Business Manager) necesita estos permisos/scopes:

```
read_insights
pages_read_engagement
pages_show_list
instagram_basic
instagram_manage_insights
ads_read
business_management
```

Recomendado: crear un **System User** en Business Manager → asignarle la página, la cuenta de IG y la cuenta publicitaria → generar un token con esos scopes (no expira). Pegarlo en `META_ACCESS_TOKEN` en Vercel.

> Nota: el **total de seguidores** es una foto del momento (la Graph API no entrega historial de seguidores totales). El resto de métricas se reconstruye mes a mes desde los insights con serie de tiempo (alcance, visualizaciones, interacciones, nuevos seguidores, etc.).

## Deploy

1. Subir el repo a GitHub (vía GitHub Desktop, igual que el dashboard de Brevo).
2. Importar en Vercel → New Project.
3. Cargar las variables de entorno.
4. En Vercel, **Settings → Deployment Protection**: desactivar para que el link sea público sin login (o usar `DASHBOARD_USER`/`PASSWORD`).

## Local

```bash
npm install
cp .env.example .env.local   # y completar las variables
npm run dev
```
