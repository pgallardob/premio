# Mantener una experiencia clara y consistente

Cada cambio debe conservar el funcionamiento del ciclo completo, no solo la apariencia de una pantalla.

## Ruta de trabajo

1. Lea [los requisitos](docs/REQUISITOS.md) y la guía del área que se modificará.
2. Cambie HTML, CSS y JavaScript en sus archivos separados.
3. Mantenga pruebas y documentación junto con el comportamiento modificado.
4. Ejecute `npm run verify` y, si afecta la interfaz, `npm run test:browser`.
5. Revise las capturas a 320 y 390 píxeles, además de escritorio.

## Convenciones

- Identificadores y comentarios técnicos en inglés; interfaz y documentación de negocio en español profesional.
- Sin `<style>`, scripts ejecutables inline, atributos `style`, eventos `onclick` ni enlaces `javascript:`.
- Registrar eventos mediante `addEventListener` y renderizar texto dinámico con `textContent`.
- El servidor decide ganadores, stock, vigencia y canjes. No duplicar esa autoridad en el cliente.
- Conservar `laidea.md` y las imágenes originales. No sobrescribir archivos de datos para «preparar una demo».
- Nunca guardar contraseñas, hashes, tokens privados, `.env` o `data/` en el repositorio.
- No añadir dependencias o servicios externos cuando una función local sencilla resuelva la necesidad.

## Cambios de contrato

Actualice primero `docs/api.openapi.json` si cambia una entrada, respuesta o garantía. Añada pruebas del caso normal y del rechazo importante. Una respuesta 200 por sí sola no demuestra que un canje sea único.

## Alcance de publicación

Esta carpeta no se inicializa ni publica en Git automáticamente. Los comandos de instalación y verificación son locales. Un despliegue, un cambio de infraestructura o una publicación de documentación requiere una decisión explícita del propietario.
