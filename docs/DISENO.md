# Una identidad futurista, cálida y útil en el teléfono

La experiencia utiliza una estética editorial oscura: negro profundo, transición oliva, tipografía geométrica y acentos lima. La interacción principal precede a la ilustración en móvil; el diseño no exige explorar una portada para poder participar.

La portada calcula su altura con el espacio disponible entre el encabezado y el pie. El titular queda limitado a 51.2 píxeles en escritorio y la ilustración se reduce con la altura de la ventana. En teléfonos, la escena pasa a una tarjeta horizontal compacta. Se conserva el botón, la explicación y el estado de campaña dentro del primer encuadre, sin ocultar información mediante recortes.

## Sistema visual

| Elemento | Uso |
|---|---|
| `#0b100d` | Fondo principal |
| `#111813` | Superficies y tarjetas |
| `#c8ef8b` | Acción principal, foco y acentos |
| `#f3f4e9` | Texto principal |
| `#9ca89c` | Texto secundario |
| Manrope | Interfaz, formularios y texto |
| Syne | Titulares y cifras destacadas |
| Bordes finos y radios moderados | Profundidad sin saturar la interfaz |

Los tokens están en `assets/css/tokens.css`. Pico.css aporta normalización, formularios y semántica visual; las hojas propias definen la identidad. Todas las fuentes, iconos y estilos se sirven localmente.

## Pantallas

- **Inicio:** participación, selección real de premios, explicación, preguntas y condiciones.
- **Resultado:** recibo de participación o cupón ganador con el marco original.
- **Colección:** cupones de la cookie del navegador, incluidos canjeados y vencidos.
- **Cupón privado:** estado verificado, imagen descargable, enlace e impresión.
- **El local:** vista general, validación explícita, inventario y reglas.
- **Cartel:** QR de la dirección configurada, condiciones y advertencias de prueba.

El cupón privado y la pantalla de acceso utilizan una composición compacta para escritorios de poca altura. Se reducen espacios y texto introductorio redundante, no la información de estado ni los controles importantes. En el cupón, las acciones comparten una fila y el marco se dimensiona con la altura disponible. Las pantallas de teléfono muy pequeñas conservan desplazamiento natural antes que recortar información.

Al abrir un enlace privado se recuerda el cupón en la colección del navegador actual. La cabecera del cupón permite ir directamente a «Mis cupones»; la colección conserva también estados canjeados y vencidos, sin presentarlos como premios nuevos.

### Navegación y participación sin pasos ambiguos

`#experiencia` y `#participar` son secciones de la misma página, no pantallas independientes. El encabezado conserva el logo al desplazarse y el pie compacto permanece visible con la marca, bases, privacidad y acceso al local. Se reserva espacio inferior para que el pie no tape el contenido y se compensan las anclas con la altura del encabezado.

Los destinos `#experiencia` y `#premios` están en sus encabezados reales, no antes del espacio decorativo de cada sección. Así no se acumulan margen de navegación y relleno superior. En tabletas y pantallas de escritorio de poca altura se mantienen tres columnas compactas, sin recortar texto; en teléfonos estrechos se conserva la lectura vertical natural.

Los botones **Descubrir mi suerte** y **Participar ahora** envían el mismo formulario y muestran el resultado directamente. El segundo ya no se limita a llevar al usuario hacia otro botón. Navegar a una sección, por sí solo, sigue sin registrar participaciones.

El resultado sin premio se presenta centrado; únicamente «no hubo premio» se destaca en dorado y con mayor peso. El mensaje invita a regresar después de 24 horas. La ilustración no muestra coordenadas ni numeración de edición.

Todas las páginas tienen un control visible **Volver**, con destinos internos explícitos: inicio desde las secciones públicas, colección desde el cupón, experiencia desde el acceso/panel y panel desde el cartel. En la validación, Volver cierra el diálogo sin confirmar un canje. No se utiliza el historial externo del navegador ni se modifican premios al volver.

### Dónde corresponde mostrar cada QR

El QR del cartel es la puerta de entrada física a la experiencia. No se exige volver a escanearlo dentro de una página que el cliente ya abrió, especialmente desde el mismo teléfono. El QR del cupón ganador es distinto: sirve al personal del local para abrir la validación de ese premio. Ninguno de los dos canjea automáticamente un cupón.

El cartel tiene una vista previa compacta de hasta 400 píxeles de ancho y un tema claro propio. Sus textos se comprueban con una relación de contraste mínima de 4.5:1. La impresión mantiene el formato A4, amplía el QR y excluye los controles y las instrucciones de pantalla. Las advertencias importantes de una URL local se conservan en la impresión.

No hay cifras de ganadores inventadas, testimonios ficticios, cuenta regresiva falsa ni premios mostrados como disponibles cuando el servidor informa lo contrario. Los productos son ilustraciones; las presentaciones reales deben confirmarse en el local.

## Adaptación a pantallas

La composición se reorganiza entre 520, 700/800, 900, 1100 y 1200 píxeles según el componente. En móvil:

- El texto y el botón de participación aparecen antes de la escena visual.
- Los premios pasan de una grilla a tarjetas horizontales.
- Los pasos se apilan sin desplazamiento lateral.
- El panel transforma su navegación lateral en navegación superior.
- Las tablas conservan desplazamiento propio, sin ensanchar la página.
- Los formularios usan campos de 16 píxeles para evitar ampliación automática al enfocar en iOS.

## Accesibilidad implementada

- Idioma del documento, enlace para saltar al contenido y estructura de encabezados.
- Etiquetas visibles, mensajes asociados a la acción y estados anunciados con `role=status`.
- Diálogos nativos: Escape, navegación por teclado y devolución del foco al disparador.
- Diálogos con tamaño de contenido y mínimos explícitos, sin heredar el tamaño de pantalla completa de la capa modal de Pico.css. En escritorio de poca altura se compacta el aviso y se limita el tamaño del marco para que su código y QR permanezcan visibles.
- Indicador de foco visible y estado expresado en texto, no solo mediante color.
- Controles principales con superficie táctil amplia.
- Entrada y botón de verificación con altura común de 48 píxeles, sin márgenes heredados que estiren el botón. En pantallas de hasta 350 píxeles, el botón compacto pasa a una fila inferior y se alinea a la derecha.
- Respeto por `prefers-reduced-motion`; la lata flotante deja de animarse.
- Íconos decorativos fuera del árbol accesible e imágenes con texto alternativo apropiado.

Esto no equivale a una certificación WCAG. Quedan pendientes pruebas con lectores de pantalla reales, personas usuarias y dispositivos físicos variados.

## Cómo realizar cambios

Mantenga la acción principal reconocible y el diseño libre de scripts o estilos embebidos. No sustituya las imágenes originales sin autorización. Cambie primero tokens y componentes, y compruebe escritorio, 390 y 320 píxeles antes de dar por terminado un ajuste.
