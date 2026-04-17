import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Para uso server-side (Route Handlers, Server Actions, etc.)
// Usa a anon key por padrão. Para operações privilegiadas,
// substituir por SUPABASE_SERVICE_ROLE_KEY quando disponível.
export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}
