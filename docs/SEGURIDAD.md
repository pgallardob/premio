# Un premio se confirma en el servidor, no en una captura

La aplicación tiene controles concretos de consistencia y acceso. La publicación Pages + Neon ya utiliza HTTPS y credenciales nuevas; permanece pausada hasta confirmar inventario, bases/privacidad, contacto y respaldos. La fase manual anterior se cerró y sus registros se eliminaron.

## Controles presentes

| Riesgo | Control |
|---|---|
| Dos ganadores por una carrera | Bloqueo transaccional de filas en Neon; cola y escritor único en el despliegue con archivo. |
| Reintento por mala conexión | Clave idempotente persistida por navegador. |
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

## Revisión pendiente: presencia e Instagram

Estas mejoras están en análisis, no activadas. El QR público contiene una URL compartible; no certifica un escaneo físico, la ubicación ni una compra. El límite de 24 horas identifica al navegador y el contador de premios es global, no una garantía por cada 20 intentos personales. Cambiar de navegador o borrar su almacenamiento permite obtener otro identificador.

La propuesta es autorizar cada participación con un código de un solo uso entregado por caja, consumido atómicamente en el servidor y con vencimiento breve. Un código por ticket limita entradas a compras efectivas, pero exigir compra modificaría las bases actuales de «no requiere compra»: el propietario debe decidir primero entre compra y visita. No se deben invalidar participaciones ya aceptadas ni presentar el código diario compartido como prueba de compra.

Para Instagram no sirven el número total de seguidores ni un botón «Ya te sigo». La [API oficial de perfiles de mensajería](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile) ofrece `is_user_follow_business` a partir del ID recibido en una interacción consentida, como un DM iniciado por la persona. Requiere una cuenta profesional, autorización, permisos y webhooks. Comprueba el seguimiento actual, no una fecha de comienzo ni permanencia futura. No hay cuenta o aplicación Meta conectada en este proyecto.

Un posible flujo vincula un desafío de un solo uso al navegador y al remitente de ese DM, verifica el seguimiento en el servidor y solo entonces registra la participación. Su implementación necesita definir las condiciones, conectar la cuenta y actualizar bases/privacidad conforme a las [normas de promociones de Instagram](https://help.instagram.com/179379842258600). No debe ocultarse en la interfaz un resultado que la API ya entregó ni fingirse una verificación por haber abierto un enlace.

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
