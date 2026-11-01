# Panel administrativo JP Mantenimiento

Aplicación web de administración operativa para una empresa de mantenimiento, construida con React + TypeScript + Vite y una base para backend profesional con Prisma + PostgreSQL.

## Objetivo

Proveer un sistema administrativo real con:

- autenticación segura basada en JWT
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
- JWT
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

- Frontend: http://localhost:5177/
- API: http://localhost:3003/api/health

> Si 5173 o 3002 están ocupados, Vite y el backend seleccionan un puerto libre para mantener el entorno operativo sin conflictos.

## Credenciales demo

- gerente@jpmantenimiento.com / JPsecure123
- secretaria@jpmantenimiento.com / JPsecure123

## Estado actual

La solución ya incluye:

- frontend profesional modular
- sesión y autenticación JWT
- backend local con SQLite para prototipo
- esquema real de Prisma con PostgreSQL listo para migración
- base sólida para crecimiento hacia sistema en tiempo real

## Estrategia de base de datos profesional

La aplicación ya tiene la base correcta para pasar de prototipo a sistema real:

1. Prisma como capa de acceso y validación del schema.
2. PostgreSQL como motor principal para producción y entorno profesional.
3. Seeds para inicializar usuarios, permisos, departamentos y empleados.
4. Separación clara entre frontend, backend y persistencia para que cada módulo crezca sin acoplarse.
5. Socket.IO para sincronizar cambios en vivo entre clientes cuando el backend real esté activo.

Comandos recomendados:

```bash
cp .env.example .env
# ajustar DATABASE_URL y JWT_SECRET
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Próximo nivel real

Se necesita conectar PostgreSQL y Socket.IO para que:

- empleados se actualicen en vivo
- órdenes se reflejen en todos los clientes
- notificaciones y alertas se distribuyan en tiempo real
- cada módulo tenga permisos reales por rol
