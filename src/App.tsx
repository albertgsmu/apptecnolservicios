import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { InventorySection } from './features/inventory/InventorySection'
import { ApplicantsPanel } from './components/ApplicantsPanel'
import { BrandMark } from './components/BrandMark'
import { LoginScreen } from './components/LoginScreen'
import { WorkersHub } from './components/WorkersHub'
import { menuItems } from './constants/navigation'
import { useOverview } from './hooks/useOverview'
import { DataStatus } from './components/DataStatus'
import { useFieldWork } from './hooks/useFieldWork'
import { FieldWorkPanel } from './features/field-work/FieldWorkPanel'
import { DashboardSection } from './features/dashboard/DashboardSection'
import { OrdersSection } from './features/orders/OrdersSection'
import { CreateOrderDialog, type OrderDraft } from './features/orders/CreateOrderDialog'
import { ReportsSection } from './features/reports/ReportsSection'
import { AgendaSection } from './features/agenda/AgendaSection'
import { roleViews } from './constants/roles'
import { useApplicants } from './hooks/useApplicants'
import { useOrders } from './hooks/useOrders'
import { useAuth } from './hooks/useAuth'
import { useEmployees } from './hooks/useEmployees'
import { CreateUserDialog } from './components/CreateUserDialog'
import { MobileNavigation } from './components/MobileNavigation'
import './mobile.css'
import { can } from '../shared/access-policy.js'
import type { ApplicantStatus, EmployeeStatus, ManagedRole, View } from './types'





