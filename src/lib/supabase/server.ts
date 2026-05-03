import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Para uso server-side (Route Handlers, Server Actions, etc.)
// Prioriza a nova SUPABASE_SECRET_KEY e mantém fallback legado.
export function createServerClient() {
  const serverKey = supabaseSecretKey ?? supabaseServiceRoleKey ?? supabaseAnonKey

  if (!supabaseUrl || !serverKey) {
    throw new Error('Supabase env vars ausentes: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (ou fallback legado).')
  }

  return createClient(supabaseUrl, serverKey)
}
