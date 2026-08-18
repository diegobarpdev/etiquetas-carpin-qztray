# Seguridad y autenticación

Fecha: 2026-08-18. Describe las capas de seguridad de la app y cómo
operarlas (rotar/recuperar PINs, qué hacer si alguien se va de la
empresa, qué asume el diseño sobre la red).

## Modelo general

```
Internet
   │  (no debería llegar nunca — ver "Supuesto de red" abajo)
   ▼
┌─────────────────────────────────────────────┐
│ Front :3000 (apps/web/server.ts)             │
│  - sirve el bundle estático                  │
│  - proxea /api/* y /health hacia la API      │
│  - agrega X-Internal-Key en cada pedido      │
└───────────────┬───────────────────────────────┘
                │ (solo el proxy conoce X-Internal-Key)
                ▼
┌─────────────────────────────────────────────┐
│ API :3010 (apps/api/index.ts)                │
│  1. CORS allowlist                            │
│  2. X-Internal-Key (rechaza si falta/no matchea)│
│  3. APP_ACCESS_PIN → cookie de sesión (30 días)│
│  4. rutas normales (/api/orders, /api/labels…) │
│     └─ PRINT_ADMIN_PIN → segunda sesión (30 min)│
│        solo para /api/admin/printers/*         │
└─────────────────────────────────────────────┘
```

Cuatro capas independientes, cada una con un objetivo distinto:

| Capa | Objetivo | Bypassable por |
|---|---|---|
| CORS allowlist | Que un sitio web ajeno no pueda leer respuestas con credenciales del navegador de un operario | No aplica a pedidos servidor-a-servidor (curl, Postman) — solo protege contra otro sitio web corriendo en el mismo navegador |
| `X-Internal-Key` | Que nadie pegue directo al puerto 3010 salteando el front | Cualquiera con la red interna igual puede llegar a 3000, que sí tiene el proxy — esta capa frena pegarle *directo a la API*, no reemplaza las siguientes |
| `APP_ACCESS_PIN` | Que un desconocido en la red de la fábrica no pueda buscar/imprimir sin el PIN de planta | Alguien que consiga el PIN (se lo pasan, lo ve escrito, fuerza bruta si no hubiera rate-limit) |
| `PRINT_ADMIN_PIN` | Que un operario común no pueda tocar el catálogo de impresoras/estaciones | Alguien con el PIN de admin |

## Los dos PINs, la diferencia

- **`APP_ACCESS_PIN`**: pide la app entera (`Etiquetas Colineal`) la
  primera vez que se abre en una PC. Sesión de **30 días** — pensado
  para que la PC de planta quede "confiada" y el operario no vuelva a
  loguearse en cada turno.
- **`PRINT_ADMIN_PIN`**: pide solo `Configuración → Impresoras`. Sesión
  de **30 minutos**, y además el botón "Configuración" siempre fuerza a
  reingresarlo (no reusa sesión previa, ver `PrintersAdmin.tsx` →
  `openFlow()`).

Son PINs **distintos a propósito**: el operario que imprime todo el día
solo necesita el primero; el segundo queda reservado para quien
administra impresoras (normalmente vos o el encargado de sistemas).

## Cómo funciona la sesión (para quien toque el código)

`apps/api/lib/session-auth.ts` es la implementación genérica, usada por
ambos PINs (`apps/api/services/app-access-auth.service.ts` y
`print-admin-auth.service.ts` solo cambian `cookieName`/`pinEnvVar`/`ttlMs`).

La sesión **no se guarda en memoria del proceso** (no hay un `Map` de
sesiones activas). En cambio, la cookie es un token autofirmado:

```
cookie = "<expiresAtMs>.<HMAC-SHA256(expiresAtMs, secreto)>"
```

El secreto es `INTERNAL_API_KEY` combinado con el nombre de la cookie
(para que un token de `app_access_session` no sirva como
`print_admin_session` aunque compartan el mismo secreto de base). Al
validar, el server recalcula el HMAC y compara en tiempo constante
(`timingSafeEqual`) — si coincide y `expiresAtMs` no pasó, la sesión es
válida.

**Por qué así y no con un `Map` en memoria:** un `Map` se pierde en cada
reinicio del proceso (deploy, cuelgue). Con una sesión de
30 minutos (admin) eso no importa. Pero con una sesión de **30 días**
(acceso general), perderla en cada reinicio de rutina obligaría a
reingresar el PIN en todas las PCs cada vez que se sube código — exactamente
lo que la sesión larga buscaba evitar. El HMAC no depende de estado del
proceso: sobrevive reinicios sin cambiar el comportamiento.

