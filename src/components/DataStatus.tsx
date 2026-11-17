type Props = { loading: boolean; error: string; generatedAt?: string; onRefresh: () => void; label?: string; actionLabel?: string }

export function DataStatus({ loading, error, generatedAt, onRefresh, label = 'Resumen', actionLabel = 'Actualizar datos' }: Props) {
  return <div className={`data-status ${error ? 'data-status-error' : ''}`}>
    <div role={error ? 'alert' : 'status'}>
      {error ? <><strong>No se pudo actualizar {label.toLowerCase()}.</strong><span>{generatedAt ? 'Se conserva la última consulta; los datos pueden haber cambiado.' : 'Los indicadores no están disponibles; no se muestran ceros como resultado.'} {error}</span></>
        : <><strong>{loading ? `Consultando ${label.toLowerCase()}…` : 'Datos guardados en la empresa'}</strong><span>{generatedAt ? `Última consulta: ${new Date(generatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · Hora de Colombia` : 'Esperando la primera consulta.'}</span></>}
    </div>
    <button className="ghost-button" aria-label={loading ? 'Actualizando…' : actionLabel} title={actionLabel} disabled={loading} onClick={onRefresh}><svg className="refresh-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13-1L20 8M4 16l1.5 2a8 8 0 0 0 13-1" /></svg><span className="refresh-label">{loading ? 'Actualizando…' : actionLabel}</span></button>
  </div>
}
