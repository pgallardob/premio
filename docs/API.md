# Contrato HTTP de Los Olivos

La fuente contractual es [api.openapi.json](api.openapi.json), OpenAPI 3.1. La instalación Node usa el mismo origen y cookies; la publicación Pages + Neon utiliza CORS restringido y credenciales bearer según [Neon](NEON.md). No se incluyen credenciales de base de datos en el cliente.

Desde la versión 0.2.0 no se expone un modo de prueba. Una instalación nueva empieza pausada, con stock cero y límite de 24 horas obligatorio. El campo `testMode` se retiró; la configuración rechaza desactivar `cooldownEnabled`.

## Participar sin registrar vistas como jugadas

1. `GET /api/status` consulta reglas y establece una cookie firmada (Node) o devuelve `X-Olivos-Device` (Neon), sin registrar una participación.
2. Si `rules.presenceRequired` es verdadero, el usuario solicita una visita, muestra su código al personal físicamente presente y espera la aprobación. No se requiere compra.
3. El usuario presiona el botón. `POST /api/participations` envía `visitId` cuando corresponde y una nueva `Idempotency-Key` de 16 a 80 caracteres alfanuméricos, guiones o guiones bajos.
4. Si la respuesta es incierta, se reintenta con **la misma clave y el mismo identificador firmado de navegador**.

Un resultado aceptado siempre responde `200`, sea ganador, no ganador o repetición idempotente. El campo `replayed` permite distinguir el último caso. Un error devuelve `{ "error": { "code": "...", "message": "..." } }`.

## Operaciones públicas

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/status` | Campaña, reglas, catálogo y stock disponible. |
| GET | `/healthz` | Salud mínima del proceso, sin información de premios o sesiones. |
| POST | `/api/participations` | Participación y cupón privado si ganó. |
| POST | `/api/instagram/clicks` | Registrar un clic declarado con origen y clave idempotente; no cuenta participaciones ni verifica visitas o seguidores. |
| GET / POST | `/api/visits/current` / `/api/visits` | Leer o solicitar una validación vinculada al navegador, sin participar. |
| POST | `/api/visits/cancel` | Cancelar una solicitud propia todavía no consumida. |
| GET | `/api/visits/{visitId}/qr` | QR de búsqueda administrativa; no concede permiso. |
| GET | `/api/wallet` | Cupones del navegador reconocido por cookie. |
| POST | `/api/wallet/coupons` | Guardar en este navegador un cupón mediante su token privado. |
| GET | `/api/coupons/{token}` | Cupón por token privado de 256 bits. |
| GET | `/api/coupons/{token}/qr` | PNG con enlace de validación administrativa. |
| GET | `/api/campaign/qr` | PNG con la URL pública de la experiencia. |

El código visible `OLV-…` no permite consultar cupones públicamente. Solo la administración puede buscar por código. El QR del cupón no contiene el token privado: dirige al panel y precarga el código, sin canjearlo.

Al abrir un enlace privado, la interfaz envía `{ "token": "..." }` a `/api/wallet/coupons` para conservar ese cupón en el navegador actual. Repetirlo devuelve `{ "saved": true }` sin duplicados. No transfiere el propietario original, no suma participaciones, no cambia el stock y no reactiva cupones canjeados o vencidos. Se permite guardar el cupón en hasta cien navegadores adicionales; después se devuelve `409 WALLET_LIMIT_REACHED`. Un código visible, un token desconocido o un origen externo no autorizan el guardado.

## Autenticación administrativa

El [registro de clics de Instagram](INSTAGRAM_CLICS.md) es independiente de la identidad y de las reglas de participación. Solo acepta `source` (`home`, `result`, `coupon`) y la cabecera `Idempotency-Key`; no recibe tokens de cupón ni datos de Instagram. El panel privado devuelve `instagramClicks` con acumulados y hasta veinte registros recientes, sin las claves internas. No es una prueba para autorizar premios.

`POST /api/admin/login` recibe `{ "password": "..." }`. Devuelve `csrfToken` y `expiresAt` y establece una cookie `olivos_session` en Node o el encabezado `X-Olivos-Session` en Neon. No guarde estas credenciales en código, HTML, `localStorage` ni documentación.

La sesión dura ocho horas. Node la conserva en memoria; Neon persiste su hash y revocación en PostgreSQL, por lo que no desaparece al reiniciar una función. Neon entrega la credencial en `X-Olivos-Session`; se conserva en `sessionStorage` y se envía como `Authorization: Bearer`. Ambas variantes exigen `X-CSRF-Token` para mutaciones.

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/admin/session` | Restaurar sesión y token CSRF. |
| POST | `/api/admin/logout` | Revocar sesión. |
| GET | `/api/admin/dashboard` | Totales, actividad, cupones, inventario y reglas. |
| PATCH | `/api/admin/settings` | Cambiar campos permitidos de configuración. |
| GET | `/api/admin/visits/{id-o-código}` | Comparar la solicitud con el teléfono presente; no aprueba. |
| POST | `/api/admin/visits/{id-o-código}/approve` | Atestación `present: true` del personal autenticado, sin exigir compra. |
| PATCH | `/api/admin/inventory/{prizeId}` | Establecer `stock` disponible, de 0 a 10000. |
| GET | `/api/admin/coupons/{code}` | Validar el estado sin modificarlo. |
| POST | `/api/admin/coupons/{code}/redeem` | Confirmar un solo canje con cuerpo `{}`. |
| GET | `/api/admin/export` | CSV sin tokens privados ni referencias de navegador. |

