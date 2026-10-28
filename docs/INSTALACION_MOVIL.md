# Instalar Los Olivos en Android o iPhone

Se instala desde la dirección HTTPS publicada, no desde un archivo APK/IPA. Se conserva el icono en la pantalla de inicio y se abre como una app independiente.

## Android

1. Abra la dirección pública en Chrome.
2. Entre a **Instalar la aplicación** desde el icono de descarga de la cabecera.
3. Use **Instalar aplicación** si aparece; en caso contrario, menú de Chrome → **Instalar app** o **Agregar a pantalla de inicio**.
4. Confirme en el teléfono.

## iPhone / iPad

1. Abra la dirección pública en Safari.
2. Toque **Compartir** → **Agregar a pantalla de inicio**.
3. Active **Abrir como app web** si la versión del sistema ofrece esa opción.
4. Confirme con **Agregar**.

Los nombres y la disponibilidad de los menús dependen de la versión del navegador y del sistema. Safari no ofrece el mismo aviso programático de instalación que Chrome; la página muestra instrucciones, no un botón que promete instalar por sí solo.

## Condiciones necesarias

- HTTPS con certificado confiable y dirección accesible desde el teléfono.
- Iconos 192/512, icono adaptable y Apple Touch Icon incluidos.
- Manifiesto con el alcance de la publicación (`/premio/` en GitHub Pages, `/` en Node) y modo `standalone`.
- Servidor disponible y almacenamiento persistente.

La dirección pública es `https://pgallardob.github.io/premio/instalar.html`; su API está conectada a Neon. No necesita mantener encendida la computadora. La campaña permanece pausada hasta completar la configuración del negocio. `http://localhost:4173` se refiere al propio teléfono cuando se abre allí; no use esa dirección para instalar. No se ha creado una ficha en Google Play ni App Store.

## Conexión y privacidad

Sin conexión se muestra una pantalla informativa. No se almacenan respuestas de API, estados personales, QR privados ni documentos de cupones/administración en Cache Storage. No se emiten premios ni se confirman canjes offline.

Una PWA puede utilizar un almacenamiento distinto al de Safari/Chrome. Dentro de **Mis cupones**, abra **Recuperar un cupón con su enlace privado**, pegue el enlace que conservó y guárdelo. Esto no registra otra participación, no altera el vencimiento ni reactiva un cupón canjeado. No se leen datos del portapapeles automáticamente.

## Pruebas realizadas y pendientes

Se verificaron el manifiesto, iconos, registro/control del service worker, caché pública, navegación offline segura e instrucciones de plataforma en Chrome. La detección de iPhone se comprobó con simulación de agente de usuario: **no reemplaza una instalación en Safari de un dispositivo físico**.

Antes de abrir al público, pruebe un Android y un iPhone reales con el dominio final, sus áreas seguras, el QR impreso, reconexión y un canje.
