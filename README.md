# Panel administrativo JP Mantenimiento

Aplicación web de administración operativa para una empresa de mantenimiento, construida con React + TypeScript + Vite y una base para backend profesional con Prisma + PostgreSQL.

## Objetivo

Para publicarla y ensayarla desde teléfonos sin mantener encendido el computador, consulta la [guía de publicación en Render](docs/publicacion-render.md). El repositorio incluye un Blueprint para servir web y API bajo una misma dirección HTTPS conectada a Neon.

La versión actual incluye cuatro perfiles (Gerente, Secretaría, Supervisor y Trabajador), órdenes con instrucciones y archivos, jornada del trabajador, reportes con solicitudes de materiales, respuestas con notificaciones e inventario con QR, préstamos, devoluciones y consumo por obra.

La API operativa usa `pg` para Neon PostgreSQL y migraciones en `server/migrations/`. La configuración de Prisma se conserva para tareas existentes; no sustituye las migraciones de seguridad de la API. Consulta [perfiles](docs/perfiles-operativos.md), [panel del trabajador](docs/panel-trabajador.md) e [inventario](docs/inventario.md).

Los datos locales, archivos subidos y secretos no forman parte del código publicado. Configura `.env.local` a partir de `.env.example`; la base local se genera en `server/data/` cuando se usa SQLite.

Proveer un sistema administrativo real con:

- sesiones seguras con cookies HttpOnly y acceso de Gerente con correo y contraseña
- modelo de negocio por entidades
- persistencia real en PostgreSQL
- sincronización en tiempo real con Socket.IO
- rutas por roles y permisos
- estructura modular y mantenible

## Stack actual

- React 19
- TypeScript
- Vite
- Express
- sesiones opacas con cookies seguras y TOTP
- SQLite para prototipo local
- Prisma + PostgreSQL para la versión real
- CSS modular con componentes reutilizables
- Oxlint

## Estructura principal

