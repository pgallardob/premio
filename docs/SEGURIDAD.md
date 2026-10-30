# Un premio se confirma en el servidor, no en una captura

La aplicación tiene controles concretos de consistencia y acceso. La publicación Pages + Neon utiliza HTTPS y credenciales nuevas; el estado vigente figura en [Avance](AVANCE.md). Una instalación nueva permanece pausada hasta confirmar inventario, bases/privacidad y contacto. Los respaldos externos siguen siendo una tarea operativa pendiente.

## Controles presentes

| Riesgo | Control |
|---|---|
| Dos ganadores por una carrera | Bloqueo transaccional de filas en Neon; cola y escritor único en el despliegue con archivo. |
| Reintento por mala conexión | Clave idempotente persistida por navegador. |
| Participación remota con una foto del QR | Requisito opcional `presenceRequired`: aprobación explícita del personal, permiso ligado al navegador, diez minutos y consumo único transaccional. Depende de que el personal compruebe el teléfono presente. |
| Cupones sin unidades | Reserva al emitir; liberación solo por vencimiento. |
| Doble entrega | Transición atómica de vigente a canjeado. |
| Acceso administrativo | Contraseña derivada con scrypt y sesión aleatoria. |
| Credenciales de sesión | Node usa cookie `HttpOnly`, `SameSite=Strict` y `Secure` en HTTPS. Neon usa bearer por pestaña, CSP estricta y revocación persistente; Web Storage no tiene la protección `HttpOnly`. |
| Mutación desde otro origen | Validación de `Origin`, JSON y token CSRF de sesión. |
| Fuerza bruta | Límite persistente global en Neon; límite por IP confiable en Node. |
| Código inyectado en HTML | CSP sin `unsafe-inline`; renderizado mediante nodos y `textContent`. |
| Fuga del archivo de datos | Lista explícita de rutas públicas; `.env`, `data/` y `server/` no se sirven. |
| Enlaces privados enviados como referencia | Política `no-referrer` y token en fragmento del enlace. |
| Fórmulas peligrosas en CSV | Escape de celdas y neutralización de prefijos de fórmula. |

## Límites que no deben ocultarse

- La cookie no identifica a una persona. La protección se puede eludir borrando datos o cambiando de navegador.
- La frecuencia de 20 es un contador determinista; **el tipo de premio** se elige al azar. No se presenta como un sorteo de identidad verificada.
- Un código del día se puede compartir. Ayuda a operar, no prueba ubicación física.
- El enlace privado es una credencial de acceso al cupón. Quien lo reciba podrá verlo y guardarlo en su propia colección; evite publicarlo. Guardar no cambia el propietario original ni permite canjear dos veces.
- Los límites por IP pueden afectar a personas que comparten la red del local. Deben ajustarse con evidencia de uso, no eliminarse sin revisar riesgos.
- No se implementa retención automática del historial. Antes de operar públicamente, defina con el local conservación, eliminación y atención de consultas sobre datos.
- Existen comandos exclusivos de respaldo y restauración validados. La programación automática y el almacenamiento externo todavía deben configurarse en el alojamiento elegido.
- Las pruebas no constituyen una auditoría de penetración.

## Presencia sin compra e Instagram pendiente

El QR público contiene una URL compartible; no certifica un escaneo físico, la ubicación ni una compra. El límite de 24 horas identifica al navegador y el contador de premios es global, no una garantía por cada 20 intentos personales. Cambiar de navegador o borrar su almacenamiento permite obtener otro identificador, pero no sustituye una autorización de visita cuando se exige.

La decisión del propietario es **exigir visita, no compra**. El [flujo de visitas](VISITAS.md) está implementado: el cliente muestra su solicitud en el teléfono y el personal confirma presencia desde el panel. La autorización dura diez minutos, sirve para ese navegador y se consume con la participación. Escanear el QR no aprueba ni revela un resultado. No se invalidan participaciones anteriores y no se utiliza un código diario compartido como prueba fuerte de presencia. Habilitar el requisito necesita una nueva confirmación de bases y privacidad; publicar código no lo activa automáticamente.

El control es una atestación humana, no una prueba criptográfica de ubicación o identidad. Personal que apruebe códigos remotos o una persona que colabore reenviándolos puede debilitarlo. Debe evitarse autorizar códigos sucesivos para eludir las 24 horas. El cliente conserva la recuperación idempotente aunque su autorización ya se haya consumido o vencido.

