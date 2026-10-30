# Registrar clics, no comprobar seguidores

El enlace **Visitar Instagram** abre el perfil del local y envía un evento al servidor propio. No utiliza la API de Meta ni confirma que Instagram se haya cargado o que una persona siga la cuenta. El evento no modifica participación, premio, visita presencial o canje; no oculta resultados.

## Contrato

`POST /api/instagram/clicks` recibe `{ "source": "home" }` y una cabecera `Idempotency-Key` aleatoria de 16 a 80 caracteres. Los orígenes del botón admitidos son `home`, `result` y `coupon`; no se aceptan URLs, identificadores de Instagram ni tokens de cupones.

La respuesta es `{ "recorded": true, "clickedAt": "…", "replayed": false }`. Repetir una clave retenida con el mismo origen no suma otra vez; reutilizarla con otro origen devuelve `409 CLICK_KEY_REUSED`. La ruta limita solicitudes y valida el origen HTTP. Una consulta GET no registra nada.

El panel privado reutiliza `/api/admin/dashboard`: `instagramClicks` contiene acumulados, conteos por origen y hasta veinte eventos recientes sin claves internas. Las cifras son eventos declarados por el cliente, no visitas, personas o seguidores verificados. Un cliente manipulado puede generar eventos falsos; los límites de solicitudes reducen abuso, no certifican clics humanos.

## Datos y conservación

- Solo se guardan una clave aleatoria por evento, el origen del botón y la fecha del servidor. No se asocian a personas, navegadores, cupones, IP o cuentas de Instagram.
- Se retienen hasta mil eventos de los últimos siete días. La limpieza ocurre en la siguiente operación de registro o consulta administrativa, no mediante un temporizador exacto.
- Los acumulados sin identificadores se conservan. La idempotencia solo se garantiza mientras la clave siga retenida.
- El enlace no lleva información privada en su URL. La navegación no espera al registro: si falla la conexión, no se bloquean Instagram, la participación ni el canje, y no se afirma que el clic se guardó.

Una condición impresa no se vuelve invisible ni queda exenta de normas por no estar en código. Esta entrega no implementa, encubre ni valida una condición de seguimiento para cobrar premios. Las condiciones de una promoción deben ser claras y compatibles con las reglas aplicables.

## Verificación

Las pruebas positivas usan servidores o esquemas aislados. En la publicación real no se generan eventos automáticos para inflar el contador, ni participaciones, premios o aprobaciones presenciales de prueba. Se mantienen las 24 horas y el requisito presencial existentes. La prueba con teléfono físico continúa pospuesta por el propietario.
