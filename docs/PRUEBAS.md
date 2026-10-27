# Verificar la experiencia sin consumir el inventario local

Los tests HTTP y de navegador crean su propio directorio temporal y su propio servidor. No utilizan `data/state.json` de la instalación que se muestra en Chrome.

## Comandos

```sh
npm run check
npm test
npm run test:browser
npm run test:pwa
```

`npm run verify` ejecuta las dos primeras comprobaciones. La prueba de navegador necesita Google Chrome instalado; usa ese Chrome en modo sin interfaz y no descarga otro navegador.

## Qué comprueba cada nivel

| Nivel | Evidencia |
|---|---|
| Estructura | Sintaxis de JavaScript, ausencia de estilos/eventos/scripts embebidos y referencias OpenAPI resolubles. |
| API real | Solicitudes HTTP contra el servidor y persistencia en disco temporal. |
| Chrome real | Clics, formularios, diálogos, descargas y adaptación de la interfaz. |
| Revisión visual | Capturas de escritorio, móvil, administración, cupón y cartel. |

## Escenarios HTTP automatizados

1. Las vistas no cuentan; solo gana la participación 20 del primer ciclo.
2. Cuarenta solicitudes simultáneas emiten exactamente dos premios distintos.
3. Diez reintentos concurrentes con la misma clave registran una participación.
4. El límite móvil de 24 horas se comprueba en el servidor, incluidos sus bordes temporales.
5. Dos canjes simultáneos producen una confirmación y un rechazo; no descuentan stock dos veces.
6. El vencimiento libera una reserva exactamente una vez e impide el canje.
7. La colección no expone cupones de otro navegador; el código público no enumera tokens.
8. Una pausa o ausencia de stock no consume participaciones.
9. Solo se emiten premios con unidades disponibles.
10. El código del local se valida y vence al cambiar de día en Chile.
11. Las reglas y el inventario rechazan tipos, rangos y campos incorrectos.
12. Las mutaciones administrativas necesitan sesión, CSRF y origen permitido.
13. El acceso limita intentos y usa cookies protegidas.
14. Secretos y archivos privados no se sirven por HTTP; la CSP excluye código inline.
15. El CSV no incluye tokens privados ni referencias de navegador.
16. Los datos sobreviven al reinicio; los errores revierten la transacción y se rechaza un segundo escritor.
17. Un enlace privado se puede conservar en otro navegador de forma idempotente; el propietario conserva el cupón y no cambian contador, stock ni estado de canje. Se rechazan códigos públicos, tokens desconocidos y orígenes no autorizados.

La suite adicional comprueba configuración pública segura, confianza explícita del proxy, valores iniciales sin stock, protección inmutable, dominio/cookie Secure, eliminación con confirmación y escritor detenido, y respaldo/restauración consistente.

## Comprobaciones PWA

- Manifiesto e iconos válidos y política de workers sin código inline.
- Registro y control real del service worker en Chrome.
- Caché limitada a recursos públicos; ni API ni documentos privados quedan guardados.
- Fallo offline sin premios, validaciones ni datos privados inventados.
- Instrucciones Android e iOS, aviso de dirección local y cancelación del aviso de instalación.
- Recuperación de un cupón desde otra sesión sin nuevas participaciones.

Las pruebas usan inventarios y repetición inyectados únicamente al constructor del servidor temporal. No existe un ajuste público que habilite repeticiones ilimitadas; una instalación normal comienza protegida y pausada.

## Comprobaciones de Chrome

- Inicio sin desplazamiento horizontal en 320, 360, 390, 768, 1024 y 1440 píxeles.
- Portada completa entre encabezado y pie, con texto e ilustración dentro del primer encuadre y sin desplazamiento inicial, en ventanas de escritorio y teléfonos de las dimensiones verificadas.
- Logo y pie visibles al abrir directamente `#experiencia` y `#participar` en móvil y escritorio.
- Navegación que encuadra las secciones completas entre encabezado y pie en 1280×720, 1024×768, 800×600 y 1440×900.
- Panel general en 320, 390, 768 y 1440; cupones, stock y configuración en móvil.
- Colección vacía, cierre con Escape y devolución del foco.
- Participación no ganadora y recibo real.
- Mensaje no ganador centrado, con «no hubo premio» semánticamente destacado y con color distinto; resto del texto preservado.
- El botón del cierre registra la participación directamente, sin redirección a una ancla ni segundo clic.
- Ganador, marco original, QR, enlace y descarga PNG.
- Cupón ganador presente en «Mis cupones», con código verificable y enlace al mismo cupón privado.
- Recuperación del aviso de un cupón guardado sin incrementar el contador; marco y QR dentro del modal en 1366×596.
- Alineación y altura común de los controles de verificación en 320, 390, 768, 1024 y 1440 píxeles.
- Inicio de sesión, lectura de estadísticas y validación a través del enlace del QR.
- Confirmación de canje, estado final y rechazo de nueva entrega.
- Guardado de configuración, actualización de stock, cartel y control de repetición.
- Participación desde otro dispositivo y desde otra pestaña: el panel cambia sin navegar ni recargar.
- Las actualizaciones automáticas conservan ediciones de reglas e inventario sin guardar.
- Recuperación de un fallo de conexión simulado en Chrome sin perder la última información.
- Coordenadas y edición eliminadas de la ilustración, y recorrido de Volver en todas las páginas y la validación sin alterar los totales de premios.
- Cartel compacto, contraste de textos mínimo de 4.5:1 y PDF de una sola hoja A4 con QR ampliado.
- Cupón privado compacto, acceso y validación sin desplazamiento adicional en los tamaños verificados; apertura del enlace en otro navegador y recuperación del mismo cupón canjeado en su colección.

Las capturas y `results.json` se guardan en `artifacts/browser/`, una carpeta excluida de Git. Sus enlaces y códigos corresponden a datos temporales eliminados al terminar las pruebas, no a premios de la instalación.

## Comprobación manual antes de publicar

- [ ] Probar el QR desde un teléfono físico en una red diferente con el dominio público.
- [ ] Probar Safari/iOS y Chrome/Android físicos.
- [ ] Revisar zoom, teclado del teléfono, lector de pantalla y orientación horizontal.
- [ ] Guardar una imagen, volver a abrir el enlace y confirmar su estado después de un canje.
- [ ] Imprimir el cartel y comprobar lectura del QR a la distancia real.
- [ ] Probar respaldo y restauración con el proceso detenido.

Las simulaciones de pantalla no prueban una cámara física, una impresora o el acceso desde Internet. No se ha realizado una prueba de carga de producción ni una auditoría formal de accesibilidad.
