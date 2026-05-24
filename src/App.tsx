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
  type TaskExpectedTime,
  type TaskRepeatType,
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

type AppView = 'projects' | 'daily' | 'grocery' | 'pick'

type DailyTask = Task & {
  project_name: string
}

type DailyTaskResponse = Task & {
  projects?: { name: string } | Array<{ name: string }> | null
}

type PickerTask = Task & {
  project_name: string
}

type PickerTaskResponse = DailyTaskResponse

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

const TASK_REPEAT_OPTIONS: Array<{
  value: TaskRepeatType
  label: string
}> = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'workdays', label: 'Workdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const TASK_EXPECTED_TIME_OPTIONS: Array<{
  value: TaskExpectedTime | ''
  label: string
}> = [
  { value: '', label: 'No estimate' },
  { value: '5_minutes', label: '5 minutes' },
  { value: '15_minutes', label: '15 minutes' },
  { value: '30_minutes', label: '30 minutes' },
  { value: '1_hour_plus', label: '1+ hour' },
]

const PHYSICAL_ENERGY_OPTIONS = [
  { value: 1, label: 'Blanket Burrito' },
  { value: 2, label: 'House Cat' },
  { value: 3, label: 'Errand Capable' },
  { value: 4, label: 'Borderline Athletic' },
  { value: 5, label: 'Laborador Retriever' },
]

const MENTAL_ENERGY_OPTIONS = [
  { value: 1, label: 'Everything Sounds Hard' },
  { value: 2, label: 'Depends on How Annoying It Is' },
  { value: 3, label: 'Momentum Possible' },
  { value: 4, label: "Let's Do Things" },
  { value: 5, label: 'Fully Activated' },
]

