import {
  useEffect,
  useRef,
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

function capitalizeFirstLetter(value: string) {
  return value.replace(/^(\s*)([a-z])/, (_match, prefix, firstLetter) => {
    return `${prefix}${firstLetter.toUpperCase()}`
  })
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

type AppView = 'projects' | 'daily'

type DailyTask = Task & {
  project_name: string
}

type DailyTaskResponse = Task & {
  projects?: { name: string } | Array<{ name: string }> | null
}

type SwipeState = {
  x: number
  y: number
}

type TaskReorderGroup = 'daily' | 'active' | 'project-daily' | 'completed'

type TaskDragState = {
  id: string
  group: TaskReorderGroup
}

type TaskDragLayout = {
  group: TaskReorderGroup
  rows: Array<{
    id: string
    centerY: number
  }>
}

const SWIPE_THRESHOLD = 72
const SWIPE_IGNORE_VERTICAL = 16

function moveItem<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
) {
  const fromIndex = items.findIndex((item) => item.id === draggedId)
  const toIndex = items.findIndex((item) => item.id === targetId)

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items
  }

  const next = [...items]
  const [draggedItem] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, draggedItem)
  return next
}

function moveItemToIndex<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetIndex: number,
) {
  const draggedItem = items.find((item) => item.id === draggedId)

  if (!draggedItem) {
    return items
  }

  const next = items.filter((item) => item.id !== draggedId)
  const safeTargetIndex = Math.max(0, Math.min(targetIndex, next.length))
  next.splice(safeTargetIndex, 0, draggedItem)

  if (next.every((item, index) => item.id === items[index]?.id)) {
    return items
  }

  return next
}

function applySortOrder<T extends { sort_order: number | null }>(items: T[]) {
  return items.map((item, index) => ({ ...item, sort_order: index }))
}

