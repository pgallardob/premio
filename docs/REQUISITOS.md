# Una experiencia real, sin complicar al cliente

La aplicación convierte la idea original en una experiencia con publicación controlada. Las decisiones de seguridad se resuelven en el servidor, no en el navegador del participante. La fase de pruebas manuales anterior terminó y sus registros se eliminaron.

## Reglas implementadas

| Necesidad del documento | Comportamiento |
|---|---|
| Un único QR público | Abre la página de participación; el cartel se genera desde `PUBLIC_URL`. |
| Contador compartido | Una cola central ordena y persiste cada participación. |
| Un premio cada 20 participaciones | Ganan las posiciones 20, 40, 60, etc., con las reglas iniciales. |
| Premios sorpresa con stock | Selección aleatoria entre tipos de premio que tengan unidades disponibles. |
| Catálogo dentro del proyecto | Nombres, imágenes y stock inicial en `config/prizes.json`. |
| Premio visible en el teléfono | Resultado ganador, QR y código verificable. |
| Guardar para más tarde | PNG descargable, enlace privado y colección del navegador. |
| Cinco días para canjear | Vencimiento exacto fijado al emitir cada cupón. |
| Un solo canje | Validación y confirmación administrativa atómicas. |
| Protección por dispositivo | Cookie firmada y límite obligatorio de 24 horas. |
| Validación de presencia | Código opcional del día, con vencimiento a medianoche en Chile. |
| Panel privado | Contraseña, sesión, stock, reglas, registro de premios y CSV. |
| Fondo negro hacia oliva | Sistema visual oscuro con transición horizontal y acentos lima. |
| Logo y marco existentes | Logo original en la marca; `sinimg.jpeg` como marco del cupón. |
| HTML, JavaScript y Pico.css | Sin framework de interfaz y sin código ejecutable embebido. |

## Decisiones importantes

### Abrir no equivale a participar

La página requiere presionar «Descubrir mi suerte». Un enlace abierto por accidente, una vista previa del QR o una recarga no deben consumir una participación. No hay sorteos automáticos durante la carga.

### Disponible no significa reservado

El sistema reserva una unidad al emitir el cupón. No espera al canje para comprobar el stock: hacerlo permitiría prometer dos veces la misma unidad. El canje confirma la entrega sin descontar otra vez. El vencimiento libera la reserva.

### Sin registro no significa identidad verificada

La cookie identifica un navegador, no una persona. Borrarla o cambiar de navegador permite obtener otra referencia. No se utiliza una huella invasiva del dispositivo. El código del día dificulta la participación remota, pero tampoco garantiza presencia física si alguien lo comparte.

## Parámetros iniciales

| Parámetro | Valor |
|---|---|
| Frecuencia | 20 participaciones válidas |
| Vigencia | 5 días desde la emisión |
| Límite por navegador | 24 horas, obligatorio |
| Código del día | Desactivado |
| Inventario | Cero; el propietario carga las unidades reales antes de activar |
| Sesión administrativa | 8 horas; se revoca al reiniciar el servidor |
| Zona de presentación | `America/Santiago` |

La frecuencia solo cambia entre ciclos. Una modificación de vigencia no altera cupones anteriores. Los días de vigencia son períodos de 24 horas, no cierres de jornada.

## Fuera del alcance de esta entrega

- Verificación por SMS, cuentas personales o registro de nombres. Requieren decidir datos, consentimiento, costos y proveedor.
- Intervalos variables: esta versión implementa el intervalo fijo configurable descrito como regla principal.
- Notificaciones por WhatsApp, correo o push.
- Alojamiento público, dominio y revisión legal de la promoción.
- Garantía de identidad o protección antifraude absoluta.

El original `laidea.md` se conserva sin convertir ni sobrescribir. Estas guías son la documentación operativa nueva.
