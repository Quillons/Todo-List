import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getSupabaseClient,
  getSupabaseConfigError,
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
    setActiveProjectMenuId(null)
    setProjectActionError(null)
  }

  const handleCancelProjectEdit = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
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
        .update({ name: trimmedName })
        .eq('id', projectId)

      if (error) {
        throw error
      }

      setEditingProjectId(null)
      setEditingProjectName('')
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
              className="secondary-button"
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

                  return (
                    <li key={project.id} className="project-card">
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
                          <div className="project-card-header">
                            <button
                              className="project-open-button"
                              type="button"
                              onClick={() => handleOpenProject(project.id)}
                            >
                              <strong>{project.name}</strong>
                              <span>
                                Tap to open this project&apos;s task list.
                              </span>
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
                                Rename Project
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
