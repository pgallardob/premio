# Estado publicado y próxima sesión · 0.2.1

Actualizado el 28 de octubre de 2026. La web está publicada en GitHub Pages y conectada a Neon Functions y PostgreSQL en el plan Free. No depende de mantener encendida la computadora. **La campaña continúa pausada; el inventario acordado se cargará en la próxima sesión, no hoy.**

## Accesos

- [Web del cliente](https://pgallardob.github.io/premio/)
- [Instalar o actualizar en Android / iPhone](https://pgallardob.github.io/premio/instalar.html)
- [Administración](https://pgallardob.github.io/premio/admin.html)
- [Cartel QR](https://pgallardob.github.io/premio/cartel.html)

La contraseña administrativa de publicación es distinta de la local. Se conserva en un archivo privado fuera del repositorio; no se publica ni se copia en esta documentación.

## Inventario acordado, todavía pendiente de carga

El propietario indicó **20 bebidas, 20 snacks y 20 cafés: 60 unidades en total**, y solicitó retomar la carga mañana. Los identificadores y el procedimiento están en [Operación del local](OPERACION.md#próxima-sesión-inventario-acordado).

Último estado verificado: campaña pausada, stock cero, cero participaciones, cupones y auditoría; protección obligatoria de 24 horas. No se cargaron esas 60 unidades ni se activó la campaña. El botón «Volveremos a sorprenderte» permanece deshabilitado por ese estado, no por un fallo de conexión con Neon.

## Implementado y comprobado

- API real en el proyecto existente `premio`, sin crear otro proyecto, túneles temporales ni activar un plan pago.
- Persistencia transaccional de contador, reservas y canjes; sesiones administrativas y límites conservados entre reinicios de las funciones.
- Interfaz conectada mediante CORS restringido y sesiones con CSRF, sin cookies de terceros.
- PWA con iconos, manifiesto, service worker y recursos versionados para actualizar instalaciones anteriores.
- CSV autenticado, cupones privados y descarga PNG; ninguna emisión o validación de premios offline.
- Registros anteriores eliminados sin restaurarlos, sin modo de prueba público ni premios ficticios en producción.
- Despliegue local con archivo y alternativa Docker/Caddy conservados, separados de la publicación en Neon.

Evidencia: 23 pruebas existentes, ocho comprobaciones contra PostgreSQL real, 19 recorridos de interfaz y siete comprobaciones PWA aprobadas. Chrome verificó además la web pública contra Neon, inicio y cierre de sesión, CSV, manifiesto y service worker. Los esquemas de verificación se eliminaron; no se generaron participaciones ni cupones reales.

## Retomar en la próxima sesión

1. Consultar el estado actual de Neon antes de modificarlo; respetar cualquier cambio posterior del propietario.
2. Cargar las cantidades acordadas desde administración, sin cambiar los valores seguros de nuevas instalaciones ni restaurar historial.
3. Completar contacto y revisión de bases/privacidad antes de autorizar la activación.
4. Comprobar la participación desde computador y teléfonos físicos, el QR y un canje de un solo uso.
5. Configurar respaldo PostgreSQL externo, calendario y verificación de restauración.

No hay una activación automática programada. Consulte [Neon](NEON.md) y [Revisión de producción](REVISION_PRODUCCION.md) para los límites gratuitos y pendientes de apertura.