```text
src/
  components/        UI reusable components
  constants/         mapped display values and domain constants
  data/              mock data and static configuration
  features/          sections by business domain
  hooks/             auth and stateful business logic
  lib/               persistence/data access layer
  types/             shared interfaces and domain types
  utils/             validation and reusable pure helpers
  App.tsx            orchestrator and core view state
server/
  server.js          API REST local actual
  prisma-client.js   wrapper de Prisma para la capa real
prisma/
  schema.prisma      esquema real del negocio con PostgreSQL
.env.example        variables de entorno para PostgreSQL
```

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:push
npm run db:studio
```

## Acceso local

- Frontend: http://localhost:5173/
- API: http://localhost:3003/api/health

La API usa `DATABASE_URL` para PostgreSQL. Si está configurado pero la conexión falla, el servidor no cambia silenciosamente a otra base. SQLite se usa solo cuando `DATABASE_URL` no está configurado.

## Cuentas de acceso

Las cuentas nuevas se crean desde **Crear usuario** en el panel, disponible para un Gerente autenticado. Las contraseñas se guardan con hash; el registro público no permite asignar roles ni crear cuentas.

En **Trabajadores → Cuentas → Gestionar**, Gerencia puede editar nombre y correo, y el área, cargo y turno de trabajadores vinculados. Las fichas sin usuario aparecen debajo y también se pueden editar.

- **Bloquear acceso** impide nuevos ingresos y cierra las sesiones abiertas. **Habilitar acceso** revierte el bloqueo.
- **Cerrar todas las sesiones** obliga a ingresar de nuevo, conservando la contraseña.
- **Restablecer contraseña** genera una clave temporal que se muestra una sola vez; exige cambiarla al ingresar. El trabajador debe registrar su ubicación después del cambio.
- **Dar de baja** bloquea el acceso y desactiva la ficha, conservando órdenes, reportes y conversaciones. **Reactivar cuenta** habilita la cuenta y la ficha.

Estas acciones requieren confirmación y permisos de Gerente. La cuenta de Gerencia está protegida contra estas operaciones. Las modificaciones usan versiones para rechazar datos antiguos; los bloqueos y cambios de contraseña invalidan sesiones en el servidor y avisan a los navegadores conectados. La migración `015-account-management` agrega los campos de control sin borrar registros y bloquea las cuentas vinculadas a fichas previamente inactivas.

## Seguimiento de reportes y notificaciones al celular

Los reportes nuevos se asignan a una cuenta activa de Secretaría; si no hay, se usa Supervisor y después Gerente. Los plazos iniciales son 30 minutos para prioridad Crítica, 4 horas para Alta y 24 horas para Normal. En la conversación de cada obra, Secretaría, Supervisor y Gerente pueden seleccionar otro responsable y una fecha/hora futura de hasta 90 días. Las reasignaciones se registran y rechazan cambios basados en versiones antiguas.

Si el plazo vence sin resolver, se avisa al responsable y a Gerencia: cada 30 minutos para Crítica, 60 para Alta y 4 horas para Normal. Si una cuenta responsable se bloquea o da de baja, la revisión busca otra cuenta activa. Resolver el reporte detiene los recordatorios. Los reportes abiertos anteriores reciben responsable y plazo inicial desde la instalación de la migración `016-report-followups-push`; el historial de obras y respuestas se conserva.

En **Notificaciones del celular → Activar notificaciones**, cada persona autoriza su dispositivo. **Enviar prueba** permite comprobar la recepción. En iPhone/iPad, agregar primero la app a la pantalla de inicio y abrirla desde allí (iOS/iPadOS 16.4 o posterior). Android requiere navegador compatible y permiso de notificaciones. Documentación: [Web Push en Apple](https://webkit.org/blog/13878/), [suscripciones del navegador](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).

Los avisos incluyen nuevos reportes, asignaciones, vencimientos y respuestas al trabajador. Los detalles privados no aparecen en la pantalla de bloqueo. Las claves VAPID se generan y persisten en la base; la clave privada y las credenciales de suscripción se cifran con `MFA_ENCRYPTION_KEY`. Conservar esa clave en Render. Al cerrar sesión se desvincula este dispositivo; bloquear una cuenta o cambiar su versión invalida sus suscripciones hasta activarlas de nuevo. No se almacenan páginas autenticadas ni respuestas de API en caché.

La cola de envío queda en PostgreSQL, con reintentos limitados y limpieza de suscripciones vencidas. La entrega depende del permiso, conexión y servicio del navegador; poner una prueba en envío no confirma que el usuario la haya recibido.

En producción hay una revisión por minuto mientras el proceso está activo. El workflow `.github/workflows/report-reminders.yml` ejecuta además una revisión aproximadamente cada 5 minutos y permite ejecución manual, para no depender de que Render mantenga el proceso despierto. Verifica identidad GitHub OIDC, identificador del repositorio, archivo de workflow y rama main; no usa un secreto compartido. GitHub puede retrasar o suspender ejecuciones programadas; los avisos no son una garantía de atención inmediata. En desarrollo y pruebas no se envían notificaciones automáticamente, salvo `PUSH_DELIVERY_ENABLED=true`.

Validación: `npm run test:followups`, `npm run test:panel` y `node scripts/verify-report-followups.mjs`. El último comando prueba la migración en un esquema PostgreSQL temporal, dentro de una transacción que se revierte.

## Seguridad de acceso

- El servidor resuelve el rol desde la cuenta y comprueba los permisos en cada endpoint. No se confía en un rol enviado por el navegador.
- La cuenta Gerente ingresa con correo y contraseña, sin QR ni código de autenticador. TOTP solo se exige si se configura `MANAGER_MFA_REQUIRED=true`; en ese caso, su secreto se cifra con AES-256-GCM y los códigos de recuperación se guardan como hashes de un solo uso.
- Las contraseñas temporales fuerzan cambio antes de continuar. El autenticador de Gerente solo se exige cuando `MANAGER_MFA_REQUIRED=true`.
- Las sesiones son tokens aleatorios opacos; la base guarda solo su hash. El navegador recibe una cookie `HttpOnly`, `Secure` en producción, y las mutaciones requieren CSRF.
- Los errores de login no revelan si el correo existe. Los intentos se limitan por IP seudonimizada y se guardan en la base compartida: pausa progresiva hasta 30 segundos y bloqueo de 15 minutos tras 10 fallos. Socket.IO también valida la sesión vigente.
- `MFA_ENCRYPTION_KEY` es obligatoria: una clave aleatoria de exactamente 32 bytes, codificada en base64. Genérala localmente con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` y guárdala en `.env.local` o en el gestor de secretos del hosting. No la publiques ni la subas al repositorio. Respáldala de forma segura: si se pierde o se rota, los secretos TOTP existentes no se pueden descifrar.
- `ALLOWED_ORIGINS` debe listar dominios completos y exactos separados por coma. No se admiten comodines.
- En producción las cookies usan `SameSite=None; Secure` para llamadas entre frontend y API. Algunos navegadores bloquean cookies de terceros; para producción, publica frontend y API bajo el mismo dominio de sitio (por ejemplo, con subdominios y un dominio propio).
- `TRUST_PROXY_HOPS` debe coincidir con la cantidad de proxies inversos confiables delante de la API. El valor predeterminado es `0`; Render y App Service se configuran con `1`. No confíes en encabezados de proxy enviados directamente por clientes.

