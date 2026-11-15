# Diagnóstico del panel Gerente

La API no iniciaba con la configuración real porque PostgreSQL no tenía la migración `001-auth-security`. La inspección de solo lectura encontró las tablas `users`, `employees`, `applicants` y `work_orders`, una cuenta Gerente y ninguna tabla de sesiones, recuperación o limitación de intentos.

El contexto `.neon` indica la rama `production`. No se aplicó la migración ni se cambiaron las cuentas de esa rama.

## Correcciones locales

- La API valida el esquema antes de crear tablas o cuentas y muestra un diagnóstico legible si falta la migración.
- El cliente muestra el estado de comprobación de sesión y un botón para reintentar cuando falla la conexión, con tiempo límite para las solicitudes.
- La restauración de sesión ignora respuestas antiguas que podrían sobrescribir un acceso reciente.
- Vite conserva el puerto 5173 y la API conserva su puerto configurado: no saltan silenciosamente a puertos incompatibles con el proxy y CORS.
- Las rutas asíncronas de usuarios, empleados y candidatos propagan los errores al manejador de Express.
- La migración usa `DATABASE_URL_UNPOOLED` cuando existe.

## Paso pendiente para los datos reales

1. Crear una rama de prueba desde `production` en Neon y conservar el punto de recuperación del original.
2. Ejecutar la migración existente contra la conexión directa de esa rama verificada, usando `ALLOW_AUTH_MIGRATION=non-production-branch`. No usar ese valor para la rama real de producción.
3. Verificar arranque, acceso Gerente, MFA, consultas de empleados/candidatos y creación/seguimiento/cierre de órdenes contra la rama de prueba.
4. Revisar y autorizar la aplicación de la misma migración en producción. El script actual está protegido para ejecutarse solo en desarrollo; no hay que falsear esa confirmación.
5. Ejecutar `npm run db:check`, reiniciar la API y abrir el frontend en su puerto configurado. Si 5173 está ocupado, identificar la instancia existente antes de abrir otra.

La migración añade cinco columnas de MFA y cambio de contraseña a `users`, cuatro tablas de seguridad (`auth_sessions`, `recovery_codes`, `login_attempts`, `security_events`), el registro `schema_migrations` y sus índices. No incluye DROP, DELETE ni cambios a las contraseñas existentes. Se ejecuta dentro de una transacción.

## Verificación reproducible

- `npm run build`
- `npm run lint`
- `npm run test:database`
- `npm run test:auth`
- `npm run test:auth-flow`
- `npm run test:panel` (requiere Chrome instalado; puede indicarse `CHROME_PATH`)
- `npm run db:check` (solo lectura sobre la configuración PostgreSQL actual)

La prueba de navegador usa una SQLite temporal y un perfil Chrome independiente: verifica contraseña y MFA, las siete secciones, asignación y cierre de una orden, persistencia al recargar, pantalla de error y reintento, y ausencia de desbordamiento horizontal a 390 px. La captura `.local-secrets/panel-verificado.png` contiene datos ficticios de esa prueba.

Estas pruebas confirman el funcionamiento local con SQLite; no sustituyen la validación pendiente de la migración y del flujo real sobre PostgreSQL. La navegación de contratos, asistencia, agenda y reportes se verifica, pero sus datos siguen siendo de demostración.
