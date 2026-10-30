# Operar Los Olivos desde el local

La web y la API utilizan HTTPS en GitHub Pages y Neon. La campaña continúa pausada, sin participaciones ni cupones, con 58 unidades cargadas. Antes de abrir, complete los requisitos de [Neon](NEON.md). La guía de [Producción](PRODUCCION.md) describe la alternativa con servidor propio y archivo.

## Inventario vigente

El 30 de octubre de 2026 se aplicó el catálogo real solicitado por el propietario. Estas cantidades sustituyen el plan anterior de bebidas, snacks y café:

| Premio | Identificador | Unidades cargadas |
|---|---|---|
| Destapador Monster | `opener` | 20 |
| Galletas mini Costa | `cookies` | 20 |
| Jokey | `jokey` | 10 |
| Polera | `tshirt` | 5 |
| Agenda | `planner` | 3 |
| **Total** | | **58** |

**Carga aplicada, campaña no activada.** Las cifras son unidades disponibles al efectuar la carga; cambian al reservar o vencer cupones. Antes de reponer, consulte inventario y reservas para no sobrescribir cambios posteriores ni contar dos veces una reserva. No vuelva a ejecutar el plan inicial: sus comprobaciones de stock previo rechazan una aplicación repetida.

## Preparar la campaña

1. Ingrese en [Administración](https://pgallardob.github.io/premio/admin.html) con la contraseña nueva de publicación.
2. **Los premios:** cargue unidades reales disponibles, excluyendo reservas de cupones vigentes.
3. **La experiencia:** confirme frecuencia y vigencia; configure el código del local si lo utilizará.
4. Revise **Contacto de la promoción**, abra **Leer las bases** y **Leer la privacidad**, y marque la confirmación únicamente después de revisarlas.
5. Active **Campaña activa** y presione **Guardar la experiencia** cuando estén completos los requisitos.

La protección de una participación cada 24 horas es obligatoria y no se puede desactivar. Identifica navegadores, no personas. El contador central sigue decidiendo el orden y el premio se selecciona entre tipos con stock.

Mientras la campaña esté pausada o no haya existencias, los botones de participación permanecen deshabilitados. El contacto solicitado ya está guardado; falta la confirmación del propietario desde el panel. El teléfono no implica aprobación automática de las bases. Contacto y confirmación persisten entre reinicios; al modificar condiciones publicadas se requiere una nueva confirmación.

## Actualización del panel

El panel publicado con Neon consulta cada 15 segundos mientras está visible y al regresar a la pestaña; la alternativa local utiliza tres segundos. Las ediciones pendientes se conservan. El indicador muestra conexión y última actualización; no es necesario recargar manualmente. Cierre el panel cuando no lo utilice para reducir consumo del plan gratuito.

## Confirmar un canje

1. Solicite el código o escanee el QR del cupón con la cámara del teléfono del local.
2. Ingrese si se solicita la contraseña. Abrir el enlace no canjea nada.
3. Revise premio, código, vencimiento y estado.
4. Presione **Confirmar canje y entrega**.
5. Entregue el producto únicamente después de recibir la confirmación del servidor.

Ante una interrupción de red, use **Volver a verificar el estado** antes de entregar. Un cupón canjeado o vencido no se reactiva. **Volver** solo cierra la validación.

## Inventario y reservas

- La emisión reserva una unidad.
- El canje no descuenta otra vez.
- El vencimiento devuelve la reserva al stock disponible.
- Poner stock en cero o pausar no invalida cupones ya emitidos.

Ejemplo: diez unidades físicas con dos cupones vigentes equivalen a ocho unidades disponibles. El catálogo está en `config/prizes.json`; mantenga estables los identificadores de premios con historial. El stock inicial de nuevas instalaciones es cero.

En Neon, el inventario vigente está en PostgreSQL y se modifica desde el panel. Cambiar `initialStock` en el catálogo no sustituye el stock de una instalación existente. Mantenga los valores iniciales seguros en cero; no cambie el código para aplicar las cantidades de esta campaña.

## Colección del cliente

«Mis cupones» muestra el historial completo, incluidos canjeados y vencidos. Al abrir un enlace privado se guarda en ese navegador sin transferir el propietario ni permitir un segundo canje.

La app instalada puede tener otra sesión. En **Mis cupones → Recuperar un cupón con su enlace privado**, pegue el enlace que conservó. Los códigos públicos `OLV-…` no sustituyen ese enlace.

## Código del día

Admite entre 4 y 24 letras, números o guiones, sin distinguir mayúsculas. Expira a medianoche en `America/Santiago`; el local debe renovarlo cada día y mostrarlo junto al cartel. Se conserva como hash, no se vuelve a revelar en el panel.

## Contraseña

En Neon, use la contraseña de publicación conservada fuera del repositorio. Los cambios de credenciales requieren actualizar la configuración privada y volver a desplegar la API. Reiniciar una función no elimina sus sesiones persistidas; **Cerrar sesión** revoca el acceso de esa sesión.

Los siguientes comandos corresponden únicamente al servidor local con archivo, no modifican Neon. Con ese servidor detenido:

```sh
node scripts/setup.js --rotate-password
```

Para credenciales de publicación utilice `--file=.env.production`. El secreto del navegador se mantiene al rotar solo la contraseña. Reiniciar revoca las sesiones administrativas, no los cupones.

## Respaldo y eliminación

La publicación de Neon necesita respaldo y restauración de PostgreSQL; su programación externa continúa pendiente. Los comandos de archivos no respaldan ni borran la base de Neon.

Para la alternativa local, los procedimientos seguros se describen en [Producción](PRODUCCION.md). El servidor debe estar detenido para obtener el bloqueo exclusivo. No copie un archivo mientras haya un escritor activo.

Para una eliminación total **expresamente autorizada** en una instalación local detenida:

```sh
node --env-file-if-exists=.env scripts/reset-data.js --confirm=DELETE_ALL_RECORDS
```

Elimina participaciones, cupones, referencias, auditoría y temporales de escritura. Reinicia contador/ciclo, deja stock cero, pausa y protección de 24 horas. No conserva copia del historial borrado y no cambia credenciales ni imágenes originales. No lo ejecute con clientes reales sin autorización.

## Exportación

**Exportar registro** genera un CSV operativo sin tokens privados ni referencias de navegador. No es una copia completa para restaurar el sistema.
