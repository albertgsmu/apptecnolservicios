import type { FieldWorkData, WorkOrder } from '../../types'
import './FieldWork.css'
import { WorkerAssignment } from './WorkerAssignment'
import { WorkerPhotos } from './WorkerPhotos'

import { WorkerConversations } from './WorkConversation'
import { WorkRecords } from './WorkRecords'


type Props = { showLocations?: boolean; manager: boolean; orders: WorkOrder[]; data: FieldWorkData | null; reload: () => void; initialOrderId?: string; initialReportId?: string }

export function FieldWorkPanel({ manager, orders, data, reload, showLocations = true, initialOrderId, initialReportId }: Props) {
  const currentOrder = orders.find(order => order.id === data?.currentOrderId)
  if (manager) return <WorkRecords orders={orders} data={data} showLocations={showLocations} initialOrderId={initialOrderId} initialReportId={initialReportId} reload={reload} />
  return <section className="content-block field-work-panel">
    <WorkerAssignment order={currentOrder} count={orders.filter(order => order.status !== 'Cerrada').length} />
    <WorkerConversations currentOrderId={currentOrder?.id} data={data} reload={reload} />
    <WorkerPhotos manager={false} currentOrder={currentOrder} orders={orders} data={data} reload={reload} />
  </section>
}
