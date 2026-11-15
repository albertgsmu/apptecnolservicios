# Flujo de órdenes

Ejecuta `npm run dev` y abre http://localhost:5173. Ingresa con una cuenta existente. En pruebas locales, `MANAGER_MFA_REQUIRED=false` en `.env.local` permite entrar al Gerente con contraseña. Cambia a `true` y reinicia la API para volver a exigir autenticador. Producción siempre exige MFA. Los secretos y códigos ya configurados se conservan; las sesiones de prueba dejan de ser válidas al restablecer la exigencia de MFA.

1. Pulsa **Nueva orden**. Completa cliente, área, dirección y ciudad (obligatorios), prioridad y fecha. El técnico es opcional al crear. Puedes especificar barrio, conjunto/torre, apartamento/piso/local, contacto y teléfono, horario de ingreso, referencias y condiciones de acceso, materiales, herramientas y cuidados necesarios.
2. La orden se guarda en la base configurada y aparece en **Órdenes**. Sin técnico comienza Programada, con técnico comienza Asignada; siempre con avance 0 %.
3. Selecciona un empleado activo, cambia a **En ejecución**, indica el avance y pulsa **Guardar cambios**.
4. Para finalizar selecciona **Cerrada**. El formulario propone 100 %. Pulsa **Cerrar orden**. Las órdenes cerradas quedan disponibles para consulta y no admiten cambios.
5. Abre **Dashboard**: los conteos, alertas y avance promedio se calculan con las órdenes guardadas. Recarga la página para comprobar la persistencia. En otra sesión usa **Actualizar órdenes** para consultar los cambios.

El Gerente crea, asigna, actualiza y cierra órdenes. Secretaría registra órdenes sin asignar y consulta su seguimiento. El Trabajador ve únicamente sus órdenes, reporta avances y envía a revisión; el cierre corresponde al Gerente. Los permisos también se validan en la API.

Si no aparecen técnicos, el Gerente puede ir a **Crear usuario → Trabajador → Nuevo trabajador** y registrar nombre, especialidad, cargo, turno y credenciales. Se crea la ficha Activa y su cuenta en el mismo paso, y el empleado queda disponible para asignaciones. También puede vincular una ficha existente. La aprobación de un candidato no crea automáticamente un empleado.

La API crea la tabla `work_orders` al iniciar, sin borrar datos existentes. Mantiene el acceso SQL actual, compatible con SQLite local y PostgreSQL. Los identificadores usan UUID y las actualizaciones comprueban la versión para evitar sobrescribir cambios concurrentes.

La migración `006-order-site-details` añade los datos de la obra en `site_details`, con validación compartida entre interfaz y API. Las órdenes anteriores se conservan sin inventar direcciones: muestran ubicación sin registrar. La vista del Trabajador incluye la ubicación, contacto, instrucciones y un enlace al mapa; solo puede consultar los datos de las órdenes que tiene asignadas. La dirección se envía al servicio de mapas únicamente si el usuario pulsa el enlace. El reporte CSV incluye también estos datos. La edición posterior de la ubicación no forma parte de este cambio.

Las pruebas del flujo usan una SQLite temporal. Ejecuta `npm run test:auth-flow`; también comprueban permisos, CSRF, persistencia, avance y cierre. PostgreSQL y la interacción visual en navegador requieren validación en su entorno.

Contratos, asistencia, agenda y reportes siguen siendo módulos de demostración.
