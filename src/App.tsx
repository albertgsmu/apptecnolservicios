import { useEffect, useState } from 'react'
import './App.css'
import { ApplicantsPanel } from './components/ApplicantsPanel'
import { BrandMark } from './components/BrandMark'
import { LoginScreen } from './components/LoginScreen'
import { WorkersSection } from './components/WorkersSection'
import {
  agenda,
  attendance,
  contracts,
  defaultRegisterForm,
  menuItems,
  providers,
  reports,
  roleOptions,
  summaryStats,
  vacationRequests,
  workOrders,
} from './data/mockData'
import { DashboardSection } from './features/dashboard/DashboardSection'
import { ContractsSection } from './features/contracts/ContractsSection'
import { OrdersSection } from './features/orders/OrdersSection'
import { PersonalSection } from './features/personal/PersonalSection'
import { ReportsSection } from './features/reports/ReportsSection'
import { SecretarySection } from './features/secretary/SecretarySection'
import { useApplicants } from './hooks/useApplicants'
import { useAuth } from './hooks/useAuth'
import { useEmployees } from './hooks/useEmployees'
import type { ApplicantStatus, EmployeeStatus, RegisterForm, Role, View } from './types'
import { isValidEmail, isValidPassword } from './utils/validation'

function App() {
  const [activeRole, setActiveRole] = useState<Role>('Gerente')
  const [selectedView, setSelectedView] = useState<View>('dashboard')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | EmployeeStatus>('Todos')
  const [loginEmail, setLoginEmail] = useState('gerente@jpmantenimiento.com')
  const [loginPassword, setLoginPassword] = useState('JPsecure123')
  const [registerOpen, setRegisterOpen] = useState(false)
  const [searchApplicant, setSearchApplicant] = useState('')
  const [applicantFilter, setApplicantFilter] = useState<'Todos' | ApplicantStatus>('Todos')
  const [registerForm, setRegisterForm] = useState<RegisterForm>(defaultRegisterForm)
  const [registerNotice, setRegisterNotice] = useState('')

  const { isLoggedIn, login, logout, sessionUser, restoreSession } = useAuth()
  const { applicants, isLoadingData, addApplicant, decideApplicant } = useApplicants()
  const { employees, updateEmployeeStatus } = useEmployees()

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  const handleLogin = async () => {
    const email = loginEmail.trim().toLowerCase()
    const password = loginPassword.trim()

    if (!email || !password) {
      alert('Completa tu correo y contraseña para continuar.')
      return
    }

    if (!isValidEmail(email)) {
      alert('Ingresa un correo electrónico válido.')
      return
    }

    if (!isValidPassword(password)) {
      alert('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    try {
      await login({
        email,
        password,
        role: activeRole,
      })
      setSelectedView('dashboard')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible iniciar sesión.')
    }
  }

  const handleRegisterChange = (field: keyof RegisterForm, value: string) => {
    setRegisterForm((current) => ({ ...current, [field]: value }))
  }

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const { fullName, email, phone, birthDate, address, city, identityNumber, emergencyContact, emergencyPhone, password } = registerForm

    if (!fullName || !email || !phone || !birthDate || !address || !city || !identityNumber || !emergencyContact || !emergencyPhone || !password) {
      setRegisterNotice('Completa todos los campos obligatorios para continuar.')
      return
    }

    if (!isValidEmail(email)) {
      setRegisterNotice('El correo electrónico no tiene un formato válido.')
      return
    }

    if (!isValidPassword(password)) {
      setRegisterNotice('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    await addApplicant({
      fullName,
      email,
      phone,
      birthDate,
      gender: registerForm.gender,
      address,
      city,
      identityNumber,
      education: registerForm.education,
      area: registerForm.area,
      experience: registerForm.experience,
      skills: registerForm.skills
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      availability: registerForm.availability,
      emergencyContact,
      emergencyPhone,
      documents: registerForm.documents
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    })
    setRegisterForm(defaultRegisterForm)
    setRegisterNotice('Registro enviado correctamente. Tu solicitud quedó en revisión.')
    setRegisterOpen(false)
    setSelectedView('personal')
  }

  const handleApplicantDecision = async (id: string, status: ApplicantStatus) => {
    await decideApplicant(id, status)
  }

  const handleEmployeeStatusChange = async (id: string, status: EmployeeStatus) => {
    try {
      await updateEmployeeStatus(id, status)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo actualizar el estado del empleado.')
    }
  }

  const renderContent = () => {
    switch (selectedView) {
      case 'workers':
        return (
          <WorkersSection
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            onSearchChange={setSearchTerm}
            onStatusChange={(value) => setStatusFilter(value)}
            onUpdateStatus={handleEmployeeStatusChange}
            employees={employees}
          />
        )

      case 'personal':
        return (
          <PersonalSection
            attendance={attendance}
            vacations={vacationRequests}
            applicants={(
              <ApplicantsPanel
                applicants={applicants}
                searchApplicant={searchApplicant}
                applicantFilter={applicantFilter}
                isLoadingData={isLoadingData}
                onSearchChange={setSearchApplicant}
                onFilterChange={(value) => setApplicantFilter(value)}
                onApplicantDecision={handleApplicantDecision}
                onRegisterOpen={() => setRegisterOpen(true)}
              />
            )}
          />
        )

      case 'orders':
        return <OrdersSection orders={workOrders} />

      case 'contracts':
        return <ContractsSection contracts={contracts} providers={providers} />

      case 'secretary':
        return <SecretarySection agenda={agenda} />

      case 'reports':
        return <ReportsSection reports={reports} />

      default:
        return (
          <DashboardSection
            stats={summaryStats}
            orders={workOrders}
            roles={roleOptions}
          />
        )
    }
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        activeRole={activeRole}
        onChangeRole={(role) => setActiveRole(role)}
        loginEmail={loginEmail}
        onChangeLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        onChangeLoginPassword={setLoginPassword}
        onLogin={handleLogin}
        onOpenRegister={() => setRegisterOpen(true)}
        registerOpen={registerOpen}
        onCloseRegister={() => setRegisterOpen(false)}
        registerForm={registerForm}
        onRegisterChange={handleRegisterChange}
        onRegisterSubmit={handleRegisterSubmit}
        registerNotice={registerNotice}
        roleOptions={roleOptions}
      />
    )
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo">
            <BrandMark size={120} />
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Menú administrativo">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={selectedView === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setSelectedView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <p className="mini-label">Estado operativo</p>
          <h3>Operación estable</h3>
          <ul>
            <li>94.3% de disponibilidad</li>
            <li>35 equipos activos</li>
            <li>2 incidencias críticas</li>
          </ul>
        </div>

        <button type="button" className="logout-button" onClick={() => logout()}>
          Cerrar sesión
        </button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Sistema administrativo</p>
            <h1>Panel corporativo de operación</h1>
          </div>

          <div className="topbar-actions">
            <div className="user-badge">
              <span>Rol</span>
              <strong>{sessionUser?.role ?? activeRole}</strong>
            </div>
            <button type="button" className="ghost-button">Generar reporte</button>
            <button type="button" className="primary-button">Nueva orden</button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}

export default App
