import { createServerClient } from '@/lib/supabase/server'

export interface ManagerSession {
  id: string
  name: string
  email: string
  role: string // 'superuser' | 'admin' | 'manager'
}

export async function getManagerFromSession(
  sessionToken: string | undefined,
): Promise<ManagerSession | null> {
  if (!sessionToken) return null
  try {
    const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8')
    const managerId = decoded.split(':')[0]
    if (!managerId) return null

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('managers')
      .select('id, name, email, role, is_active')
      .eq('id', managerId)
      .single()

    if (error || !data || !data.is_active) return null
    return { id: data.id, name: data.name ?? '', email: data.email ?? '', role: data.role ?? 'manager' }
  } catch {
    return null
  }
}

export function isAdmin(role: string): boolean {
  return role === 'superuser' || role === 'admin'
}
