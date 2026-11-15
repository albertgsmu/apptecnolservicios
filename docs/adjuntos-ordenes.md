# Fotos y videos en órdenes

Al crear una orden, Gerencia o Secretaría puede seleccionar o arrastrar archivos en **Fotos y videos del servicio**. El formulario permite previsualizarlos y quitarlos antes de guardar. La subida se realiza al pulsar **Crear orden**. Si falla, el formulario conserva los datos y la selección para reintentar.

No se fija un límite de cantidad de adjuntos por orden. La capacidad de la base y los límites técnicos de tamaño y transporte siguen aplicando:

- JPG, PNG y WEBP: hasta 10 MB por imagen.
- MP4 y WEBM: hasta 25 MB por video.

Cada archivo tiene un campo opcional **Indicaciones para el trabajador**, de hasta 2.000 caracteres. El texto se guarda en la misma fila del adjunto y aparece junto a su imagen o video en la orden del Trabajador. Quitar un archivo de la selección no desplaza las indicaciones de los demás.

Los archivos deben estar en un formato que el navegador pueda reproducir; el contenedor MP4 por sí solo no garantiza compatibilidad con todos los códecs. Para otros formatos, conviértelos antes de subirlos.

La tarjeta de la orden muestra imágenes y reproductores de video. Gerencia y Secretaría pueden consultarlos. Un Trabajador solo puede consultar los de sus órdenes asignadas. Cada solicitud de archivo verifica la sesión y, en el caso del Trabajador, vuelve a comprobar la asignación. No se crean enlaces públicos ni se exponen las rutas del disco.

## Persistencia

La migración `003-order-media` crea los metadatos y `004-database-media` añade `content` y `content_sha256`. En PostgreSQL/Neon, las imágenes y videos se guardan como `BYTEA` dentro de la misma base de datos; SQLite utiliza `BLOB`. La orden, los metadatos, el contenido binario y su hash se insertan en una transacción.

El disco solo se utiliza durante la recepción y validación del multipart. Los temporales se eliminan al terminar, incluso si la orden se rechaza. Sin `ORDER_UPLOAD_DIR` se utiliza la carpeta temporal del sistema; la variable es opcional y puede elegir otra ubicación para los temporales. Una caída abrupta puede dejar temporales pendientes de limpieza, pero las nuevas órdenes guardadas no dependen de ellos.

Al iniciar, los adjuntos del antiguo almacenamiento en disco se importan uno por uno a la base y se verifica su hash. Las copias originales se conservan. Si falta algún archivo, se reporta la cantidad; no se inventa contenido ni se borra su referencia.

Una vez importados, los adjuntos forman parte de las copias y ramas de la base. Los videos consumen almacenamiento de PostgreSQL y transferencia de Neon al reproducirse. `npm run db:storage` consulta el tamaño de la base, el límite de servidor reportado por Neon y la cantidad/tamaño binario de los adjuntos. El tamaño de esta base no equivale al uso facturado de todo el proyecto, que puede incluir otras bases, ramas e historial.

La API comprueba el formato por el contenido del archivo, además de los límites del formulario y del parser multipart. La lectura admite rangos HTTP y consulta el binario por bloques de hasta 1 MiB. Las listas solo consultan metadatos; no cargan las imágenes ni videos completos. El caché compartido está desactivado.

## Verificación

- `npm run test:access`: imágenes reales, archivos con formato falso, límites de tamaño, más de seis adjuntos con indicaciones distintas, limpieza de rechazos, acceso con sesión, acceso ajeno denegado y rangos HTTP.
- `npm run test:panel`: selecciona una imagen PNG y un video WEBM generado en Chrome, comprueba las vistas previas, crea la orden y confirma que el Trabajador puede cargar ambos desde la API después de asignarla. También verifica persistencia tras actualizar y recargar.
- `npm run test:media:postgres`: con `ALLOW_MEDIA_VERIFICATION=non-production-branch` y una rama de desarrollo verificada, comprueba binarios, hash y rangos con el driver real de PostgreSQL. Usa una tabla temporal y revierte la transacción; no crea órdenes de prueba permanentes.

Las pruebas usan una base y carpeta temporales, sin agregar órdenes ficticias a los datos del proyecto.
