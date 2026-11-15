import { ORDER_SITE_FIELDS } from '../../../shared/order-site.js'
import type { OrderSiteDetails } from '../../types'

type Props = { value: OrderSiteDetails; onChange: (value: OrderSiteDetails) => void }
const placeholders: Record<Exclude<keyof OrderSiteDetails, 'geofence'>, string> = {
  address: 'Ej. Calle 72 # 10-34', city: 'Ej. Bogotá', neighborhood: 'Ej. Quinta Camacho',
  building: 'Ej. Conjunto Los Cedros, torre 2', unit: 'Ej. Apto. 503, piso 5',
  contactName: 'Persona que recibirá al trabajador', contactPhone: 'Ej. +57 300 123 4567',
  accessHours: 'Ej. Lunes a viernes de 8:00 a. m. a 5:00 p. m.',
  accessInstructions: 'Ej. Ingresar por portería norte, anunciarse y presentar documento. El ascensor de servicio está junto al parqueadero.',
  workRequirements: 'Ej. Llevar escalera, taladro y protección para el piso. Coordinar el corte de agua con el contacto antes de comenzar.',
}

export function OrderSiteFields({ value, onChange }: Props) {
  const field = (key: Exclude<keyof OrderSiteDetails, 'geofence'>, multiline = false) => {
    const config = ORDER_SITE_FIELDS[key]
    const props = { id: `order-site-${key}`, maxLength: config.maxLength, required: config.required, value: value[key], placeholder: placeholders[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [key]: event.target.value }) }
    return <label key={key} className={multiline ? 'order-description-field' : undefined} htmlFor={props.id}>
      {config.label}<span className={config.required ? 'order-required' : 'order-optional'}>{config.required ? 'Obligatorio' : 'Opcional'}</span>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} type={key === 'contactPhone' ? 'tel' : 'text'} autoComplete={key === 'address' ? 'street-address' : key === 'city' ? 'address-level2' : key === 'contactPhone' ? 'tel' : 'off'} />}
    </label>
  }
  return <>
    <section aria-labelledby="order-site-title"><h3 id="order-site-title"><span>02</span> Ubicación de la obra</h3>
      <div className="order-form-grid">{(['address', 'city', 'neighborhood', 'building', 'unit'] as const).map(key => field(key))}</div>
    </section>
    <section aria-labelledby="order-contact-title"><h3 id="order-contact-title"><span>03</span> Contacto, acceso y preparación</h3>
      <div className="order-form-grid">{(['contactName', 'contactPhone', 'accessHours'] as const).map(key => field(key))}</div>
      {field('accessInstructions', true)}{field('workRequirements', true)}
    </section>
  </>
}
