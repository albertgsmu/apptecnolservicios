# Perfiles de acceso

Solo el Gerente crea cuentas. El formulario muestra los permisos del perfil, valida correo y contraseña, exige confirmarla y vincula al Trabajador con una ficha de empleado activo. No permite crear otro Gerente ni elegir permisos adicionales por medio del navegador.

| Perfil | Acceso y responsabilidades |
| --- | --- |
| Gerente | Todas las secciones existentes, creación de cuentas, asignación y cierre de órdenes, decisiones sobre candidatos y estado del personal. |
| Secretaría | Resumen operativo, agenda, registro y consulta de candidatos y creación de órdenes sin asignar. No aprueba candidatos ni modifica órdenes existentes. |
| Trabajador | Únicamente sus órdenes asignadas. Reporta avance hasta 99 % y envía a revisión. El Gerente realiza la asignación y el cierre. |

Hay tres perfiles activos: Gerente, Secretaría y Trabajador. El formulario del Gerente crea únicamente Secretaría o Trabajador; no crea otro Gerente. Los antiguos perfiles Supervisor, RRHH y Administración no pueden crearse ni iniciar sesión. Las cuentas que los tuvieran se conservan sin reasignar privilegios automáticamente.

Contratos y asistencia se identifican como no disponibles hasta conectar sus registros. La agenda se deriva de órdenes abiertas y los reportes CSV consultan datos reales. La creación de Trabajador puede registrar una ficha nueva; todavía no se implementan baja de cuentas o edición de roles.

## Organización del código

- `shared/access-policy.js` y su declaración TypeScript: permisos compartidos por API e interfaz.
- `src/constants/roles.ts`: nombres, navegación y explicaciones para cada perfil.
- `src/components/CreateUserDialog.tsx`: formulario y confirmación visual.
- `server/users.js`: endpoints de creación y consulta de empleados vinculables.
- `server/services/accounts.js`: validación, normalización, contraseña y transacción de creación; independiente de Express.
- `server/orders.js`: alcance de consulta y validación de operaciones sobre órdenes.
- `server/migrations/user-access.js`: vínculo único entre usuario y empleado, registrado como `002-user-employee-access` al arrancar. No modifica cuentas existentes.

La creación de cuenta, el vínculo y el evento de auditoría se guardan en una transacción. La base protege la unicidad del correo y del empleado vinculado. Las contraseñas se guardan con hash y no se devuelven en la API. El cliente no decide sus permisos; el servidor resuelve el rol de la sesión.

Las consultas de órdenes del Trabajador filtran en SQL por su empleado vinculado. La API comprueba también la pertenencia antes de modificar una orden y utiliza su versión para evitar sobrescribir cambios concurrentes.

Para crear un Trabajador, el Gerente puede elegir **Nuevo trabajador** y completar área/especialidad, cargo y turno, o **Vincular ficha existente** y seleccionar una ficha activa sin cuenta. En el primer caso la ficha Activa, la cuenta, el vínculo y el evento de auditoría se guardan en una sola transacción. Los errores no dejan fichas huérfanas. La cuenta de acceso y el expediente laboral siguen siendo entidades diferentes. No se agregan empleados o usuarios de demostración a la base del proyecto.

## Verificación

`npm run test:access` comprueba creación, contraseñas, duplicados, vínculo, auditoría y permisos de los tres perfiles activos, y rechaza la creación de perfiles retirados. `npm run test:panel` verifica el formulario en Chrome, confirmación de contraseña, vista móvil y navegación limitada de Secretaría y Trabajador, además del flujo del Gerente. Las pruebas crean sus registros en una SQLite temporal.

Antes de ampliar módulos, agrega cada nueva operación al contrato de permisos, valídala en el servidor y prueba al menos un permiso admitido y uno rechazado. Las pruebas locales no equivalen a una certificación de seguridad ni de capacidad para miles de usuarios.