const TASK_REQUIREMENT_OPTIONS = [
  { value: '', label: 'Not assigned' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
]

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseLocalDateKey(dateKey: string | null) {
  if (!dateKey) {
    return null
  }

  const [year, month, day] = dateKey.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function getTaskRepeatType(task: Task) {
  return TASK_REPEAT_OPTIONS.some((option) => option.value === task.repeat_type)
    ? task.repeat_type
    : 'none'
}

function isRecurringTask(task: Task) {
  return getTaskRepeatType(task) !== 'none'
}

function isTaskDueBy(task: Task, dateKey: string) {
  return Boolean(task.deadline_date && task.deadline_date <= dateKey)
}

function doesTaskRepeatOn(task: Task, dateKey: string) {
  if (!isRecurringTask(task)) {
    return false
  }

  const startDate = parseLocalDateKey(task.repeat_start_date)
  const targetDate = parseLocalDateKey(dateKey)

  if (!startDate || !targetDate || dateKey < task.repeat_start_date!) {
    return false
  }

  const targetDay = targetDate.getDay()

  switch (getTaskRepeatType(task)) {
    case 'daily':
      return true
    case 'workdays':
      return targetDay >= 1 && targetDay <= 5
    case 'weekends':
      return targetDay === 0 || targetDay === 6
    case 'weekly':
      return targetDay === startDate.getDay()
    case 'monthly': {
      const expectedDay = Math.min(
        startDate.getDate(),
        getDaysInMonth(targetDate.getFullYear(), targetDate.getMonth()),
      )

      return targetDate.getDate() === expectedDay
    }
    case 'yearly': {
      if (targetDate.getMonth() !== startDate.getMonth()) {
        return false
      }

      const expectedDay = Math.min(
        startDate.getDate(),
        getDaysInMonth(targetDate.getFullYear(), targetDate.getMonth()),
      )

      return targetDate.getDate() === expectedDay
    }
    case 'none':
      return false
  }
}

function shouldShowInDaily(
  task: Task,
  dateKey: string,
  completedRepeatTaskIds: Set<string>,
) {
  const repeatsToday = doesTaskRepeatOn(task, dateKey)

  if (isRecurringTask(task) && completedRepeatTaskIds.has(task.id)) {
    return false
  }

  return task.is_daily || isTaskDueBy(task, dateKey) || repeatsToday
}

function getRepeatLabel(repeatType: TaskRepeatType) {
  return (
    TASK_REPEAT_OPTIONS.find((option) => option.value === repeatType)?.label ??
    'Does not repeat'
  )
}

function getEnergyLabel(
  options: Array<{ value: number; label: string }>,
  value: number,
) {
  return options.find((option) => option.value === value)?.label ?? `${value}`
}

function getTaskRequirement(value: number | null) {
  return value ?? 3
}

function getProjectName(row: DailyTaskResponse) {
  return getDailyProjectName(row) || 'Daily Tasks'
}

function formatDateLabel(dateKey: string) {
  const date = parseLocalDateKey(dateKey)

  if (!date) {
    return dateKey
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

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

function TaskMetaBadges({ task }: { task: Task }) {
  const repeatType = getTaskRepeatType(task)
  const badges = [
    repeatType !== 'none' ? `Repeats ${getRepeatLabel(repeatType)}` : null,
    task.deadline_date ? `Due ${formatDateLabel(task.deadline_date)}` : null,
  ].filter(Boolean) as string[]

  if (badges.length === 0) {
    return null
  }

  return (
    <span className="task-meta-badges" aria-label="Task details">
      {badges.map((badge) => (
        <span className="task-meta-badge" key={badge}>
          {badge}
        </span>
      ))}
    </span>
  )
}

function TaskExpectedTimeButtons({
  value,
  disabled,
  onChange,
}: {
  value: TaskExpectedTime | ''
  disabled: boolean
  onChange: (value: TaskExpectedTime | '') => void
}) {
  return (
    <fieldset className="task-option-row">
      <legend className="field-label">Expected Time</legend>
      <div className="task-option-buttons">
        {TASK_EXPECTED_TIME_OPTIONS.map((option) => (
          <button
            className={`task-option-button${
              value === option.value ? ' is-selected' : ''
            }`}
            type="button"
            key={option.value || 'none'}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function TaskRequirementButtons({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="task-option-row">
      <legend className="field-label">{label}</legend>
      <div className="task-option-buttons">
        {TASK_REQUIREMENT_OPTIONS.map((option) => (
          <button
            className={`task-option-button${
              value === option.value ? ' is-selected' : ''
            }`}
            type="button"
            key={option.value || 'none'}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function TaskRow({
  task,
  projectName,
  selected,
  selectable,
  swipeToDaily,
  reorderGroup,
  editing,
  editText,
  editRepeatType,
  editRepeatStartDate,
  editDeadlineDate,
  editExpectedTime,
  editShopping,
  editMentalEffort,
  editPhysicalEffort,
  isDragging,
  disabled,
  onSelectChange,
  onComplete,
  onSendToDaily,
  onRemoveFromDaily,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditTextChange,
  onEditRepeatTypeChange,
  onEditRepeatStartDateChange,
  onEditDeadlineDateChange,
  onEditExpectedTimeChange,
  onEditShoppingChange,
  onEditMentalEffortChange,
  onEditPhysicalEffortChange,
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
  editing: boolean
  editText: string
  editRepeatType: TaskRepeatType
  editRepeatStartDate: string
  editDeadlineDate: string
  editExpectedTime: TaskExpectedTime | ''
  editShopping: boolean
  editMentalEffort: string
  editPhysicalEffort: string
  isDragging: boolean
  disabled: boolean
  onSelectChange: (taskId: string, selected: boolean) => void
  onComplete: (task: Task) => void
  onSendToDaily: (task: Task) => void
  onRemoveFromDaily: (task: Task) => void
  onDelete: (taskId: string) => void
  onStartEdit: (task: Task) => void
  onCancelEdit: () => void
  onSaveEdit: (task: Task) => void
  onEditTextChange: (value: string) => void
  onEditRepeatTypeChange: (value: TaskRepeatType) => void
  onEditRepeatStartDateChange: (value: string) => void
  onEditDeadlineDateChange: (value: string) => void
  onEditExpectedTimeChange: (value: TaskExpectedTime | '') => void
  onEditShoppingChange: (value: boolean) => void
  onEditMentalEffortChange: (value: string) => void
  onEditPhysicalEffortChange: (value: string) => void
  onReorderDragStart: (taskId: string, group: TaskReorderGroup) => void
  onReorderDragEnter: (taskId: string, group: TaskReorderGroup) => void
  onReorderDragEnd: () => void
}) {
  const swipeStart = useRef<SwipeState | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const canSwipeToDaily =
    swipeToDaily && !task.completed && !task.is_daily && !disabled && !editing
  const canSwipeToDelete = !disabled && !editing
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
    editing ? 'is-editing' : '',
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
          <span className="task-title">{task.text}</span>
          {projectName ? <small>{projectName}</small> : null}
          <TaskMetaBadges task={task} />
        </button>
        <div className="task-actions">
          {task.is_daily && !task.completed && task.project_id ? (
            <button
              className="icon-button secondary-button"
              type="button"
              onClick={() => onRemoveFromDaily(task)}
              disabled={disabled}
            >
              Remove Daily
            </button>
          ) : null}
          <button
            className="icon-button secondary-button"
            type="button"
            onClick={() => {
              if (editing) {
                onCancelEdit()
                return
              }

              onStartEdit(task)
            }}
            disabled={disabled}
          >
            Edit
          </button>
        </div>
      </div>
      {editing ? (
        <form
          className="task-edit-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSaveEdit(task)
          }}
        >
          <label className="field-group">
            <span className="field-label">Task</span>
            <input
              type="text"
              value={editText}
              onChange={(event) =>
                onEditTextChange(capitalizeFirstLetter(event.target.value))
              }
              disabled={disabled}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Repeats</span>
            <select
              value={editRepeatType}
              onChange={(event) =>
                onEditRepeatTypeChange(event.target.value as TaskRepeatType)
              }
              disabled={disabled}
            >
              {TASK_REPEAT_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-group">
            <span className="field-label">Repeat start</span>
            <input
              type="date"
              value={editRepeatStartDate}
              onChange={(event) =>
                onEditRepeatStartDateChange(event.target.value)
              }
              required={editRepeatType !== 'none'}
              disabled={disabled || editRepeatType === 'none'}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Deadline</span>
            <input
              type="date"
              value={editDeadlineDate}
              onChange={(event) => onEditDeadlineDateChange(event.target.value)}
              disabled={disabled}
            />
          </label>
          <TaskExpectedTimeButtons
            value={editExpectedTime}
            onChange={onEditExpectedTimeChange}
            disabled={disabled}
          />
          <TaskRequirementButtons
            label="Mental effort"
            value={editMentalEffort}
            onChange={onEditMentalEffortChange}
            disabled={disabled}
          />
          <TaskRequirementButtons
            label="Physical effort"
            value={editPhysicalEffort}
            onChange={onEditPhysicalEffortChange}
            disabled={disabled}
          />
          <label className="checkbox-field">
            <span className="field-label">Shopping:</span>
            <input
              type="checkbox"
              checked={editShopping}
              onChange={(event) => onEditShoppingChange(event.target.checked)}
              disabled={disabled}
            />
          </label>
          <div className="task-edit-actions">
            <button className="primary-button" type="submit" disabled={disabled}>
              Save
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={onCancelEdit}
              disabled={disabled}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
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
  const [groceryItems, setGroceryItems] = useState<Task[]>([])
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
  const [showTaskCreateForm, setShowTaskCreateForm] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskRepeatType, setNewTaskRepeatType] =
    useState<TaskRepeatType>('none')
  const [newTaskRepeatStartDate, setNewTaskRepeatStartDate] = useState(
    getLocalDateKey,
  )
  const [newTaskDeadlineDate, setNewTaskDeadlineDate] = useState('')
  const [newTaskExpectedTime, setNewTaskExpectedTime] = useState<
    TaskExpectedTime | ''
  >('')
  const [newTaskShopping, setNewTaskShopping] = useState(false)
  const [newTaskMentalEffort, setNewTaskMentalEffort] = useState('')
  const [newTaskPhysicalEffort, setNewTaskPhysicalEffort] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskText, setEditingTaskText] = useState('')
  const [editingTaskRepeatType, setEditingTaskRepeatType] =
    useState<TaskRepeatType>('none')
  const [editingTaskRepeatStartDate, setEditingTaskRepeatStartDate] =
    useState(getLocalDateKey)
  const [editingTaskDeadlineDate, setEditingTaskDeadlineDate] = useState('')
  const [editingTaskExpectedTime, setEditingTaskExpectedTime] = useState<
    TaskExpectedTime | ''
  >('')
  const [editingTaskShopping, setEditingTaskShopping] = useState(false)
  const [editingTaskMentalEffort, setEditingTaskMentalEffort] = useState('')
  const [editingTaskPhysicalEffort, setEditingTaskPhysicalEffort] = useState('')
  const [pickerMentalEnergy, setPickerMentalEnergy] = useState(3)
  const [pickerPhysicalEnergy, setPickerPhysicalEnergy] = useState(3)
  const [pickedTask, setPickedTask] = useState<PickerTask | null>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [newGroceryItemText, setNewGroceryItemText] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [dailyTasksLoading, setDailyTasksLoading] = useState(false)
  const [groceryItemsLoading, setGroceryItemsLoading] = useState(false)
  const [projectSubmitting, setProjectSubmitting] = useState(false)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [grocerySubmitting, setGrocerySubmitting] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [dailyTasksError, setDailyTasksError] = useState<string | null>(null)
  const [groceryItemsError, setGroceryItemsError] = useState<string | null>(
    null,
  )
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
  const groceryMessages = [configError, groceryItemsError, taskActionError].filter(
    Boolean,
  ) as string[]
  const pickerMessages = [configError, pickerError].filter(Boolean) as string[]
  const authMessages = [configError, authError].filter(Boolean) as string[]
  const isBusy = taskSubmitting || Boolean(configError)
  const isGroceryBusy = grocerySubmitting || Boolean(configError)

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    dailyTasksRef.current = dailyTasks
  }, [dailyTasks])

  function resetNewTaskForm() {
    setShowTaskCreateForm(false)
    setNewTaskText('')
    setNewTaskRepeatType('none')
    setNewTaskRepeatStartDate(getLocalDateKey())
    setNewTaskDeadlineDate('')
    setNewTaskExpectedTime('')
    setNewTaskShopping(false)
    setNewTaskMentalEffort('')
    setNewTaskPhysicalEffort('')
  }

  function clearAppState() {
    setAppView('daily')
    setProjects([])
    setTasks([])
    setDailyTasks([])
    setGroceryItems([])
    setSelectedProjectId(null)
    setSelectedTaskIds(new Set())
    setNewProjectName('')
    setEditingProjectId(null)
    setEditingProjectName('')
    setEditingProjectColor(null)
    setEditingProjectIcon(null)
    resetNewTaskForm()
    setEditingTaskId(null)
    setEditingTaskText('')
    setEditingTaskRepeatType('none')
    setEditingTaskRepeatStartDate(getLocalDateKey())
    setEditingTaskDeadlineDate('')
    setEditingTaskExpectedTime('')
    setEditingTaskShopping(false)
    setEditingTaskMentalEffort('')
    setEditingTaskPhysicalEffort('')
    setPickedTask(null)
    setPickerError(null)
    setPickerLoading(false)
    setNewGroceryItemText('')
    setShowCompleted(false)
    setDraggingProjectId(null)
    setDraggingTask(null)
    draggingProjectIdRef.current = null
    draggingTaskRef.current = null
    taskDragLayoutRef.current = null
    setProjectsError(null)
    setTasksError(null)
    setDailyTasksError(null)
    setGroceryItemsError(null)
    setProjectActionError(null)
    setTaskActionError(null)
    setProjectsLoading(false)
    setTasksLoading(false)
    setDailyTasksLoading(false)
    setGroceryItemsLoading(false)
    setProjectSubmitting(false)
    setTaskSubmitting(false)
    setGrocerySubmitting(false)
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
      const todayKey = getLocalDateKey()
      const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('completed', false)
        .or(
          `is_daily.eq.true,deadline_date.lte.${todayKey},repeat_type.neq.none`,
        )
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('daily_added_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const rows = (data ?? []) as DailyTaskResponse[]
      const repeatingTaskIds = rows
        .filter((row) => isRecurringTask(row))
        .map((row) => row.id)
      let completedRepeatTaskIds = new Set<string>()

      if (repeatingTaskIds.length > 0) {
        const { data: completionData, error: completionError } = await supabase
          .from('task_occurrence_completions')
          .select('task_id')
          .eq('occurrence_date', todayKey)
          .in('task_id', repeatingTaskIds)

        if (completionError) {
          throw completionError
        }

        completedRepeatTaskIds = new Set(
          (completionData ?? []).map((completion) => completion.task_id),
        )
      }

      setDailyTasks(
        rows
          .filter((row) =>
            shouldShowInDaily(row, todayKey, completedRepeatTaskIds),
          )
          .map((row) => {
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

  async function fetchGroceryItems() {
    setGroceryItemsLoading(true)
    setGroceryItemsError(null)

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .is('project_id', null)
        .eq('is_daily', false)
        .eq('completed', false)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      setGroceryItems(data ?? [])
    } catch (error) {
      setGroceryItemsError(getErrorMessage(error))
    } finally {
      setGroceryItemsLoading(false)
    }
  }

  function choosePickerTask(
    candidates: PickerTask[],
    currentTaskId: string | null,
  ) {
    const selectableCandidates =
      currentTaskId && candidates.length > 1
        ? candidates.filter((task) => task.id !== currentTaskId)
        : candidates

    if (selectableCandidates.length === 0) {
      return null
    }

    const scoredCandidates = selectableCandidates.map((task) => ({
      task,
      score:
        Math.abs(getTaskRequirement(task.mental_effort) - pickerMentalEnergy) +
        Math.abs(
          getTaskRequirement(task.physical_effort) - pickerPhysicalEnergy,
        ),
    }))
    const bestScore = Math.min(
      ...scoredCandidates.map((candidate) => candidate.score),
    )
    const bestCandidates = scoredCandidates
      .filter((candidate) => candidate.score === bestScore)
      .map((candidate) => candidate.task)

    return bestCandidates[Math.floor(Math.random() * bestCandidates.length)]
  }

  async function handlePickTask() {
    if (!session) {
      setPickerError('You must be signed in to pick a task.')
      return
    }

    setPickerLoading(true)
    setPickerError(null)

    try {
      const supabase = getSupabaseClient()
      const todayKey = getLocalDateKey()
      const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('completed', false)
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const rows = (data ?? []) as PickerTaskResponse[]
      const repeatingTaskIds = rows
        .filter((row) => isRecurringTask(row))
        .map((row) => row.id)
      let completedRepeatTaskIds = new Set<string>()

      if (repeatingTaskIds.length > 0) {
        const { data: completionData, error: completionError } = await supabase
          .from('task_occurrence_completions')
          .select('task_id')
          .eq('occurrence_date', todayKey)
          .in('task_id', repeatingTaskIds)

        if (completionError) {
          throw completionError
        }

        completedRepeatTaskIds = new Set(
          (completionData ?? []).map((completion) => completion.task_id),
        )
      }

      const candidates = rows
        .filter((row) => !Boolean(row.shopping))
        .filter(
          (row) =>
            row.project_id !== null ||
            row.is_daily ||
            isTaskDueBy(row, todayKey) ||
            doesTaskRepeatOn(row, todayKey),
        )
        .filter((row) => {
          if (!isRecurringTask(row)) {
            return true
          }

          return !completedRepeatTaskIds.has(row.id)
        })
        .map((row) => {
          const { projects: _projects, ...task } = row

          return {
            ...task,
            project_name: getProjectName(row),
          }
        })

      const nextTask = choosePickerTask(candidates, pickedTask?.id ?? null)

      if (!nextTask) {
        setPickedTask(null)
        setPickerError('No matching non-shopping tasks are available.')
        return
      }

      setPickedTask(nextTask)
    } catch (error) {
      setPickerError(getErrorMessage(error))
    } finally {
      setPickerLoading(false)
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
      setGroceryItems([])
      return
    }

    void fetchProjects()
    void fetchDailyTasks()
    void fetchGroceryItems()
  }, [configError, session?.user.id])

  useEffect(() => {
    if (!session || !selectedProjectId) {
      setTasks([])
      setTasksError(null)
      setTaskActionError(null)
      resetNewTaskForm()
      setEditingTaskId(null)
      setEditingTaskText('')
      setEditingTaskRepeatType('none')
      setEditingTaskRepeatStartDate(getLocalDateKey())
      setEditingTaskDeadlineDate('')
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
    resetNewTaskForm()
    setTaskActionError(null)
    setTasksError(null)
    setShowCompleted(false)
  }

  const handleBackToProjects = () => {
    resetNewTaskForm()
    setSelectedProjectId(null)
  }

  const handleShowDailyTasks = () => {
    setAppView('daily')
    setSelectedProjectId(null)
    resetNewTaskForm()
    setTaskActionError(null)
    setDailyTasksError(null)
    void fetchDailyTasks()
  }

  const handleShowGroceryList = () => {
    setAppView('grocery')
    setSelectedProjectId(null)
    resetNewTaskForm()
    setTaskActionError(null)
    setGroceryItemsError(null)
    void fetchGroceryItems()
  }

  const handleShowPickForMe = () => {
    setAppView('pick')
    setSelectedProjectId(null)
    resetNewTaskForm()
    setTaskActionError(null)
    setPickerError(null)
  }

  const handleShowProjects = () => {
    setAppView('projects')
    resetNewTaskForm()
    setTaskActionError(null)
  }

  function getTaskDetailPayload(
    repeatType: TaskRepeatType,
    repeatStartDate: string,
    deadlineDate: string,
    expectedTime: TaskExpectedTime | '',
    shopping: boolean,
    mentalEffort: string,
    physicalEffort: string,
  ) {
    return {
      repeat_type: repeatType,
      repeat_start_date:
        repeatType === 'none' ? null : repeatStartDate || getLocalDateKey(),
      deadline_date: deadlineDate || null,
      expected_time: expectedTime || null,
      shopping,
      mental_effort: mentalEffort ? Number(mentalEffort) : null,
      physical_effort: physicalEffort ? Number(physicalEffort) : null,
    }
  }

  const handleNewTaskRepeatTypeChange = (repeatType: TaskRepeatType) => {
    setNewTaskRepeatType(repeatType)

    if (repeatType !== 'none' && !newTaskRepeatStartDate) {
      setNewTaskRepeatStartDate(getLocalDateKey())
    }
  }

  const handleStartTaskEdit = (task: Task) => {
    setEditingTaskId(task.id)
    setEditingTaskText(task.text)
    setEditingTaskRepeatType(getTaskRepeatType(task))
    setEditingTaskRepeatStartDate(task.repeat_start_date ?? getLocalDateKey())
    setEditingTaskDeadlineDate(task.deadline_date ?? '')
    setEditingTaskExpectedTime(task.expected_time ?? '')
    setEditingTaskShopping(Boolean(task.shopping))
    setEditingTaskMentalEffort(
      task.mental_effort ? String(task.mental_effort) : '',
    )
    setEditingTaskPhysicalEffort(
      task.physical_effort ? String(task.physical_effort) : '',
    )
    setTaskActionError(null)
  }

  const handleCancelTaskEdit = () => {
    setEditingTaskId(null)
    setEditingTaskText('')
    setEditingTaskRepeatType('none')
    setEditingTaskRepeatStartDate(getLocalDateKey())
    setEditingTaskDeadlineDate('')
  }

  const handleEditingTaskRepeatTypeChange = (repeatType: TaskRepeatType) => {
    setEditingTaskRepeatType(repeatType)

    if (repeatType !== 'none' && !editingTaskRepeatStartDate) {
      setEditingTaskRepeatStartDate(getLocalDateKey())
    }
  }

  const handleSaveTaskEdit = async (task: Task) => {
    if (!session) {
      setTaskActionError('You must be signed in to update a task.')
      return
    }

    const trimmedText = capitalizeFirstLetter(editingTaskText).trim()

    if (!trimmedText) {
      setTaskActionError('Task text cannot be empty.')
      return
    }

    if (editingTaskRepeatType !== 'none' && !editingTaskRepeatStartDate) {
      setTaskActionError('Repeat start date is required for repeating tasks.')
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .update({
          text: trimmedText,
          ...getTaskDetailPayload(
            editingTaskRepeatType,
            editingTaskRepeatStartDate,
            editingTaskDeadlineDate,
            editingTaskExpectedTime,
            editingTaskShopping,
            editingTaskMentalEffort,
            editingTaskPhysicalEffort,
          ),
        })
        .eq('id', task.id)

      if (error) {
        throw error
      }

      handleCancelTaskEdit()
      await refreshTaskViews(getVisibleProjectRefreshId(task))
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setTaskSubmitting(false)
    }
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

    if (newTaskRepeatType !== 'none' && !newTaskRepeatStartDate) {
      setTaskActionError('Repeat start date is required for repeating tasks.')
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const taskDetailPayload = getTaskDetailPayload(
        newTaskRepeatType,
        newTaskRepeatStartDate,
        newTaskDeadlineDate,
        newTaskExpectedTime,
        newTaskShopping,
        newTaskMentalEffort,
        newTaskPhysicalEffort,
      )
      const { error } = await supabase.from('tasks').insert(
        isDailyTask
          ? {
              project_id: null,
              user_id: session.user.id,
              text: trimmedText,
              is_daily: true,
              daily_added_at: new Date().toISOString(),
              sort_order: dailyTasks.length,
              ...taskDetailPayload,
            }
          : {
              project_id: selectedProjectId,
              user_id: session.user.id,
              text: trimmedText,
              sort_order: tasks.length,
              ...taskDetailPayload,
            },
      )

      if (error) {
        throw error
      }

      resetNewTaskForm()
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

  const handleCreateGroceryItem = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!session) {
      setTaskActionError('You must be signed in to create a grocery item.')
      return
    }

    const trimmedText = capitalizeFirstLetter(newGroceryItemText).trim()
    if (!trimmedText) {
      setTaskActionError('Grocery item text cannot be empty.')
      return
    }

    setGrocerySubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').insert({
        project_id: null,
        user_id: session.user.id,
        text: trimmedText,
        is_daily: false,
        completed: false,
        daily_added_at: null,
        sort_order: groceryItems.length,
      })

      if (error) {
        throw error
      }

      setNewGroceryItemText('')
      await fetchGroceryItems()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setGrocerySubmitting(false)
    }
  }

  const handleCompleteGroceryItem = async (itemId: string) => {
    if (!session) {
      setTaskActionError('You must be signed in to complete a grocery item.')
      return
    }

    setGrocerySubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('tasks').delete().eq('id', itemId)

      if (error) {
        throw error
      }

      await fetchGroceryItems()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setGrocerySubmitting(false)
    }
  }

  const handleDeleteAllGroceryItems = async () => {
    if (!session) {
      setTaskActionError('You must be signed in to delete grocery items.')
      return
    }

    if (groceryItems.length === 0) {
      return
    }

    setGrocerySubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('tasks')
        .delete()
        .is('project_id', null)
        .eq('user_id', session.user.id)
        .eq('is_daily', false)

      if (error) {
        throw error
      }

      await fetchGroceryItems()
    } catch (error) {
      setTaskActionError(getErrorMessage(error))
    } finally {
      setGrocerySubmitting(false)
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

      if (isRecurringTask(task)) {
        const { error } = await supabase
          .from('task_occurrence_completions')
          .upsert(
            {
              task_id: task.id,
              user_id: session.user.id,
              occurrence_date: getLocalDateKey(),
            },
            { onConflict: 'task_id,occurrence_date' },
          )

        if (error) {
          throw error
        }

        setSelectedTaskIds((current) => {
          const next = new Set(current)
          next.delete(task.id)
          return next
        })
        await refreshTaskViews(getVisibleProjectRefreshId(task))
        return
      }

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
    if (!session) {
      setTaskActionError('You must be signed in to update tasks.')
      return
    }

    const recurringTasks = selectedTasks.filter(
      (task) => !task.completed && isRecurringTask(task),
    )
    const taskIds = selectedTasks
      .filter((task) => !task.completed)
      .filter((task) => !isRecurringTask(task))
      .map((task) => task.id)

    if (taskIds.length === 0 && recurringTasks.length === 0) {
      setSelectedTaskIds(new Set())
      return
    }

    setTaskSubmitting(true)
    setTaskActionError(null)

    try {
      const supabase = getSupabaseClient()
      const todayKey = getLocalDateKey()
      const updates = await Promise.all([
        taskIds.length > 0
          ? supabase
              .from('tasks')
              .update({
                completed: true,
                is_daily: false,
                daily_added_at: null,
              })
              .in('id', taskIds)
          : Promise.resolve({ error: null }),
        recurringTasks.length > 0
          ? supabase.from('task_occurrence_completions').upsert(
              recurringTasks.map((task) => ({
                task_id: task.id,
                user_id: session.user.id,
                occurrence_date: todayKey,
              })),
              { onConflict: 'task_id,occurrence_date' },
            )
          : Promise.resolve({ error: null }),
      ])
      const failedUpdate = updates.find((update) => update.error)

      if (failedUpdate?.error) {
        throw failedUpdate.error
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
      editing={editingTaskId === task.id}
      editText={editingTaskText}
      editRepeatType={editingTaskRepeatType}
      editRepeatStartDate={editingTaskRepeatStartDate}
      editDeadlineDate={editingTaskDeadlineDate}
      editExpectedTime={editingTaskExpectedTime}
      editShopping={editingTaskShopping}
      editMentalEffort={editingTaskMentalEffort}
      editPhysicalEffort={editingTaskPhysicalEffort}
      isDragging={draggingTask?.id === task.id}
      disabled={isBusy}
      onSelectChange={handleSelectTask}
      onComplete={(nextTask) => void handleCompleteTask(nextTask)}
      onSendToDaily={(nextTask) => void handleSendToDaily(nextTask)}
      onRemoveFromDaily={(nextTask) => void handleRemoveFromDaily(nextTask)}
      onDelete={(taskId) => void handleDeleteTask(taskId)}
      onStartEdit={handleStartTaskEdit}
      onCancelEdit={handleCancelTaskEdit}
      onSaveEdit={(nextTask) => void handleSaveTaskEdit(nextTask)}
      onEditTextChange={setEditingTaskText}
      onEditRepeatTypeChange={handleEditingTaskRepeatTypeChange}
      onEditRepeatStartDateChange={setEditingTaskRepeatStartDate}
      onEditDeadlineDateChange={setEditingTaskDeadlineDate}
      onEditExpectedTimeChange={setEditingTaskExpectedTime}
      onEditShoppingChange={setEditingTaskShopping}
      onEditMentalEffortChange={setEditingTaskMentalEffort}
      onEditPhysicalEffortChange={setEditingTaskPhysicalEffort}
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
                : appView === 'grocery'
                  ? 'Keep a quick grocery list that clears items as you shop.'
                  : appView === 'pick'
                    ? 'Match a task to the energy you have right now.'
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
          <button
            className={appView === 'grocery' ? 'is-selected' : ''}
            type="button"
            onClick={handleShowGroceryList}
            aria-pressed={appView === 'grocery'}
          >
            Grocery List
            <span className="count-pill">{groceryItems.length}</span>
          </button>
          <button
            className={appView === 'pick' ? 'is-selected' : ''}
            type="button"
            onClick={handleShowPickForMe}
            aria-pressed={appView === 'pick'}
          >
            Pick for Me
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

            {showTaskCreateForm ? (
              <form
                className="inline-form task-create-form"
                onSubmit={handleCreateTask}
              >
                <label className="field-group task-text-field">
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
                <label className="field-group">
                  <span className="field-label">Repeats</span>
                  <select
                    value={newTaskRepeatType}
                    onChange={(event) =>
                      handleNewTaskRepeatTypeChange(
                        event.target.value as TaskRepeatType,
                      )
                    }
                    disabled={Boolean(configError) || taskSubmitting}
                  >
                    {TASK_REPEAT_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-group">
                  <span className="field-label">Repeat start</span>
                  <input
                    type="date"
                    value={newTaskRepeatStartDate}
                    onChange={(event) =>
                      setNewTaskRepeatStartDate(event.target.value)
                    }
                    required={newTaskRepeatType !== 'none'}
                    disabled={
                      Boolean(configError) ||
                      taskSubmitting ||
                      newTaskRepeatType === 'none'
                    }
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Deadline</span>
                  <input
                    type="date"
                    value={newTaskDeadlineDate}
                    onChange={(event) =>
                      setNewTaskDeadlineDate(event.target.value)
                    }
                    disabled={Boolean(configError) || taskSubmitting}
                  />
                </label>
                <TaskExpectedTimeButtons
                  value={newTaskExpectedTime}
                  onChange={setNewTaskExpectedTime}
                  disabled={Boolean(configError) || taskSubmitting}
                />
                <TaskRequirementButtons
                  label="Mental effort"
                  value={newTaskMentalEffort}
                  onChange={setNewTaskMentalEffort}
                  disabled={Boolean(configError) || taskSubmitting}
                />
                <TaskRequirementButtons
                  label="Physical effort"
                  value={newTaskPhysicalEffort}
                  onChange={setNewTaskPhysicalEffort}
                  disabled={Boolean(configError) || taskSubmitting}
                />
                <label className="checkbox-field">
                  <span className="field-label">Shopping:</span>
                  <input
                    type="checkbox"
                    checked={newTaskShopping}
                    onChange={(event) =>
                      setNewTaskShopping(event.target.checked)
                    }
                    disabled={Boolean(configError) || taskSubmitting}
                  />
                </label>
                <div className="task-create-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={Boolean(configError) || taskSubmitting}
                  >
                    {taskSubmitting ? 'Saving...' : 'Add Task'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={resetNewTaskForm}
                    disabled={taskSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="primary-button task-create-toggle"
                type="button"
                onClick={() => setShowTaskCreateForm(true)}
                disabled={Boolean(configError) || taskSubmitting}
              >
                New Task
              </button>
            )}

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
        ) : appView === 'pick' ? (
          <section className="screen-section pick-screen-section">
            <div className="section-header home-header">
              <div>
                <p className="eyebrow">Pick for Me</p>
                <h2>Current Energy</h2>
              </div>
              {pickerLoading ? (
                <span className="section-note">Finding a task...</span>
              ) : null}
            </div>

            {pickerMessages.length > 0 ? (
              <div className="message-stack">
                {pickerMessages.map((message, index) => (
                  <p
                    key={`${index}-${message}`}
                    className="message-card error-message"
                  >
                    {message}
                  </p>
                ))}
              </div>
            ) : null}

            <section className="picker-controls">
              <fieldset className="picker-energy-group">
                <legend className="field-label">Mental energy</legend>
                <div className="picker-energy-options">
                  {MENTAL_ENERGY_OPTIONS.map((option) => (
                    <button
                      className={`picker-energy-button${
                        pickerMentalEnergy === option.value ? ' is-selected' : ''
                      }`}
                      type="button"
                      key={option.value}
                      onClick={() => setPickerMentalEnergy(option.value)}
                      disabled={pickerLoading}
                      aria-pressed={pickerMentalEnergy === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="picker-energy-group">
                <legend className="field-label">Physical energy</legend>
                <div className="picker-energy-options">
                  {PHYSICAL_ENERGY_OPTIONS.map((option) => (
                    <button
                      className={`picker-energy-button${
                        pickerPhysicalEnergy === option.value ? ' is-selected' : ''
                      }`}
                      type="button"
                      key={option.value}
                      onClick={() => setPickerPhysicalEnergy(option.value)}
                      disabled={pickerLoading}
                      aria-pressed={pickerPhysicalEnergy === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className="list-section picker-result-section">
              {pickedTask ? (
                <article className="picker-task-card">
                  <div>
                    <p className="eyebrow">Recommended</p>
                    <h3>{pickedTask.text}</h3>
                    <p className="section-note">{pickedTask.project_name}</p>
                    <TaskMetaBadges task={pickedTask} />
                  </div>
                  <div className="picker-task-details">
                    <span>
                      Mental:{' '}
                      {getEnergyLabel(
                        MENTAL_ENERGY_OPTIONS,
                        getTaskRequirement(pickedTask.mental_effort),
                      )}
                    </span>
                    <span>
                      Physical:{' '}
                      {getEnergyLabel(
                        PHYSICAL_ENERGY_OPTIONS,
                        getTaskRequirement(pickedTask.physical_effort),
                      )}
                    </span>
                  </div>
                </article>
              ) : (
                <p className="empty-state">No task picked yet.</p>
              )}
              <div className="button-row picker-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handlePickTask()}
                  disabled={pickerLoading || Boolean(configError)}
                >
                  {pickedTask ? 'Refresh' : 'Pick Task'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setPickedTask(null)
                    setPickerError(null)
                  }}
                  disabled={pickerLoading || !pickedTask}
                >
                  Clear Task
                </button>
              </div>
            </section>
          </section>
        ) : appView === 'grocery' ? (
          <section className="screen-section">
            <div className="section-header home-header">
              <div>
                <p className="eyebrow">Grocery List</p>
                <h2>Shopping Run</h2>
              </div>
              <div className="section-actions">
                {groceryItemsLoading ? (
                  <span className="section-note">Refreshing groceries...</span>
                ) : null}
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void handleDeleteAllGroceryItems()}
                  disabled={isGroceryBusy || groceryItems.length === 0}
                >
                  Delete All
                </button>
              </div>
            </div>

            {groceryMessages.length > 0 ? (
              <div className="message-stack">
                {groceryMessages.map((message, index) => (
                  <p
                    key={`${index}-${message}`}
                    className="message-card error-message"
                  >
                    {message}
                  </p>
                ))}
              </div>
            ) : null}

            <form className="inline-form" onSubmit={handleCreateGroceryItem}>
              <label className="field-group">
                <span className="field-label">New item</span>
                <input
                  type="text"
                  value={newGroceryItemText}
                  onChange={(event) =>
                    setNewGroceryItemText(
                      capitalizeFirstLetter(event.target.value),
                    )
                  }
                  placeholder="Milk, eggs, apples..."
                  disabled={isGroceryBusy}
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={isGroceryBusy}
              >
                {grocerySubmitting ? 'Saving...' : 'Add Item'}
              </button>
            </form>

            <section className="list-section grocery-list-section">
              {groceryItems.length > 0 ? (
                <ul className="grocery-list">
                  {groceryItems.map((item) => (
                    <li className="grocery-item" key={item.id}>
                      <button
                        className="grocery-item-button"
                        type="button"
                        onClick={() => void handleCompleteGroceryItem(item.id)}
                        disabled={isGroceryBusy}
                      >
                        <span className="grocery-check" aria-hidden="true" />
                        <span>{item.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">
                  {groceryItemsLoading
                    ? 'Loading your grocery list...'
                    : 'No grocery items yet.'}
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

            {showTaskCreateForm ? (
              <form
                className="inline-form task-create-form"
                onSubmit={handleCreateTask}
              >
                <label className="field-group task-text-field">
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
                <label className="field-group">
                  <span className="field-label">Repeats</span>
                  <select
                    value={newTaskRepeatType}
                    onChange={(event) =>
                      handleNewTaskRepeatTypeChange(
                        event.target.value as TaskRepeatType,
                      )
                    }
                    disabled={Boolean(configError) || taskSubmitting}
                  >
                    {TASK_REPEAT_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-group">
                  <span className="field-label">Repeat start</span>
                  <input
                    type="date"
                    value={newTaskRepeatStartDate}
                    onChange={(event) =>
                      setNewTaskRepeatStartDate(event.target.value)
                    }
                    required={newTaskRepeatType !== 'none'}
                    disabled={
                      Boolean(configError) ||
                      taskSubmitting ||
                      newTaskRepeatType === 'none'
                    }
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Deadline</span>
                  <input
                    type="date"
                    value={newTaskDeadlineDate}
                    onChange={(event) =>
                      setNewTaskDeadlineDate(event.target.value)
                    }
                    disabled={Boolean(configError) || taskSubmitting}
                  />
                </label>
                <TaskExpectedTimeButtons
                  value={newTaskExpectedTime}
                  onChange={setNewTaskExpectedTime}
                  disabled={Boolean(configError) || taskSubmitting}
                />
                <TaskRequirementButtons
                  label="Mental effort"
                  value={newTaskMentalEffort}
                  onChange={setNewTaskMentalEffort}
                  disabled={Boolean(configError) || taskSubmitting}
                />
                <TaskRequirementButtons
                  label="Physical effort"
                  value={newTaskPhysicalEffort}
                  onChange={setNewTaskPhysicalEffort}
                  disabled={Boolean(configError) || taskSubmitting}
                />
                <label className="checkbox-field">
                  <span className="field-label">Shopping:</span>
                  <input
                    type="checkbox"
                    checked={newTaskShopping}
                    onChange={(event) =>
                      setNewTaskShopping(event.target.checked)
                    }
                    disabled={Boolean(configError) || taskSubmitting}
                  />
                </label>
                <div className="task-create-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={Boolean(configError) || taskSubmitting}
                  >
                    {taskSubmitting ? 'Saving...' : 'Add Task'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={resetNewTaskForm}
                    disabled={taskSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="primary-button task-create-toggle"
                type="button"
                onClick={() => setShowTaskCreateForm(true)}
                disabled={Boolean(configError) || taskSubmitting}
              >
                New Task
              </button>
            )}

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
