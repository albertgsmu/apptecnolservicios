import type { OrderSiteDetails } from '../../types'

export function OrderSiteInfo({ site }: { site: OrderSiteDetails }) {
  if (!site?.address && !site?.city) return <p className="metric-explanation">Ubicación sin registrar en esta orden.</p>
  const location = [site.address, site.neighborhood, site.city].filter(Boolean).join(', ')
  return <section className="order-site-info" aria-label="Ubicación y datos de la obra">
    <h4>Ubicación de la obra</h4><p className="order-site-address">{site.address}</p>
    <p>{[site.neighborhood, site.city].filter(Boolean).join(' · ')}</p>
    {(site.building || site.unit) && <p><strong>{[site.building, site.unit].filter(Boolean).join(' · ')}</strong></p>}
    <a className="order-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer">Ver dirección en el mapa ↗</a>
    {site.geofence && <p>Radio de llegada: {site.geofence.radius} m. Coordenadas: {site.geofence.latitude}, {site.geofence.longitude}</p>}
    <dl>
      {(site.contactName || site.contactPhone) && <div><dt>Contacto en la obra</dt><dd>{site.contactName || 'Nombre sin registrar'}{site.contactPhone && <> · <a href={`tel:${site.contactPhone.replace(/[^\d+]/g, '')}`}>{site.contactPhone}</a></>}</dd></div>}
      {site.accessHours && <div><dt>Horario permitido de ingreso</dt><dd>{site.accessHours}</dd></div>}
      {site.accessInstructions && <div><dt>Referencias y condiciones de acceso</dt><dd>{site.accessInstructions}</dd></div>}
      {site.workRequirements && <div><dt>Materiales, herramientas y cuidados</dt><dd>{site.workRequirements}</dd></div>}
    </dl>
  </section>
}
