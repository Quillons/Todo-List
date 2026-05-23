import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type ProjectCardColor,
  type ProjectCardIcon,
  type Project,
  type Task,
} from './lib/supabaseClient'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Something went wrong while talking to Supabase.'
}

type ProjectCardStyle = CSSProperties & {
  '--project-card-bg': string
  '--project-card-text': string
  '--project-card-icon': string
}

type ChoiceStyle = CSSProperties & {
  '--choice-bg': string
  '--choice-text': string
}

const PROJECT_COLOR_OPTIONS: Array<{
  value: ProjectCardColor | null
  label: string
  background: string
  text: string
  icon: string
}> = [
  {
    value: null,
    label: 'No color',
    background: '#ffffff',
    text: '#172033',
    icon: '#d8e2ef',
  },
  {
    value: 'red',
    label: 'Red',
    background: '#FADADD',
    text: '#8A2F3B',
    icon: '#E8AEB6',
  },
  {
    value: 'orange',
    label: 'Orange',
    background: '#FFE1C2',
    text: '#8A4B13',
    icon: '#EDB574',
  },
  {
    value: 'yellow',
    label: 'Yellow',
    background: '#FFF3B8',
    text: '#735C00',
    icon: '#E4CB61',
  },
  {
    value: 'green',
    label: 'Green',
    background: '#DDF3D8',
    text: '#2F6B3A',
    icon: '#A8D7A1',
  },
  {
    value: 'blue',
    label: 'Blue',
    background: '#DCEEFF',
    text: '#245E8F',
    icon: '#A7D0F5',
  },
  {
    value: 'indigo',
    label: 'Indigo',
    background: '#E3E1FF',
    text: '#4D458F',
    icon: '#BBB5F5',
  },
  {
    value: 'violet',
    label: 'Violet',
    background: '#F0DDF8',
    text: '#6B3A82',
    icon: '#D1AFE0',
  },
]

const PROJECT_ICON_OPTIONS: Array<{
  value: ProjectCardIcon | null
  label: string
}> = [
  { value: null, label: 'No icon' },
  { value: 'house', label: 'House' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'lightbulb', label: 'Lightbulb' },
  { value: 'car', label: 'Car' },
  { value: 'running', label: 'Running' },
  { value: 'euro', label: 'Euro' },
  { value: 'shopping', label: 'Shopping' },
]

function getProjectColorOption(color: ProjectCardColor | null) {
  return (
    PROJECT_COLOR_OPTIONS.find((colorOption) => colorOption.value === color) ??
    PROJECT_COLOR_OPTIONS[0]
  )
}

function getProjectCardStyle(color: ProjectCardColor | null) {
  const colorOption = getProjectColorOption(color)

  return {
    '--project-card-bg': colorOption.background,
    '--project-card-text': colorOption.text,
    '--project-card-icon': colorOption.icon,
  } as ProjectCardStyle
}

function getChoiceStyle(color: ProjectCardColor | null) {
  const colorOption = getProjectColorOption(color)

  return {
    '--choice-bg': colorOption.background,
    '--choice-text': colorOption.text,
  } as ChoiceStyle
}

