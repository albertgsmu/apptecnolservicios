# Jornada, reportes y ubicación del trabajador

## Acceso obligatorio con ubicación

El aviso de acceso aparece una sola vez por día de Colombia, después de registrar correctamente la primera ubicación. La comprobación se hace en el servidor por cuenta y fecha, no en almacenamiento del navegador. Los siguientes inicios de sesión del día obtienen otra lectura automáticamente antes de habilitar el acceso. Si falla, se muestra el error y el panel sigue bloqueado. Las fotos actualizan su lista y contador sin mensaje de éxito; los errores y la información permanente de ubicación siguen visibles.

Para Trabajador, la contraseña crea una sesión pendiente, sin acceso al panel ni a sus API de trabajo. La pantalla informa que el Gerente consultará la ubicación y exige una lectura puntual válida. Si el permiso se rechaza, vence o no hay GPS disponible, puede reintentarse o cancelar; no se completa el acceso. No es necesario estar dentro del radio de una obra para entrar.

`POST /api/auth/worker-location` valida coordenadas, hora y CSRF; guarda la lectura y su comparación, consume la sesión pendiente y emite una sesión nueva en una sola transacción. La API comprueba que las sesiones de Trabajador tengan un registro de inicio con ubicación. Recargar una sesión completada no solicita otra lectura. Las fotos siguen requiriendo su propia ubicación actual. Esta regla sustituye las notas anteriores que permitían entrar sin coordenadas. No hay captura oculta ni seguimiento continuo.

## Llegada automática por radio de obra

En Órdenes, el Gerente abre **Configurar llegada automática** e introduce latitud, longitud y radio de 25 a 2.000 m. Puede usar su ubicación si está físicamente en la obra. La dirección no se geocodifica. El radio se puede editar o desactivar en órdenes abiertas; se comprueba la versión de la orden y se registra el cambio en auditoría. Otros perfiles no pueden modificarlo.

Al iniciar sesión se evalúan las obras abiertas asignadas. Cada foto y llegada manual evalúa solo la obra seleccionada. El servidor calcula la distancia geográfica y considera la precisión del GPS: dentro si distancia + precisión está dentro del radio; fuera si distancia − precisión supera el radio; en otro caso, precisión insuficiente. Sin radio o sin permiso se indica expresamente que no hay comparación válida. No se elige una obra de forma arbitraria si hay varias.

Los resultados se conservan junto con cada evento mediante `009-location-assessments`: cambiar las coordenadas no reescribe el historial y las lecturas anteriores a esta función quedan sin comparación. La llegada detectada es evidencia puntual basada en el dispositivo; no confirma identidad, permanencia ni horas trabajadas. No existe captura continua al desplazarse hacia una obra: se evalúa una nueva lectura al iniciar sesión, registrar llegada o enviar foto. Esta sección sustituye las limitaciones de comparación descritas en las notas de versiones anteriores más abajo.

El Trabajador dispone de **Mi jornada**, **Órdenes** y **Reportes de obra**. Solo puede enviar reportes o registrar una llegada sobre una orden abierta que tenga asignada y con una ficha de empleado Activa. Puede seguir consultando su historial de reportes.

## Reportes de obra

El formulario registra obra, tipo (Avance, Necesidad, Problema o Seguridad), prioridad (Normal, Alta o Crítica), título, descripción y apoyo solicitado. Los campos de texto tienen límites de tamaño validados por el servidor. El reporte se guarda en Neon y el Gerente lo consulta en **Reportes de obra**. Su resumen también incluye el número de reportes sin resolver y los críticos.

El Gerente puede responder y marcar el seguimiento como Pendiente, En atención o Resuelto. La respuesta se muestra al trabajador. Las actualizaciones comprueban la versión para evitar sobrescribir otra respuesta. La creación y la revisión se registran en auditoría. Enviar un reporte no cambia el progreso ni cierra la orden.

Los listados muestran los últimos 100 registros del usuario o, en Gerencia, del equipo. Los totales incluyen el historial completo. Se actualizan cada 30 segundos con la ventana visible, al regresar a ella y con el botón de actualización. No son una notificación inmediata de emergencia; ante peligro el trabajador debe detener la tarea y contactar directamente al responsable.

