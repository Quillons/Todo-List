import { useEffect, useState, type FormEvent } from 'react'
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
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )
  const [newProjectName, setNewProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
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
      setProjects([])
      setTasks([])
      return
    }

    void fetchProjects()
  }, [configError])

  useEffect(() => {
    if (!selectedProjectId) {
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
  }, [configError, selectedProjectId])

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

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

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
    setProjectActionError(null)
  }

  const handleCancelProjectEdit = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  const handleSaveProjectEdit = async (projectId: string) => {
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
      await fetchProjects()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
    } finally {
      setProjectSubmitting(false)
    }
  }

  const handleDeleteProject = async (project: Project) => {
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

      await fetchProjects()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
    } finally {
      setProjectSubmitting(false)
    }
  }

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setTaskActionError(null)
    setTasksError(null)
    setShowCompleted(false)
  }

  const handleBackToProjects = () => {
    setSelectedProjectId(null)
  }

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

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

  return (
    <main className="app-shell">
      <section className="panel app-panel">
        <h1>Personal Ops Center</h1>
        <p className="intro">
          {selectedProject
            ? 'Track the tasks for one project at a time.'
            : 'Manage your project categories and keep each task list tidy.'}
        </p>

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
                {taskMessages.map((message) => (
                  <p key={message} className="message-card error-message">
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
                {homeMessages.map((message) => (
                  <p key={message} className="message-card error-message">
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

                          <div className="button-row card-actions">
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleStartProjectEdit(project)}
                              disabled={projectSubmitting}
                            >
                              Edit
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              onClick={() => void handleDeleteProject(project)}
                              disabled={projectSubmitting}
                            >
                              Delete
                            </button>
                          </div>
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
