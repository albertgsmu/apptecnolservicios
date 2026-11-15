type Props = { loading: boolean; error: string; generatedAt?: string; onRefresh: () => void; label?: string; actionLabel?: string }

export function DataStatus({ loading, error, generatedAt, onRefresh, label = 'Resumen', actionLabel = 'Actualizar datos' }: Props) {
  return <div className={`data-status ${error ? 'data-status-error' : ''}`}>
    <div role={error ? 'alert' : 'status'}>
      {error ? <><strong>No se pudo actualizar {label.toLowerCase()}.</strong><span>{generatedAt ? 'Se conserva la última consulta; los datos pueden haber cambiado.' : 'Los indicadores no están disponibles; no se muestran ceros como resultado.'} {error}</span></>
        : <><strong>{loading ? `Consultando ${label.toLowerCase()}…` : 'Datos guardados en la empresa'}</strong><span>{generatedAt ? `Última consulta: ${new Date(generatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · Hora de Colombia` : 'Esperando la primera consulta.'}</span></>}
    </div>
    <button className="ghost-button" disabled={loading} onClick={onRefresh}>{loading ? 'Actualizando…' : actionLabel}</button>
  </div>
}