function ProjectIconSvg({
  icon,
  className,
}: {
  icon: ProjectCardIcon
  className?: string
}) {
  switch (icon) {
    case 'house':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <path d="M10 30 32 12l22 18" />
          <path d="M16 28v24h32V28" />
          <path d="M27 52V38h10v14" />
        </svg>
      )
    case 'bicycle':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <circle cx="18" cy="44" r="11" />
          <circle cx="48" cy="44" r="11" />
          <path d="M18 44h12l8-18h-9" />
          <path d="M30 44 22 28h-6" />
          <path d="M38 26 48 44" />
          <path d="M37 18h9" />
        </svg>
      )
    case 'lightbulb':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <path d="M22 29a10 10 0 1 1 20 0c0 5-4 8-6 12h-8c-2-4-6-7-6-12Z" />
          <path d="M27 47h10" />
          <path d="M29 53h6" />
          <path d="M32 8v6" />
          <path d="M48 16l-4 4" />
          <path d="M16 16l4 4" />
        </svg>
      )
    case 'car':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <path d="M13 36h38l-5-14H18l-5 14Z" />
          <path d="M10 36v12h44V36" />
          <circle cx="20" cy="48" r="5" />
          <circle cx="44" cy="48" r="5" />
          <path d="M21 28h22" />
        </svg>
      )
    case 'running':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <circle cx="39" cy="13" r="6" />
          <path d="M35 22 24 32l10 8 7-12 8 7" />
          <path d="M34 40 25 56" />
          <path d="M34 40 48 54" />
          <path d="M24 32 13 34" />
        </svg>
      )
    case 'euro':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <path d="M48 17a20 20 0 1 0 0 30" />
          <path d="M14 28h28" />
          <path d="M14 37h25" />
        </svg>
      )
    case 'shopping':
      return (
        <svg className={className} aria-hidden="true" viewBox="0 0 64 64">
          <path d="M18 24h28l3 30H15l3-30Z" />
          <path d="M24 24a8 8 0 0 1 16 0" />
          <path d="M39 30h13l3 24H43" />
          <path d="M43 30a6 6 0 0 1 12 0" />
        </svg>
      )
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )
  const [newProjectName, setNewProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [editingProjectColor, setEditingProjectColor] =
    useState<ProjectCardColor | null>(null)
  const [editingProjectIcon, setEditingProjectIcon] =
    useState<ProjectCardIcon | null>(null)
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(
    null,
  )
  const [newTaskText, setNewTaskText] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [projectSubmitting, setProjectSubmitting] = useState(false)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [projectActionError, setProjectActionError] = useState<string | null>(
    null,
  )
  const [taskActionError, setTaskActionError] = useState<string | null>(null)

  const configError = getSupabaseConfigError()
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null
  const activeTasks = tasks.filter((task) => !task.completed)
  const completedTasks = tasks.filter((task) => task.completed)
  const homeMessages = [configError, projectsError, projectActionError].filter(
    Boolean,
  ) as string[]
  const taskMessages = [configError, tasksError, taskActionError].filter(
    Boolean,
  ) as string[]
  const authMessages = [configError, authError].filter(Boolean) as string[]

  function clearAppState() {
    setProjects([])
    setTasks([])
    setSelectedProjectId(null)
    setNewProjectName('')
    setEditingProjectId(null)
    setEditingProjectName('')
    setEditingProjectColor(null)
    setEditingProjectIcon(null)
    setActiveProjectMenuId(null)
    setNewTaskText('')
    setShowCompleted(false)
    setProjectsError(null)
    setTasksError(null)
    setProjectActionError(null)
    setTaskActionError(null)
    setProjectsLoading(false)
    setTasksLoading(false)
    setProjectSubmitting(false)
    setTaskSubmitting(false)
  }

  async function fetchProjects() {
    setProjectsLoading(true)
    setProjectsError(null)

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setProjects(data ?? [])
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    } finally {
      setProjectsLoading(false)
    }
  }

  async function fetchTasks(projectId: string) {
    setTasksLoading(true)
    setTasksError(null)

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      setTasks(data ?? [])
    } catch (error) {
      setTasksError(getErrorMessage(error))
    } finally {
      setTasksLoading(false)
    }
  }

  useEffect(() => {
    if (configError) {
      setSession(null)
      setSessionLoading(false)
      clearAppState()
      return
    }

    const supabase = getSupabaseClient()
    let isMounted = true

    const loadSession = async () => {
      setSessionLoading(true)

      try {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!isMounted) {
          return
        }

        setSession(data.session ?? null)

        if (!data.session) {
          clearAppState()
        }
      } catch (error) {
        if (!isMounted) {
          return
        }

        setAuthError(getErrorMessage(error))
        setSession(null)
        clearAppState()
      } finally {
        if (isMounted) {
          setSessionLoading(false)
        }
      }
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setSessionLoading(false)

      if (!nextSession) {
        clearAppState()
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [configError])

  useEffect(() => {
    if (!session || configError) {
      setProjects([])
      return
    }

    void fetchProjects()
  }, [configError, session?.user.id])

  useEffect(() => {
    if (!session || !selectedProjectId) {
      setTasks([])
      setTasksError(null)
      setTaskActionError(null)
      setNewTaskText('')
      setShowCompleted(false)
      return
    }

    if (configError) {
      setTasks([])
      return
    }

    setTasks([])
    void fetchTasks(selectedProjectId)
  }, [configError, selectedProjectId, session?.user.id])

  useEffect(() => {
    if (!selectedProjectId || projectsLoading) {
      return
    }

    const projectStillExists = projects.some(
      (project) => project.id === selectedProjectId,
    )

    if (!projectStillExists) {
      setSelectedProjectId(null)
      setTasks([])
    }
  }, [projects, projectsLoading, selectedProjectId])

  const handleSignIn = async () => {
    const email = authEmail.trim()
    const password = authPassword.trim()

    if (!email || !password) {
      setAuthError('Email and password are both required.')
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    setAuthLoading(true)
    setAuthError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!session) {
      setProjectActionError('You must be signed in to create a project.')
      return
    }

    const trimmedName = newProjectName.trim()
    if (!trimmedName) {
      setProjectActionError('Project name cannot be empty.')
      return
    }

    setProjectSubmitting(true)
    setProjectActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('projects').insert({
        name: trimmedName,
        user_id: session.user.id,
      })

      if (error) {
        throw error
      }

      setNewProjectName('')
      await fetchProjects()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
    } finally {
      setProjectSubmitting(false)
    }
  }

  const handleStartProjectEdit = (project: Project) => {
    setEditingProjectId(project.id)
    setEditingProjectName(project.name)
    setEditingProjectColor(project.card_color ?? null)
    setEditingProjectIcon(project.card_icon ?? null)
    setActiveProjectMenuId(null)
    setProjectActionError(null)
  }

  const handleCancelProjectEdit = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
    setEditingProjectColor(null)
    setEditingProjectIcon(null)
    setActiveProjectMenuId(null)
  }

  const handleSaveProjectEdit = async (projectId: string) => {
    if (!session) {
      setProjectActionError('You must be signed in to update a project.')
      return
    }

    const trimmedName = editingProjectName.trim()
    if (!trimmedName) {
      setProjectActionError('Project name cannot be empty.')
      return
    }

    setProjectSubmitting(true)
    setProjectActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('projects')
        .update({
          name: trimmedName,
          card_color: editingProjectColor,
          card_icon: editingProjectIcon,
        })
        .eq('id', projectId)

      if (error) {
        throw error
      }

      setEditingProjectId(null)
      setEditingProjectName('')
      setEditingProjectColor(null)
      setEditingProjectIcon(null)
      setActiveProjectMenuId(null)
      await fetchProjects()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
    } finally {
      setProjectSubmitting(false)
    }
  }

  const handleDeleteProject = async (project: Project) => {
    if (!session) {
      setProjectActionError('You must be signed in to delete a project.')
      return
    }

    const confirmed = window.confirm(
      `Delete "${project.name}" and all of its tasks?`,
    )

    if (!confirmed) {
      return
    }

    setProjectSubmitting(true)
    setProjectActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id)

      if (error) {
        throw error
      }

      if (editingProjectId === project.id) {
        setEditingProjectId(null)
        setEditingProjectName('')
        setEditingProjectColor(null)
        setEditingProjectIcon(null)
      }

      setActiveProjectMenuId(null)
      await fetchProjects()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
    } finally {
      setProjectSubmitting(false)
    }
  }

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setActiveProjectMenuId(null)
    setTaskActionError(null)
    setTasksError(null)
    setShowCompleted(false)
  }

  const handleBackToProjects = () => {
    setSelectedProjectId(null)
  }

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!session) {
      setTaskActionError('You must be signed in to create a task.')
      return
    }

    if (!selectedProjectId) {
      return
    }

    const trimmedText = newTaskText.trim()
    if (!trimmedText) {
      setTaskActionError('Task text cannot be empty.')
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').insert({
        project_id: selectedProjectId,
        text: trimmedText,
      })

      if (error) {
        throw error
      }

      setNewTaskText('')
      await fetchTasks(selectedProjectId)
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleToggleTask = async (task: Task) => {
    if (!session) {
      setTaskActionError('You must be signed in to update a task.')
      return
    }

    if (!selectedProjectId) {
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({ completed: !task.completed })
        .eq('id', task.id)

      if (error) {
        throw error
      }

      await fetchTasks(selectedProjectId)
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!session) {
      setTaskActionError('You must be signed in to delete a task.')
      return
    }

    if (!selectedProjectId) {
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').delete().eq('id', taskId)

      if (error) {
        throw error
      }

      await fetchTasks(selectedProjectId)
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  if (!session) {
    return (
      <main className="app-shell">
        <section className="panel auth-panel">
          <p className="eyebrow">Supabase Auth</p>
          <h1>Personal Ops Center</h1>
          <p className="intro">
            Sign in with your manually created Supabase user to access only your
            own projects and tasks.
          </p>

          {authMessages.length > 0 ? (
            <div className="message-stack">
              {authMessages.map((message, index) => (
                <p
                  key={`${index}-${message}`}
                  className="message-card error-message"
                >
                  {message}
                </p>
              ))}
            </div>
          ) : null}

          {sessionLoading ? (
            <p className="message-card info-message">Checking session...</p>
          ) : null}

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSignIn()
            }}
          >
            <label className="field-group">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={Boolean(configError) || authLoading || sessionLoading}
              />
            </label>

            <label className="field-group">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="At least 6 characters"
                autoComplete="current-password"
                disabled={Boolean(configError) || authLoading || sessionLoading}
              />
            </label>

            <div className="button-row auth-button-row">
              <button
                className="primary-button"
                type="submit"
                disabled={Boolean(configError) || authLoading || sessionLoading}
              >
                {authLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="panel app-panel">
        <div className="app-topbar">
          <div>
            <h1>Personal Ops Center</h1>
            <p className="intro">
              {selectedProject
                ? 'Track the tasks for one project at a time.'
                : 'Manage your project categories and keep each task list tidy.'}
            </p>
          </div>
          <div className="topbar-actions">
            <p className="session-note">
              Signed in as <strong>{session.user.email ?? 'your account'}</strong>
            </p>
            <button
              className="secondary-button sign-out-button"
              type="button"
              onClick={() => void handleSignOut()}
              disabled={authLoading}
            >
              {authLoading ? 'Signing Out...' : 'Sign Out'}
            </button>
          </div>
        </div>

        {selectedProject ? (
          <section className="screen-section">
            <div className="section-header">
              <button
                className="secondary-button"
                type="button"
                onClick={handleBackToProjects}
              >
                Back to Projects
              </button>
              <div>
                <p className="eyebrow">Project Tasks</p>
                <h2>{selectedProject.name}</h2>
              </div>
            </div>

            {taskMessages.length > 0 ? (
              <div className="message-stack">
                {taskMessages.map((message, index) => (
                  <p
                    key={`${index}-${message}`}
                    className="message-card error-message"
                  >
                    {message}
                  </p>
                ))}
              </div>
            ) : null}

            <form className="inline-form" onSubmit={handleCreateTask}>
              <label className="field-group">
                <span className="field-label">New task</span>
                <input
                  type="text"
                  value={newTaskText}
                  onChange={(event) => setNewTaskText(event.target.value)}
                  placeholder="Add a task for this project"
                  disabled={Boolean(configError) || taskSubmitting}
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={Boolean(configError) || taskSubmitting}
              >
                {taskSubmitting ? 'Saving...' : 'Add Task'}
              </button>
            </form>

            <section className="list-section">
              <div className="section-title-row">
                <h3>Active Tasks</h3>
                {tasksLoading ? (
                  <span className="section-note">Loading tasks...</span>
                ) : null}
              </div>

              {activeTasks.length > 0 ? (
                <ul className="task-list">
                  {activeTasks.map((task) => (
                    <li key={task.id} className="task-item">
                      <label className="task-toggle">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => void handleToggleTask(task)}
                          disabled={Boolean(configError) || taskSubmitting}
                        />
                        <span>{task.text}</span>
                      </label>
                      <button
                        className="icon-button danger-button"
                        type="button"
                        onClick={() => void handleDeleteTask(task.id)}
                        disabled={Boolean(configError) || taskSubmitting}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">
                  {tasksLoading
                    ? 'Loading your tasks...'
                    : completedTasks.length > 0
                      ? 'No active tasks right now. Everything is tucked into Completed.'
                      : 'No tasks yet. Add your first task above.'}
                </p>
              )}
            </section>

            <section className="list-section completed-section">
              <button
                className="completed-toggle"
                type="button"
                onClick={() => setShowCompleted((current) => !current)}
              >
                <span>Completed</span>
                <span>{showCompleted ? 'Hide' : 'Show'}</span>
                <span className="count-pill">{completedTasks.length}</span>
              </button>

              {showCompleted ? (
                completedTasks.length > 0 ? (
                  <ul className="task-list completed-list">
                    {completedTasks.map((task) => (
                      <li key={task.id} className="task-item completed-task-item">
                        <label className="task-toggle">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => void handleToggleTask(task)}
                            disabled={Boolean(configError) || taskSubmitting}
                          />
                          <span>{task.text}</span>
                        </label>
                        <button
                          className="icon-button danger-button"
                          type="button"
                          onClick={() => void handleDeleteTask(task.id)}
                          disabled={Boolean(configError) || taskSubmitting}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No completed tasks yet.</p>
                )
              ) : null}
            </section>
          </section>
        ) : (
          <section className="screen-section">
            <div className="section-header home-header">
              <div>
                <p className="eyebrow">Projects</p>
                <h2>Your Categories</h2>
              </div>
              {projectsLoading ? (
                <span className="section-note">Refreshing projects...</span>
              ) : null}
            </div>

            {homeMessages.length > 0 ? (
              <div className="message-stack">
                {homeMessages.map((message, index) => (
                  <p
                    key={`${index}-${message}`}
                    className="message-card error-message"
                  >
                    {message}
                  </p>
                ))}
              </div>
            ) : null}

            <form className="inline-form" onSubmit={handleCreateProject}>
              <label className="field-group">
                <span className="field-label">New project</span>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Apartment, Work, Errands..."
                  disabled={Boolean(configError) || projectSubmitting}
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={Boolean(configError) || projectSubmitting}
              >
                {projectSubmitting ? 'Saving...' : 'Add Project'}
              </button>
            </form>

            {projects.length > 0 ? (
              <ul className="project-grid">
                {projects.map((project) => {
                  const isEditing = editingProjectId === project.id
                  const isMenuOpen = activeProjectMenuId === project.id
                  const projectCardStyle = getProjectCardStyle(
                    project.card_color ?? null,
                  )
                  const projectCardClassName = [
                    'project-card',
                    project.card_color ? 'has-project-color' : '',
                    project.card_icon ? 'has-project-icon' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <li
                      key={project.id}
                      className={projectCardClassName}
                      style={projectCardStyle}
                    >
                      {isEditing ? (
                        <form
                          className="project-edit-block"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void handleSaveProjectEdit(project.id)
                          }}
                        >
                          <label className="field-group">
                            <span className="field-label">Project name</span>
                            <input
                              type="text"
                              value={editingProjectName}
                              onChange={(event) =>
                                setEditingProjectName(event.target.value)
                              }
                              disabled={projectSubmitting}
                            />
                          </label>
                          <fieldset className="project-choice-group">
                            <legend className="field-label">Card color</legend>
                            <div className="choice-grid color-choice-grid">
                              {PROJECT_COLOR_OPTIONS.map((colorOption) => {
                                const isSelected =
                                  editingProjectColor === colorOption.value

                                return (
                                  <button
                                    key={colorOption.value ?? 'none'}
                                    className={`choice-button color-choice-button${
                                      isSelected ? ' is-selected' : ''
                                    }`}
                                    type="button"
                                    style={getChoiceStyle(colorOption.value)}
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                      setEditingProjectColor(colorOption.value)
                                    }
                                    disabled={projectSubmitting}
                                  >
                                    <span className="color-choice-swatch" />
                                    <span>{colorOption.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </fieldset>
                          <fieldset className="project-choice-group">
                            <legend className="field-label">Card icon</legend>
                            <div className="choice-grid icon-choice-grid">
                              {PROJECT_ICON_OPTIONS.map((iconOption) => {
                                const isSelected =
                                  editingProjectIcon === iconOption.value

                                return (
                                  <button
                                    key={iconOption.value ?? 'none'}
                                    className={`choice-button icon-choice-button${
                                      isSelected ? ' is-selected' : ''
                                    }`}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                      setEditingProjectIcon(iconOption.value)
                                    }
                                    disabled={projectSubmitting}
                                  >
                                    {iconOption.value ? (
                                      <ProjectIconSvg
                                        icon={iconOption.value}
                                        className="choice-icon"
                                      />
                                    ) : (
                                      <span className="no-icon-mark" />
                                    )}
                                    <span>{iconOption.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </fieldset>
                          <div className="button-row">
                            <button
                              className="primary-button"
                              type="submit"
                              disabled={projectSubmitting}
                            >
                              Save
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={handleCancelProjectEdit}
                              disabled={projectSubmitting}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {project.card_icon ? (
                            <ProjectIconSvg
                              icon={project.card_icon}
                              className="project-card-watermark"
                            />
                          ) : null}
                          <div className="project-card-header">
                            <button
                              className="project-open-button"
                              type="button"
                              onClick={() => handleOpenProject(project.id)}
                            >
                              <strong>{project.name}</strong>
                            </button>
                            <button
                              className="project-menu-button"
                              type="button"
                              aria-expanded={isMenuOpen}
                              aria-label={`Edit ${project.name}`}
                              onClick={() =>
                                setActiveProjectMenuId((currentProjectId) =>
                                  currentProjectId === project.id
                                    ? null
                                    : project.id,
                                )
                              }
                              disabled={projectSubmitting}
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                focusable="false"
                              >
                                <path d="M15.2 5.2 18.8 8.8M4 20l4.2-1 11-11a2.6 2.6 0 0 0-3.7-3.7l-11 11L4 20Z" />
                              </svg>
                            </button>
                          </div>

                          {isMenuOpen ? (
                            <div className="project-action-menu">
                              <button
                                className="menu-action-button"
                                type="button"
                                onClick={() => handleStartProjectEdit(project)}
                                disabled={projectSubmitting}
                              >
                                Edit Project
                              </button>
                              <button
                                className="menu-action-button menu-danger-button"
                                type="button"
                                onClick={() => void handleDeleteProject(project)}
                                disabled={projectSubmitting}
                              >
                                Delete Project
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="empty-state">
                {projectsLoading
                  ? 'Loading your projects...'
                  : 'No projects yet. Add your first category above.'}
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

export default App
