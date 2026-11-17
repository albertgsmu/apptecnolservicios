export type Role = 'Gerente' | 'Secretaria' | 'Supervisor' | 'Trabajador'
export type ManagedRole = Exclude<Role, 'Gerente'>
export type View = 'inventory' | 'dashboard' | 'workers' | 'orders' | 'agenda' | 'reports' | 'my-work' | 'field-reports'
export type EmployeeStatus = 'Activo' | 'Vacaciones' | 'Licencia' | 'Inactivo'
export type ApplicantStatus = 'Pendiente' | 'Aprobado' | 'Rechazado'
export type OrderAttachment = {
  id: string; name: string; mimeType: string; size: number; url: string
  instructions: string
}
export type OrderAttachmentDraft = { file: File; instructions: string }
export type MaterialRequestLine = { name: string; quantity: number; unit: string }
export type FieldReport = {
  materials: MaterialRequestLine[]
  id: string; orderId: string; employeeName: string; client: string; site: { address: string; city: string; unit: string }
  category: string; urgency: string; title: string; details: string; requestedAction: string; status: string
  managerReply: string; reviewerName: string | null; reviewerRole: string | null; reviewedAt: string | null; createdAt: string; version: number
}
export type WorkerCheckIn = {
  assessments: LocationAssessment[]
  id: string; employeeId: string; orderId: string | null; employeeName: string; client: string | null; site: { address: string; city: string; unit: string }
  kind: string; locationStatus: string; latitude: number | null; longitude: number | null; accuracy: number | null
  capturedAt: string | null; notes: string; createdAt: string
}
export type LocationAssessment = { orderId: string; client: string; status: 'inside' | 'outside' | 'uncertain' | 'unconfigured' | 'unavailable'; distance: number | null; radius: number | null }
export type WorkerPhoto = { assessments: LocationAssessment[]; id: string; orderId: string; caption: string; latitude: number; longitude: number; accuracy: number; capturedAt: string; createdAt: string; day: string; employeeName: string; client: string }
export type WorkerReportNotification = { id: string; reportId: string; title: string; reply: string; status: string; reviewerName: string; reviewerRole: string; createdAt: string; readAt: string | null }
export type FieldWorkData = { currentOrderId: string | null; notifications: WorkerReportNotification[]; unreadNotifications: number; photos: WorkerPhoto[]; dailyPhotos: { day: string; required: number; workers: { employeeId: string; name: string; count: number; missing: number }[] }; reports: FieldReport[]; checkIns: WorkerCheckIn[]; totals: { total: number; pending: number; critical: number }; generatedAt: string }
export type OrderSiteDetails = {
  geofence?: { latitude: number; longitude: number; radius: number } | null
  address: string; city: string; neighborhood: string; building: string; unit: string
  contactName: string; contactPhone: string; accessHours: string; accessInstructions: string; workRequirements: string
}
export type DashboardOverview = {
  generatedAt: string; today: string; timeZone: string
  orders: { total: number; open: number; closed: number; averageProgress: number }
  operations: { openAverageProgress: number | null; review: number; unassigned: number; critical: number; overdue: number }
  employees: { total: number; active: number; vacation: number; leave: number; inactive: number } | null
  applicants: { total: number; pending: number; approved: number; rejected: number }
  media: { files: number; bytes: number }
  fieldWork: { pending: number; critical: number } | null
  availability: { attendance: boolean; contracts: boolean; financialResults: boolean }
}
export type WorkOrder = {
  id: string; client: string; area: string; priority: string; status: string
  progress: number; assignedTo: string; assignedName: string; date: string
  observations: string; createdAt: string; updatedAt: string; version: number
  attachments: OrderAttachment[]
  site: OrderSiteDetails
}

export type Applicant = {
  id: string
  fullName: string
  email: string
  phone: string
  birthDate: string
  gender: string
  address: string
  city: string
  identityNumber: string
  education: string
  area: string
  experience: string
  skills: string[]
  availability: string
  emergencyContact: string
  emergencyPhone: string
  documents: string[]
  status: ApplicantStatus
  createdAt: string
}

export type SessionUser = {
  email: string
  role: Role
  name: string
}
