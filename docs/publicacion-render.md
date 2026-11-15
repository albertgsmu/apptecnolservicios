# Publicación permanente para pruebas desde teléfonos

La configuración `render.yaml` crea un único Web Service: sirve la web compilada, la API y Socket.IO bajo el mismo dominio HTTPS. GitHub conserva el código y Render ejecuta el servicio. Neon conserva los datos y archivos en PostgreSQL.

## Conectar GitHub y Render

Se puede usar la integración de Render o abrir [Deploy to Render](https://render.com/deploy?repo=https://github.com/albertgsmu/apptecnolservicios). Autoriza el repositorio `albertgsmu/apptecnolservicios`, rama `main`, y utiliza el Blueprint `render.yaml`. Mantén el plan Free para estas pruebas. No crees un Static Site: esta app necesita ejecutar Node.js.

Las siguientes variables privadas se introducen en Render, sin subirlas a GitHub:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Conexión agrupada de la rama de Neon que contiene las cuentas y órdenes de prueba. |
| `DATABASE_URL_UNPOOLED` | Conexión directa a esa misma rama. |
| `MFA_ENCRYPTION_KEY` | Exactamente la clave actual de `.env.local`, de 32 bytes codificados en base64. No generar otra si hay autenticadores configurados. |

El Blueprint establece Node 24, `NODE_ENV=production`, `SERVE_FRONTEND=true` y `TRUST_PROXY_HOPS=1`. La web se construye con `npm ci --include=dev && npm run build:web` y arranca con `npm start`. La aplicación incorpora el `RENDER_EXTERNAL_URL` al conjunto de orígenes permitidos, sin comodines ni URLs locales en el navegador del teléfono. Para un dominio propio se puede añadir `APP_ORIGIN=https://dominio`.

## Verificar la publicación

Tras finalizar el despliegue, usa la URL HTTPS que devuelva Render. Debe abrir el acceso y responder en `/api/health` con `ok: true` y `database: postgres`. Prueba el acceso del gerente, una cuenta de trabajador, autorización de ubicación, envío de foto y respuesta a un reporte. Las cookies, la API, los adjuntos y las notificaciones funcionan en ese mismo origen. El computador local puede apagarse.

En producción el Gerente debe configurar su autenticador; el modo opcional local no desactiva esa protección. La base debe tener preparada la migración de autenticación. No se ejecuta `db:reset`, `prisma db push` ni un borrado de datos durante el despliegue. Si falta el esquema, corrígelo primero en la rama de pruebas verificada.

El plan gratuito puede suspender el servicio por inactividad y tardar en reactivarse; no es una garantía de disponibilidad permanente. No se añade un plan de pago automáticamente. Límites y comportamiento: [Render Free](https://render.com/docs/free). Los archivos permanentes están en Neon, no en el disco temporal del servicio.

## Comprobación local del modo alojado

Ejecuta `npm run build:web`, `npm run test:hosting` y `npm run lint`. `build:web` fuerza una API relativa aunque `.env.local` tenga un destino local de desarrollo. El test usa una base SQLite temporal, prueba la web y el acceso en un solo origen, bloquea orígenes ajenos y comprueba que no se sirven secretos ni rutas de API inexistentes como HTML.

Documentación oficial: [Express en Render](https://render.com/docs/deploy-node-express-app), [Blueprints](https://render.com/docs/infrastructure-as-code), [secretos](https://render.com/docs/configure-environment-variables), [dominio automático](https://render.com/docs/environment-variables).
