'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import OverviewTab from './tabs/OverviewTab'
import DemographicsTab from './tabs/DemographicsTab'
import HseTab from './tabs/HseTab'
import RemoteTab from './tabs/RemoteTab'

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
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    area: [], role: [], gender: [], race_color: [],
  })
  const [filters, setFilters] = useState<ActiveFilters>({
    area: '', role: '', gender: '', race_color: '',
  })
  const [managerDisplay, setManagerDisplay] = useState<{ name: string; email: string; role: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
    <div className="min-h-screen" style={{ backgroundColor: '#111111', color: '#FFFFFF' }}>
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: '#2A2A2A', backgroundColor: '#1A1A1A' }}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard de Riscos Psicossociais</h1>
          <p className="text-sm mt-0.5" style={{ color: '#A3A3A3' }}>Instituto Alana</p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm px-3 py-1.5 rounded-md transition-colors"
              style={{ backgroundColor: '#2A2A2A', color: '#A3A3A3' }}
            >
              Limpar filtros ({activeCount})
            </button>
          )}

          {/* Link admin (só para superuser/admin) */}
          {managerDisplay && (managerDisplay.role === 'superuser' || managerDisplay.role === 'admin') && (
            <a
              href="/admin/upload"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: '#1F1F1F', border: '1px solid #2A2A2A', color: '#A3A3A3' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#F5C200'; e.currentTarget.style.borderColor = '#F5C200' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#A3A3A3'; e.currentTarget.style.borderColor = '#2A2A2A' }}
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
                style={{ backgroundColor: menuOpen ? '#2A2A2A' : 'transparent', color: '#FFFFFF' }}
                onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = '#222222' }}
                onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {/* Ícone de usuário */}
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
                  style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: '#2A2A2A' }}>
                    <p className="text-sm font-semibold">{managerDisplay.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#A3A3A3' }}>{managerDisplay.email}</p>
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
      </header>

      {/* Filtros */}
      <div className="px-6 py-3 flex flex-wrap gap-3 border-b" style={{ borderColor: '#2A2A2A', backgroundColor: '#1A1A1A' }}>
        {(['area', 'role', 'gender', 'race_color'] as const).map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide" style={{ color: '#525252' }}>
              {key === 'area' ? 'Área' : key === 'role' ? 'Cargo' : key === 'gender' ? 'Gênero' : 'Raça/Cor'}
            </label>
            <select
              value={filters[key]}
              onChange={(e) => handleFilter(key, e.target.value)}
              className="text-sm rounded-md px-2 py-1 border outline-none"
              style={{ backgroundColor: '#222222', borderColor: '#2A2A2A', color: '#FFFFFF', minWidth: '140px' }}
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
      <div className="px-6 pt-4 border-b" style={{ borderColor: '#2A2A2A' }}>
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
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
      <main className="p-6">
        {activeTab === 'overview' && <OverviewTab query={buildQuery()} />}
        {activeTab === 'demographics' && <DemographicsTab query={buildQuery()} />}
        {activeTab === 'hse' && <HseTab query={buildQuery()} />}
        {activeTab === 'remote' && <RemoteTab query={buildQuery()} />}
      </main>
    </div>
  )
}