## Errores que cambian una decisión

### Contacto y confirmación antes de activar

`PATCH /api/admin/settings` acepta `promotionContact` (texto público de hasta 200 caracteres) y `promotionReviewed` (confirmación explícita del administrador). El servidor registra `promotionReviewedAt`; ese campo no puede enviarse ni falsificarse desde el cliente. Guardar un contacto no aprueba las bases ni activa la campaña.

La activación pública exige contacto, revisión y unidades disponibles del catálogo. Cambiar contacto, frecuencia, vigencia, verificación diaria o `presenceRequired` invalida la revisión anterior si no se reconfirma expresamente. La confirmación queda persistida y también se utiliza al reiniciar; las variables de despliegue sirven solo de compatibilidad para instalaciones anteriores.

La solicitud de visita vence en diez minutos y la aprobación concede otros diez. Un permiso autorizado no sirve para otro navegador ni para una segunda participación. Los reintentos de una participación ya aceptada no necesitan un permiso nuevo, aunque esté vencido o usado; si no se conserva su ID, se puede omitir al reenviar la misma clave. Consulte [Visitas](VISITAS.md) para activación, operación y límites de la comprobación humana.

### Respuestas de error

| Código | HTTP | Acción del cliente |
|---|---|---|
| `INVALID_INPUT` / `INVALID_JSON` | 400 | Corregir la solicitud; no repetir sin cambios. |
| `UNAUTHORIZED` | 401 | Volver a ingresar. |
| `FORBIDDEN` | 403 | Revisar origen o restaurar token CSRF. |
| `DAILY_CODE_REQUIRED` | 403 | Solicitar el código actual visible en el local. |
| `NOT_FOUND` | 404 | Revisar el enlace o código; no enumerar valores. |
| `VISIT_NOT_FOUND` | 404 | Solicitar un código nuevo; el anterior no existe o venció. |
| `VISIT_REQUIRED` | 409 | Obtener la aprobación presencial para este navegador; no se contó la solicitud. |
| `VISIT_USED` / `VISITS_DISABLED` | 409 | No reaprovechar el permiso o revisar si el requisito está habilitado. |
| `CAMPAIGN_PAUSED` | 409 | Informar pausa; no sumar participación. |
| `PROMOTION_NOT_READY` | 409 | Completar la configuración de la campaña; no se contó participación. |
| `CYCLE_IN_PROGRESS` | 409 | Esperar a completar el ciclo para cambiar frecuencia. |
| `COUPON_REDEEMED` / `COUPON_EXPIRED` | 409 | No entregar otro premio. |
| `COOLDOWN` / `RATE_LIMITED` | 429 | Respetar `Retry-After` y `error.retryAt`. |
| `OUT_OF_STOCK` | 503 | No se contó participación; esperar reposición. |
| `INTERNAL_ERROR` | 500 | Reintentar una participación con la misma clave. |

Las solicitudes JSON se limitan a 8 KiB. Node no necesita CORS; Neon admite únicamente el origen de la interfaz configurada. Los campos desconocidos en las mutaciones se rechazan para detectar errores de integración.

En Node de producción se rechaza un `Host` distinto del dominio configurado y las cabeceras reenviadas solo se usan desde `TRUSTED_PROXIES`. Neon usa su gateway HTTPS y límites globales persistidos, sin confiar en IPs aportadas por el cliente. Activar una campaña pública exige revisión del propietario, contacto e inventario, además de HTTPS.

## Garantías y límites

### Actualización de clientes administrativos

La interfaz reutiliza `GET /api/admin/dashboard`. Consulta cada 15 segundos en Neon y cada tres segundos en la alternativa local, al recuperar el foco y ante avisos de participación de otras pestañas del mismo origen. No recarga el documento ni sustituye información del servidor por un contador local. En segundo plano deja de consultar; los errores de sesión detienen las actualizaciones y exigen un nuevo ingreso.

### Garantías del servidor

- Participación, reserva y emisión se confirman juntas.
- Un reintento idempotente devuelve el resultado original incluso si ahora la campaña está pausada.
- Validar mediante GET no canjea.
- El canje y el vencimiento son estados finales; no hay una ruta de «reactivación» pública o administrativa.
- Las respuestas privadas usan `Cache-Control: no-store`.
- La colección permite recuperar cupones solo mientras se conserve la cookie o el enlace privado.

Las pruebas ejecutan la implementación real. La verificación del archivo OpenAPI comprueba sintaxis JSON y referencias internas; no debe confundirse con una certificación completa de conformidad semántica OpenAPI.
