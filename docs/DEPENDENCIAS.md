# Dependencias locales y sus licencias

Las versiones exactas instaladas están fijadas en `package-lock.json`. La aplicación no consulta un CDN al abrirse.

| Dependencia directa | Uso | Licencia declarada |
|---|---|---|
| `@picocss/pico` | Base CSS de la interfaz | MIT |
| `@fontsource/manrope` | Fuente de lectura e interfaz | OFL-1.1 |
| `@fontsource/syne` | Fuente de titulares | OFL-1.1 |
| `qrcode` | Generación de QR en el servidor | MIT |
| `@playwright/test` | Verificación con Chrome, solo desarrollo | Apache-2.0 |

Las declaraciones se comprobaron en los manifiestos de los paquetes instalados. Sus textos de licencia y avisos se conservan en los paquetes dentro de `node_modules`; deben respetarse en una redistribución. Las dependencias transitivas mantienen sus propias licencias.

El logo y el marco fueron proporcionados con el proyecto; su propiedad no se redefine mediante las licencias de las dependencias. No se asigna automáticamente una licencia pública al proyecto completo.
