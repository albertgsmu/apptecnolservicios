import { getApiBaseUrl } from '../../lib/dataService'
import type { OrderAttachment } from '../../types'
import { formatMediaSize } from './mediaUtils'
import './OrderMedia.css'

export function OrderAttachments({ attachments = [] }: { attachments: OrderAttachment[] }) {
  if (!attachments.length) return null
  return <section className="order-attachments" aria-label="Fotos y videos del servicio">
    <h4>Fotos y videos del servicio <span>{attachments.length}</span></h4>
    <div className="order-attachment-grid">
      {attachments.map(attachment => {
        const url = `${getApiBaseUrl()}${attachment.url}`
        return <figure key={attachment.id}>
          {attachment.mimeType.startsWith('video/')
            ? <video controls playsInline preload="metadata" crossOrigin="use-credentials" src={url} aria-label={attachment.name} />
            : <a href={url} target="_blank" rel="noreferrer" aria-label={`Abrir imagen ${attachment.name}`}><img crossOrigin="use-credentials" loading="lazy" src={url} alt={attachment.name} /></a>}
          <figcaption>
            <a href={url} target="_blank" rel="noreferrer" title={attachment.name}>{attachment.name}</a>
            <small>{formatMediaSize(attachment.size)}</small>
            {attachment.instructions && <div className="order-attachment-instructions"><strong>Indicaciones del trabajo</strong><p>{attachment.instructions}</p></div>}
          </figcaption>
        </figure>
      })}
    </div>
  </section>
}
