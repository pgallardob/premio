# Publicar la aplicación con Neon y GitHub Pages

GitHub Pages conserva la interfaz y la instalación móvil. Neon Functions ejecuta la API con HTTPS; PostgreSQL conserva el inventario y los cupones aunque una función se reinicie. El catálogo sigue versionado en `config/prizes.json`; el stock mutable deja de depender del disco del servidor.

## Ruta rápida

1. Autentique la CLI oficial en un perfil privado. No comparta claves ni cadenas de conexión por chat.
2. Establezca `NEON_CLI_PATH`, `NEON_CONFIG_DIR` y opcionalmente `NEON_PROFILE=premio`. El directorio de credenciales debe quedar fuera del repositorio y ser privado.
3. Compruebe el destino existente en `deploy/neon-target.json`.

```sh
npm ci
npm run neon:inspect
npm run test:neon
npm run neon:migrate
npm run neon:deploy
```

La migración crea únicamente el esquema `premio` y sus tablas si faltan. No reemplaza un estado existente ni modifica otras aplicaciones. Una instalación nueva permanece pausada, sin stock y con protección de 24 horas.

En Windows, use la CLI instalada con npm y apunte `NEON_CLI_PATH` a su `dist/cli.js` si el ejecutable portable falla al evaluar `neon.ts`. La distribución portable 8.13.1 presentó un error de empaquetado de `jiti`; no es necesario cambiar las credenciales ni el plan para resolverlo.

El despliegue genera credenciales nuevas en el directorio privado: `premio-deployment.env` y `premio-admin-password.txt`. No se publican ni se imprimen. `neon deploy --no-env-pull` evita sobrescribir el `.env` local. La configuración declara únicamente la función `api`, sin actualizaciones del plan ni ajustes de cómputo.

## Conectar la interfaz

Use la URL HTTPS de la función que devuelve el despliegue:

```sh
PAGES_API_URL=https://YOUR_FUNCTION_HOST npm run build:pages
```

En PowerShell, establezca `$env:PAGES_API_URL` antes del comando. Publique `dist-pages/` en la rama `gh-pages` siguiendo [GitHub Pages](GITHUB_PAGES.md). Sin esa variable, la compilación sigue siendo una interfaz explícitamente desconectada, no una API simulada.

## Garantías y límites

| Área | Comportamiento |
|---|---|
| Contador y premios | Un documento JSONB en PostgreSQL; `SELECT ... FOR UPDATE` ordena operaciones entre instancias. Los errores hacen rollback. |
| Sesiones administrativas | Credencial bearer por pestaña, guardada en `sessionStorage`. Hash de sesión y CSRF persistidos en PostgreSQL, vigencia de ocho horas, revocación al salir. |
| Identificación del navegador | Token aleatorio firmado en `localStorage`, limitado al origen de API configurado. No identifica a una persona. |
| Orígenes | CORS admite únicamente el origen de la web configurada. No depende de cookies de terceros. CSRF sigue siendo obligatorio para cambios administrativos. |
| Navegador | CSP sin scripts embebidos, API fuera de Cache Storage y QR entre orígenes compatible con descarga PNG. Una vulnerabilidad XSS podría acceder a Web Storage: no añada scripts externos sin revisión. |
| Límites de solicitudes | Contadores persistidos, globales y no eludibles mediante encabezados de IP inventados. Un exceso puede afectar a otros visitantes. |
| Plan gratuito | Tiene cuotas y suspensión por inactividad; no ofrece disponibilidad continua garantizada. Cierre el panel cuando no lo utilice. El refresco remoto es de 15 segundos. |
| Copias | El procedimiento de respaldo de archivos no respalda Neon. Debe planificarse una copia PostgreSQL y probar su restauración antes de abrir la promoción. |

Las pruebas `test:neon` usan esquemas únicos `premio_verify_*` y eliminan solo sus propios datos al terminar. No siembran cupones de prueba en el esquema real.

El gateway de Neon responde a `/healthz` con su propio texto `ok`; eso no verifica la base de datos. Compruebe `/api/status` para validar el recorrido real por la función y PostgreSQL.

## Antes de aceptar participantes

- Complete contacto y revisión de bases en las variables privadas de despliegue.
- Configure únicamente stock real y active la campaña desde administración.
- Verifique desde Android y Safari de iPhone el QR, instalación, sesión, cupón y canje.
- Configure respaldo externo y seguimiento de las cuotas gratuitas.

La instalación final se confirma en el teléfono; ninguna prueba de escritorio sustituye esa confirmación física.
