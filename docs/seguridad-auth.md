# Seguridad y autenticación

Fecha: 2026-08-18. Describe las capas de seguridad de la app y cómo
operarlas (primer admin, aprobar/rechazar/promover usuarios, cortar
acceso a alguien, qué asume el diseño sobre la red).

> Reemplaza el modelo anterior de PIN compartido (`APP_ACCESS_PIN` /
> `PRINT_ADMIN_PIN`) por cuentas reales por persona. Motivo: habilitar
> publicar la app más allá de la LAN de la fábrica, con usuarios
> nuevos/externos sumándose — un PIN único para todos ya no alcanzaba.

## Modelo general

```
Internet / red externa (ahora sí puede llegar acá — ver "Supuesto de red")
   ▼
┌─────────────────────────────────────────────┐
│ Front (apps/web/server.ts)                   │
│  - sirve el bundle estático                  │
│  - proxea /api/* y /health hacia la API      │
│  - agrega X-Internal-Key en cada pedido      │
└───────────────┬───────────────────────────────┘
                │ (solo el proxy conoce X-Internal-Key)
                ▼
┌─────────────────────────────────────────────┐
│ API (apps/api/index.ts)                      │
│  1. CORS allowlist                            │
│  2. X-Internal-Key (rechaza si falta/no matchea)│
│  3. /api/auth/* sin gate (login/registro/logout)│
│  4. requireLogin → cookie de sesión (30 días) │
│     + relectura en vivo de rol/estado en DB   │
│  5. rutas normales (/api/orders, /api/labels…) │
│     └─ requireAdmin → exige role='admin'       │
│        en /api/admin/* (impresoras/inspectores/│
│        usuarios)                               │
└─────────────────────────────────────────────┘
```

| Capa | Objetivo | Bypassable por |
|---|---|---|
| CORS allowlist | Que un sitio web ajeno no pueda leer respuestas con credenciales del navegador de un operario | No aplica a pedidos servidor-a-servidor (curl, Postman) — solo protege contra otro sitio web corriendo en el mismo navegador |
| `X-Internal-Key` | Que nadie pegue directo al puerto de la API salteando el front | Cualquiera con la red igual puede llegar al front, que sí tiene el proxy — esta capa frena pegarle *directo a la API*, no reemplaza las siguientes |
| Login (email+clave) | Que un desconocido no pueda buscar/imprimir sin cuenta aprobada | Alguien con las credenciales de una cuenta real (fuerza bruta mitigada por rate-limit) |
| Rol `admin` | Que un operario común no pueda tocar impresoras/inspectores/usuarios | Alguien con credenciales de una cuenta `admin` |

## Cuentas y roles

Dos roles:
- **`operario`** (default al registrarse): busca e imprime.
- **`admin`**: además, `Configuración → Impresoras`, `→ Inspectores` y
  `→ Usuarios`.

Cualquiera puede crearse una cuenta desde la pantalla de acceso (nombre,
email, clave ≥8 caracteres), pero queda en estado `pending` — no puede
loguearse hasta que un admin la apruebe desde `Configuración → Usuarios`.
Un admin puede: aprobar, rechazar (corta el acceso), promover a admin,
degradar a operario, o resetear la clave de cualquiera a mano (sin
email de por medio — no hay SMTP configurado).

**Guarda de "último admin":** no se puede rechazar ni degradar al único
admin aprobado que quede (`apps/api/routes/admin-users.ts`,
`requireNotLastAdmin`) — sin esto la app podría quedar sin nadie que
pueda gestionar usuarios.

## El primer admin (bootstrap)

Como el registro necesita aprobación de un admin, alguien tiene que ser
el primero. Se resuelve con dos env vars leídas una sola vez al
arrancar (`apps/api/services/bootstrap-admin.service.ts`):

```
BOOTSTRAP_ADMIN_EMAIL=admin@tuempresa.com
BOOTSTRAP_ADMIN_PASSWORD=algo-largo-y-random
```

Si ese email **no existe todavía**, se crea como admin ya aprobado. Si
ya existe, no hace nada (no resetea la clave en cada restart, por si ya
se cambió a mano). Úsalo una vez para entrar y aprobar/promover al
resto desde la app; después puedes dejar las env vars puestas sin
problema, o borrarlas.

## Cómo funciona la sesión (para quien toque el código)

