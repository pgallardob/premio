# Autorizar una visita, sin exigir compra

El QR público abre la web, pero no acredita presencia. La participación debe exigir una autorización de un solo uso vinculada al navegador: el personal comprueba el código en el teléfono presente y la confirma desde el panel. No requiere compra ni registra automáticamente una participación.

## Contrato del recorrido

| Operación | Acceso | Resultado y efectos |
|---|---|---|
| `GET /api/visits/current` | Identificador firmado del navegador | Solicitud vigente de ese navegador y próxima fecha permitida; no participa. |
| `POST /api/visits` con `{}` | Navegador | Crea o reutiliza una solicitud con QR y código `VIS-…`; vence a los diez minutos. Rechaza pausa, falta de stock o límite de 24 horas. |
| `GET /api/visits/{id}/qr` | ID aleatorio de 128 bits | PNG que dirige al panel del personal; no concede permiso de juego. |
| `POST /api/visits/cancel` con `visitId` | Mismo navegador | Cancela solo su solicitud no consumida. |
| `GET /api/admin/visits/{id-o-código}` | Sesión administrativa | Permite comparar el código y la vigencia con el teléfono presente. No autoriza. |
| `POST /api/admin/visits/{id}/approve` con `present: true` | Sesión, CSRF y origen permitido | Confirmación explícita del personal; concede diez minutos para una participación y registra la autorización. No exige compra ni modifica el contador o stock. |
| `POST /api/participations` con `visitId` | Mismo navegador autorizado | Comprueba las reglas habituales y consume la autorización en la misma transacción que registra la participación. |

La respuesta de estado de visita contiene `required`, `visit` y `cooldownUntil`; la vista de una solicitud incluye ID, código, estado, creación, vencimiento, aprobación y uso, nunca el hash del navegador.

## Garantías

- Sin aprobación del personal, conocer la URL, generar otro identificador o copiar una solicitud no permite participar.
- Un ID autorizado no sirve para otro navegador; el servidor no acepta un booleano de aprobación enviado por el cliente.
- Una autorización sirve una sola vez. Un reintento con la misma clave idempotente conserva el resultado original, sin necesitar otra aprobación.
- Se comprueban stock, código del día y límite de 24 horas antes de consumirla; un rechazo no desperdicia el permiso.
- La confirmación del personal no revela un resultado ni entrega un premio. El visitante todavía debe presionar «Descubrir mi suerte».
- Solicitudes vencidas se retiran y el número de solicitudes vigentes es limitado. No se almacenan nombres ni se verifica una compra.
- El personal debe comprobar la pantalla presente, no aprobar fotos o mensajes remotos. La autorización es una atestación humana, no una prueba criptográfica de ubicación ni de identidad de la persona.

## Activación controlada

El servidor y el cliente se publican primero con compatibilidad para la configuración anterior. La publicación por sí sola **no habilita el requisito**. El propietario debe leer las bases y la privacidad, marcar **Validación presencial sin compra**, volver a confirmar la revisión y guardar desde **La experiencia**. El servidor rechaza el cambio de reglas de una campaña activa si no incluye esa confirmación. No se pausa la campaña ni se reinicia el ciclo: las participaciones ya aceptadas y sus reintentos siguen siendo válidos.

Solo después de la confirmación expresa del propietario, una operación asistida puede usar:

```sh
node scripts/neon-tools.js require-presence --confirm=REQUIRE_PRESENCE --owner-reviewed-terms
```

No revertir a un servidor anterior que ignore este requisito mientras la campaña esté abierta; para ese tipo de restauración, pausar primero. El QR de entrada impreso no cambia. El personal puede mantener el panel abierto en **Visitas** e introducir el código corto, sin depender de que la cámara del teléfono conserve una sesión administrativa en una pestaña nueva.

## Trabajo del personal

1. El visitante pulsa **Validar mi visita** y muestra su teléfono en el local.
2. El personal compara el código `VIS-…` desde **Visitas**, o escanea el QR y se identifica en el panel.
3. Marca la confirmación de presencia y autoriza. No solicita compra, ticket ni pago.
4. El visitante pulsa **Descubrir mi suerte** en su propio teléfono. La aprobación por sí sola no participa.

No aprobar fotografías o mensajes remotos ni entregar autorizaciones sucesivas para eludir la protección de 24 horas. El control técnico sigue siendo por navegador, no una identificación verificable de personas. Cerrar el aviso no cancela la solicitud; **Cancelar solicitud** sí retira una autorización todavía no usada.

Instagram es una etapa separada y todavía no debe presentarse como verificado. Las pruebas positivas de presencia utilizan únicamente datos aislados; la comprobación de la instalación real no debe declarar falsamente que un visitante automático está físicamente en el local.
