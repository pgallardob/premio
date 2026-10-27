# Publicar una instancia segura y persistente

Esta guía prepara un servidor Linux con Docker Compose y un dominio propio. Los archivos están incluidos; el despliegue real no se ha ejecutado porque aún no se proporcionó alojamiento ni dominio.

## Antes de comenzar

- Servidor con Docker/Compose y disco persistente.
- Dominio con DNS dirigido a ese servidor y puertos 80/443 accesibles.
- Contacto real del local, inventario confirmado y bases/privacidad revisadas.
- Copias de seguridad fuera del disco principal y una persona responsable de restaurarlas.

No publique los registros borrados ni reutilice las credenciales compartidas durante el desarrollo.

## Configuración

```sh
node scripts/setup.js --file=.env.production
```

Conserve la contraseña generada fuera del repositorio. Edite `.env.production`:

| Variable | Valor de publicación |
|---|---|
| `PUBLIC_URL` | Origen HTTPS real, sin ruta final. |
| `DOMAIN` | El mismo dominio, sin `https://`. |
| `TLS_EMAIL` | Correo operativo para certificados. |
| `PROMOTION_CONTACT` | Contacto real que podrá mostrarse al cliente. |
| `PROMOTION_REVIEWED` | `true` solo después de confirmar bases, premios y tratamiento de datos. |
| `CREDENTIALS_ROTATED` | Lo configura la generación de credenciales nuevas. |

El archivo Compose define automáticamente puerto interno, volumen y dirección del proxy. No agregue una publicación del puerto 8080: solo Caddy debe recibir tráfico externo.

## Validar y desplegar

```sh
docker compose --env-file .env.production -f compose.production.json config
docker compose --env-file .env.production -f compose.production.json up -d --build
docker compose --env-file .env.production -f compose.production.json ps
```

Caddy solicita y renueva HTTPS; sus datos de certificados se conservan en un volumen. El contenedor Node utiliza usuario no privilegiado, raíz de solo lectura y volúmenes separados para datos y respaldos. Las imágenes fijadas son Node 24.22.1 y Caddy 2.11.7; revise nuevas actualizaciones de seguridad antes de cada publicación.

La red privada utiliza `172.30.24.0/24`. Si hay un conflicto con la infraestructura, cambie la subred y las direcciones del proxy **en ambos lugares**, incluido `TRUSTED_PROXIES`. No confíe en cabeceras de cualquier cliente ni exponga Node directamente.

## Abrir la campaña

La instalación nueva comienza pausada y con cero unidades. Ingrese a Administración:

1. **Los premios:** cargue las unidades reales no reservadas.
2. **La experiencia:** confirme frecuencia y vigencia; configure un código diario si lo utilizará.
3. Active **Campaña activa**. En producción se rechaza la activación si faltan revisión/contacto o stock.
4. Escanee el QR desde otro teléfono y verifique su destino HTTPS.

La protección de 24 horas es obligatoria. No existe un modo público de repeticiones ilimitadas.

## Respaldo consistente

El respaldo obtiene el mismo bloqueo exclusivo del servidor: no copia mientras hay un escritor activo. Programe una ventana breve de mantenimiento.

```sh
docker compose --env-file .env.production -f compose.production.json stop app
docker compose --env-file .env.production -f compose.production.json run --rm --no-deps maintenance node scripts/backup.js
docker compose --env-file .env.production -f compose.production.json start app
```

Los archivos quedan en el volumen `app-backups`. Exporte y cifre copias fuera del host; un segundo volumen en el mismo disco no protege ante pérdida del servidor. La programación periódica y el destino externo dependen del alojamiento elegido y todavía deben configurarse.

El servicio de mantenimiento no tiene red ni IP estática y comparte únicamente los volúmenes necesarios. No utilice `down -v` al actualizar: elimina los volúmenes de datos.

## Restaurar

Con el servidor detenido y una copia verificada dentro del volumen de respaldos:

```sh
docker compose --env-file .env.production -f compose.production.json stop app
docker compose --env-file .env.production -f compose.production.json run --rm --no-deps maintenance node scripts/backup.js --restore=/app/backups/ARCHIVO.json --confirm=RESTORE_STATE
docker compose --env-file .env.production -f compose.production.json start app
```

La restauración valida reglas, cupones, fechas y estructura, rechaza protección desactivada y deja la campaña pausada para revisar el inventario. No elimina ni sustituye secretos. Pruebe este procedimiento en una instalación aislada antes de depender de él.

## Control final

```sh
docker compose --env-file .env.production -f compose.production.json exec app node scripts/production-check.js
```

El resultado esperado es `ready-for-live-verification`, no una certificación automática de producción. Compruebe además HTTPS, DNS, teléfonos reales, canje único, reinicio sin pérdida de datos, respaldo externo, política de conservación y atención de consultas.

## Qué se verificó aquí

- Reglas y consistencia por HTTP real, configuración segura, bloqueo de segundo escritor y respaldo/restauración temporal.
- Interfaz móvil, manifest, service worker y exclusión de datos privados de la caché en Chrome.
- Sintaxis JSON de Compose, separación de red/puertos y presencia de recursos de instalación.

Docker no está instalado en este computador: **no se ejecutaron el build del contenedor, Caddy, la emisión TLS ni un despliegue remoto**. Esos pasos siguen siendo verificaciones obligatorias en el destino.
