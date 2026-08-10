'use client'

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import type jsPDFType from 'jspdf'
import OverviewTab from './tabs/OverviewTab'
import DemographicsTab from './tabs/DemographicsTab'
import HseTab from './tabs/HseTab'
import RemoteTab from './tabs/RemoteTab'
import MentalHealthTab from './tabs/MentalHealthTab'
import InsightsTab from './tabs/InsightsTab'
import { ThemeToggle } from '@/components/ThemeToggle'
import ReportRiskModal from './ReportRiskModal'
import { BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import { isMappingAdmin, isMappingSuperuser } from '@/lib/auth/roles'
import { useThemeTokens } from '@/lib/theme'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const T = useThemeTokens()
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>{label}</span>
      <Select
        className="w-full sm:min-w-[150px]"
        value={value}
        onChange={onChange}
        placeholder="Todos"
        options={[{ value: '', label: 'Todos' }, ...options.map((opt) => ({ value: opt, label: opt }))]}
      />
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'demographics', label: 'Dados Demográficos' },
  { id: 'hse', label: 'HSE por Domínio' },
  { id: 'remote', label: 'Trabalho Remoto' },
  { id: 'mental_health', label: 'Saúde Mental' },
  { id: 'insights', label: '✦ Insights' },
] as const

type TabId = (typeof TABS)[number]['id']

type FilterOptions = Record<string, string[]>
type ActiveFilters = Record<string, string>

type DashboardRuntimeConfig = {
  modules: string[]
  demographic_columns: string[]
  field_labels: Record<string, string>
}

interface ManagerDisplay {
  name: string
  email: string
  role: string
  mapping_role?: string | null
  must_change_password?: boolean
  mapping_slug?: string | null
}

