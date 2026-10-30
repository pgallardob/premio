# Estado publicado y validación de visitas · 0.3.0

Actualizado el 30 de octubre de 2026. La web utiliza GitHub Pages y Neon Functions con PostgreSQL en el plan Free. No depende de mantener encendida la computadora. **La última consulta confirma la campaña activa, con 58 unidades, dos participaciones y ningún cupón comercial emitido. No cambiar estos valores para forzar una prueba ganadora.**

La versión 0.3.0 está publicada en ambos servicios y **la validación presencial sin compra ya está habilitada (`presenceRequired: true`)**. El propietario confirmó la revisión de las bases y la privacidad y autorizó expresamente activarla. El servidor registró la nueva revisión el `2026-10-30T18:33:19.434Z`. Una participación nueva requiere la aprobación del personal en el [flujo de visitas](VISITAS.md); Instagram todavía no está conectado.

## Accesos

- [Web del cliente](https://pgallardob.github.io/premio/)
- [Instalar o actualizar en Android / iPhone](https://pgallardob.github.io/premio/instalar.html)
- [Administración](https://pgallardob.github.io/premio/admin.html)
- [Cartel QR](https://pgallardob.github.io/premio/cartel.html)

La contraseña administrativa de publicación es distinta de la local. Se conserva en un archivo privado fuera del repositorio; no se publica ni se copia en esta documentación.

## Inventario real cargado

El propietario reemplazó el plan anterior por **20 destapadores Monster, 20 galletas mini Costa, 10 Jokey, 5 poleras y 3 agendas: 58 unidades en total**. La carga se aplicó en una transacción de PostgreSQL, con controles para no sobrescribir cambios posteriores ni duplicar la reposición. Consulte [Operación del local](OPERACION.md#inventario-vigente).

La campaña fue habilitada después de incorporar la confirmación del panel. Se conservan la protección de 24 horas, el contador y el stock reales; la última auditoría contiene nueve movimientos. Había ocho antes de activar la validación presencial y la activación agregó uno, sin eliminar los anteriores. El plan de bebidas, snacks y café quedó sin efecto y no debe aplicarse.

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
- Solicitud de visita y aprobación explícita del personal, con diez minutos para cada etapa, vinculación al navegador y consumo único en la transacción de participación. Autorizar no registra una entrada ni muestra el resultado.
- Reintento de un resultado aceptado aunque la visita haya sido usada o haya vencido; el requisito nuevo no invalida las dos entradas anteriores.

Evidencia: 56 pruebas sin base externa aprobadas; la suite Neon pasó 14/14, incluidos trece escenarios con PostgreSQL real y un control del identificador SQL. Pasaron los 21 recorridos existentes de Chrome, cinco grupos nuevos de visitas, siete comprobaciones PWA y la compilación estática. La web pública se verificó con Chrome contra Neon sin registrar participaciones ni aprobar visitantes. No quedan esquemas de pruebas. El ejemplo ganador privado real sigue eliminado.

La publicación Pages corresponde a `675e89dc26ca71098a25e903a3983638a64b8944`; el código funcional llega a `f90c38f`. La publicación inicial no alteró el estado de negocio: su huella fue `c40f5ac7b342d8b9c99773451f63e34e822272f7cff3ffeb2d9ce2caa23c71bc`. Después de activar el requisito, la huella actual es `e55d15617b5b7e7a09861f75bef7afd93696c0b279a3e06786294b5cbf3cf27e`; incluye las reglas y la auditoría actualizadas. Siguen disponibles 58 unidades y se conservan las dos participaciones, sin cupones comerciales, cupones de prueba ni visitas pendientes.

La comprobación pública posterior a la activación usó Google Chrome: participar sin visita o con una visita pendiente devolvió `409 VISIT_REQUIRED`; intentar aprobar sin sesión devolvió `401`. Se generó y canceló únicamente la solicitud temporal de ese navegador, sin atestar presencia, aceptar participaciones o consumir inventario. El QR se cargó correctamente y no hubo errores JavaScript. El recorrido positivo con personal y teléfono físicamente presentes sigue pendiente.

## Prueba pospuesta por el propietario

- [ ] **Pendiente por ahora:** verificar físicamente una solicitud, su autorización desde **Visitas** y el resultado en el mismo teléfono. El propietario pidió posponer esta prueba y continuar con Instagram. No se considera aprobada ni bloquea la preparación de esa integración.

La validación presencial permanece activa y sin compra. No exigir ticket o pago ni aprobar visitas automáticamente durante comprobaciones remotas. No volver a solicitar esta prueba como requisito para avanzar con Instagram mientras siga pospuesta.

## Continuar con Instagram

1. Identificar la cuenta del local y confirmar su tipo y la autorización oficial, una pregunta a la vez. El siguiente dato pendiente es su usuario `@`. No presentar todavía el seguimiento como verificado.
2. Definir el contrato de verificación antes de implementar el requisito. La cuenta, aplicación Meta, permisos y credenciales todavía no están conectados.
3. Revisar inventario y reservas antes de reponer; no repetir la carga inicial ni restaurar historial. Mantener pendientes las comprobaciones Android/iPhone físicas y un canje comercial de un solo uso.
4. Configurar respaldo PostgreSQL externo, calendario y verificación de restauración.

No hay una activación automática programada. Consulte [Neon](NEON.md) y [Revisión de producción](REVISION_PRODUCCION.md) para los límites gratuitos y pendientes de apertura.
