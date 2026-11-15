# Trabajo asignado y respuestas

## Solicitud de material dentro de Reportes

El formulario existente ofrece **Solicitud de material** como tipo de reporte. Se pueden registrar entre 1 y 20 materiales, indicando nombre y especificaciones, cantidad positiva con hasta tres decimales y unidad de medida. La descripción indica el motivo o trabajo que requiere el material; se conserva la prioridad y el seguimiento habitual.

La solicitud usa automáticamente la obra asignada y se muestra completa a Secretaría, Supervisor y Gerencia. Las respuestas generan las mismas notificaciones que otros reportes. No crea movimientos, no reserva stock ni descuenta cantidades: una entrega física se registra por separado en Bodega e inventario. Los reportes anteriores conservan su información y tienen una lista vacía de materiales estructurados. Migración aditiva: `012-material-requests`.

La primera sección de Mi jornada muestra el destino, dirección, unidad, contacto, horario, condiciones de acceso, preparación, instrucciones y adjuntos de la orden actual. Después aparecen mensajes y soluciones y el formulario de reporte, con botón **Enviar**. El trabajador no elige una obra para reportar ni para subir fotos.

La orden actual se resuelve en el servidor: solo las asignadas al empleado activo, sin cerrar; primero En ejecución, luego Asignada y los demás estados, por fecha prevista y fecha de creación. Si hay varias, la pantalla explica la prioridad y conserva la consulta de otras asignaciones en Órdenes. El cliente envía el identificador visible para detectar cambios de asignación; si ya no corresponde, la API rechaza el envío con 409 en lugar de guardarlo en otra obra. La misma regla aplica a fotos.

No se muestran controles de llegada ni historial de coordenadas al trabajador. La API devuelve ubicaciones de jornada y metadatos GPS de fotos solo al Gerente. Se conservan el aviso diario del acceso y la información de ubicación en el envío de fotos; la captura no es oculta ni continua.

Cada respuesta o cambio de seguimiento confirmado genera una notificación persistente para el autor del reporte, con texto, estado, nombre y perfil del responsable. Se muestra el aviso de respuestas sin leer desde cualquier vista del trabajador. En Mi jornada y Reportes de obra puede consultar el historial y marcar una o todas como leídas. Las notificaciones están limitadas por usuario; no se marcan como leídas al abrir automáticamente la pantalla.

Socket.IO avisa a la sesión del trabajador después del commit, y el cliente vuelve a consultar los datos. La actualización periódica y al recuperar foco sirve de respaldo. Los avisos son internos de la app: no se envían mensajes externos ni notificaciones push con el navegador cerrado.

Migración aditiva: `011-report-notifications`, tabla `worker_report_notifications`. La lista muestra las 100 notificaciones más recientes y el contador incluye todas las no leídas. Cambios de asignación no transfieren reportes ni mensajes a otro trabajador.