export default function DashboardShell() {
  const router = useRouter()
  const pathname = usePathname()
  // Slug extraído da URL — síncrono, não depende de state ou cookie
  const slugFromPath = pathname?.match(/^\/mapeamento\/([^/]+)\/dashboard/)?.[1] ?? null
  const baseT = useThemeTokens()
  const isDark = baseT.isDark
  const T = {
    ...baseT,
    inputBorder: baseT.border,
    menuHover: baseT.surface2,
    clearBtn: baseT.surface2,
    clearBtnText: baseT.textMuted,
    adminBorder: baseT.border,
    adminText: baseT.textMuted,
    menuBg: baseT.surface,
  }

  const [tabs, setTabs] = useState<Array<{ id: TabId; label: string }>>(TABS as unknown as Array<{ id: TabId; label: string }>)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [dashboardConfig, setDashboardConfig] = useState<DashboardRuntimeConfig>({
    modules: ['sociodemografico', 'hse', 'ietr'],
    demographic_columns: ['gender', 'age_range', 'race_color', 'education_level', 'marital_status', 'disability', 'disability_types'],
    field_labels: {},
  })
  const [availableFilters, setAvailableFilters] = useState<string[]>(['area', 'role', 'employment_type', 'gender', 'race_color'])
  const [filterLabels, setFilterLabels] = useState<Record<string, string>>({
    area: 'Área',
    role: 'Cargo',
    employment_type: 'Vínculo',
    gender: 'Gênero',
    race_color: 'Raça/Cor',
    age_range: 'Faixa etária',
  })
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({})
  const [filters, setFilters] = useState<ActiveFilters>({})
  const [managerDisplay, setManagerDisplay] = useState<ManagerDisplay | null>(null)
  const [activeMappingSlug, setActiveMappingSlug] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportRiskModalOpen, setReportRiskModalOpen] = useState(false)
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const reportMenuRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab]
    if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeTab])

  useEffect(() => {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('manager_display='))
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match.split('=').slice(1).join('='))) as ManagerDisplay
        setManagerDisplay(parsed)
        if (parsed.mapping_slug) {
          setActiveMappingSlug(parsed.mapping_slug)
        }
      } catch {}
    }
  }, [])

  useEffect(() => {
    fetch('/api/dashboard/config')
      .then(async (res) => {
        if (!res.ok) throw new Error('dashboard_config_unavailable')
        return res.json()
      })
      .then((json) => {
        const modules: string[] = Array.isArray(json?.config?.modules) ? json.config.modules : ['sociodemografico', 'hse', 'ietr']
        const dynamicTabs: Array<{ id: TabId; label: string }> = [{ id: 'overview', label: 'Visão Geral' }]
        if (modules.includes('sociodemografico')) dynamicTabs.push({ id: 'demographics', label: 'Dados Demográficos' })
        if (modules.includes('hse')) dynamicTabs.push({ id: 'hse', label: 'HSE por Domínio' })
        if (modules.includes('ietr')) dynamicTabs.push({ id: 'remote', label: 'Trabalho Remoto' })
        if (modules.includes('saude_mental')) dynamicTabs.push({ id: 'mental_health', label: 'Saúde Mental' })
        dynamicTabs.push({ id: 'insights', label: '✦ Insights' })
        setTabs(dynamicTabs)

        const demographicColumns: string[] = Array.isArray(json?.config?.demographic_columns)
          ? json.config.demographic_columns
          : ['gender', 'age_range', 'race_color', 'education_level', 'marital_status', 'disability', 'disability_types']
        const fieldLabels: Record<string, string> = json?.config?.field_labels && typeof json.config.field_labels === 'object'
          ? json.config.field_labels
          : {}

        setDashboardConfig({ modules, demographic_columns: demographicColumns, field_labels: fieldLabels })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? 'overview')
    }
  }, [activeTab, tabs])

  useEffect(() => {
    fetch('/api/auth/manager/me')
      .then(async (res) => {
        if (!res.ok) throw new Error('unauthorized')
        return res.json()
      })
      .then((me) => {
        if (me.mapping_slug) {
          setActiveMappingSlug(me.mapping_slug)
        }
        if (me.must_change_password) {
          const next = me.mapping_slug
            ? `/mapeamento/${me.mapping_slug}/dashboard`
            : '/dashboard/client'
          router.replace(`/dashboard/reset-password?first_access=1&next=${encodeURIComponent(next)}`)
        }
      })
      .catch(() => {
        const slug = slugFromPath ?? activeMappingSlug
        if (slug) {
          router.replace(`/mapeamento/${slug}/manager/login`)
          return
        }
        router.replace('/manager/login')
      })
  }, [activeMappingSlug, router, slugFromPath])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) setReportMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/manager', { method: 'DELETE' })
    const slug = slugFromPath ?? activeMappingSlug
    if (slug) {
      router.push(`/mapeamento/${slug}/manager/login`)
      return
    }
    router.push('/manager/login')
  }

  function handleGoToResetPassword() {
    setMenuOpen(false)
    setMobileMenuOpen(false)
    const slug = slugFromPath ?? activeMappingSlug
    const next = slug ? `/mapeamento/${slug}/dashboard` : '/dashboard/client'
    router.push(`/dashboard/reset-password?next=${encodeURIComponent(next)}`)
  }

  async function handleDownloadPDF() {
    setReportLoading(true)
    setReportMenuOpen(false)
    try {
      const q = buildQuery()
      const res = await fetch('/api/dashboard/report?format=json' + (q ? '&' + q : ''))
      if (!res.ok) throw new Error('Falha ao buscar dados')
      const data = await res.json()

      const { default: jsPDF } = await import('jspdf') as unknown as { default: typeof jsPDFType }
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF()
      const dateStr = new Date().toLocaleDateString('pt-BR')
      const headerColor: [number, number, number] = [23, 103, 243]
      const headerText: [number, number, number] = [255, 255, 255]
      const bodyText: [number, number, number] = [3, 44, 57]

      doc.setFillColor(...headerColor)
      doc.rect(0, 0, 210, 18, 'F')
      doc.setFontSize(13)
      doc.setTextColor(...headerText)
      doc.setFont('helvetica', 'bold')
      doc.text(`Relatório de Adesão — ${BRAND_NAME}`, 14, 12)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 136)
      doc.text(`Gerado em ${dateStr}  •  Dados de participação apenas (sem dados de risco)`, 14, 22)

      let resumoY = 32
      if (data.filters) {
        const filterParts: string[] = []
        if (data.filters.area) filterParts.push(`Área: ${data.filters.area}`)
        if (data.filters.role) filterParts.push(`Cargo: ${data.filters.role}`)
        if (data.filters.gender) filterParts.push(`Gênero: ${data.filters.gender}`)
        if (data.filters.race_color) filterParts.push(`Raça/Cor: ${data.filters.race_color}`)
        if (data.filters.employment_type) filterParts.push(`Vínculo: ${data.filters.employment_type}`)
        if (filterParts.length > 0) {
          doc.setFontSize(8)
          doc.setTextColor(54, 162, 235)
          doc.text(`Filtros: ${filterParts.join('  •  ')}`, 14, 28)
          resumoY = 38
        }
      }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...bodyText)
      doc.text('Resumo Geral', 14, resumoY)

      autoTable(doc, {
        startY: resumoY + 4,
        head: [['Total de Colaboradores', 'Responderam', 'Taxa de Adesão']],
        body: [[data.summary.total, data.summary.answered, `${data.summary.pct}%`]],
        headStyles: { fillColor: headerColor, textColor: headerText, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 },
      })

      const addSection = (title: string, rows: { name: string; total: number; answered: number; pct: number }[]) => {
        const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...bodyText)
        doc.text(title, 14, lastY + 10)
        autoTable(doc, {
          startY: lastY + 14,
          head: [['Categoria', 'Total', 'Responderam', 'Adesão (%)']],
          body: rows.map((r) => [r.name, r.total, r.answered, `${r.pct}%`]),
          headStyles: { fillColor: headerColor, textColor: headerText, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          alternateRowStyles: { fillColor: [248, 250, 251] },
          margin: { left: 14, right: 14 },
        })
      }

      addSection('Por Área', data.by_area)
      addSection('Por Cargo', data.by_role)
      addSection('Por Vínculo', data.by_employment_type)
      addSection('Por Gênero', data.by_gender)
      addSection('Por Raça/Cor', data.by_race_color)

      const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...bodyText)
      doc.text('Linha do Tempo de Respostas', 14, lastY + 10)
      autoTable(doc, {
        startY: lastY + 14,
        head: [['Data', 'Respostas no Dia']],
        body: data.responses_by_day.map((r: { date: string; count: number }) => [r.date, r.count]),
        headStyles: { fillColor: headerColor, textColor: headerText, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 251] },
        margin: { left: 14, right: 14 },
      })

      doc.save(`relatorio-adesao-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
    } finally {
      setReportLoading(false)
    }
  }

  function handleDownloadXLSX() {
    setReportMenuOpen(false)
    const q = buildQuery()
    window.open('/api/dashboard/report?format=xlsx' + (q ? '&' + q : ''), '_blank')
  }

  function handleDownloadRiskCSV() {
    setReportMenuOpen(false)
    const q = buildQuery()
    window.open('/api/dashboard/export-risk' + (q ? '?' + q : ''), '_blank')
  }

  useEffect(() => {
    fetch('/api/dashboard/filters')
      .then((r) => r.json())
      .then((d) => {
        const keys: string[] = Array.isArray(d?.available_filters) ? d.available_filters : []
        const options: Record<string, string[]> = d?.options && typeof d.options === 'object' ? d.options : {}
        const labels: Record<string, string> = d?.labels && typeof d.labels === 'object' ? d.labels : {}
        setAvailableFilters(keys)
        setFilterOptions(options)
        setFilterLabels((prev) => ({ ...prev, ...labels }))
        setFilters((prev) => {
          const next: Record<string, string> = {}
          for (const key of keys) next[key] = prev[key] ?? ''
          return next
        })
      })
      .catch(() => {})
  }, [])

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v)
    }
    return params.toString()
  }, [filters])

  const handleFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, ''])))
  }

  const canSuperuser = !!managerDisplay && isMappingSuperuser(managerDisplay.role, managerDisplay.mapping_role ?? null)
  const canAdmin = !!managerDisplay && isMappingAdmin(managerDisplay.role, managerDisplay.mapping_role ?? null)

  const activeCount = Object.values(filters).filter(Boolean).length
  const reportRiskFilters = {
    area: filters.area ?? '',
    role: filters.role ?? '',
    gender: filters.gender ?? '',
    race_color: filters.race_color ?? '',
    employment_type: filters.employment_type ?? '',
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <header className="border-b px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between gap-3" style={{ borderColor: T.border, backgroundColor: T.surface }}>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-xl font-semibold tracking-tight leading-snug">Dashboard de Riscos Psicossociais</h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: T.textMuted }}>{BRAND_NAME}</p>
        </div>

        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <ThemeToggle />

          <div className="relative" ref={reportMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReportMenuOpen((v) => !v)}
              loading={reportLoading}
            >
              {reportLoading ? 'Gerando...' : 'Relatório'}
            </Button>
            <AnimatePresence>
              {reportMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="absolute right-0 mt-1 w-48 rounded-xl shadow-lg py-1 z-50"
                  style={{ backgroundColor: T.menuBg, border: `1px solid ${T.border}` }}
                >
                  <p className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Exportar Relatório de Adesão</p>
                  <button onClick={handleDownloadXLSX} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: T.text }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>Baixar Excel (.xlsx)</button>
                  <button onClick={handleDownloadPDF} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: T.text }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>Baixar PDF</button>
                  {canSuperuser && (
                    <>
                      <div style={{ margin: '6px 16px', borderTop: `1px solid ${T.border}` }} />
                      <p className="px-4 pb-1 text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Superuser — Dados de Risco</p>
                      <button onClick={handleDownloadRiskCSV} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: T.text }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>Exportar Riscos (.csv)</button>
                      <button onClick={() => { setReportMenuOpen(false); setReportRiskModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: T.text }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>Relatório de Risco (.pptx)</button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros ({activeCount})
            </Button>
          )}

          {canAdmin && <a href="/admin/upload" className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors" style={{ backgroundColor: T.surface, border: `1px solid ${T.adminBorder}`, color: T.adminText }} onMouseEnter={(e) => { e.currentTarget.style.color = BRAND_COLORS.primary; e.currentTarget.style.borderColor = BRAND_COLORS.primary }} onMouseLeave={(e) => { e.currentTarget.style.color = T.adminText; e.currentTarget.style.borderColor = T.adminBorder }}>Importar CSV</a>}
          {managerDisplay?.role === 'superuser' && <a href="/admin/managers" className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors" style={{ backgroundColor: T.surface, border: `1px solid ${T.adminBorder}`, color: T.adminText }} onMouseEnter={(e) => { e.currentTarget.style.color = BRAND_COLORS.primary; e.currentTarget.style.borderColor = BRAND_COLORS.primary }} onMouseLeave={(e) => { e.currentTarget.style.color = T.adminText; e.currentTarget.style.borderColor = T.adminBorder }}>Gestores</a>}

          {managerDisplay && (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors" style={{ backgroundColor: menuOpen ? T.clearBtn : 'transparent', color: T.text }} onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = T.menuHover }} onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = 'transparent' }}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}>{managerDisplay.name.charAt(0).toUpperCase() || '?'}</span>
                <span className="font-medium">{managerDisplay.name || managerDisplay.email}</span>
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className="absolute right-0 mt-1 w-56 rounded-xl shadow-lg py-1 z-50"
                    style={{ backgroundColor: T.menuBg, border: `1px solid ${T.border}` }}
                  >
                    <div className="px-4 py-3 border-b" style={{ borderColor: T.border }}>
                      <p className="text-sm font-semibold" style={{ color: T.text }}>{managerDisplay.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{managerDisplay.email}</p>
                    </div>
                    <button onClick={handleGoToResetPassword} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: T.text }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>Redefinir senha</button>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: BRAND_COLORS.danger }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${BRAND_COLORS.danger}15` }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>Sair</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="flex sm:hidden items-center gap-1 flex-shrink-0">
          <ThemeToggle />
          <button onClick={() => setMobileMenuOpen((v) => !v)} className="p-2 rounded-lg transition-colors" style={{ backgroundColor: mobileMenuOpen ? T.clearBtn : 'transparent', color: T.text }} aria-label="Menu">
            {mobileMenuOpen ? '×' : '☰'}
          </button>
        </div>
      </header>

      {mobileMenuOpen && managerDisplay && (
        <div className="sm:hidden border-b" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: T.border }}>
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}>{managerDisplay.name.charAt(0).toUpperCase() || '?'}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: T.text }}>{managerDisplay.name}</p>
              <p className="text-xs truncate" style={{ color: T.textMuted }}>{managerDisplay.email}</p>
            </div>
          </div>
          <div className="px-4 py-2 flex flex-col gap-0.5">
            {activeCount > 0 && <button onClick={() => { clearFilters(); setMobileMenuOpen(false) }} className="w-full text-left text-sm px-3 py-2.5 rounded-lg" style={{ color: T.clearBtnText }}>Limpar filtros ({activeCount})</button>}
            <button onClick={() => { setMobileMenuOpen(false); handleDownloadXLSX() }} className="w-full text-left text-sm px-3 py-2.5 rounded-lg" style={{ color: T.adminText }}>Relatório Excel</button>
            <button onClick={() => { setMobileMenuOpen(false); handleDownloadPDF() }} className="w-full text-left text-sm px-3 py-2.5 rounded-lg" style={{ color: T.adminText }}>{reportLoading ? 'Gerando PDF...' : 'Relatório PDF'}</button>
            {canAdmin && <a href="/admin/upload" className="text-sm px-3 py-2.5 rounded-lg" style={{ color: T.adminText }} onClick={() => setMobileMenuOpen(false)}>Importar CSV</a>}
            {managerDisplay.role === 'superuser' && <a href="/admin/managers" className="text-sm px-3 py-2.5 rounded-lg" style={{ color: T.adminText }} onClick={() => setMobileMenuOpen(false)}>Gestores</a>}
            <button onClick={handleGoToResetPassword} className="w-full text-left text-sm px-3 py-2.5 rounded-lg" style={{ color: T.textMuted }}>Redefinir senha</button>
            <button onClick={() => { setMobileMenuOpen(false); handleLogout() }} className="w-full text-left text-sm px-3 py-2.5 rounded-lg" style={{ color: BRAND_COLORS.danger }}>Sair</button>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-3 border-b" style={{ borderColor: T.border, backgroundColor: T.surface }}>
        {availableFilters.map((key) => {
          return (
            <FilterDropdown
              key={key}
              label={filterLabels[key] ?? key}
              value={filters[key] ?? ''}
              options={filterOptions[key] ?? []}
              onChange={(v) => handleFilter(key, v)}
            />
          )
        })}
      </div>

      <div className="px-4 sm:px-6 pt-4 border-b overflow-x-auto" style={{ borderColor: T.border }}>
        <div className="relative flex gap-1 min-w-max">
          <div aria-hidden style={{ position: 'absolute', bottom: 0, left: tabIndicator.left, width: tabIndicator.width, height: '100%', backgroundColor: BRAND_COLORS.primary, borderRadius: '6px 6px 0 0', transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s cubic-bezier(0.4,0,0.2,1)', zIndex: 0 }} />
          {tabs.map((tab) => (
            <button key={tab.id} ref={(el) => { tabRefs.current[tab.id] = el }} onClick={() => setActiveTab(tab.id)} className="relative px-4 py-2 text-sm font-medium rounded-t-md whitespace-nowrap flex-shrink-0 transition-colors" style={{ color: activeTab === tab.id ? '#FFFFFF' : T.textMuted, backgroundColor: 'transparent', zIndex: 1 }} onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = T.text }} onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = T.textMuted }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="p-4 sm:p-6 max-w-full overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {activeTab === 'overview' && <OverviewTab query={buildQuery()} />}
            {activeTab === 'demographics' && <DemographicsTab query={buildQuery()} chartKeys={dashboardConfig.demographic_columns} chartLabels={dashboardConfig.field_labels} />}
            {activeTab === 'hse' && <HseTab query={buildQuery()} />}
            {activeTab === 'remote' && <RemoteTab query={buildQuery()} />}
            {activeTab === 'mental_health' && <MentalHealthTab query={buildQuery()} />}
            {activeTab === 'insights' && <InsightsTab query={buildQuery()} isSuperuser={canSuperuser} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {reportRiskModalOpen && <ReportRiskModal filters={reportRiskFilters} theme={T} isDark={isDark} onClose={() => setReportRiskModalOpen(false)} />}
    </div>
  )
}