**Costo de esa elección:** no hay forma de invalidar UNA sesión
puntual (no hay lista de sesiones activas para borrar de a una). Solo se
puede invalidar **todas a la vez**, rotando el secreto. Ver
"Invalidar todas las sesiones" abajo.

## Se me olvidó el PIN / alguien se olvidó del suyo

Los PINs no son por-usuario (no hay usuarios, login individual ni
recuperación por email) — son un secreto compartido de planta. No hay
"olvidé mi contraseña": alguien con acceso al servidor mira el valor
real en `.env`:

```powershell
Select-String -Path .env -Pattern "APP_ACCESS_PIN|PRINT_ADMIN_PIN"
```

y se lo pasa de nuevo al operario. No hace falta reiniciar nada — el
PIN se lee de `.env` en cada intento de unlock, no queda cacheado en
memoria.

## Rotar un PIN (cambiarlo)

1. Editar `.env`, cambiar `APP_ACCESS_PIN=` o `PRINT_ADMIN_PIN=` por el
   valor nuevo.
2. Reiniciar la API (cortar el proceso `node`/`npm start` y volver a
   levantarlo).
3. **Las sesiones ya abiertas siguen funcionando** hasta que expiren
   (hasta 30 días para `APP_ACCESS_PIN`, hasta 30 min para
   `PRINT_ADMIN_PIN`) — cambiar el PIN no cierra sesiones existentes,
   solo bloquea nuevos intentos de unlock con el PIN viejo. Es
   intencional (si no, cualquier restart de rutina desloguearía a todo
   el piso).

Motivos típicos para rotar: sospecha de que el PIN se filtró
demasiado (más gente de la que debería lo sabe), cambio de política
interna, etc.

## Alguien se fue de la empresa: invalidar TODAS las sesiones ya

Si hace falta cortar el acceso ya mismo (no esperar los 30 días), no
alcanza con cambiar el PIN — hay que invalidar el secreto de firma:

1. Generar una `INTERNAL_API_KEY` nueva:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Reemplazar `INTERNAL_API_KEY=` en `.env` con el valor nuevo.
3. (Opcional pero recomendado si el motivo es este) rotar también
   `APP_ACCESS_PIN` y `PRINT_ADMIN_PIN` en el mismo paso.
4. Reiniciar API y front (el front también lee `INTERNAL_API_KEY` para
   el proxy — si no coincide con la API, todo pedido vuelve 401).
5. Todas las cookies de sesión existentes (de ambos tipos, en todas las
   PCs) quedan inválidas al instante — cada PC va a pedir el PIN de
   nuevo la próxima vez que abra la app.

Esto **también** corta cualquier sesión legítima activa en ese momento
(todo el piso vuelve a ver la pantalla de PIN) — es la naturaleza de no
tener un registro de sesiones individuales. Usarlo solo cuando
realmente hace falta cortar todo, no para rotar un PIN de rutina (para
eso alcanza con el paso anterior).

## Rate-limit y bloqueo por fuerza bruta

`/api/app/unlock` y `/api/admin/printers/unlock` comparten el mismo
esquema de bloqueo progresivo por IP (`apps/api/lib/session-auth.ts`):

| Intentos fallidos seguidos | Bloqueo |
|---|---|
| 5 | 30 segundos |
| 8 | 2 minutos |
| 12 | 15 minutos |

El contador es en memoria (si el proceso reinicia, se resetea) — es
aceptable acá porque el objetivo es frenar fuerza bruta automatizada,
no llevar un registro permanente de intentos.

## Supuesto de red

Todo lo anterior asume que **el server solo es alcanzable desde la red
interna de la fábrica**, nunca desde internet directo (sin VPN, sin
port-forward, sin túnel tipo Cloudflare — hubo uno hace tiempo, se dio
de baja, verificado el 2026-08-17 que no corre ningún
proceso/servicio/tarea programada de eso). El PIN de acceso frena a
alguien que llegue a esa red sin ser operario, pero no reemplaza
mantener la red cerrada hacia afuera — si algún día se expone el server
a internet (VPN, port-forward, lo que sea), revisar esta lista de
nuevo antes de exponerlo:

- ¿Sigue habiendo rate-limit adecuado para tráfico de internet (no solo
  de planta)?
- ¿Los PINs numéricos cortos (`APP_ACCESS_PIN` es de 6 dígitos hoy)
  siguen siendo suficientes, o hace falta algo más fuerte estando
  expuesto a internet?
- ¿HTTPS real (hoy todo es HTTP plano en la LAN)?

## Endpoints públicos (sin ninguna de estas capas)

Solo `GET /health` queda totalmente público (ni `X-Internal-Key` ni
PIN) — es el chequeo de salud que usan monitoreo/scripts, no expone
datos de órdenes ni impresión.
