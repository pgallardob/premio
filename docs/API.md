# Contrato HTTP de Los Olivos

La fuente contractual es [api.openapi.json](api.openapi.json), OpenAPI 3.1. Esta guía explica cómo usarla. Todos los clientes utilizan el mismo origen; no hay un proveedor externo ni credenciales de terceros.

La versión 0.2.0 no expone un modo de prueba. Una instalación nueva empieza pausada, con stock cero y límite de 24 horas obligatorio. El campo `testMode` se retiró; la configuración rechaza desactivar `cooldownEnabled`.

## Participar sin registrar vistas como jugadas

1. `GET /api/status` consulta reglas, establece la cookie firmada y no registra una participación.
2. El usuario presiona el botón.
3. `POST /api/participations` envía JSON y una nueva `Idempotency-Key` de 16 a 80 caracteres alfanuméricos, guiones o guiones bajos.
4. Si la respuesta es incierta, se reintenta con **la misma clave y la misma cookie**.

Un resultado aceptado siempre responde `200`, sea ganador, no ganador o repetición idempotente. El campo `replayed` permite distinguir el último caso. Un error devuelve `{ "error": { "code": "...", "message": "..." } }`.

## Operaciones públicas

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/status` | Campaña, reglas, catálogo y stock disponible. |
| GET | `/healthz` | Salud mínima del proceso, sin información de premios o sesiones. |
| POST | `/api/participations` | Participación y cupón privado si ganó. |
| GET | `/api/wallet` | Cupones del navegador reconocido por cookie. |
| POST | `/api/wallet/coupons` | Guardar en este navegador un cupón mediante su token privado. |
| GET | `/api/coupons/{token}` | Cupón por token privado de 256 bits. |
| GET | `/api/coupons/{token}/qr` | PNG con enlace de validación administrativa. |
| GET | `/api/campaign/qr` | PNG con la URL pública de la experiencia. |

El código visible `OLV-…` no permite consultar cupones públicamente. Solo la administración puede buscar por código. El QR del cupón no contiene el token privado: dirige al panel y precarga el código, sin canjearlo.

Al abrir un enlace privado, la interfaz envía `{ "token": "..." }` a `/api/wallet/coupons` para conservar ese cupón en el navegador actual. Repetirlo devuelve `{ "saved": true }` sin duplicados. No transfiere el propietario original, no suma participaciones, no cambia el stock y no reactiva cupones canjeados o vencidos. Se permite guardar el cupón en hasta cien navegadores adicionales; después se devuelve `409 WALLET_LIMIT_REACHED`. Un código visible, un token desconocido o un origen externo no autorizan el guardado.

## Autenticación administrativa

`POST /api/admin/login` recibe `{ "password": "..." }`. Si la contraseña es válida, establece una cookie `olivos_session` y devuelve `csrfToken` y `expiresAt`. No guarde estos valores en código, HTML, `localStorage` ni documentación.

La sesión dura ocho horas, se conserva solo en memoria y se revoca al reiniciar el servidor. `GET /api/admin/session` permite restaurar el token CSRF en una pestaña nueva. Las mutaciones administrativas requieren la cookie y el encabezado `X-CSRF-Token`; las consultas requieren la cookie.

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/admin/session` | Restaurar sesión y token CSRF. |
| POST | `/api/admin/logout` | Revocar sesión. |
| GET | `/api/admin/dashboard` | Totales, actividad, cupones, inventario y reglas. |
| PATCH | `/api/admin/settings` | Cambiar campos permitidos de configuración. |
| PATCH | `/api/admin/inventory/{prizeId}` | Establecer `stock` disponible, de 0 a 10000. |
| GET | `/api/admin/coupons/{code}` | Validar el estado sin modificarlo. |
| POST | `/api/admin/coupons/{code}/redeem` | Confirmar un solo canje con cuerpo `{}`. |
| GET | `/api/admin/export` | CSV sin tokens privados ni referencias de navegador. |

## Errores que cambian una decisión

| Código | HTTP | Acción del cliente |
|---|---|---|
| `INVALID_INPUT` / `INVALID_JSON` | 400 | Corregir la solicitud; no repetir sin cambios. |
| `UNAUTHORIZED` | 401 | Volver a ingresar. |
| `FORBIDDEN` | 403 | Revisar origen o restaurar token CSRF. |
| `DAILY_CODE_REQUIRED` | 403 | Solicitar el código actual visible en el local. |
| `NOT_FOUND` | 404 | Revisar el enlace o código; no enumerar valores. |
| `CAMPAIGN_PAUSED` | 409 | Informar pausa; no sumar participación. |
| `CYCLE_IN_PROGRESS` | 409 | Esperar a completar el ciclo para cambiar frecuencia. |
| `COUPON_REDEEMED` / `COUPON_EXPIRED` | 409 | No entregar otro premio. |
| `COOLDOWN` / `RATE_LIMITED` | 429 | Respetar `Retry-After` y `error.retryAt`. |
| `OUT_OF_STOCK` | 503 | No se contó participación; esperar reposición. |
| `INTERNAL_ERROR` | 500 | Reintentar una participación con la misma clave. |

Las solicitudes JSON se limitan a 8 KiB. El servidor no habilita CORS. Los campos desconocidos en las mutaciones se rechazan para detectar errores de integración.

En producción se rechaza un `Host` distinto del dominio configurado. Las cabeceras de IP reenviada solo se utilizan si la conexión inmediata pertenece a `TRUSTED_PROXIES`; de lo contrario, no alteran los límites de acceso. Activar una campaña pública requiere revisión del propietario, contacto e inventario, además de HTTPS.

## Garantías y límites

### Actualización de clientes administrativos

La interfaz reutiliza `GET /api/admin/dashboard`, sin modificar su autenticación ni añadir endpoints. Lo consulta cada tres segundos en primer plano, al recuperar el foco y ante avisos de participación de otras pestañas del mismo origen. No recarga el documento ni sustituye información del servidor por un contador local. En segundo plano deja de consultar; los errores de sesión detienen las actualizaciones y exigen un nuevo ingreso.

### Garantías del servidor

- Participación, reserva y emisión se confirman juntas.
- Un reintento idempotente devuelve el resultado original incluso si ahora la campaña está pausada.
- Validar mediante GET no canjea.
- El canje y el vencimiento son estados finales; no hay una ruta de «reactivación» pública o administrativa.
- Las respuestas privadas usan `Cache-Control: no-store`.
- La colección permite recuperar cupones solo mientras se conserve la cookie o el enlace privado.

Las pruebas ejecutan la implementación real. La verificación del archivo OpenAPI comprueba sintaxis JSON y referencias internas; no debe confundirse con una certificación completa de conformidad semántica OpenAPI.
