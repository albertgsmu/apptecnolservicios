export type InventoryItem = {
  id: string; code: string; kind: 'Herramienta' | 'Material'; name: string; unit: string; brand: string; serial: string; notes: string
  status: string; warehouse: number; minimum: number; employeeId: string | null; orderId: string | null
  employeeName: string | null; client: string | null; dueDate: string | null; version: number
}
export type InventoryData = {
  items: InventoryItem[]
  allocations: { id: string; itemId: string; orderId: string; employeeId: string; quantity: number; employeeName: string; client: string }[]
  employees: { id: string; name: string }[]; orders: { id: string; client: string }[]; generatedAt: string
}
export type InventoryMovement = { id: string; action: string; quantity: number; employeeName: string | null; client: string | null; actorName: string; notes: string; createdAt: string }
