# Perfiles operativos

## Uso principal en celular

La aplicación se manejará principalmente desde celulares. Los cambios de interfaz de todos los perfiles deben priorizar pantallas pequeñas y uso táctil: navegación sencilla, botones fáciles de tocar, formularios legibles y contenido sin desbordamiento horizontal. Las funciones de cámara, archivos y ubicación deben funcionar desde el navegador móvil y explicar los permisos cuando sean necesarios. El acceso desde computador también debe conservarse.

Las acciones de eliminación del Gerente deben ser accesibles desde el celular, con confirmación clara antes de borrar y mensajes que indiquen si la operación se completó o falló.

El panel incorpora cabecera compacta, barra inferior con Inicio, Órdenes, Reportes y Más, y un menú con todas las secciones, creación de usuarios y cierre de sesión. En celular las tablas de personal y seguimiento se presentan como fichas; las órdenes permiten buscar por cliente, técnico o área y filtrar por estado. Los formularios usan controles táctiles y texto de entrada de 16 píxeles. La navegación y el ajuste de las nueve secciones de Gerencia se verifican en Chrome con anchos de 320, 390, 430 y 768 píxeles mediante `server/panel-browser.test.js`.

## Requisito de eliminación del Gerente

El Gerente debe poder eliminar personas (personal, candidatos y cuentas), reportes, trabajos u órdenes y los demás registros operativos de la aplicación. La interfaz debe ofrecer estas acciones al Gerente y la API debe comprobar el permiso en cada solicitud. Este requisito no concede permisos de eliminación a otros perfiles.

Estado: pendiente de implementación. Las rutas actuales no ofrecen la eliminación general de estos registros. Registrar este requisito no elimina datos existentes.

## Permisos implementados

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
