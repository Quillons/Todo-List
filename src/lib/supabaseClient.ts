import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ProjectCardColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'violet'

export type ProjectCardIcon =
  | 'house'
  | 'bicycle'
  | 'lightbulb'
  | 'car'
  | 'running'
  | 'euro'
  | 'shopping'

export type TaskRepeatType =
  | 'none'
  | 'daily'
  | 'workdays'
  | 'weekends'
  | 'weekly'
  | 'monthly'
  | 'yearly'

export type TaskExpectedTime =
  | '5_minutes'
  | '15_minutes'
  | '30_minutes'
  | '1_hour_plus'

export type Project = {
  id: string
  user_id: string
  name: string
  card_color: ProjectCardColor | null
  card_icon: ProjectCardIcon | null
  sort_order: number | null
  created_at: string | null
}

export type Task = {
  id: string
  project_id: string | null
  user_id: string | null
  text: string
  completed: boolean
  is_daily: boolean
  daily_added_at: string | null
  repeat_type: TaskRepeatType
  repeat_start_date: string | null
  deadline_date: string | null
  expected_time: TaskExpectedTime | null
  shopping: boolean
  mental_effort: number | null
  physical_effort: number | null
  sort_order: number | null
  created_at: string | null
}

export type TaskOccurrenceCompletion = {
  id: string
  task_id: string
  user_id: string
  occurrence_date: string
  created_at: string | null
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let supabaseClient: SupabaseClient | null = null

export function getSupabaseConfigError() {
  const missingVariables = [
    !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean)

  if (missingVariables.length === 0) {
    return null
  }

  return `Missing Supabase environment variables: ${missingVariables.join(
    ', ',
  )}. Create a .env.local file in the project root and add the missing values.`
}

export function getSupabaseClient() {
  const configError = getSupabaseConfigError()

  if (configError) {
    throw new Error(configError)
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!)
  }

  return supabaseClient
}
