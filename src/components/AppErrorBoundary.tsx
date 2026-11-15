import { Component, type ErrorInfo, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('No se pudo mostrar el panel:', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <main className="startup-status"><h1>No se pudo mostrar el panel</h1><p>Ocurrió un error al cargar la pantalla. Recarga para intentar nuevamente.</p><button className="primary-button" onClick={() => window.location.reload()}>Recargar panel</button></main>
    }
    return this.props.children
  }
}
