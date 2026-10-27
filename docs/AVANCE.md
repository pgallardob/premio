# Preparación de publicación · 0.2.0

La aplicación cuenta con interfaz móvil, reglas centralizadas, cupones de un solo uso y versión PWA. No se ha desplegado en Internet: la instalación en teléfonos requiere el dominio HTTPS y el servidor de destino.

## Estado limpio

- Participaciones, cupones, canjes, referencias y auditoría anteriores eliminados por solicitud del propietario.
- Artefactos anteriores de pruebas del proyecto eliminados, sin conservar una copia del historial.
- Modo de prueba retirado de la interfaz, API y herramienta de generación.
- Protección de 24 horas obligatoria; campaña pausada e inventario en cero hasta confirmar unidades reales.
- Credenciales, catálogo, imágenes originales y código conservados.

## Implementado

- PWA con manifiesto, iconos Android/Apple, instalación guiada y pantalla offline segura.
- Recuperación de cupones mediante su enlace privado dentro de otra sesión o app instalada.
- API y páginas privadas excluidas de Cache Storage; ninguna operación de premio offline.
- Validación de producción, proxy confiable explícito, bloqueo de dominio incorrecto y salud mínima.
- Despliegue de una instancia con Node actualizado, Caddy HTTPS y volúmenes persistentes.
- Herramientas exclusivas de respaldo, restauración y eliminación con confirmación.
- Paquete de entrega que excluye secretos, datos y artefactos de pruebas.

## Lo que sigue pendiente

Consulte [Revisión de producción](REVISION_PRODUCCION.md): dominio/alojamiento, contacto y bases, inventario real, credenciales nuevas de publicación, respaldo externo y verificación física Android/iPhone. No se presenta un ZIP como instalador móvil ni se declara un despliegue inexistente.

Las pruebas se ejecutan en servidores y datos temporales separados de esta instalación.
