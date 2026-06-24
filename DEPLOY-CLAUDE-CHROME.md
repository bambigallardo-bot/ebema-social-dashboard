# Deploy del dashboard con Claude para Chrome

Tú primero publicas el repo en **GitHub Desktop** (Add Local Repository → `ebema-social-dashboard` → Publish).
Luego, en Chrome con Claude para Chrome (logueada en Vercel, GitHub y Google), pega el prompt de abajo.

## PROMPT (deploy + copia de tokens)

```
Estoy logueada en Vercel, GitHub y Google. Quiero desplegar un dashboard nuevo en Vercel
reutilizando tokens que ya existen en otros proyectos. Hazlo todo en el navegador y, al
final, dame el link público. No inventes valores; si no encuentras algo, dime en qué quedaste.

PASO 1 — Importar
- Vercel → Add New → Project → importa el repo de GitHub "ebema-social-dashboard".
- Framework: Next.js. No cambies la configuración de build. NO hagas deploy todavía.

PASO 2 — Copiar variables del proyecto de Brevo
- Abre el proyecto "ebema-brevo-dashboard" → Settings → Environment Variables.
- Copia el VALOR de estas (las que existan) y agrégalas al proyecto nuevo con el mismo nombre:
  BREVO_API_KEY
  GA4_PROPERTY_ID
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
  GOOGLE_OAUTH_REFRESH_TOKEN
  GA_SERVICE_ACCOUNT_JSON

PASO 3 — Copiar variables del proyecto de paid media (Meta + Google Ads)
- Abre el proyecto "paid-media-dashboard" (o el que ya use Meta y Google Ads) →
  Settings → Environment Variables.
- Copia el VALOR del token de Meta y agrégalo al proyecto nuevo como:
  META_ACCESS_TOKEN
- Copia los de Google Ads y agrégalos con ESTOS nombres exactos (si en el origen tienen
  otro nombre, copia igual el valor):
  GOOGLE_ADS_DEVELOPER_TOKEN
  GOOGLE_ADS_CLIENT_ID
  GOOGLE_ADS_CLIENT_SECRET
  GOOGLE_ADS_REFRESH_TOKEN
  GOOGLE_ADS_LOGIN_CUSTOMER_ID   (id de la MCC, solo dígitos)

PASO 4 — Variables fijas de Ebema (agrégalas tal cual)
  META_AD_ACCOUNT_ID = 823470930601959
  META_PAGE_ID = 102254444856912
  LINKEDIN_ORG_ID = 3863744

PASO 5 — Customer ID de Google Ads de EBEMA (NO el de otro cliente)
- Abre https://ads.google.com , selecciona la cuenta de EBEMA y lee el número de cuenta
  (arriba a la derecha, formato XXX-XXX-XXXX). Quítale los guiones y agrégalo como:
  GOOGLE_ADS_CUSTOMER_ID = <solo dígitos>
- Si no encuentras la cuenta de Ebema, detente y pregúntame.

PASO 6 — Deploy y link público
- Haz Deploy.
- Al terminar: Settings → Deployment Protection → desactívala (link público sin login).
- Devuélveme el link final del dashboard.

Faltará LINKEDIN_ACCESS_TOKEN (pendiente de aprobación de LinkedIn): NO lo busques, lo
agrego después. El dashboard debe desplegar igual y mostrar las secciones con datos.
```

## Después del deploy
- Si Instagram/Facebook orgánico muestran error de permisos, el token de Meta no trae los
  scopes de insights de página/IG; se regenera ampliando permisos (read_insights,
  pages_read_engagement, instagram_basic, instagram_manage_insights).
- Cuando LinkedIn apruebe, agrega LINKEDIN_ACCESS_TOKEN y Redeploy.
