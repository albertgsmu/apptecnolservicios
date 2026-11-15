import { useEffect, useRef, useState } from 'react'
import { ORDER_MEDIA_ACCEPT, ORDER_MEDIA_LIMITS, ORDER_MEDIA_TYPES } from '../../../shared/order-media.js'
import './OrderMedia.css'
import { formatMediaSize } from './mediaUtils'
import type { OrderAttachmentDraft } from '../../types'

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(file)
    let active = true
    queueMicrotask(() => { if (active) setUrl(next) })
    return () => { active = false; URL.revokeObjectURL(next) }
  }, [file])
  if (!url) return <div className="order-file-placeholder">Preparando vista previa…</div>
  return file.type.startsWith('video/')
    ? <video src={url} controls preload="metadata" playsInline aria-label={`Vista previa de ${file.name}`} />
    : <img src={url} alt={`Vista previa de ${file.name}`} />
}

export function OrderMediaPicker({ files, onChange, disabled }: { files: OrderAttachmentDraft[]; onChange: (files: OrderAttachmentDraft[]) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const addFiles = (incoming: File[]) => {
    if (disabled) return
    const unique = incoming.filter(file => !files.some(existing => existing.file.name === file.name && existing.file.size === file.size && existing.file.lastModified === file.lastModified))
    for (const file of unique) {
      if (!ORDER_MEDIA_TYPES.includes(file.type)) { setError(`${file.name}: usa JPG, PNG, WEBP, MP4 o WEBM.`); return }
      if (!file.size) { setError(`${file.name}: el archivo está vacío.`); return }
      const limit = file.type.startsWith('image/') ? ORDER_MEDIA_LIMITS.imageBytes : ORDER_MEDIA_LIMITS.videoBytes
      if (file.size > limit) { setError(`${file.name}: máximo ${file.type.startsWith('image/') ? '10 MB por imagen' : '25 MB por video'}.`); return }
    }
    setError('')
    onChange([...files, ...unique.map(file => ({ file, instructions: '' }))])
  }

  return <div className="order-media-picker">
    <div className={`order-media-dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }}>
      <span className="order-media-symbol" aria-hidden="true">＋</span>
      <div><strong>Agrega fotos o videos del servicio</strong><p>Arrastra los archivos aquí o selecciónalos desde tu equipo.</p></div>
      <button type="button" className="ghost-button" disabled={disabled} onClick={() => input.current?.click()}>Seleccionar archivos</button>
      <input ref={input} className="visually-hidden" tabIndex={-1} id="order-media-files" type="file" multiple accept={ORDER_MEDIA_ACCEPT} disabled={disabled} aria-label="Seleccionar fotos o videos del servicio" onChange={event => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} />
    </div>
    <p className="order-media-limits">Sin límite fijo de cantidad · Fotos JPG, PNG y WEBP: 10 MB por archivo · Videos MP4 y WEBM: 25 MB por archivo</p>
    {error && <p className="order-create-error" role="alert">{error}</p>}
    {files.length > 0 && <ul className="order-media-selection" aria-label="Archivos seleccionados">
      {files.map(({ file, instructions }, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>
        <FilePreview file={file} />
        <div className="order-file-info"><strong title={file.name}>{file.name}</strong><small>{file.type.startsWith('video/') ? 'Video' : 'Imagen'} · {formatMediaSize(file.size)}</small></div>
        <label className="order-media-instruction-field">Indicaciones para el trabajador
          <textarea value={instructions} disabled={disabled} maxLength={ORDER_MEDIA_LIMITS.instructionCharacters} rows={3} placeholder="Ej. Reparar la fisura de esta pared y pintar al terminar." aria-label={`Indicaciones para ${file.name}`} onChange={event => onChange(files.map((attachment, position) => position === index ? { ...attachment, instructions: event.target.value } : attachment))} />
          <small>{instructions.length} / {ORDER_MEDIA_LIMITS.instructionCharacters}</small>
        </label>
        <button type="button" className="order-file-remove" disabled={disabled} aria-label={`Quitar ${file.name}`} onClick={() => { setError(''); onChange(files.filter((_file, position) => position !== index)) }}>×</button>
      </li>)}
    </ul>}
  </div>
}
