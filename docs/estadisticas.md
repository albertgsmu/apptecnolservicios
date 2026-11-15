# Estadísticas para Gerencia

Los indicadores del resumen provienen de `/api/dashboard/overview`, autorizado para Gerente y Secretaría. Una única consulta SQL calcula todos los totales con la misma instantánea, sin cargar el contenido binario de los adjuntos. El personal se incluye únicamente en la respuesta del Gerente; el Trabajador no puede consultar este endpoint.

| Indicador | Origen y definición |
| --- | --- |
| Órdenes abiertas | `work_orders`: estado diferente de Cerrada. |
| Órdenes cerradas | `work_orders`: estado Cerrada. |
| Pendientes de revisión | `work_orders`: estado Revisión. |
| Sin técnico | Órdenes abiertas con `assigned_to` nulo. |
| Avance del trabajo abierto | Promedio de `progress` solo de órdenes abiertas. Sin órdenes abiertas se muestra —, no 0 %. No mide productividad ni cumplimiento. |
| Fecha prevista vencida | Orden abierta con fecha registrada anterior a hoy, según America/Bogota. No representa incumplimiento contractual. |
| Críticas abiertas | Órdenes abiertas cuya prioridad es Crítica. |
| Empleados activos | `employees`: fichas con estado Activo. No equivale a cuentas de usuario. |
| Vacaciones y licencias | Estado actual de las fichas de empleados. No es un conteo de solicitudes ni días. |
| Candidatos | `applicants`: total y conteos por Pendiente, Aprobado y Rechazado. Aprobar no crea un empleado. |
| Fotos y videos guardados | `order_attachments`: filas con contenido binario en la base. El espacio mostrado es la suma de `size_bytes`, no la capacidad total del plan. |
| Porcentaje de cierre | Cerradas / total de órdenes registradas. Sin registros no se calcula. No se presenta como asistencia ni productividad. |

El alcance es todo lo registrado, sin filtro de fechas. No se presentan variaciones porcentuales respecto a períodos anteriores: aún no existe ese análisis histórico.

El resumen, las órdenes y los candidatos se consultan cada 30 segundos mientras la ventana está visible y al regresar a ella. El personal usa API y eventos Socket.IO; **Actualizar datos** vuelve a consultar resumen, órdenes y personal. Los cambios locales en órdenes, empleados o decisiones de candidatos disparan otra consulta del resumen. La hora mostrada es la última consulta, en Colombia; no se denomina actualización instantánea.

Un error de consulta no se convierte en cero. El resumen conserva su último resultado con una advertencia; si no existe una consulta válida muestra estado no disponible. El personal también informa los fallos. Los conteos del personal incluyen todas las fichas; sus filtros aplican únicamente a la tabla.

## Secciones aclaradas

- Trabajadores: conteos de estados, distribución real por área y carga de órdenes por empleado. Se retiraron score/rankings de rendimiento y porcentajes de crecimiento sin respaldo.
- Personal: conteos reales de candidatos. Asistencia aparece no disponible porque no se registran marcaciones.
- Secretaría: agenda de fechas previstas de órdenes abiertas; no se inventan reuniones. Los documentos se consultan en cada orden.
- Contratos/proveedores: se identifican como pendientes de conectar. Se retiraron importes, vencimientos y calificaciones ficticias.
- Reportes: CSV de órdenes y resumen operativo, generados con una consulta nueva al descargarlos. No se ofrecen PDF, Excel, reportes financieros o de asistencia ficticios. Las celdas de texto se protegen contra fórmulas de hoja de cálculo.

## Verificación

`npm run test:access` verifica el resumen vacío, conteos mixtos, avance abierto, revisión, fechas pasadas/futuras, personal en vacaciones, candidatos, adjuntos y separación por roles. `npm run test:panel` verifica la actualización tras cerrar una orden, la conservación de datos ante un error y la descarga real del CSV en Chrome. `npm run db:overview` ejecuta la misma consulta de negocio en PostgreSQL en una transacción de solo lectura, sin exponer datos personales.