### Preparar una cuenta Gerente existente

Las migraciones PostgreSQL deben probarse primero en una rama de desarrollo de Neon; el script rechaza por defecto su ejecución sin confirmación explícita de esa rama.

```bash
npm run db:migrate:auth:postgres
npm run auth:bootstrap:postgres
```

Configura `DATABASE_URL` para la rama no productiva y `ALLOW_AUTH_MIGRATION=non-production-branch` antes de correr esos comandos. La credencial temporal se escribe solo en `.local-secrets/manager-bootstrap.txt`, que está excluido de Git. No la compartas ni la guardes en el chat. Al ingresar, cámbiala por una frase nueva y configura el autenticador; guarda los códigos de recuperación fuera de este equipo.

Para SQLite local, usa los equivalentes `npm run db:migrate:auth:sqlite` y `npm run auth:bootstrap:sqlite`.

Para una instalación vacía, configura antes del primer inicio:

```bash
INITIAL_ADMIN_NAME=Nombre del gerente
INITIAL_ADMIN_EMAIL=gerente@tuempresa.com
INITIAL_ADMIN_PASSWORD=una-contraseña-segura
MFA_ENCRYPTION_KEY=clave-base64-aleatoria-de-32-bytes
```

El backend crea esa cuenta Gerente solo si la tabla de usuarios está vacía. No se generan empleados, candidatos ni otras cuentas de demostración automáticamente. Para la primera configuración, usa una contraseña inicial fuerte y completa el enrolamiento TOTP.

## Estado actual

La solución ya incluye:

- frontend profesional modular
- sesiones opacas con cookies HttpOnly, protección CSRF y TOTP opcional para Gerente
- API con PostgreSQL y SQLite local explícita
- creación de cuentas internas desde el panel del Gerente
- esquema de dominio Prisma preparado; la API actual usa consultas SQL directas
- base sólida para crecimiento hacia sistema en tiempo real

## Estrategia de base de datos profesional

La aplicación ya tiene la base correcta para pasar de prototipo a sistema real:

1. PostgreSQL como motor principal para producción y entorno profesional.
2. Prisma define el esquema del dominio, pero aún no es la capa de acceso de la API.
3. `npm run db:seed` inicializa permisos; no agrega personas ni cuentas de muestra.
4. Separación clara entre frontend, backend y persistencia para que cada módulo crezca sin acoplarse.
5. Socket.IO sincroniza cambios de empleados entre clientes.

Comandos recomendados:

```bash
cp .env.example .env
# ajustar DATABASE_URL, MFA_ENCRYPTION_KEY y VITE_API_URL
npm run db:generate
npm run db:seed
npm run dev
```

La API usa SQL directo y migraciones versionadas; `db:push` no es el mecanismo para actualizar su esquema de producción.

Los módulos de órdenes, contratos, asistencia, agenda y reportes todavía muestran datos de demostración; deben conectarse a la API antes de usarlos como información operativa.

## Deploy en Render (backend)

Para desplegar la API en Render, usa esta configuración recomendada:

- Tipo de servicio: Web Service
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Variables de entorno requeridas en Render:

```bash
NODE_ENV=production
PORT=10000
MFA_ENCRYPTION_KEY=clave-base64-aleatoria-de-32-bytes
ALLOWED_ORIGINS=https://tu-app.vercel.app
DATABASE_URL=postgresql://... (la URL de Neon)
DATABASE_URL_UNPOOLED=postgresql://... (la URL sin pool, opcional para tareas administrativas)
```

Importante:
- Render asigna un puerto dinámico en producción, pero la app ya usa `process.env.PORT`, por lo que es compatible.
- Define `ALLOWED_ORIGINS` con el dominio exacto de producción; no incluyas localhost ni comodines.
- Render genera `MFA_ENCRYPTION_KEY`; guarda una copia protegida antes de eliminar o recrear el servicio.

## Deploy en Vercel

Si el frontend ya está en Vercel, la app debe apuntar al backend con una variable de entorno real:

```bash
VITE_API_URL=https://tu-backend-url.com
```

También puedes dejar el comportamiento local igual si la variable no existe:

```bash
VITE_API_URL=http://localhost:3003
```

No uses rutas relativas `/api` si el backend no vive en el mismo dominio. El frontend actual ya fue ajustado para soportar `VITE_API_URL` y mantener compatibilidad local.

## Próximo nivel real

Se necesita conectar PostgreSQL y Socket.IO para que:

- empleados se actualicen en vivo
- órdenes se reflejen en todos los clientes
- notificaciones y alertas se distribuyan en tiempo real
- cada módulo tenga permisos reales por rol
