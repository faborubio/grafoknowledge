import { useEffect, useState } from 'react'

type Health = { status: string; domain?: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'backend caído' }))
  }, [])

  return (
    <main className="min-h-screen bg-void text-starlight flex flex-col items-center justify-center gap-8 px-6">
      <header className="text-center space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">GrafoKnowledge</h1>
        <p className="text-muted max-w-md">
          Tus notas, leídas por IA, convertidas en una constelación de conocimiento
          que puedes consultar.
        </p>
      </header>

      {/* Pantalla inicial = búsqueda (ADR-007: revelación progresiva).
          La ego-network llega en Fase 4. */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Busca un concepto… (Fase 4)"
        disabled
        className="w-full max-w-lg rounded-full bg-surface border border-muted/30 px-6 py-3
                   text-starlight placeholder:text-muted focus:outline-none
                   focus:border-concepto/60 disabled:opacity-60"
      />

      <footer className="text-xs text-muted">
        backend:{' '}
        <span className={health?.status === 'ok' ? 'text-concepto' : 'text-fuente'}>
          {health ? `${health.status}${health.domain ? ` · dominio ${health.domain}` : ''}` : 'conectando…'}
        </span>
      </footer>
    </main>
  )
}

export default App