`apps/api/lib/user-session.ts`. La cookie (`user_session`, `HttpOnly`,
`SameSite=Lax`, `Secure` si la conexión es HTTPS) es un token
autofirmado, igual que el esquema PIN anterior, pero **solo firma la
identidad, no el rol ni el estado**:

```
cookie = "<userId>.<expiresAtMs>.<HMAC-SHA256(userId.expiresAtMs, secreto)>"
```

El secreto es `INTERNAL_API_KEY`. En cada request, `requireLogin`
verifica la firma/expiración y **relee el usuario completo de la DB**
(`prisma.user.findUnique`) para confirmar `status === 'approved'` y
obtener el `role` actual — a propósito, para que aprobar, rechazar,
promover o degradar a alguien tenga efecto **inmediato**, sin esperar a
que expire una sesión de hasta 30 días. `requireAdmin` es lo mismo más
`role === 'admin'`.

**Costo de esto:** una request de más a la DB local (Postgres) por
pedido autenticado — aceptable, la DB es local y esta app no es de alto
tráfico.

## Cortar acceso a UNA persona

Rechazarla desde `Configuración → Usuarios` (botón "Quitar acceso" /
"Rechazar"). Efecto inmediato — su próxima request (con la sesión que
ya tenía abierta, o si intenta loguearse de nuevo) falla, sin esperar a
que expire nada. Esto es justamente lo que el PIN compartido anterior
no podía hacer sin afectar a todos.

## Cortar TODO acceso ya (incidente grave)

Si hace falta invalidar **todas** las sesiones activas de una (no solo
la de una persona):

1. Generar una `INTERNAL_API_KEY` nueva:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Reemplazar `INTERNAL_API_KEY=` en `.env` con el valor nuevo.
3. Reiniciar API y front (el front también lee `INTERNAL_API_KEY` para
   el proxy — si no coincide con la API, todo pedido vuelve 401).
4. Todas las cookies de sesión existentes quedan inválidas al instante
   (la firma ya no calza) — todo el mundo tiene que loguearse de nuevo.

Las cuentas en sí (aprobadas/rechazadas/roles) no se tocan con esto —
solo invalida las sesiones, no borra usuarios.

## Rate-limit y fuerza bruta

- `/api/auth/login`: 10 intentos/min por IP.
- `/api/auth/register`: 5 intentos/min por IP.
- Los 7 endpoints que renderizan PDF/ZPL con Puppeteer: 20/min por IP
  (evita un DoS trivial por loop descontrolado).

Contadores en memoria (se resetean si el proceso reinicia) — aceptable
porque el objetivo es frenar automatización, no llevar un registro
permanente.

## Supuesto de red

**Este modelo se diseñó para exponerse más allá de la LAN de la
fábrica**, con TLS propio delante (reverse proxy con certificado real,
no un túnel tipo Cloudflare) y usuarios nuevos/externos sumándose — a
diferencia del modelo PIN-compartido anterior, que asumía red interna
cerrada. Antes de exponerlo de verdad, confirmar:

- ¿El reverse proxy corre en la misma máquina que la API? Si no,
  `app.set('trust proxy', 'loopback')` en `apps/api/index.ts` hay que
  ajustarlo a la IP real del proxy — si no, `req.secure` nunca da
  `true` y la cookie nunca lleva `Secure` aunque haya TLS de verdad.
- `PUBLIC_URL` en `.env` tiene que ser el dominio público real (entra
  en el allowlist de CORS).
- Password mínimo de 8 caracteres (`apps/api/routes/auth.ts`) — evaluar
  si conviene subirlo estando expuesto a cualquiera en internet.
- CSRF: hoy la única defensa es la cookie `SameSite=Lax` (sin token
  CSRF real) — suficiente contra el vector clásico en navegadores
  modernos, pero es una decisión consciente, no una garantía absoluta.
  Revisar si el modelo de amenaza cambia lo suficiente como para
  justificar un token real (doble-cookie), que requeriría tocar cada
  request de escritura del frontend.

## Endpoints públicos (sin login)

- `GET /health`: chequeo de salud (monitoreo/scripts), no expone datos
  de órdenes ni impresión.
- `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`: tienen que ser alcanzables sin sesión previa
  (si no, nadie podría loguearse nunca) — el registro deja la cuenta en
  `pending`, no otorga acceso por sí solo.
