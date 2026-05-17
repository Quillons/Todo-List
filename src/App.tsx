import { useState } from 'react'
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type Project,
} from './lib/supabaseClient'

type Status = 'idle' | 'loading' | 'success' | 'error'

const statusLabels: Record<Status, string> = {
  idle: 'Ready',
  loading: 'Working',
  success: 'Connected',
  error: 'Error',
}

function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState(
    'Press the button to check your Supabase connection and read from the projects table.',
  )
  const [projects, setProjects] = useState<Project[]>([])

  const configError = getSupabaseConfigError()

  const handleConnectionTest = async () => {
    setStatus('loading')
    setMessage('Checking Supabase connection...')
    setProjects([])

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      const rows = data ?? []
      setProjects(rows)
      setStatus('success')

      if (rows.length === 0) {
        setMessage('Connected to Supabase, but no projects were found yet.')
        return
      }

      setMessage(
        `Connected to Supabase and loaded ${rows.length} project${rows.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong while connecting to Supabase.',
      )
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Local connection check</p>
        <h1>Personal Ops Center</h1>
        <p className="intro">
          This first screen is only here to confirm the React app runs, your
          environment variables load, and Supabase can read from{' '}
          <code>projects</code>.
        </p>

        <button
          className="primary-button"
          type="button"
          onClick={handleConnectionTest}
          disabled={status === 'loading'}
        >
          {status === 'loading'
            ? 'Testing Connection...'
            : 'Test Supabase Connection'}
        </button>

        <div className={`status-card status-${status}`} role="status">
          <div className="status-row">
            <span className="status-label">{statusLabels[status]}</span>
            {configError ? (
              <span className="config-warning">Missing .env values</span>
            ) : (
              <span className="config-ok">Config detected</span>
            )}
          </div>
          <p>{message}</p>
        </div>

        {projects.length > 0 ? (
          <section className="results">
            <h2>Projects</h2>
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id} className="project-item">
                  <strong>{project.name}</strong>
                  <span>
                    Created:{' '}
                    {project.created_at
                      ? new Date(project.created_at).toLocaleString()
                      : 'Unknown'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