function getTaskReorderItems(tasks: Task[], group: TaskReorderGroup) {
  switch (group) {
    case 'active':
      return tasks.filter((task) => !task.completed && !task.is_daily)
    case 'project-daily':
      return tasks.filter((task) => !task.completed && task.is_daily)
    case 'completed':
      return tasks.filter((task) => task.completed)
    case 'daily':
      return tasks
  }
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
  { value: 'running', label: 'Person' },
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

function getDailyProjectName(row: DailyTaskResponse) {
  if (Array.isArray(row.projects)) {
    return row.projects[0]?.name ?? ''
  }

  return row.projects?.name ?? ''
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
          <circle cx="32" cy="12" r="6" />
          <path d="M17 24h30" />
          <path d="M32 24v18" />
          <path d="M32 42h14" />
          <path d="M46 42l2 15" />
          <path d="M32 42 14 52" />
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

function CardStackIcon() {
  return (
    <span className="card-stack-icon" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function TaskRow({
  task,
  projectName,
  selected,
  selectable,
  swipeToDaily,
  reorderGroup,
  isDragging,
  disabled,
  onSelectChange,
  onComplete,
  onSendToDaily,
  onRemoveFromDaily,
  onDelete,
  onReorderDragStart,
  onReorderDragEnter,
  onReorderDragEnd,
}: {
  task: Task
  projectName?: string
  selected: boolean
  selectable: boolean
  swipeToDaily: boolean
  reorderGroup: TaskReorderGroup
  isDragging: boolean
  disabled: boolean
  onSelectChange: (taskId: string, selected: boolean) => void
  onComplete: (task: Task) => void
  onSendToDaily: (task: Task) => void
  onRemoveFromDaily: (task: Task) => void
  onDelete: (taskId: string) => void
  onReorderDragStart: (taskId: string, group: TaskReorderGroup) => void
  onReorderDragEnter: (taskId: string, group: TaskReorderGroup) => void
  onReorderDragEnd: () => void
}) {
  const swipeStart = useRef<SwipeState | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const canSwipeToDaily =
    swipeToDaily && !task.completed && !task.is_daily && !disabled
  const canSwipeToDelete = !disabled
  const canSwipe = canSwipeToDaily || canSwipeToDelete

  const resetSwipe = () => {
    swipeStart.current = null
    setSwipeOffset(0)
  }

  const rowClassName = [
    'task-item',
    task.completed ? 'completed-task-item' : '',
    task.is_daily ? 'daily-task-item' : '',
    canSwipe ? 'swipeable-task' : '',
    isDragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      className={rowClassName}
      data-task-id={task.id}
      data-task-group={reorderGroup}
      onDragEnter={(event) => {
        event.preventDefault()
        onReorderDragEnter(task.id, reorderGroup)
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      {canSwipeToDelete ? (
        <span className="swipe-action swipe-action-delete">Delete</span>
      ) : null}
      {canSwipeToDaily ? (
        <span className="swipe-action swipe-action-daily">Daily</span>
      ) : null}
      <div
        className="task-item-content"
        style={
          swipeOffset
            ? { transform: `translateX(${swipeOffset}px)` }
            : undefined
        }
        onPointerDown={(event) => {
          if (!canSwipe || event.pointerType === 'mouse') {
            return
          }

          swipeStart.current = {
            x: event.clientX,
            y: event.clientY,
          }
        }}
        onPointerMove={(event) => {
          if (!swipeStart.current) {
            return
          }

          const deltaX = event.clientX - swipeStart.current.x
          const deltaY = event.clientY - swipeStart.current.y

          if (
            Math.abs(deltaY) > Math.abs(deltaX) &&
            Math.abs(deltaY) > SWIPE_IGNORE_VERTICAL
          ) {
            resetSwipe()
            return
          }

          if (deltaX > 0 && canSwipeToDelete) {
            setSwipeOffset(Math.min(deltaX, SWIPE_THRESHOLD + 28))
          } else if (deltaX < 0 && canSwipeToDaily) {
            setSwipeOffset(Math.max(deltaX, -(SWIPE_THRESHOLD + 28)))
          }
        }}
        onPointerCancel={resetSwipe}
        onPointerUp={() => {
          if (!swipeStart.current) {
            return
          }

          if (swipeOffset >= SWIPE_THRESHOLD) {
            onDelete(task.id)
          } else if (swipeOffset <= -SWIPE_THRESHOLD) {
            onSendToDaily(task)
          }

          resetSwipe()
        }}
      >
        <button
          className="drag-handle task-drag-handle"
          type="button"
          aria-label={`Reorder ${task.text}`}
          title="Reorder"
          onPointerDown={(event) => {
            event.stopPropagation()

            if (disabled || !event.isPrimary || event.pointerType === 'touch') {
              return
            }

            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            onReorderDragStart(task.id, reorderGroup)
          }}
          onPointerMove={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerUp={(event) => {
            event.preventDefault()
            event.stopPropagation()

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }

            onReorderDragEnd()
          }}
          onPointerCancel={(event) => {
            event.stopPropagation()
            onReorderDragEnd()
          }}
          onTouchStart={(event) => {
            event.preventDefault()
            event.stopPropagation()

            if (disabled) {
              return
            }

            onReorderDragStart(task.id, reorderGroup)
          }}
          disabled={disabled}
        >
          <CardStackIcon />
        </button>
        {selectable ? (
          <input
            className="task-select"
            type="checkbox"
            aria-label={`Select ${task.text}`}
            checked={selected}
            onChange={(event) => onSelectChange(task.id, event.target.checked)}
            disabled={disabled}
          />
        ) : null}
        <button
          className="task-text-button"
          type="button"
          onClick={() => onComplete(task)}
          disabled={disabled || task.completed}
        >
          <span>{task.text}</span>
          {projectName ? <small>{projectName}</small> : null}
        </button>
        {task.is_daily && !task.completed && task.project_id ? (
          <div className="task-actions">
            <button
              className="icon-button secondary-button"
              type="button"
              onClick={() => onRemoveFromDaily(task)}
              disabled={disabled}
            >
              Remove Daily
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [appView, setAppView] = useState<AppView>('daily')
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  )
  const projectsRef = useRef<Project[]>([])
  const tasksRef = useRef<Task[]>([])
  const dailyTasksRef = useRef<DailyTask[]>([])
  const projectDragChangedRef = useRef(false)
  const taskDragChangedRef = useRef(false)
  const draggingProjectIdRef = useRef<string | null>(null)
  const draggingTaskRef = useRef<TaskDragState | null>(null)
  const taskDragLayoutRef = useRef<TaskDragLayout | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [editingProjectColor, setEditingProjectColor] =
    useState<ProjectCardColor | null>(null)
  const [editingProjectIcon, setEditingProjectIcon] =
    useState<ProjectCardIcon | null>(null)
  const [newTaskText, setNewTaskText] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [dailyTasksLoading, setDailyTasksLoading] = useState(false)
  const [projectSubmitting, setProjectSubmitting] = useState(false)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [dailyTasksError, setDailyTasksError] = useState<string | null>(null)
  const [projectActionError, setProjectActionError] = useState<string | null>(
    null,
  )
  const [taskActionError, setTaskActionError] = useState<string | null>(null)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(
    null,
  )
  const [draggingTask, setDraggingTask] = useState<TaskDragState | null>(null)

  const configError = getSupabaseConfigError()
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null
  const activeTasks = tasks.filter((task) => !task.completed && !task.is_daily)
  const projectDailyTasks = tasks.filter(
    (task) => !task.completed && task.is_daily,
  )
  const completedTasks = tasks.filter((task) => task.completed)
  const selectableTasks =
    appView === 'daily' && !selectedProject
      ? dailyTasks
      : tasks
  const selectedTasks = selectableTasks.filter((task) =>
    selectedTaskIds.has(task.id),
  )
  const homeMessages = [configError, projectsError, projectActionError].filter(
    Boolean,
  ) as string[]
  const taskMessages = [configError, tasksError, taskActionError].filter(
    Boolean,
  ) as string[]
  const dailyMessages = [
    configError,
    dailyTasksError,
    taskActionError,
  ].filter(Boolean) as string[]
  const authMessages = [configError, authError].filter(Boolean) as string[]
  const isBusy = taskSubmitting || Boolean(configError)

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    dailyTasksRef.current = dailyTasks
  }, [dailyTasks])

  function clearAppState() {
    setAppView('daily')
    setProjects([])
    setTasks([])
    setDailyTasks([])
    setSelectedProjectId(null)
    setSelectedTaskIds(new Set())
    setNewProjectName('')
    setEditingProjectId(null)
    setEditingProjectName('')
    setEditingProjectColor(null)
    setEditingProjectIcon(null)
    setNewTaskText('')
    setShowCompleted(false)
    setDraggingProjectId(null)
    setDraggingTask(null)
    draggingProjectIdRef.current = null
    draggingTaskRef.current = null
    taskDragLayoutRef.current = null
    setProjectsError(null)
    setTasksError(null)
    setDailyTasksError(null)
    setProjectActionError(null)
    setTaskActionError(null)
    setProjectsLoading(false)
    setTasksLoading(false)
    setDailyTasksLoading(false)
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
        .order('sort_order', { ascending: true, nullsFirst: false })
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
        .order('sort_order', { ascending: true, nullsFirst: false })
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

  async function fetchDailyTasks() {
    setDailyTasksLoading(true)
    setDailyTasksError(null)

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('is_daily', true)
        .eq('completed', false)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('daily_added_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const rows = (data ?? []) as DailyTaskResponse[]

      setDailyTasks(
        rows.map((row) => {
          const { projects: _projects, ...task } = row

          return {
            ...task,
            project_name: getDailyProjectName(row),
          }
        }),
      )
    } catch (error) {
      setDailyTasksError(getErrorMessage(error))
    } finally {
      setDailyTasksLoading(false)
    }
  }

  async function refreshTaskViews(projectId = selectedProjectId) {
    const refreshes = [fetchDailyTasks()]

    if (projectId) {
      refreshes.push(fetchTasks(projectId))
    }

    await Promise.all(refreshes)
  }

  function getVisibleProjectRefreshId(task: Task) {
    return selectedProjectId === task.project_id ? task.project_id : null
  }

  async function persistProjectOrder(orderedProjects: Project[]) {
    if (!session) {
      setProjectActionError('You must be signed in to reorder projects.')
      await fetchProjects()
      return
    }

    setProjectSubmitting(true)
    setProjectActionError(null)

    try {
      const supabase = getSupabaseClient()
      const updates = await Promise.all(
        orderedProjects.map((project, index) =>
          supabase
            .from('projects')
            .update({ sort_order: index })
            .eq('id', project.id),
        ),
      )
      const failedUpdate = updates.find((update) => update.error)

      if (failedUpdate?.error) {
        throw failedUpdate.error
      }

      await fetchProjects()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
      await fetchProjects()
    } finally {
      setProjectSubmitting(false)
    }
  }

  async function persistTaskOrder(orderedTasks: Task[]) {
    if (!session) {
      setTaskActionError('You must be signed in to reorder tasks.')
      await refreshTaskViews()
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const updates = await Promise.all(
        orderedTasks.map((task, index) =>
          supabase.from('tasks').update({ sort_order: index }).eq('id', task.id),
        ),
      )
      const failedUpdate = updates.find((update) => update.error)

      if (failedUpdate?.error) {
        throw failedUpdate.error
      }

      await refreshTaskViews()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
      await refreshTaskViews()
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleProjectDragStart = (projectId: string) => {
    projectDragChangedRef.current = false
    draggingProjectIdRef.current = projectId
    setDraggingProjectId(projectId)
    setProjectActionError(null)
  }

  const handleProjectDragEnter = (targetProjectId: string) => {
    const activeProjectId = draggingProjectIdRef.current

    if (!activeProjectId || activeProjectId === targetProjectId) {
      return
    }

    setProjects((current) => {
      const next = applySortOrder(
        moveItem(current, activeProjectId, targetProjectId),
      )
      projectsRef.current = next
      return next
    })
    projectDragChangedRef.current = true
  }

  const handleProjectDragEnd = () => {
    if (!draggingProjectIdRef.current) {
      return
    }

    const orderedProjects = projectsRef.current
    draggingProjectIdRef.current = null
    setDraggingProjectId(null)

    if (projectDragChangedRef.current) {
      void persistProjectOrder(orderedProjects)
    }
  }

  const handleProjectPointerMove = (clientX: number, clientY: number) => {
    if (!draggingProjectIdRef.current) {
      return
    }

    const targetElement = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-project-id]')
    const targetProjectId = targetElement?.dataset.projectId

    if (targetProjectId) {
      handleProjectDragEnter(targetProjectId)
    }
  }

  const handleTaskDragStart = (taskId: string, group: TaskReorderGroup) => {
    taskDragChangedRef.current = false
    const nextDraggingTask = { id: taskId, group }
    const dragRows = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-task-group="${group}"]`),
    )
      .filter((row) => row.dataset.taskId && row.dataset.taskId !== taskId)
      .map((row) => {
        const rect = row.getBoundingClientRect()

        return {
          id: row.dataset.taskId!,
          centerY: rect.top + rect.height / 2,
        }
      })

    draggingTaskRef.current = nextDraggingTask
    taskDragLayoutRef.current = {
      group,
      rows: dragRows,
    }
    setDraggingTask(nextDraggingTask)
    setTaskActionError(null)
  }

  const handleTaskDragEnter = (
    targetTaskId: string,
    group: TaskReorderGroup,
  ) => {
    if (
      !draggingTaskRef.current ||
      draggingTaskRef.current.group !== group ||
      draggingTaskRef.current.id === targetTaskId
    ) {
      return
    }

    const activeTaskId = draggingTaskRef.current.id

    if (group === 'daily') {
      setDailyTasks((current) => {
        const next = applySortOrder(
          moveItem(current, activeTaskId, targetTaskId),
        )
        dailyTasksRef.current = next
        return next
      })
      taskDragChangedRef.current = true
      return
    }

    setTasks((current) => {
      const groupItems = getTaskReorderItems(current, group)
      const reorderedItems = applySortOrder(
        moveItem(groupItems, activeTaskId, targetTaskId),
      )
      let reorderedIndex = 0
      const next = current.map((task) => {
        if (!groupItems.some((groupItem) => groupItem.id === task.id)) {
          return task
        }

        const reorderedTask = reorderedItems[reorderedIndex]
        reorderedIndex += 1
        return reorderedTask
      })
      tasksRef.current = next
      return next
    })
    taskDragChangedRef.current = true
  }

  const handleTaskDragToIndex = (
    targetIndex: number,
    group: TaskReorderGroup,
  ) => {
    if (!draggingTaskRef.current || draggingTaskRef.current.group !== group) {
      return
    }

    const activeTaskId = draggingTaskRef.current.id

    if (group === 'daily') {
      setDailyTasks((current) => {
        const movedItems = moveItemToIndex(current, activeTaskId, targetIndex)

        if (movedItems === current) {
          return current
        }

        const next = applySortOrder(movedItems)
        dailyTasksRef.current = next
        taskDragChangedRef.current = true
        return next
      })
      return
    }

    setTasks((current) => {
      const groupItems = getTaskReorderItems(current, group)
      const movedItems = moveItemToIndex(groupItems, activeTaskId, targetIndex)

      if (movedItems === groupItems) {
        return current
      }

      const reorderedItems = applySortOrder(movedItems)
      let reorderedIndex = 0
      const next = current.map((task) => {
        if (!groupItems.some((groupItem) => groupItem.id === task.id)) {
          return task
        }

        const reorderedTask = reorderedItems[reorderedIndex]
        reorderedIndex += 1
        return reorderedTask
      })
      tasksRef.current = next
      taskDragChangedRef.current = true
      return next
    })
  }

  const handleTaskDragEnd = () => {
    const activeDraggingTask = draggingTaskRef.current

    if (!activeDraggingTask) {
      return
    }

    const orderedTasks =
      activeDraggingTask.group === 'daily'
        ? dailyTasksRef.current
        : getTaskReorderItems(tasksRef.current, activeDraggingTask.group)

    draggingTaskRef.current = null
    taskDragLayoutRef.current = null
    setDraggingTask(null)

    if (taskDragChangedRef.current) {
      void persistTaskOrder(orderedTasks)
    }
  }

  const handleTaskPointerMove = (
    group: TaskReorderGroup,
    clientY: number,
  ) => {
    if (!draggingTaskRef.current || draggingTaskRef.current.group !== group) {
      return
    }

    const rows =
      taskDragLayoutRef.current?.group === group
        ? taskDragLayoutRef.current.rows
        : []

    const targetIndex = rows.findIndex((row) => clientY < row.centerY)

    handleTaskDragToIndex(
      targetIndex === -1 ? rows.length : targetIndex,
      group,
    )
  }

  useEffect(() => {
    if (!draggingTask) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault()
      handleTaskPointerMove(draggingTask.group, event.clientY)
    }

    const handlePointerEnd = (event: PointerEvent) => {
      event.preventDefault()
      handleTaskDragEnd()
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]

      if (!touch) {
        return
      }

      event.preventDefault()
      handleTaskPointerMove(draggingTask.group, touch.clientY)
    }

    const handleTouchEnd = (event: TouchEvent) => {
      event.preventDefault()
      handleTaskDragEnd()
    }

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', handlePointerEnd, { passive: false })
    window.addEventListener('pointercancel', handlePointerEnd, {
      passive: false,
    })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: false })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [draggingTask])

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
      setDailyTasks([])
      return
    }

    void fetchProjects()
    void fetchDailyTasks()
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
    setSelectedTaskIds(new Set())
  }, [appView, selectedProjectId])

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

    const trimmedName = capitalizeFirstLetter(newProjectName).trim()
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
        sort_order: projects.length,
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
    setProjectActionError(null)
  }

  const handleCancelProjectEdit = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
    setEditingProjectColor(null)
    setEditingProjectIcon(null)
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

      await fetchProjects()
      await fetchDailyTasks()
    } catch (error) {
      setProjectActionError(getErrorMessage(error))
    } finally {
      setProjectSubmitting(false)
    }
  }

  const handleOpenProject = (projectId: string) => {
    setAppView('projects')
    setSelectedProjectId(projectId)
    setTaskActionError(null)
    setTasksError(null)
    setShowCompleted(false)
  }

  const handleBackToProjects = () => {
    setSelectedProjectId(null)
  }

  const handleShowDailyTasks = () => {
    setAppView('daily')
    setSelectedProjectId(null)
    setTaskActionError(null)
    setDailyTasksError(null)
    void fetchDailyTasks()
  }

  const handleShowProjects = () => {
    setAppView('projects')
    setTaskActionError(null)
  }

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!session) {
      setTaskActionError('You must be signed in to create a task.')
      return
    }

    const isDailyTask = appView === 'daily' && !selectedProjectId

    if (!selectedProjectId && !isDailyTask) {
      return
    }

    const trimmedText = capitalizeFirstLetter(newTaskText).trim()
    if (!trimmedText) {
      setTaskActionError('Task text cannot be empty.')
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').insert(
        isDailyTask
          ? {
              project_id: null,
              user_id: session.user.id,
              text: trimmedText,
              is_daily: true,
              daily_added_at: new Date().toISOString(),
              sort_order: dailyTasks.length,
            }
          : {
              project_id: selectedProjectId,
              text: trimmedText,
              sort_order: tasks.length,
            },
      )

      if (error) {
        throw error
      }

      setNewTaskText('')
      if (isDailyTask) {
        await fetchDailyTasks()
      } else if (selectedProjectId) {
        await fetchTasks(selectedProjectId)
      }
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleSelectTask = (taskId: string, isSelected: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current)

      if (isSelected) {
        next.add(taskId)
      } else {
        next.delete(taskId)
      }

      return next
    })
  }

  const handleSendToDaily = async (task: Task) => {
    if (!session) {
      setTaskActionError('You must be signed in to update a task.')
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: false,
          is_daily: true,
          daily_added_at: new Date().toISOString(),
        })
        .eq('id', task.id)

      if (error) {
        throw error
      }

      setSelectedTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
      await refreshTaskViews(getVisibleProjectRefreshId(task))
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleRemoveFromDaily = async (task: Task) => {
    if (!session) {
      setTaskActionError('You must be signed in to update a task.')
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({
          is_daily: false,
          daily_added_at: null,
        })
        .eq('id', task.id)

      if (error) {
        throw error
      }

      setSelectedTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
      await refreshTaskViews(getVisibleProjectRefreshId(task))
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleCompleteTask = async (task: Task) => {
    if (!session) {
      setTaskActionError('You must be signed in to update a task.')
      return
    }

    if (task.completed) {
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: true,
          is_daily: false,
          daily_added_at: null,
        })
        .eq('id', task.id)

      if (error) {
        throw error
      }

      setSelectedTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
      await refreshTaskViews(getVisibleProjectRefreshId(task))
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

    const taskToDelete =
      tasks.find((task) => task.id === taskId) ??
      dailyTasks.find((task) => task.id === taskId) ??
      null

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').delete().eq('id', taskId)

      if (error) {
        throw error
      }

      setSelectedTaskIds((current) => {
        const next = new Set(current)
        next.delete(taskId)
        return next
      })
      await refreshTaskViews(
        taskToDelete ? getVisibleProjectRefreshId(taskToDelete) : selectedProjectId,
      )
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleBulkSendToDaily = async () => {
    const taskIds = selectedTasks
      .filter((task) => !task.completed && !task.is_daily)
      .map((task) => task.id)

    if (taskIds.length === 0) {
      setSelectedTaskIds(new Set())
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: false,
          is_daily: true,
          daily_added_at: new Date().toISOString(),
        })
        .in('id', taskIds)

      if (error) {
        throw error
      }

      setSelectedTaskIds(new Set())
      await refreshTaskViews()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleBulkComplete = async () => {
    const taskIds = selectedTasks
      .filter((task) => !task.completed)
      .map((task) => task.id)

    if (taskIds.length === 0) {
      setSelectedTaskIds(new Set())
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: true,
          is_daily: false,
          daily_added_at: null,
        })
        .in('id', taskIds)

      if (error) {
        throw error
      }

      setSelectedTaskIds(new Set())
      await refreshTaskViews()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    const taskIds = selectedTasks.map((task) => task.id)

    if (taskIds.length === 0) {
      return
    }

    const confirmed = window.confirm(
      `Delete ${taskIds.length} selected task${taskIds.length === 1 ? '' : 's'}?`,
    )

    if (!confirmed) {
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').delete().in('id', taskIds)

      if (error) {
        throw error
      }

      setSelectedTaskIds(new Set())
      await refreshTaskViews()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const renderBulkActions = () => {
    if (selectedTasks.length === 0) {
      return null
    }

    const canSendToDaily = selectedTasks.some(
      (task) => !task.completed && !task.is_daily,
    )
    const canComplete = selectedTasks.some((task) => !task.completed)

    return (
      <div className="bulk-action-bar" role="region" aria-label="Selected tasks">
        <span>{selectedTasks.length} selected</span>
        <div className="bulk-action-buttons">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleBulkSendToDaily()}
            disabled={isBusy || !canSendToDaily}
          >
            Send to Daily
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleBulkComplete()}
            disabled={isBusy || !canComplete}
          >
            Complete
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={isBusy}
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  const renderTaskRow = (
    task: Task,
    options: {
      projectName?: string
      swipeToDaily?: boolean
      selectable?: boolean
      reorderGroup?: TaskReorderGroup
    } = {},
  ) => (
    <TaskRow
      key={task.id}
      task={task}
      projectName={options.projectName}
      selected={selectedTaskIds.has(task.id)}
      selectable={options.selectable ?? !task.completed}
      swipeToDaily={options.swipeToDaily ?? false}
      reorderGroup={options.reorderGroup ?? 'active'}
      isDragging={draggingTask?.id === task.id}
      disabled={isBusy}
      onSelectChange={handleSelectTask}
      onComplete={(nextTask) => void handleCompleteTask(nextTask)}
      onSendToDaily={(nextTask) => void handleSendToDaily(nextTask)}
      onRemoveFromDaily={(nextTask) => void handleRemoveFromDaily(nextTask)}
      onDelete={(taskId) => void handleDeleteTask(taskId)}
      onReorderDragStart={handleTaskDragStart}
      onReorderDragEnter={handleTaskDragEnter}
      onReorderDragEnd={handleTaskDragEnd}
    />
  )

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
              {appView === 'daily'
                ? 'Review the tasks pulled into today from every project.'
                : selectedProject
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

        <nav className="view-tabs" aria-label="Main views">
          <button
            className={appView === 'projects' ? 'is-selected' : ''}
            type="button"
            onClick={handleShowProjects}
            aria-pressed={appView === 'projects'}
          >
            Projects
          </button>
          <button
            className={appView === 'daily' ? 'is-selected' : ''}
            type="button"
            onClick={handleShowDailyTasks}
            aria-pressed={appView === 'daily'}
          >
            Daily Tasks
            <span className="count-pill">{dailyTasks.length}</span>
          </button>
        </nav>

        {appView === 'daily' ? (
          <section className="screen-section">
            <div className="section-header home-header">
              <div>
                <p className="eyebrow">Daily Tasks</p>
                <h2>Today's Bucket</h2>
              </div>
              {dailyTasksLoading ? (
                <span className="section-note">Refreshing daily tasks...</span>
              ) : null}
            </div>

            {dailyMessages.length > 0 ? (
              <div className="message-stack">
                {dailyMessages.map((message, index) => (
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
                  onChange={(event) =>
                    setNewTaskText(capitalizeFirstLetter(event.target.value))
                  }
                  placeholder="Add a daily task"
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

            {renderBulkActions()}

            <section className="list-section daily-list-section">
              {dailyTasks.length > 0 ? (
                <ul className="task-list">
                  {dailyTasks.map((task) =>
                    renderTaskRow(task, {
                      projectName: task.project_name,
                      reorderGroup: 'daily',
                    }),
                  )}
                </ul>
              ) : (
                <p className="empty-state">
                  {dailyTasksLoading
                    ? 'Loading your daily tasks...'
                    : 'No tasks in Daily Tasks yet.'}
                </p>
              )}
            </section>
          </section>
        ) : selectedProject ? (
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
                  onChange={(event) =>
                    setNewTaskText(capitalizeFirstLetter(event.target.value))
                  }
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

            {renderBulkActions()}

            <section className="list-section">
              <div className="section-title-row">
                <h3>Active Tasks</h3>
                {tasksLoading ? (
                  <span className="section-note">Loading tasks...</span>
                ) : null}
              </div>

              {activeTasks.length > 0 ? (
                <ul className="task-list">
                  {activeTasks.map((task) =>
                    renderTaskRow(task, {
                      swipeToDaily: true,
                      reorderGroup: 'active',
                    }),
                  )}
                </ul>
              ) : (
                <p className="empty-state">
                  {tasksLoading
                    ? 'Loading your tasks...'
                    : projectDailyTasks.length > 0 || completedTasks.length > 0
                      ? 'No active tasks right now.'
                      : 'No tasks yet. Add your first task above.'}
                </p>
              )}
            </section>

            <section className="list-section daily-project-section">
              <div className="section-title-row">
                <h3>Tasks on Daily Task</h3>
                <span className="count-pill">{projectDailyTasks.length}</span>
              </div>

              {projectDailyTasks.length > 0 ? (
                <ul className="task-list">
                  {projectDailyTasks.map((task) =>
                    renderTaskRow(task, { reorderGroup: 'project-daily' }),
                  )}
                </ul>
              ) : (
                <p className="empty-state">No tasks from this project are in Daily.</p>
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
                    {completedTasks.map((task) =>
                      renderTaskRow(task, {
                        selectable: true,
                        reorderGroup: 'completed',
                      }),
                    )}
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

            {projects.length > 0 ? (
              <ul className="project-grid">
                {projects.map((project) => {
                  const isEditing = editingProjectId === project.id
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
                      className={`${projectCardClassName}${
                        draggingProjectId === project.id ? ' is-dragging' : ''
                      }`}
                      style={projectCardStyle}
                      data-project-id={project.id}
                      onDragEnter={(event) => {
                        event.preventDefault()
                        handleProjectDragEnter(project.id)
                      }}
                      onDragOver={(event) => event.preventDefault()}
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
                            <button
                              className="danger-button"
                              type="button"
                              onClick={() => void handleDeleteProject(project)}
                              disabled={projectSubmitting}
                            >
                              Delete Project
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
                              className="drag-handle project-drag-handle"
                              type="button"
                              aria-label={`Reorder ${project.name}`}
                              title="Reorder"
                              onPointerDown={(event) => {
                                if (projectSubmitting || !event.isPrimary) {
                                  return
                                }

                                event.currentTarget.setPointerCapture(
                                  event.pointerId,
                                )
                                handleProjectDragStart(project.id)
                              }}
                              onPointerMove={(event) => {
                                if (
                                  !event.currentTarget.hasPointerCapture(
                                    event.pointerId,
                                  )
                                ) {
                                  return
                                }

                                handleProjectPointerMove(
                                  event.clientX,
                                  event.clientY,
                                )
                              }}
                              onPointerUp={(event) => {
                                if (
                                  event.currentTarget.hasPointerCapture(
                                    event.pointerId,
                                  )
                                ) {
                                  event.currentTarget.releasePointerCapture(
                                    event.pointerId,
                                  )
                                }

                                handleProjectDragEnd()
                              }}
                              onPointerCancel={handleProjectDragEnd}
                              disabled={projectSubmitting}
                            >
                              <CardStackIcon />
                            </button>
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
                              aria-label={`Edit ${project.name}`}
                              onClick={() => handleStartProjectEdit(project)}
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
                  : 'No projects yet. Add your first category below.'}
              </p>
            )}

            <form className="inline-form" onSubmit={handleCreateProject}>
              <label className="field-group">
                <span className="field-label">New project</span>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(event) =>
                    setNewProjectName(capitalizeFirstLetter(event.target.value))
                  }
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
          </section>
        )}
      </section>
    </main>
  )
}

export default App
