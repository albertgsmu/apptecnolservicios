import type { OrderSiteDetails } from '../src/types'
export const ORDER_SITE_FIELDS: Record<keyof OrderSiteDetails, { label: string; maxLength: number; required?: boolean }>
export function emptyOrderSite(): OrderSiteDetails
export function validateOrderSite(input: unknown): { error: string; value?: never } | { value: OrderSiteDetails; error?: never }
