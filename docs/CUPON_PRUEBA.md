# Un QR ganador privado, sin afectar la campaña

**Prueba finalizada:** el propietario confirmó el escaneo y la validación web y solicitó eliminar el ejemplo. El registro, su marcador y los archivos generados ya se eliminaron; la consulta API del cupón responde 404 y el enlace ya no valida. No existe una prueba activa ni debe recrearse como parte de una comprobación rutinaria. Los comandos siguientes documentan la capacidad para futuras solicitudes expresas.

El propietario solicitó un cupón ganador para probar el escaneo desde su teléfono y conservarlo hasta pedir su eliminación. Es un recurso privado y no comercial: **permanece activo, sin vencimiento y sin posibilidad de canje**. No habilita un modo de repeticiones ni modifica las reglas de participantes reales.

## Crear o volver a mostrar el mismo QR

Con la CLI de Neon autenticada y el directorio privado ya configurado:

```sh
node scripts/neon-tools.js test-winner-create --confirm=CREATE_TEST_WINNER
```

- Reutiliza el único cupón de prueba existente; no crea ganadores adicionales al repetir el comando.
- Usa el premio destacado del catálogo y un código claramente separado, `TST-…`.
- Guarda el enlace y su token únicamente en `test-winner.json`, dentro de `NEON_CONFIG_DIR`, fuera del repositorio.
- Genera `artifacts/test-winner-qr.png`, también excluido de Git. Este QR abre la vista del ganador en el teléfono; el QR dentro del cupón abre la validación administrativa.
- La campaña, sus participaciones, ciclo, stock, cupones comerciales y auditoría no se modifican.

La página, la colección y el PNG descargado indican que es una prueba sin validez para entrega. La administración puede consultarlo, pero no confirmarlo como canje. El servidor rechaza ese intento con `409 TEST_COUPON` y conserva el estado activo.

## Verificar sin borrar el cupón retenido

```sh
node scripts/held-winner-check.js
node scripts/neon-tools.js verify
```

La comprobación usa Chrome con tamaño de teléfono, consulta, descarga y guarda el ejemplo; valida además el rechazo del canje. **No elimina el cupón de prueba de la instalación.** Las pruebas automáticas de `tests/` sí eliminan sus propios datos aislados, nunca este registro retenido.

## Eliminar únicamente cuando lo solicite el propietario

No ejecutar este paso como limpieza automática ni al finalizar una verificación:

```sh
node scripts/neon-tools.js test-winner-delete --confirm=DELETE_TEST_WINNER
```

Comprueba el proyecto y el identificador `TST-…` del marcador privado, elimina solo ese registro de prueba y sus archivos generados conocidos. La consulta API devuelve 404, el enlace deja de validar y el ejemplo desaparece de las colecciones. No se borran cupones reales ni se cambia el contador o el inventario. Las copias que el usuario haya guardado en su teléfono no pueden retirarse remotamente, pero dejan de validarse en el servidor.

No publique el token o el QR en Git ni en documentación pública. La condición retenida es una excepción de este cupón, no una ampliación de vigencia de los premios reales.
