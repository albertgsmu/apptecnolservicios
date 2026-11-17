# Perfiles operativos

## Uso principal en celular

La aplicación se manejará principalmente desde celulares. Los cambios de interfaz de todos los perfiles deben priorizar pantallas pequeñas y uso táctil: navegación sencilla, botones fáciles de tocar, formularios legibles y contenido sin desbordamiento horizontal. Las funciones de cámara, archivos y ubicación deben funcionar desde el navegador móvil y explicar los permisos cuando sean necesarios. El acceso desde computador también debe conservarse.

Las acciones de eliminación del Gerente deben ser accesibles desde el celular, con confirmación clara antes de borrar y mensajes que indiquen si la operación se completó o falló.

El panel incorpora cabecera compacta, barra inferior con Inicio, Órdenes, Reportes y Más, y un menú con todas las secciones, creación de usuarios y cierre de sesión. En celular las tablas de personal y seguimiento se presentan como fichas; las órdenes permiten buscar por cliente, técnico o área y filtrar por estado. Los formularios usan controles táctiles y texto de entrada de 16 píxeles. La navegación y el ajuste de las ocho secciones de Gerencia se verifican en Chrome con anchos de 320, 390, 430 y 768 píxeles mediante `server/panel-browser.test.js`. Contratos y Proveedores se retiraron del panel a solicitud del usuario.

## Requisito de eliminación del Gerente

El Gerente debe poder eliminar personas (personal, candidatos y cuentas), reportes, trabajos u órdenes y los demás registros operativos de la aplicación. La interfaz debe ofrecer estas acciones al Gerente y la API debe comprobar el permiso en cada solicitud. Este requisito no concede permisos de eliminación a otros perfiles.

Implementado para órdenes: en **Órdenes**, el Gerente puede tocar **Borrar orden** al final de la ficha y confirmar o cancelar. Incluye órdenes cerradas. El borrado elimina archivos, fotos, reportes de obra y notificaciones asociados; exige la versión vigente y conserva una auditoría. Si hay herramientas o materiales pendientes, devuelve un aviso para resolverlos primero en Bodega. Los movimientos de inventario conservan su responsable, fecha y referencia textual a la orden eliminada. La API limita esta acción al Gerente y exige sesión y CSRF.

La eliminación general de personas y otros registros independientes sigue pendiente. Agregar estos permisos no elimina datos existentes durante el despliegue.

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
