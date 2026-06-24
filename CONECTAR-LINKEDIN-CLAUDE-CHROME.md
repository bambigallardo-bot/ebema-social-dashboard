# Conectar LinkedIn con Claude para Chrome

El dashboard ya trae LinkedIn **automático por API** (`lib/linkedin.js`). Solo necesita 2 datos en Vercel:

- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_ORG_ID`

Como tú eres admin de la página de Ebema, deja que **Claude para Chrome** los consiga por ti. Abre Chrome con la extensión, logueada con tu cuenta (la que administra la página de Ebema), y **pega este prompt**:

---

## PROMPT 1 — Obtener el token y el ID (pégalo a Claude para Chrome)

```
Necesito conectar la página de empresa de EBEMA en LinkedIn a un dashboard propio
vía la Community Management API. Soy admin de la página. Ayúdame paso a paso en el
navegador y, al final, entrégame DOS valores en un bloque para copiar:
LINKEDIN_ACCESS_TOKEN y LINKEDIN_ORG_ID.

Haz esto:
1. Abre https://www.linkedin.com/developers/apps y crea una app nueva
   (o usa una existente). Asóciala a la PÁGINA DE EMPRESA de Ebema y completa
   logo/privacy URL si los pide.
2. En la pestaña "Products" de la app, solicita/activa "Community Management API"
   (acceso self-serve para administradores de la propia página).
3. En la pestaña "Auth", usa el "OAuth 2.0 token generator" / "Token Inspector"
   para generar un ACCESS TOKEN de usuario con estos scopes marcados:
   r_organization_social y rw_organization_admin. Autorízate como admin de Ebema.
   Copia el access token completo.
4. Consigue el ID numérico de la organización: abre
   https://www.linkedin.com/company/ → entra a la página de Ebema → "Admin" ;
   la URL queda como linkedin.com/company/<NUMERO>/admin. Ese <NUMERO> es el ORG_ID.
   (Si la URL muestra el nombre y no el número, abre "Configuración de la página"
   o el "Centro de administración" donde aparece el ID numérico.)
5. Devuélveme exactamente:

LINKEDIN_ACCESS_TOKEN=<el token>
LINKEDIN_ORG_ID=<el número>

Si algún paso te pide permisos que yo deba aprobar (login, 2FA, aceptar términos),
detente y dime qué hacer. No inventes valores: si no encuentras el token o el ID,
avísame en qué pantalla quedaste.
```

---

## Dónde pegar el resultado

1. Vercel → tu proyecto `ebema-social-dashboard` → **Settings → Environment Variables**.
2. Agrega `LINKEDIN_ACCESS_TOKEN` y `LINKEDIN_ORG_ID` con los valores que te dio Claude.
3. **Redeploy**. La sección LinkedIn pasa de "DATOS DE EJEMPLO" a **"AUTO · API"** y trae
   métricas + mejores posts del mes en vivo.

> El token de usuario de LinkedIn dura ~60 días. Cuando caduque, vuelve a correr el
> PROMPT 1 (paso 3) y reemplaza solo `LINKEDIN_ACCESS_TOKEN` en Vercel.

---

## PROMPT 2 — Plan B: si NO se puede activar la API

Si LinkedIn no te deja activar la Community Management API, usa Claude para Chrome para
llenar los datos a mano una vez al mes. Ve a **LinkedIn → página de Ebema → Análisis**
(Seguidores, Visitantes, Contenido), elige el mes que cerró y pega:

```
Estás en LinkedIn Analytics de la página de EBEMA como admin. Lee las métricas del
MES <MES> (Seguidores, Visitantes y Contenido) y dame SOLO este JSON para pegar en
data/manual.json del repo, bajo "linkedin":

"<AAAA-MM>": {
  "followers": <seguidores totales>,
  "monthly": { "acquired": <nuevos>, "impressions": <impresiones>, "views": <visualizaciones>, "reactions": <reacciones>, "engagement": <engagement %> },
  "best": [ { "label": "POST: <tema>", "date": "<dd mes>", "impressions": <n>, "reactions": <n>, "clicks": <n>, "newFollowers": <n> } ]
}

Luego abre github.com → repo ebema-social-dashboard → data/manual.json → editar,
pega el bloque dentro de "linkedin" con la key del mes, y haz commit.
```

(El dashboard usa estos datos solo si NO hay token de API; con token, manda la API.)
