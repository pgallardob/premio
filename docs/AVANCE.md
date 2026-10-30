# Estado publicado e inventario real · 0.2.3

Actualizado el 30 de octubre de 2026. La web utiliza GitHub Pages y Neon Functions con PostgreSQL en el plan Free. No depende de mantener encendida la computadora. **El inventario real ya se cargó: 58 unidades de cinco productos. La campaña continúa pausada; cargar stock no equivale a activarla.**

## Accesos

- [Web del cliente](https://pgallardob.github.io/premio/)
- [Instalar o actualizar en Android / iPhone](https://pgallardob.github.io/premio/instalar.html)
- [Administración](https://pgallardob.github.io/premio/admin.html)
- [Cartel QR](https://pgallardob.github.io/premio/cartel.html)

La contraseña administrativa de publicación es distinta de la local. Se conserva en un archivo privado fuera del repositorio; no se publica ni se copia en esta documentación.

## Inventario real cargado

El propietario reemplazó el plan anterior por **20 destapadores Monster, 20 galletas mini Costa, 10 Jokey, 5 poleras y 3 agendas: 58 unidades en total**. La carga se aplicó en una transacción de PostgreSQL, con controles para no sobrescribir cambios posteriores ni duplicar la reposición. Consulte [Operación del local](OPERACION.md#inventario-vigente).

Último estado verificado: campaña pausada, stock 58, cero participaciones y cupones, cinco movimientos de inventario y una actualización de contacto en auditoría, con protección obligatoria de 24 horas. El botón «Volveremos a sorprenderte» permanece deshabilitado porque la campaña no está activa, no por falta de stock o conexión. El plan anterior de bebidas, snacks y café quedó sin efecto y no debe aplicarse.

El catálogo usa identificadores nuevos y cinco ilustraciones referenciales; no son fotografías de los productos. Los identificadores anteriores y sus recursos se conservan para no romper posibles referencias históricas. Los valores iniciales de una instalación nueva siguen en cero.

El contacto solicitado está guardado. La revisión de bases y privacidad ahora se confirma expresamente en **Administración → La experiencia** y permanece registrada entre reinicios; sigue pendiente del propietario. No se activó la campaña ni se marcó esa confirmación en su nombre. El mensaje de guardado ocupa todo el ancho bajo el botón y el texto de presentación de premios se adapta sin saltos de línea forzados.

## Implementado y comprobado

- API real en el proyecto existente `premio`, sin crear otro proyecto, túneles temporales ni activar un plan pago.
- Persistencia transaccional de contador, reservas y canjes; sesiones administrativas y límites conservados entre reinicios de las funciones.
- Interfaz conectada mediante CORS restringido y sesiones con CSRF, sin cookies de terceros.
- PWA con iconos, manifiesto, service worker y recursos versionados para actualizar instalaciones anteriores.
- CSV autenticado, cupones privados y descarga PNG; ninguna emisión o validación de premios offline.
- Registros anteriores eliminados sin restaurarlos, sin modo de prueba público ni premios ficticios en producción.
- Despliegue local con archivo y alternativa Docker/Caddy conservados, separados de la publicación en Neon.

Evidencia: 23 pruebas existentes, ocho pruebas de inventario, seis pruebas de contacto y confirmación, y diez comprobaciones contra PostgreSQL real. Los 20 recorridos de Chrome verifican también el mensaje ancho bajo el botón, la confirmación explícita y los enlaces a bases y privacidad; se mantienen las siete comprobaciones PWA y la compilación estática. Los esquemas de verificación se eliminan al terminar; no se generan participaciones ni cupones reales para probar la publicación.

## Retomar en la próxima sesión

1. Revisar bases y privacidad, marcar la confirmación en el panel y autorizar la activación. El contacto ya está configurado.
2. Revisar el inventario y las reservas antes de cualquier reposición; no repetir la carga inicial ya aplicada ni restaurar historial.
3. Comprobar la participación desde computador y teléfonos físicos, el QR y un canje de un solo uso después de activar.
4. Configurar respaldo PostgreSQL externo, calendario y verificación de restauración.

No hay una activación automática programada. Consulte [Neon](NEON.md) y [Revisión de producción](REVISION_PRODUCCION.md) para los límites gratuitos y pendientes de apertura.