Para Instagram no sirven el número total de seguidores ni un botón «Ya te sigo». La [API oficial de perfiles de mensajería](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile) ofrece `is_user_follow_business` a partir del ID recibido en una interacción consentida, como un DM iniciado por la persona. Requiere una cuenta profesional, autorización, permisos y webhooks. Comprueba el seguimiento actual, no una fecha de comienzo ni permanencia futura. No hay cuenta o aplicación Meta conectada en este proyecto.

**La propuesta de exigir seguimiento está en pausa por un bloqueo de políticas.** La disponibilidad técnica del campo no autoriza cualquier uso. La [guía oficial de rechazo de aplicaciones](https://developers.facebook.com/docs/resp-plat-initiatives/appreview/tutorial/rejection-guide/), en «Your app incentivizes unapproved actions», indica que se rechazan apps que incentivan promocionar una app o marca mediante acciones de Instagram como likes o follows. Las [políticas de desarrolladores](https://developers.facebook.com/devpolicy/), actualizadas el 3 de febrero de 2026, también restringen programas de intercambio de seguidores y el uso de datos de mensajería fuera de sus fines permitidos. La guía de rechazo cita una numeración antigua de políticas; no debe interpretarse como un dictamen legal sobre todas las promociones de Instagram, pero sí impide dar por aprobado el bloqueo propuesto.

No implementar el seguimiento como condición para participar, revelar el resultado o canjear sobre la base de que existe `is_user_follow_business`. El análisis anterior de viabilidad era incompleto: faltaba comprobar el uso permitido. No se ha creado la aplicación Meta ni aceptado sus condiciones de creación; el asistente permanece en **Resumen**.

El propietario limitó el trabajo de software a [registrar el clic](INSTAGRAM_CLICS.md) en un enlace normal. El sistema no comprueba seguidores, no acredita visitas al perfil y no agrega condiciones de participación o canje. No requiere una aplicación Meta ni la API de Instagram. Los eventos son declarados por el cliente, limitados e idempotentes dentro de su conservación; no certifican personas ni acciones humanas.

Una condición impresa o publicada en otra página no queda exenta de normas ni se garantiza que sea desconocida por Meta. Esta entrega no implementa ni valida esa condición externa. Cualquier uso posterior debe cumplir las [normas de promociones de Instagram](https://help.instagram.com/179379842258600), las políticas aplicables y los requisitos de información y consentimiento. No ocultar resultados ya emitidos ni tratar un clic como prueba de seguimiento.

## Alternativa de publicación con archivo

Un servidor con **un proceso Node.js, HTTPS mediante un proxy y un volumen persistente**. El proceso HTTP puede escuchar en la interfaz privada; `PUBLIC_URL` debe contener el origen HTTPS público. Con `NODE_ENV=production`, el arranque rechaza una URL pública HTTP.

No utilice modo clúster, réplicas múltiples o un disco efímero para el JSON. El archivo de bloqueo evita un segundo escritor local; no coordina servidores independientes. Migre a almacenamiento transaccional antes de cambiar ese modelo.

### GitHub Pages

Pages puede servir HTML, CSS y JavaScript, pero no ejecutar este servidor ni escribir su contador central. Guardar datos en `localStorage` produciría contadores distintos por teléfono y permitiría falsificar premios. Por esa razón no se ofrece como un despliegue completo ficticio.

La publicación actual conecta Pages con Neon mediante CORS de origen exacto, identificadores firmados y sesiones bearer con CSRF. No utiliza cookies de terceros ni guarda el contador en el teléfono. Los tokens de Web Storage pueden ser leídos por una vulnerabilidad XSS: no deben añadirse scripts externos sin revisión. Consulte [los límites de Neon](NEON.md).

## Antes de abrir al público

- [ ] Confirmar dominio, HTTPS y `PUBLIC_URL`; escanear el QR desde otro teléfono.
- [ ] Confirmar productos reales y unidades disponibles.
- [ ] Verificar la protección obligatoria de 24 horas y decidir si se usará el código diario.
- [ ] Cambiar y conservar la contraseña administrativa; restringir acceso al computador y al disco.
- [ ] Definir respaldo, retención y un procedimiento de restauración.
- [ ] Revisar bases, privacidad y requisitos legales de la promoción en Chile con quien corresponda.
- [ ] Realizar una prueba de entrega real y de rechazo de un segundo canje.
- [ ] Comprobar que no se publican secretos, capturas con enlaces privados ni registros de datos.