function App() {
  const [selectedView, setSelectedView] = useState<View>('dashboard')
  const [recordOrderId, setRecordOrderId] = useState<string>()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | EmployeeStatus>('Todos')
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createUserRole, setCreateUserRole] = useState<ManagedRole>('Secretaria')
  const openCreateUser = (role: ManagedRole = 'Secretaria') => { setCreateUserRole(role); setCreateUserOpen(true) }
  const closeCreateUser = useCallback(() => setCreateUserOpen(false), [])
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const closeNewOrder = useCallback(() => setNewOrderOpen(false), [])
  const [searchApplicant, setSearchApplicant] = useState('')
  const [applicantFilter, setApplicantFilter] = useState<'Todos' | ApplicantStatus>('Todos')

  const { isLoggedIn, login, logout, completeLogin, sessionUser, restoreSession, isRestoringSession, sessionError } = useAuth()
  const canWriteOrders = can(sessionUser?.role, 'createOrders')
  const canManageOrders = can(sessionUser?.role, 'manageOrders')
  const canUpdateOrders = can(sessionUser?.role, 'updateOrders')
  const { orders, assignees, error: ordersError, loading: ordersLoading, reload: reloadOrders, create: createOrder, update: updateOrder, remove: deleteOrder } = useOrders(isLoggedIn, canManageOrders)
  const { applicants, isLoadingData, loadError, decideApplicant } = useApplicants(isLoggedIn && can(sessionUser?.role, 'readApplicants'))
  const canReadEmployees = can(sessionUser?.role, 'readEmployees')
  const { employees, updateEmployeeStatus, loading: employeeLoading, error: employeeError, reload: reloadEmployees } = useEmployees(isLoggedIn && canReadEmployees)
  const { data: overview, loading: overviewLoading, error: overviewError, reload: reloadOverview } = useOverview(isLoggedIn && sessionUser?.role !== 'Trabajador' ? sessionUser?.email ?? null : null)
  const refreshCompanyData = () => { void reloadOverview(); void reloadOrders(); if (canReadEmployees) reloadEmployees() }
  const fieldWork = useFieldWork(isLoggedIn && sessionUser && ['Gerente', 'Secretaria', 'Supervisor', 'Trabajador'].includes(sessionUser.role) ? sessionUser.email : null)
  const reloadFieldWork = fieldWork.reload
  const refreshFieldWork = useCallback(() => { void reloadFieldWork(); void reloadOverview() }, [reloadFieldWork, reloadOverview])

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  const handleLogin = async (credentials: { email: string; password: string }) => {
    const result = await login(credentials)
    if (result.nextStep === 'authenticated') {
      setSelectedView(result.user.role === 'Trabajador' ? 'my-work' : 'dashboard')
    }
    return result
  }

  const handleAuthenticationComplete = (user: NonNullable<typeof sessionUser>) => {
    completeLogin(user)
    setSelectedView(user.role === 'Trabajador' ? 'my-work' : 'dashboard')
  }

  const handleApplicantDecision = async (id: string, status: ApplicantStatus) => {
    await decideApplicant(id, status)
    void reloadOverview()
  }

  const handleOpenNewOrder = () => {
    setNewOrderOpen(true)
  }

  const handleCreateOrder = async (draft: OrderDraft) => {
    await createOrder(draft)
    void reloadOverview()
    setNewOrderOpen(false)
    setSelectedView('orders')
  }

  const handleEmployeeStatusChange = async (id: string, status: EmployeeStatus) => {
    try {
      await updateEmployeeStatus(id, status)
      void reloadOverview()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo actualizar el estado del empleado.')
    }
  }

  const allowedViews = sessionUser ? roleViews[sessionUser.role] ?? [] : []
  const activeView = allowedViews.includes(selectedView) ? selectedView : allowedViews[0]
  const renderContent = () => {
    switch (activeView) {
      case 'inventory':
        return <InventorySection key={sessionUser?.email} manager={sessionUser?.role === 'Gerente'} writable={can(sessionUser?.role, 'manageInventory')} />
      case 'my-work':
      case 'field-reports':
        return <><DataStatus loading={fieldWork.loading} error={fieldWork.error} generatedAt={fieldWork.data?.generatedAt} onRefresh={refreshFieldWork} label="Reportes de obra" actionLabel="Actualizar reportes" /><FieldWorkPanel key={`${sessionUser?.email}:${recordOrderId ?? ''}`} initialOrderId={recordOrderId} manager={sessionUser?.role !== 'Trabajador'} showLocations={sessionUser?.role === 'Gerente' || sessionUser?.role === 'Trabajador'} orders={orders} data={fieldWork.data} reload={refreshFieldWork} /></>
      case 'workers':
        return <WorkersHub key={sessionUser?.email} canReadEmployees={canReadEmployees} data={overview} fieldWork={fieldWork.data}
          onCreateWorker={can(sessionUser?.role, 'manageUsers') ? () => openCreateUser('Trabajador') : undefined}
          employeeProps={{ searchTerm, statusFilter, onSearchChange: setSearchTerm, onStatusChange: setStatusFilter,
            onUpdateStatus: handleEmployeeStatusChange, canManageEmployees: can(sessionUser?.role, 'manageEmployees'),
            employees, orders, ordersError, employeeLoading, employeeError }}
          applicants={<ApplicantsPanel applicants={applicants} searchApplicant={searchApplicant} applicantFilter={applicantFilter}
            isLoadingData={isLoadingData} loadError={loadError} onSearchChange={setSearchApplicant} onFilterChange={setApplicantFilter}
            onApplicantDecision={handleApplicantDecision} canDecide={can(sessionUser?.role, 'decideApplicants')} />}
        />

      case 'orders':
        return <OrdersSection onViewRecord={sessionUser?.role !== 'Trabajador' ? id => { setRecordOrderId(id); setSelectedView('field-reports'); window.scrollTo({ top: 0, behavior: 'instant' }) } : undefined} canDelete={can(sessionUser?.role, 'deleteOrders')} onDelete={async (id, version) => { await deleteOrder(id, version); void reloadOverview(); void reloadFieldWork() }} canClose={can(sessionUser?.role, 'closeOrders')} onLocationSaved={() => void reloadOrders()} orders={orders} assignees={assignees} canWrite={canUpdateOrders} canCreate={canWriteOrders} canAssign={canManageOrders} onCreate={handleOpenNewOrder} onUpdate={async (id, payload) => { await updateOrder(id, payload); void reloadOverview() }} />

      case 'agenda':
        return <AgendaSection orders={orders} error={ordersError} onViewOrders={() => setSelectedView('orders')} />

      case 'reports':
        return <ReportsSection data={overview} />

      default:
        return (
          <DashboardSection orders={orders} data={overview} ordersError={ordersError} onViewOrders={canWriteOrders ? () => setSelectedView('orders') : undefined} />
        )
    }
  }

  const visibleMenuItems = sessionUser ? menuItems.filter((item) => (roleViews[sessionUser.role] ?? []).includes(item.key)) : []
  const navigate = (view: View) => {
    setRecordOrderId(undefined)
    setSelectedView(view)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const handleLogout = async () => {
    try { await logout() }
    catch (error) { console.error('No se pudo cerrar la sesión en el servidor.', error) }
  }

  if (isRestoringSession) {
    return <main className="startup-status" role="status"><h1>JP Mantenimiento Integral</h1><p>Comprobando tu sesión…</p></main>
  }

  if (sessionError && !isLoggedIn) {
    return <main className="startup-status"><h1>No se pudo cargar el panel</h1><p role="alert">{sessionError}</p><button className="primary-button" onClick={() => void restoreSession()}>Reintentar conexión</button></main>
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onAuthenticated={handleAuthenticationComplete}
      />
    )
  }

  return (
    <div className="admin-shell" data-view={activeView}>
      <MobileNavigation items={visibleMenuItems} activeView={activeView} role={sessionUser!.role} name={sessionUser!.name} onNavigate={navigate} onLogout={handleLogout} onCreateUser={sessionUser?.role === 'Gerente' ? () => openCreateUser() : undefined} />
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo">
            <BrandMark size={120} />
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Menú administrativo">
          {visibleMenuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeView === item.key ? 'nav-item active' : 'nav-item'}
              aria-current={activeView === item.key ? 'page' : undefined}
              onClick={() => navigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <p className="mini-label">Estado operativo</p>
          <h3>Seguimiento de órdenes</h3>
          {sessionUser?.role === 'Trabajador' ? (ordersError ? <p>No se pudo consultar el resumen.</p> : <ul><li>{orders.filter(order => order.status !== 'Cerrada').length} de mis órdenes abiertas</li><li>{orders.filter(order => order.status === 'Cerrada').length} de mis órdenes cerradas</li></ul>) : overview ? <ul><li>{overview.orders.open} órdenes abiertas</li><li>{overview.orders.closed} órdenes cerradas</li><li>{overview.operations.review} pendientes de revisión</li></ul> : <p>Resumen pendiente de consulta.</p>}
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={async () => {
            try {
              await logout()
            } catch (error) {
              console.error('No se pudo cerrar la sesión en el servidor.', error)
            }
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Sistema administrativo</p>
            <h1>{sessionUser?.role === 'Trabajador' ? 'Mi espacio de trabajo' : 'Panel corporativo de operación'}</h1>
            <h2 className="mobile-page-title">{activeView === 'dashboard' ? 'Resumen de la empresa' : visibleMenuItems.find(item => item.key === activeView)?.label}</h2>
          </div>

          <div className="topbar-actions">
            <div className="user-badge">
              <span>Rol</span>
              <strong>{sessionUser?.role}</strong>
            </div>
            {sessionUser?.role === 'Gerente' && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  openCreateUser()
                }}
              >
                Crear usuario
              </button>
            )}
            {allowedViews.includes('reports') && <button type="button" className="ghost-button" onClick={() => setSelectedView('reports')}>Ver reportes</button>}
            {canWriteOrders && <button type="button" className="primary-button" onClick={handleOpenNewOrder}>Nueva orden</button>}
          </div>
        </header>

        {createUserOpen && sessionUser?.role === 'Gerente' && <CreateUserDialog initialRole={createUserRole} onClose={closeCreateUser} onCreated={refreshCompanyData} />}

        {newOrderOpen && canWriteOrders && (
          <CreateOrderDialog assignees={assignees} canAssign={canManageOrders} onClose={closeNewOrder} onCreate={handleCreateOrder} />
        )}

        {sessionUser?.role !== 'Trabajador' && activeView !== 'field-reports' && activeView !== 'inventory' && <DataStatus loading={overviewLoading} error={overviewError} generatedAt={overview?.generatedAt} onRefresh={refreshCompanyData} />}
        {ordersLoading && <p role="status">Cargando órdenes...</p>}
        {ordersError && <div role="alert">{ordersError} <button onClick={() => void reloadOrders()}>Reintentar</button></div>}
        {sessionUser?.role === 'Trabajador' && !ordersLoading && !ordersError && <button className="text-button" onClick={() => void reloadOrders()}>Actualizar órdenes</button>}
        {sessionUser?.role === 'Trabajador' && !!fieldWork.data?.unreadNotifications && <div className="panel worker-response-alert" role="status" aria-live="polite"><strong>Tienes {fieldWork.data.unreadNotifications} respuestas nuevas a tus reportes.</strong><button className="primary-button" onClick={() => setSelectedView('field-reports')}>Ver mensajes y soluciones</button></div>}
        {renderContent()}
      </main>
    </div>
  )
}

export default App
