# Publicación de la interfaz en GitHub Pages

Repositorio: `https://github.com/pgallardob/premio`.

La rama `main` conserva el código completo. La rama `gh-pages` contiene únicamente la interfaz compilada para `https://pgallardob.github.io/premio/`, incluidos recursos locales y PWA con alcance `/premio/`.

## Límite funcional

GitHub Pages no ejecuta Node.js ni escribe el contador central. Esta publicación **no registra participaciones, no verifica sesiones y no canjea cupones**. Los controles de negocio quedan deshabilitados y la web explica que falta conectar el servidor. No se publican respuestas simuladas de API ni contadores locales.

La interfaz puede abrirse e instalarse mediante HTTPS. Para operar la promoción hace falta un backend real; el despliegue completo de una instancia sigue documentado en [Producción](PRODUCCION.md). No basta con cambiar una URL para habilitar cookies/CSRF entre orígenes: esa integración debe configurarse y verificarse expresamente.

## Compilar y verificar

```sh
npm ci
npm run build:pages
npm run test:pages
```

`dist-pages/` es un artefacto regenerable ignorado por Git. Las rutas HTML/CSS/JavaScript, el manifiesto y el worker se adaptan a la subcarpeta del proyecto. Los iconos, fuentes y licencias se copian localmente. El QR del cartel apunta al sitio publicado, pero la impresión comercial permanece bloqueada mientras no exista backend.

## Publicación

Publique únicamente los archivos de `dist-pages/` en `gh-pages`, sin `.pages-build.json`. Configure Pages con origen de rama `gh-pages`, carpeta `/`, y `.nojekyll`. No suba `.env`, `ellocal.txt`, datos, respaldos, node_modules ni artefactos de pruebas.

`scripts/github-pages.js` permite inspeccionar/configurar el sitio usando una credencial del sistema o una variable de entorno; no imprime ni guarda tokens. La configuración y el envío requieren permisos sobre este repositorio.

```sh
node scripts/github-pages.js inspect
node scripts/github-pages.js enable
node scripts/github-pages.js wait
```

El envío del código a `main` no actualiza por sí solo el contenido compilado de `gh-pages`: vuelva a compilar y publicar esa rama cuando cambie la interfaz. Nunca fuerce sobrescrituras de trabajo ajeno.
