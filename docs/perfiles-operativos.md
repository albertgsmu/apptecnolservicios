# Perfiles operativos

El sistema admite cuatro perfiles. Solo el Gerente crea cuentas. Los permisos se aplican en la API además de la interfaz, en `shared/access-policy.js`.

| Perfil | Operación disponible |
| --- | --- |
| Gerente | Administrar cuentas, personal y candidatos; crear, asignar y cerrar órdenes; configurar radios de llegada; revisar reportes, ubicaciones y evidencias. |
| Secretaría | Crear órdenes sin asignar; consultar operación; registrar candidatos; responder y dar seguimiento a problemas y necesidades. |
| Supervisor | Crear órdenes; consultar trabajadores disponibles para asignaciones; asignar y reasignar trabajos; actualizar avance hasta 99 % y enviar a revisión; añadir instrucciones, fotos y videos a órdenes abiertas; atender reportes. |
| Trabajador | Consultar y actualizar sus órdenes; enviar reportes y evidencias diarias con ubicación; sin asignaciones ni cierre final. |

El cierre final y el progreso de 100 % son exclusivos del Gerente, incluso si otro perfil llama directamente a la API. El Supervisor no administra cuentas, personal, candidatos ni radios de llegada. Las coordenadas de jornada y fotos diarias se devuelven al Gerente y al trabajador autor; Secretaría y Supervisor reciben los reportes sin esos datos.

Los cambios de instrucciones y nuevas evidencias conservan los adjuntos anteriores, comprueban la versión de la orden y generan un evento de auditoría. Las órdenes cerradas no aceptan modificaciones de campo.

El inventario está disponible en **Bodega e inventario**: Gerente y Supervisor registran y mueven herramientas y materiales; Secretaría consulta sin modificar. Gerencia corrige las fichas, realiza ajustes de cantidades y da de baja herramientas. Cada operación conserva su responsable e historial.