## Ubicación

Después de un acceso nuevo del Trabajador, la pantalla explica la captura y solicita una lectura puntual mediante el permiso de geolocalización del navegador. Restaurar una sesión al recargar no dispara otra lectura. Cambiar de pestaña, consultar reportes y la actualización periódica tampoco capturan ubicación. No se realiza seguimiento continuo.

Se guardan dos tipos distintos:

- **Inicio de sesión:** lectura relacionada con esa sesión, sin obra asociada. No demuestra que la persona llegó al trabajo. Se conserva un registro por sesión. Si inicialmente se negó o falló la ubicación, puede reintentarse; una lectura capturada no se sustituye por posteriores reintentos.
- **Llegada declarada:** el trabajador selecciona una orden abierta y pulsa Registrar llegada a la obra. Se solicita otra lectura y queda asociada a esa orden.

Las coordenadas, precisión aproximada, hora del dispositivo y hora de recepción del servidor se guardan en Neon. Las horas se muestran en America/Bogota. La API comprueba coordenadas, precisión y antigüedad de la lectura; son datos suministrados por el dispositivo, no una prueba infalible de presencia. No se calcula distancia ni se asegura que coincidan con la dirección de la obra.

Si el permiso se rechaza, la ubicación no está disponible o vence el tiempo de espera, se conserva el estado sin coordenadas y se comunica expresamente que no confirma ubicación. No se bloquea el acceso ni el envío de reportes por negar ese permiso. Fuera de localhost el navegador requiere HTTPS.

Solo Gerencia y el propio Trabajador pueden consultar los registros. Secretaría y otros trabajadores reciben acceso denegado o listas propias vacías. El identificador privado de sesión usado para evitar duplicados no se devuelve en la API. El mapa externo solo se abre si el usuario pulsa el enlace.

Esta versión conserva el historial en la base; todavía no incluye una política automática de eliminación o un cálculo de horas de asistencia. Los registros de ubicación no se presentan como porcentaje de asistencia.

## Código y pruebas

## Evidencias diarias

Se exigen al menos tres fotos distintas por día de Colombia para cada trabajador activo con una orden abierta asignada. El panel muestra el cumplimiento y las fotos que faltan; Gerencia consulta los mismos contadores. Esta obligación no bloquea el inicio de sesión ni impide enviar un reporte de problemas. Se pueden enviar más de tres fotos.

Cada envío obtiene una lectura nueva de ubicación automáticamente. Sin ubicación válida no se acepta la foto. El archivo y las coordenadas se guardan juntos en `worker_photos`, con hora del servidor, fecha de Colombia, precisión, orden y descripción. No se acepta usar una ubicación anterior a cinco minutos ni duplicar el mismo archivo para aumentar el contador del día. El servidor valida la firma de JPG, PNG o WEBP y el máximo de 10 MB por archivo. El contenido binario se conserva en Neon; solo Gerencia y el autor pueden descargarlo. La migración aditiva es `008-worker-photos`.

El inicio de sesión captura automáticamente sin pedir un envío manual. El permiso del navegador sigue siendo obligatorio y no puede omitirse desde la aplicación. La ubicación de cada foto corresponde al momento del envío; una imagen de galería no acredita por sí sola el lugar ni la hora de su toma. No hay comparación automática con las coordenadas de una obra ni seguimiento continuo. El contador actual muestra el día en curso; no constituye un calendario de asistencia ni contempla aún días laborales, vacaciones o un cierre de jornada bloqueado por faltantes.

- `server/migrations/field-work.js`: migración aditiva `007-field-work`.
- `server/field-work.js`: acceso, validación, reportes, llegadas y seguimiento.
- `src/hooks/useFieldWork.ts`: consulta por sesión y actualización periódica.
- `src/features/field-work/FieldWorkPanel.tsx`: pantalla del trabajador y revisión de Gerencia.
- `npm run test:access`: pertenencia de órdenes, CSRF, coordenadas inválidas, duplicados de sesión, respuesta de Gerencia y privacidad entre trabajadores.
- `npm run test:panel`: Chrome con GPS simulado, llegada, reporte, respuesta y permiso rechazado. Los datos se guardan exclusivamente en una base temporal durante estas pruebas.
