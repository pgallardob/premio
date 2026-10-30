# Estado publicado, visitas y clics de Instagram · 0.4.0

Actualizado el 30 de octubre de 2026. La web utiliza GitHub Pages y Neon Functions con PostgreSQL en el plan Free. No depende de mantener encendida la computadora. **La última consulta confirma la campaña activa, con 58 unidades, dos participaciones y ningún cupón comercial emitido. No cambiar estos valores para forzar una prueba ganadora.**

La versión 0.4.0 está publicada en ambos servicios y **la validación presencial sin compra sigue habilitada (`presenceRequired: true`)**. El propietario confirmó la revisión de las bases y la privacidad y autorizó expresamente activarla; el servidor registró esa revisión el `2026-10-30T18:33:19.434Z`. Una participación nueva requiere la aprobación del personal en el [flujo de visitas](VISITAS.md). Instagram usa enlaces normales y [registro de clics](INSTAGRAM_CLICS.md), no una integración con la API de Meta ni comprobación de seguidores.

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
- Enlaces **Visitar Instagram** en el cierre de la página principal, el resultado y el cupón. El panel general muestra acumulados y hasta veinte eventos recientes. Solo se guarda origen del botón, fecha y una clave aleatoria por evento; no se vinculan navegadores, personas o cupones. Un clic no autoriza participaciones ni canjes.

Evidencia: 63 pruebas sin base externa aprobadas; la suite Neon pasó 15/15, incluidos catorce escenarios con PostgreSQL real y un control del identificador SQL. Pasaron los 21 recorridos existentes de Chrome, cinco de visitas, seis de clics de Instagram, siete comprobaciones PWA y la compilación estática. Los registros positivos usan datos aislados; el destino Instagram es una página estática de navegación en esos tests, no una prueba de visita o seguimiento real. La web publicada se verificó contra Neon mediante inspección de enlaces, lectura privada y rechazo de un origen de clic inválido, sin generar clics artificiales, participaciones o aprobaciones. No quedan esquemas de pruebas; el ganador privado de prueba sigue eliminado.

Pages corresponde a `48d93fe9e660ae8678e92050514875ef2f1fa009`; el código funcional llega a `2c047cb` (API `e761f32`, interfaz `96cb4f2`). La huella comercial antes y después de publicar 0.4.0 coincide: `e55d15617b5b7e7a09861f75bef7afd93696c0b279a3e06786294b5cbf3cf27e`. Siguen las 58 unidades, dos participaciones, nueve movimientos de auditoría, protección de 24 horas y requisito presencial, sin cupones comerciales o de prueba, visitas pendientes ni clics registrados en la última consulta. Los acumulados de clics son independientes del estado de premios.

La comprobación pública posterior a la activación usó Google Chrome: participar sin visita o con una visita pendiente devolvió `409 VISIT_REQUIRED`; intentar aprobar sin sesión devolvió `401`. Se generó y canceló únicamente la solicitud temporal de ese navegador, sin atestar presencia, aceptar participaciones o consumir inventario. El QR se cargó correctamente y no hubo errores JavaScript. El recorrido positivo con personal y teléfono físicamente presentes sigue pendiente.

## Prueba pospuesta por el propietario

- [ ] **Pendiente por ahora:** verificar físicamente una solicitud, su autorización desde **Visitas** y el resultado en el mismo teléfono. El propietario pidió posponer esta prueba y continuar con Instagram. No se considera aprobada ni bloquea la preparación de esa integración.

La validación presencial permanece activa y sin compra. No exigir ticket o pago ni aprobar visitas automáticamente durante comprobaciones remotas. No volver a solicitar esta prueba como requisito para avanzar con Instagram mientras siga pospuesta.

## Instagram: alcance de software completado

Cuenta del local: [@comercializadora_los_olivos_](https://www.instagram.com/comercializadora_los_olivos_). **Conversión a Negocio (cuenta profesional de empresa) completada**, con perfil público y autorización expresa del propietario. Instagram confirmó que la cuenta de empresa está lista; al recargar la configuración aparecen **Cuenta profesional** y **Controles y herramientas para empresas**.

Se eligió **No usar mi información de contacto**. Los campos empresariales de correo, teléfono, WhatsApp y dirección se verificaron vacíos; no se agregaron datos ni se vincularon cuentas de Facebook, publicidad o suscripciones. La conversión por sí sola no verifica seguidores ni conecta la promoción con la API.

El propietario completó la verificación de Meta personalmente y aprobó el nombre **Los Olivos Premio** y el correo precompletado. El asistente quedó en **Resumen**, únicamente con **Administrar mensajes y contenido en Instagram**, sin portfolio comercial vinculado. **No se pulsó Crear app ni se aceptaron las condiciones de creación.** No se leyeron contraseñas, códigos ni el valor del correo. El registro de clics finalmente solicitado no necesita esa aplicación ni la cuenta profesional; no continuar su creación ni revertir la configuración anterior sin una nueva petición.

**Bloqueo descubierto antes de crear la app:** la [guía oficial de Meta](https://developers.facebook.com/docs/resp-plat-initiatives/appreview/tutorial/rejection-guide/) advierte del rechazo de apps que incentivan follows o likes para promocionar una app o marca. Consultar técnicamente el seguimiento no significa que esté permitido exigirlo para una promoción. Se corrigió el análisis anterior y se detuvo la creación; consulte [Seguridad](SEGURIDAD.md#presencia-sin-compra-e-instagram-pendiente). El seguimiento obligatorio no está implementado.

El propietario pidió trabajar **solo en registrar el clic**. Eso ya está publicado: no se implementaron ni validaron condiciones de seguimiento impresas o externas, ni se prometió que sean invisibles a Meta. El software mantiene participación y canje independientes del registro. La privacidad explica la conservación de hasta mil eventos durante siete días y acumulados sin identificadores; la navegación funciona aunque no pueda confirmarse el guardado del evento.

1. No continuar con verificación de seguidores o creación de la app Meta bajo el alcance actual. Cualquier condición externa necesita información clara y compatibilidad con las normas aplicables; no tratar el contador como prueba para cobrar.
2. Si el propietario comprueba enlaces en la publicación real, sus clics se registrarán como eventos reales. No generar datos automáticos para inflar el contador. La prueba física de visitas sigue pospuesta, no aprobada.
3. Revisar inventario y reservas antes de reponer; no repetir la carga inicial ni restaurar historial. Mantener pendientes las comprobaciones Android/iPhone físicas y un canje comercial de un solo uso.
4. Configurar respaldo PostgreSQL externo, calendario y verificación de restauración.

No hay una activación automática programada. Consulte [Neon](NEON.md) y [Revisión de producción](REVISION_PRODUCCION.md) para los límites gratuitos y pendientes de apertura.
