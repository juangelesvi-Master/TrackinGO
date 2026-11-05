/** Título de una pantalla completa (Reportes, Administración, Maestro) con botón para volver al mapa. */
export default function PageTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="page-title">
      <button type="button" className="back-button" onClick={onBack} aria-label="Volver al mapa">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" />
        </svg>
        Volver
      </button>
      <h2>{title}</h2>
    </div>
  )
}
