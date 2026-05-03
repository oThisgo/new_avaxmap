import { createServerClient } from '@/lib/supabase/server'

const SESSION_MAX_AGE_MS = 60 * 60 * 8 * 1000
const SESSION_CLOCK_SKEW_MS = 60 * 1000

export interface ManagerSession {
  id: string
  name: string
  email: string
  role: string // 'superuser' | 'admin' | 'manager'
}

function parseSessionToken(sessionToken: string): { managerId: string; issuedAt: number } | null {
  const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8')
  const [managerId, issuedAtRaw] = decoded.split(':')
  const issuedAt = Number(issuedAtRaw)

  if (!managerId || !Number.isFinite(issuedAt)) return null

  const now = Date.now()
  if (issuedAt > now + SESSION_CLOCK_SKEW_MS) return null
  if (now - issuedAt > SESSION_MAX_AGE_MS) return null

  return { managerId, issuedAt }
}

export async function getManagerFromSession(
  sessionToken: string | undefined,
): Promise<ManagerSession | null> {
  if (!sessionToken) return null
  try {
    const parsed = parseSessionToken(sessionToken)
    if (!parsed) return null

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('managers')
      .select('id, name, email, role, is_active')
      .eq('id', parsed.managerId)
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
