# Estado publicado e inventario real · 0.2.4

Actualizado el 30 de octubre de 2026. La web utiliza GitHub Pages y Neon Functions con PostgreSQL en el plan Free. No depende de mantener encendida la computadora. **La última consulta confirma la campaña activa, con 58 unidades, dos participaciones y ningún cupón comercial emitido. No cambiar estos valores para forzar una prueba ganadora.**

## Accesos

- [Web del cliente](https://pgallardob.github.io/premio/)
- [Instalar o actualizar en Android / iPhone](https://pgallardob.github.io/premio/instalar.html)
- [Administración](https://pgallardob.github.io/premio/admin.html)
- [Cartel QR](https://pgallardob.github.io/premio/cartel.html)

La contraseña administrativa de publicación es distinta de la local. Se conserva en un archivo privado fuera del repositorio; no se publica ni se copia en esta documentación.

## Inventario real cargado

El propietario reemplazó el plan anterior por **20 destapadores Monster, 20 galletas mini Costa, 10 Jokey, 5 poleras y 3 agendas: 58 unidades en total**. La carga se aplicó en una transacción de PostgreSQL, con controles para no sobrescribir cambios posteriores ni duplicar la reposición. Consulte [Operación del local](OPERACION.md#inventario-vigente).

La campaña fue habilitada después de incorporar la confirmación del panel. Se conservan la protección de 24 horas, el contador y el stock reales; la auditoría consultada contiene siete movimientos. El plan anterior de bebidas, snacks y café quedó sin efecto y no debe aplicarse.

El catálogo usa identificadores nuevos y cinco ilustraciones referenciales; no son fotografías de los productos. Los identificadores anteriores y sus recursos se conservan para no romper posibles referencias históricas. Los valores iniciales de una instalación nueva siguen en cero.

El contacto solicitado está guardado. La revisión de bases y privacidad se confirma expresamente en **Administración → La experiencia** y permanece registrada entre reinicios. El mensaje de guardado ocupa todo el ancho bajo el botón y el texto de presentación de premios se adapta sin saltos de línea forzados.

El propietario confirmó que el [QR ganador de prueba](CUPON_PRUEBA.md) funcionó en su teléfono y en la validación web, y pidió eliminarlo. La eliminación ya se completó: no queda un cupón de prueba activo, su consulta API responde 404, el enlace ya no valida y se retiraron su marcador privado, QR e imágenes de verificación. No recrearlo sin una nueva solicitud. La campaña, las dos participaciones reales y las 58 unidades se conservaron.

## Implementado y comprobado

- API real en el proyecto existente `premio`, sin crear otro proyecto, túneles temporales ni activar un plan pago.
- Persistencia transaccional de contador, reservas y canjes; sesiones administrativas y límites conservados entre reinicios de las funciones.
- Interfaz conectada mediante CORS restringido y sesiones con CSRF, sin cookies de terceros.
- PWA con iconos, manifiesto, service worker y recursos versionados para actualizar instalaciones anteriores.
- CSV autenticado, cupones privados y descarga PNG; ninguna emisión o validación de premios offline.
- Registros anteriores eliminados sin restaurarlos, sin modo de prueba público ni premios ficticios en producción.
- Despliegue local con archivo y alternativa Docker/Caddy conservados, separados de la publicación en Neon.

Evidencia: 23 pruebas existentes, ocho de inventario, seis de contacto y confirmación, cinco del cupón retenido y once comprobaciones contra PostgreSQL real. Los 21 recorridos de Chrome incluyen la vista ganadora de prueba en teléfono, PNG, colección y validación sin canje; se mantienen las siete comprobaciones PWA y la compilación estática. Los datos automáticos se crean y eliminan en instalaciones aisladas. El ejemplo privado de la instalación real se eliminó tras la confirmación del propietario.

## Retomar en la próxima sesión

1. Definir si la elegibilidad exige una compra o solo presencia en el local antes de implementar códigos de un solo uso. Revisar después la conexión oficial de Instagram. Estas restricciones todavía no están implementadas.
2. Revisar el inventario y las reservas antes de cualquier reposición; no repetir la carga inicial ya aplicada ni restaurar historial.
3. Comprobar la participación desde computador y teléfonos físicos, el QR y un canje de un solo uso después de activar.
4. Configurar respaldo PostgreSQL externo, calendario y verificación de restauración.

No hay una activación automática programada. Consulte [Neon](NEON.md) y [Revisión de producción](REVISION_PRODUCCION.md) para los límites gratuitos y pendientes de apertura.
