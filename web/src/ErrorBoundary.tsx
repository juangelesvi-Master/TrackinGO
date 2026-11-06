import { Component, type ReactNode } from 'react'
import { isChunkError, logError, reloadForNewVersion } from './errors'

interface Props {
  children: ReactNode
  /** Dónde está (para el registro). */
  where: string
  /** Pantalla completa (toda la app) o solo un panel. */
  full?: boolean
}

/** Si algo falla al dibujar una pantalla, muestra un aviso amable en lugar de dejarla en blanco. */
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    // Después de actualizar el servidor, las partes viejas de la app ya no existen: se recarga.
    if (isChunkError(err) && reloadForNewVersion()) return
    logError(this.props.where, err)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={this.props.full ? 'error-screen' : 'error-panel'} role="alert">
        <strong>Algo salió mal</strong>
        <p>No se pudo mostrar esta pantalla. Vuelve a intentarlo; si sigue pasando, avísale al administrador.</p>
        <div className="row-actions">
          <button type="button" onClick={() => this.setState({ failed: false })}>
            Reintentar
          </button>
          <button type="button" className="ghost" onClick={() => location.reload()}>
            Recargar la app
          </button>
        </div>
      </div>
    )
  }
}
