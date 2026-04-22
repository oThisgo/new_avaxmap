'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import OverviewTab from './tabs/OverviewTab'
import DemographicsTab from './tabs/DemographicsTab'
import HseTab from './tabs/HseTab'
import RemoteTab from './tabs/RemoteTab'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

const TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'demographics', label: 'Dados Demográficos' },
  { id: 'hse', label: 'HSE por Domínio' },
  { id: 'remote', label: 'Trabalho Remoto' },
] as const

type TabId = (typeof TABS)[number]['id']

interface FilterOptions {
  area: string[]
  role: string[]
  gender: string[]
  race_color: string[]
}

interface ActiveFilters {
  area: string
  role: string
  gender: string
  race_color: string
}

export default function DashboardShell() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Tokens condicionais
  const T = {
    bg: isDark ? '#111111' : '#F8F8F8',
    surface: isDark ? '#1A1A1A' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#E5E5E5',
    text: isDark ? '#FFFFFF' : '#111111',
    textMuted: isDark ? '#A3A3A3' : '#737373',
    textFaint: isDark ? '#525252' : '#A3A3A3',
    inputBg: isDark ? '#222222' : '#F5F5F5',
    inputBorder: isDark ? '#2A2A2A' : '#E5E5E5',
    menuHover: isDark ? '#222222' : '#F5F5F5',
    clearBtn: isDark ? '#2A2A2A' : '#E5E5E5',
    clearBtnText: isDark ? '#A3A3A3' : '#737373',
    adminBorder: isDark ? '#2A2A2A' : '#E5E5E5',
    adminText: isDark ? '#A3A3A3' : '#737373',
    menuBg: isDark ? '#1A1A1A' : '#FFFFFF',
    avatarTextBg: '#F5C200',
  }

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    area: [], role: [], gender: [], race_color: [],
  })
  const [filters, setFilters] = useState<ActiveFilters>({
    area: '', role: '', gender: '', race_color: '',
  })
  const [managerDisplay, setManagerDisplay] = useState<{ name: string; email: string; role: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Lê o cookie de exibição (não-sensível)
  useEffect(() => {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('manager_display='))
    if (match) {
      try {
        setManagerDisplay(JSON.parse(decodeURIComponent(match.split('=').slice(1).join('='))))
      } catch {}
    }
  }, [])

  // Fecha o menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/manager', { method: 'DELETE' })
    router.push('/manager/login')
  }

  useEffect(() => {
    fetch('/api/dashboard/filters')
      .then((r) => r.json())
      .then((d) => setFilterOptions(d))
      .catch(() => {})
  }, [])

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v)
    }
    return params.toString()
  }, [filters])

  const handleFilter = (key: keyof ActiveFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({ area: '', role: '', gender: '', race_color: '' })
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      {/* Header */}
      <header className="border-b px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between gap-3" style={{ borderColor: T.border, backgroundColor: T.surface }}>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-xl font-semibold tracking-tight leading-snug">Dashboard de Riscos Psicossociais</h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: T.textMuted }}>Instituto Alana</p>
        </div>

        {/* Desktop controls (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <ThemeToggle />
          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm px-3 py-1.5 rounded-md transition-colors"
              style={{ backgroundColor: T.clearBtn, color: T.clearBtnText }}
            >
              Limpar filtros ({activeCount})
            </button>
          )}
          {managerDisplay && (managerDisplay.role === 'superuser' || managerDisplay.role === 'admin') && (
            <a
              href="/admin/upload"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: T.surface, border: `1px solid ${T.adminBorder}`, color: T.adminText }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#F5C200'; e.currentTarget.style.borderColor = '#F5C200' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.adminText; e.currentTarget.style.borderColor = T.adminBorder }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              Importar CSV
            </a>
          )}
          {managerDisplay && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{ backgroundColor: menuOpen ? T.clearBtn : 'transparent', color: T.text }}
                onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = T.menuHover }}
                onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: '#F5C200', color: '#111111' }}
                >
                  {managerDisplay.name.charAt(0).toUpperCase() || '?'}
                </span>
                <span className="font-medium">{managerDisplay.name || managerDisplay.email}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.5 }}>
                  <path d="M6 8L1 3h10z" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-1 w-56 rounded-xl shadow-lg py-1 z-50"
                  style={{ backgroundColor: T.menuBg, border: `1px solid ${T.border}` }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: T.border }}>
                    <p className="text-sm font-semibold" style={{ color: T.text }}>{managerDisplay.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{managerDisplay.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
                    style={{ color: '#EF4444' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#EF444415' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sair
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile controls: ThemeToggle + hamburger (hidden on desktop) */}
        <div className="flex sm:hidden items-center gap-1 flex-shrink-0">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: mobileMenuOpen ? T.clearBtn : 'transparent', color: T.text }}
            aria-label="Menu"
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          {managerDisplay && (
            <>
              <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: T.border }}>
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: '#F5C200', color: '#111111' }}
                >
                  {managerDisplay.name.charAt(0).toUpperCase() || '?'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: T.text }}>{managerDisplay.name}</p>
                  <p className="text-xs truncate" style={{ color: T.textMuted }}>{managerDisplay.email}</p>
                </div>
              </div>
              <div className="px-4 py-2 flex flex-col gap-0.5">
                {activeCount > 0 && (
                  <button
                    onClick={() => { clearFilters(); setMobileMenuOpen(false) }}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg"
                    style={{ color: T.clearBtnText }}
                  >
                    Limpar filtros ({activeCount})
                  </button>
                )}
                {(managerDisplay.role === 'superuser' || managerDisplay.role === 'admin') && (
                  <a
                    href="/admin/upload"
                    className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg"
                    style={{ color: T.adminText }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    Importar CSV
                  </a>
                )}
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogout() }}
                  className="w-full text-left flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg"
                  style={{ color: '#EF4444' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="px-4 sm:px-6 py-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-3 border-b" style={{ borderColor: T.border, backgroundColor: T.surface }}>
        {(['area', 'role', 'gender', 'race_color'] as const).map((key) => (
          <div key={key} className="flex flex-col gap-1 min-w-0">
            <label className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>
              {key === 'area' ? 'Área' : key === 'role' ? 'Cargo' : key === 'gender' ? 'Gênero' : 'Raça/Cor'}
            </label>
            <select
              value={filters[key]}
              onChange={(e) => handleFilter(key, e.target.value)}
              className="text-sm rounded-md px-2 py-1 border outline-none w-full sm:min-w-[140px]"
              style={{ backgroundColor: T.inputBg, borderColor: T.inputBorder, color: T.text }}
            >
              <option value="">Todos</option>
              {filterOptions[key].map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="px-4 sm:px-6 pt-4 border-b overflow-x-auto" style={{ borderColor: T.border }}>
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap flex-shrink-0"
              style={
                activeTab === tab.id
                  ? { backgroundColor: '#F5C200', color: '#111111' }
                  : { backgroundColor: 'transparent', color: '#A3A3A3' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo das abas */}
      <main className="p-4 sm:p-6 max-w-full overflow-x-hidden">
        {activeTab === 'overview' && <OverviewTab query={buildQuery()} />}
        {activeTab === 'demographics' && <DemographicsTab query={buildQuery()} />}
        {activeTab === 'hse' && <HseTab query={buildQuery()} />}
        {activeTab === 'remote' && <RemoteTab query={buildQuery()} />}
      </main>
    </div>
  )
}
