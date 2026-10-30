# Los Olivos · Premio

Aplicación web instalable para Android y iPhone, con participación por QR, cupones privados de un solo uso y administración protegida. HTML, JavaScript y Pico.css se mantienen separados, sin código embebido.

## Estado de publicación

La interfaz se publica en `https://pgallardob.github.io/premio/`. [GitHub Pages](docs/GITHUB_PAGES.md) aloja la web; la integración con [Neon Functions y PostgreSQL](docs/NEON.md) permite ejecutar y persistir la API sin depender de una computadora encendida. Sin `PAGES_API_URL`, la compilación estática mantiene los controles de negocio desconectados.

**La conexión del servidor no activa automáticamente la promoción.** Se eliminaron los registros anteriores y el modo de prueba. Toda instalación limpia empieza pausada, sin stock y con protección obligatoria de 24 horas. No se convierten unidades de ejemplo en premios reales.

La instalación desde un teléfono requiere una **dirección HTTPS accesible** y un backend con persistencia: disco privado para Node o PostgreSQL para Neon. `localhost` solo funciona en el computador que ejecuta el servidor.

## Inicio local

Se requiere Node.js **24.22.1 LTS o una versión compatible actualizada**.

```sh
npm ci
node scripts/setup.js
npm start
```

Abra `http://localhost:4173`. El comando de configuración muestra una contraseña aleatoria una sola vez; consérvela en un gestor de contraseñas. No se guarda en texto plano.

| Pantalla | Dirección |
|---|---|
| Experiencia del cliente | `/` |
| Mis cupones | `/#mis-cupones` |
| Administración | `/admin.html` |
| Configuración de campaña | `/admin.html#settings` |
| Instalación Android / iPhone | `/instalar.html` |
| Cartel imprimible | `/cartel.html` |
| Estado del proceso | `/healthz` |

## Verificación

```sh
npm run verify
npm run test:browser
npm run test:pwa
npm run production:check
```

Las pruebas utilizan servidores y datos temporales separados. El último comando **debe fallar** mientras falten dominio, credenciales de publicación, contacto, revisión de bases, inventario o activación. Un informe local aprobado tampoco sustituye la prueba desde un teléfono físico.

## Publicar e instalar

Para Neon, use [la guía de despliegue de Neon](docs/NEON.md). Para un servidor propio:

1. Complete [la guía de producción](docs/PRODUCCION.md).
2. Genere credenciales nuevas en `.env.production`; no reutilice las de desarrollo.
3. Despliegue Node.js y Caddy con HTTPS, sin exponer el puerto interno del backend.
4. Confirme premios y stock reales; active la campaña desde el panel.
5. Abra la URL HTTPS en el teléfono y siga [la instalación móvil](docs/INSTALACION_MOVIL.md).

Esta entrega es una **PWA**, no un APK, IPA ni una publicación en App Store/Google Play. Android permite instalar desde Chrome; en iPhone se utiliza Safari y «Agregar a pantalla de inicio». Los premios y canjes siempre necesitan conexión.

## Guías

- [Estado actual e inventario real](docs/AVANCE.md)
- [Revisión y pendientes de producción](docs/REVISION_PRODUCCION.md)
- [Despliegue, respaldo y restauración](docs/PRODUCCION.md)
- [Neon Functions, PostgreSQL y GitHub Pages](docs/NEON.md)
- [Instalación Android / iOS](docs/INSTALACION_MOVIL.md)
- [Operación del local](docs/OPERACION.md)
- [Arquitectura](docs/ARQUITECTURA.md), [seguridad](docs/SEGURIDAD.md) y [diseño](docs/DISENO.md)
- [Contrato HTTP](docs/API.md) · [OpenAPI](docs/api.openapi.json)
- [Pruebas](docs/PRUEBAS.md), [requisitos](docs/REQUISITOS.md) y [dependencias](docs/DEPENDENCIAS.md)
- [QR ganador privado para comprobación en teléfono](docs/CUPON_PRUEBA.md)

## Límites importantes

- El despliegue con archivo requiere un proceso y un volumen persistente. Neon utiliza bloqueo de filas en PostgreSQL para coordinar las instancias; no guarda el stock en el disco efímero de una función.
- GitHub Pages por sí solo no ejecuta el contador ni protege el canje.
- El identificador firmado del navegador (cookie local o token de Neon) no identifica personas. Las bases y el nivel antifraude deben aceptarse antes de operar.
- El service worker no almacena API, estados de cupones ni documentos administrativos/privados.
- El original `laidea.md` y las imágenes aportadas se conservan intactos. El original contiene Word pese a su extensión.
