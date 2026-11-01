import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const roles = [
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

  for (const permission of roles) {
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

  const adminUser = await prisma.user.upsert({
    where: { email: 'gerente@jpmantenimiento.com' },
    update: {},
    create: {
      email: 'gerente@jpmantenimiento.com',
      passwordHash: '$2a$10$Q6A4f0n2lWwXW9wL0cVJd.9m1rXcE3A0wKc3d8Lz2lR4cbR8NPNwC',
      name: 'Gerente General',
      role: 'GERENTE',
      status: 'ACTIVO',
    },
  })

  const secretaryUser = await prisma.user.upsert({
    where: { email: 'secretaria@jpmantenimiento.com' },
    update: {},
    create: {
      email: 'secretaria@jpmantenimiento.com',
      passwordHash: '$2a$10$Q6A4f0n2lWwXW9wL0cVJd.9m1rXcE3A0wKc3d8Lz2lR4cbR8NPNwC',
      name: 'Secretaria General',
      role: 'SECRETARIA',
      status: 'ACTIVO',
    },
  })

  const miguelUser = await prisma.user.upsert({
    where: { email: 'miguel.torres@jpmantenimiento.com' },
    update: {},
    create: {
      email: 'miguel.torres@jpmantenimiento.com',
      passwordHash: '$2a$10$Q6A4f0n2lWwXW9wL0cVJd.9m1rXcE3A0wKc3d8Lz2lR4cbR8NPNwC',
      name: 'Miguel Torres',
      role: 'SUPERVISOR',
      status: 'ACTIVO',
    },
  })

  const carmenUser = await prisma.user.upsert({
    where: { email: 'carmen.vela@jpmantenimiento.com' },
    update: {},
    create: {
      email: 'carmen.vela@jpmantenimiento.com',
      passwordHash: '$2a$10$Q6A4f0n2lWwXW9wL0cVJd.9m1rXcE3A0wKc3d8Lz2lR4cbR8NPNwC',
      name: 'Carmen Vela',
      role: 'ADMINISTRACION',
      status: 'ACTIVO',
    },
  })

  const employeeSeed = [
    {
      fullName: 'Luis Salas',
      position: 'Técnico senior',
      department: 'Electricidad',
      status: 'ACTIVO',
      phone: '5512345678',
      address: 'Calle 5, Colonia Roma',
      hireDate: new Date('2023-02-10'),
      userId: adminUser.id,
    },
    {
      fullName: 'Patricia Romero',
      position: 'Analista de personal',
      department: 'RRHH',
      status: 'ACTIVO',
      phone: '5523456789',
      address: 'Avenida de la Reforma 45',
      hireDate: new Date('2021-06-14'),
      userId: secretaryUser.id,
    },
    {
      fullName: 'Miguel Torres',
      position: 'Supervisor campo',
      department: 'Mecánica',
      status: 'VACACIONES',
      phone: '5534567890',
      address: 'Boulevard del Sol 78',
      hireDate: new Date('2020-11-05'),
      userId: miguelUser.id,
    },
    {
      fullName: 'Carmen Vela',
      position: 'Coordinadora',
      department: 'Secretaría',
      status: 'ACTIVO',
      phone: '5545678901',
      address: 'Calle de la Aurora 21',
      hireDate: new Date('2019-08-22'),
      userId: carmenUser.id,
    },
  ]

  for (const employee of employeeSeed) {
    await prisma.employee.upsert({
      where: { userId: employee.userId },
      update: {
        fullName: employee.fullName,
        position: employee.position,
        department: employee.department,
        status: employee.status,
        phone: employee.phone,
        address: employee.address,
        hireDate: employee.hireDate,
      },
      create: {
        userId: employee.userId,
        fullName: employee.fullName,
        position: employee.position,
        department: employee.department,
        status: employee.status,
        phone: employee.phone,
        address: employee.address,
        hireDate: employee.hireDate,
      },
    })
  }

  const departments = [
    'Electricidad',
    'Mecánica',
    'Plomería',
    'RRHH',
    'Administración',
    'Secretaría',
  ]

  for (const departmentName of departments) {
    await prisma.department.upsert({
      where: { name: departmentName },
      update: {},
      create: { name: departmentName },
    })
  }

  const existingApplicants = await prisma.applicant.count()
  if (existingApplicants === 0) {
    await prisma.applicant.createMany({
      data: [
        {
          fullName: 'María José Vázquez',
          email: 'maria.vazquez@email.com',
          phone: '5512345678',
          birthDate: new Date('1994-07-12'),
          gender: 'FEMENINO',
          address: 'Calle 5, Colonia Roma',
          city: 'Ciudad de México',
          identityNumber: 'VAMJ940712MDF',
          education: 'Licenciatura',
          area: 'Electricidad',
          experience: '2 años',
          skills: ['Mantenimiento eléctrico', 'Diagnóstico', 'Trabajo en equipo'],
          availability: 'Full time',
          emergencyContact: 'José Vázquez',
          emergencyPhone: '5578901234',
          documents: ['INE', 'CURP', 'Comprobante de domicilio'],
          status: 'PENDIENTE',
        },
        {
          fullName: 'Eduardo Duran',
          email: 'eduardo.duran@email.com',
          phone: '5523456789',
          birthDate: new Date('1989-03-21'),
          gender: 'MASCULINO',
          address: 'Avenida de la Reforma 87',
          city: 'Guadalajara',
          identityNumber: 'DURE890321JDF',
          education: 'Técnico superior',
          area: 'Plomería',
          experience: '4 años',
          skills: ['Plomería', 'HVAC', 'Atención a clientes'],
          availability: 'Turno nocturno',
          emergencyContact: 'Diana Duran',
          emergencyPhone: '5543210987',
          documents: ['INE', 'CURP'],
          status: 'APROBADO',
        },
      ],
    })
  }

  console.log('Database seed completed successfully')
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
