import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Project = {
  id: string
  user_id: string
  name: string
  created_at: string | null
}

export type Task = {
  id: string
  project_id: string
  text: string
  completed: boolean
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
