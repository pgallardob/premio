# Revisión de salida a producción

La PWA está publicada en `https://pgallardob.github.io/premio/` y conectada a una API real de Neon Functions con PostgreSQL, en el plan Free. **La campaña sigue pausada y no se declara lista para recibir participantes** mientras falten los elementos operativos siguientes.

## Corregido e implementado

| Área | Cambio |
|---|---|
| Datos anteriores | Eliminación explícita de participaciones, cupones, canjes, referencias de navegador y auditoría; sin copia del historial eliminado. |
| Modo de prueba | Retirado de interfaz, API y herramientas de generación; control de 24 horas obligatorio. |
| Inicio seguro | Campaña pausada e inventario inicial en cero, sin convertir ejemplos en compromisos reales. |
| Configuración | Credenciales válidas, HTTPS público obligatorio en producción, rechazo de dominio incorrecto y revisión/contacto antes de activar. |
| Infraestructura | Contenedor no privilegiado, disco persistente, backend sin puerto externo, Caddy HTTPS y proxy explícitamente confiable. |
| Datos y mantenimiento | Validación más estricta del estado, bloqueo exclusivo y comandos de respaldo/restauración con confirmación. |
| Disponibilidad | Endpoint de salud mínimo y apagado con límite de espera. |
| Rendimiento | Agrupación de actividad semanal en una pasada y limpieza de referencias de límite ya vencidas. |
| Android / iOS | Manifiesto, iconos, instalación guiada, modo independiente y áreas seguras. |
| Offline | Solo caché de recursos públicos; API y páginas privadas siempre en red. |
| Entrega | Paquete de despliegue sin credenciales, datos, artefactos de prueba ni node_modules. |

## Pendiente de información o verificación externa

1. **Inventario real:** confirmar nombres/presentaciones y unidades disponibles en el local; no se cargaron premios ficticios.
2. **Bases, privacidad y contacto:** completar datos reales, conservación/eliminación y revisión legal aplicable a la promoción en Chile.
3. **Respaldo PostgreSQL externo y calendario:** configurarlos y probar restauración; los respaldos de archivos de Node no respaldan Neon.
4. **Teléfonos físicos:** verificar Android, iPhone/Safari, QR impreso, entrega real y rechazo del segundo canje.

El alojamiento y HTTPS ya no son bloqueos. Se usó el proyecto existente `premio`, sin crear otro ni activar un plan pago. Se generaron credenciales nuevas fuera del repositorio y no se abrieron túneles temporales. La alternativa Docker/Caddy conserva su verificación pendiente, pero no es la infraestructura de esta publicación.

## Límite antifraude

Una cookie no identifica a una persona; borrarla o cambiar de navegador puede eludir el límite. El código del local reduce participación remota, pero puede compartirse. Si el negocio necesita identificación fuerte, debe decidir un mecanismo adicional y sus costos/consentimiento antes de abrir; no se añadió un proveedor SMS ni una promesa de identidad verificada.

## Alcance de la evidencia

- Node.js 24.22.1 LTS, descargado de la fuente oficial y verificado por SHA256; no se cambió el runtime global de otros proyectos.
- **23/23** pruebas de HTTP, reglas, configuración y mantenimiento aprobadas.
- **19/19** recorridos de interfaz en Chrome aprobados.
- **7/7** comprobaciones PWA, privacidad de caché, offline e instalación guiada aprobadas.
- Verificación de la instalación local: cero participaciones, cupones, referencias y auditoría; ciclo/contador cero, stock cero y campaña pausada con límite de 24 horas.
- Auditoría de dependencias sin vulnerabilidades reportadas en la instalación verificada.
- Ocho pruebas adicionales contra PostgreSQL real verifican concurrencia, rollback, idempotencia, sesiones, CSRF, canje único y límites persistentes. Sus esquemas de verificación se eliminaron; no quedaron datos de prueba en la campaña.
- Chrome verificó la web pública contra la API real: CORS, identidad del navegador, login y sesión tras recarga, CSV, logout revocado, manifiesto y service worker. No se emitieron premios ni se alteró el stock real.
- `artifacts/production-check.json` corresponde al despliegue local con archivo. El estado de Neon se consulta con `node scripts/neon-tools.js verify`; la promoción continúa bloqueada por los datos del negocio, no por falta de backend.

Las pruebas locales automatizadas validan comportamientos concretos, no una auditoría de penetración, una prueba de carga de producción ni una certificación legal/accesible. El control `production:check` enumera bloqueos y mantiene la campaña cerrada hasta la configuración real. El ZIP es un artefacto para el servidor: **no es un instalador móvil**.
