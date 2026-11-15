# Bodega, herramientas y materiales

## Identificación

Cada herramienta física tiene una ficha y un código numérico único de 4 a 20 dígitos; si no se introduce, el servidor genera uno de 12 dígitos. Se conservan ceros iniciales. Los materiales tienen un código por referencia y una unidad de medida fija. El QR codifica únicamente ese identificador, sin datos de trabajadores. La etiqueta PNG descargable incluye QR, código y nombre. Puede imprimirse y adherirse al equipo. La búsqueda permite introducir el código o usar un lector que lo escriba como teclado; esta versión no integra escaneo de cámara dentro del navegador.

## Custodia de herramientas

- En bodega → Préstamo a trabajador activo y obra abierta, con devolución prevista opcional.
- Prestada → Devolución completa a bodega o devolución con daño a mantenimiento.
- En bodega → Mantenimiento; Mantenimiento → Disponible en bodega.
- Gerencia puede dar de baja una herramienta que esté en bodega o mantenimiento. El historial no se borra.

Una herramienta prestada o en mantenimiento no puede prestarse de nuevo. La devolución conserva en su movimiento el trabajador y la obra originales. La ficha muestra la custodia actual, mientras que el historial conserva todas las anteriores. Para reasignar custodia se registra primero la devolución y luego otro préstamo.

## Materiales

La existencia disponible en bodega se separa del saldo entregado en cada combinación de obra y trabajador responsable. Entrada suma a bodega; entrega resta de bodega y suma al saldo de obra; consumo resta del saldo de obra sin devolverlo a bodega; retorno de sobrantes resta del saldo de obra y suma a bodega. Los retornos también se permiten desde obras cerradas y responsables que ya no estén activos, para poder conciliar lo entregado. Los sobrantes solo se ofrecen a otra obra después de su devolución física registrada.

Las cantidades admiten tres decimales y se guardan como enteros de milésimas, sin errores acumulados de coma flotante. No se suman unidades incompatibles en los indicadores. Los mínimos generan una señal de reposición por referencia. El Gerente puede hacer ajustes positivos o negativos, siempre con motivo; no se sobrescribe una cantidad sin movimiento.

## Control

Gerente y Supervisor operan el inventario; Secretaría tiene lectura; Trabajador no consulta toda la bodega. Gerencia puede corregir nombre, marca, serie, notas y mínimo, manteniendo código y unidad inmutables. La ficha anterior y la nueva se conservan en el historial.

Todas las escrituras tienen autorización y CSRF. Los movimientos comprueban versión y existencias, se ejecutan en transacción y usan una clave de idempotencia para no duplicar reintentos de red. Dos préstamos simultáneos de la misma herramienta no pueden completarse. No hay borrado de movimientos por API.

Migración aditiva: `010-inventory`. Tablas: `inventory_items`, `inventory_allocations`, `inventory_movements`. Historial visible: últimos 200 movimientos por elemento; el historial completo permanece en la base. El panel actualiza cada 30 segundos y al recuperar foco. Se trabaja con una bodega lógica; todavía no hay compras, valoración contable, múltiples almacenes, firma de recepción ni solicitudes de material integradas a un movimiento automático.

Pruebas: `npm run test:access` cubre códigos únicos, permisos, préstamo simultáneo, reintentos, daño, devolución, cantidades fraccionadas, insuficiencia de saldo y ajustes. `npm run test:panel` verifica registro, QR, préstamo y devolución en Chrome, además de diseño móvil. Las pruebas usan datos temporales, sin insertar inventario ficticio en Neon.
