import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const permissions = [
    { role: 'GERENTE', module: 'dashboard', canRead: true, canWrite: true, canDelete: true },
    { role: 'GERENTE', module: 'workers', canRead: true, canWrite: true, canDelete: true },
    { role: 'GERENTE', module: 'personal', canRead: true, canWrite: true, canDelete: true },
    { role: 'GERENTE', module: 'orders', canRead: true, canWrite: true, canDelete: true },
    { role: 'GERENTE', module: 'contracts', canRead: true, canWrite: true, canDelete: true },
    { role: 'GERENTE', module: 'reportes', canRead: true, canWrite: true, canDelete: true },
    { role: 'SECRETARIA', module: 'dashboard', canRead: true, canWrite: false, canDelete: false },
    { role: 'SECRETARIA', module: 'personal', canRead: true, canWrite: true, canDelete: false },
    { role: 'SECRETARIA', module: 'orders', canRead: true, canWrite: true, canDelete: false },
    { role: 'SECRETARIA', module: 'contracts', canRead: true, canWrite: true, canDelete: false },
    { role: 'SUPERVISOR', module: 'workers', canRead: true, canWrite: true, canDelete: false },
    { role: 'SUPERVISOR', module: 'orders', canRead: true, canWrite: true, canDelete: false },
    { role: 'RRHH', module: 'personal', canRead: true, canWrite: true, canDelete: false },
    { role: 'RRHH', module: 'workers', canRead: true, canWrite: true, canDelete: false },
    { role: 'ADMINISTRACION', module: 'contracts', canRead: true, canWrite: true, canDelete: false },
  ]

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        role_module: {
          role: permission.role,
          module: permission.module,
        },
      },
      update: permission,
      create: permission,
    })
  }

  console.log('Role permissions seeded successfully')
}

main()
  .catch((error) => {
    console.error('Error seeding role permissions:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
