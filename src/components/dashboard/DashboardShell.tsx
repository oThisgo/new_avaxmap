'use client'

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type jsPDFType from 'jspdf'
import OverviewTab from './tabs/OverviewTab'
import DemographicsTab from './tabs/DemographicsTab'
import HseTab from './tabs/HseTab'
import RemoteTab from './tabs/RemoteTab'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

interface ThemeTokens {
  surface: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  menuHover: string
  menuBg: string
}

function FilterDropdown({
  label, value, options, onChange, T,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  T: ThemeTokens
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <span className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>{label}</span>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-lg transition-all w-full sm:min-w-[150px]"
        style={{
          backgroundColor: T.surface,
          border: `1px solid ${open ? '#F5C200' : T.border}`,
          color: value ? T.text : T.textMuted,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.textMuted }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.border }}
      >
        <span className="truncate max-w-[120px] sm:max-w-[160px]">{value || 'Todos'}</span>
        <svg
          width="10" height="10" viewBox="0 0 12 12" fill="currentColor"
          style={{ opacity: 0.45, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <path d="M6 8L1 3h10z" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-xl shadow-xl py-1 z-40"
          style={{
            backgroundColor: T.menuBg,
            border: `1px solid ${T.border}`,
            minWidth: '100%',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {(['', ...options]).map((opt) => (
            <button
              key={opt || '__all__'}
              onClick={() => { onChange(opt); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors"
              style={{ color: opt === value ? '#F5C200' : T.text, fontWeight: opt === value ? 600 : 400 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <span className="truncate">{opt || 'Todos'}</span>
              {opt === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5C200" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  employment_type: string[]
}

interface ActiveFilters {
  area: string
  role: string
  gender: string
  race_color: string
  employment_type: string
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
    area: [], role: [], gender: [], race_color: [], employment_type: [],
  })
  const [filters, setFilters] = useState<ActiveFilters>({
    area: '', role: '', gender: '', race_color: '', employment_type: '',
  })
  const [managerDisplay, setManagerDisplay] = useState<{ name: string; email: string; role: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const reportMenuRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab]
    if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeTab])

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

  // Fecha menus ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setReportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/manager', { method: 'DELETE' })
    router.push('/manager/login')
  }

  async function handleDownloadPDF() {
    setReportLoading(true)
    setReportMenuOpen(false)
    try {
      const res = await fetch('/api/dashboard/report?format=json')
      if (!res.ok) throw new Error('Falha ao buscar dados')
      const data = await res.json()

      const { default: jsPDF } = await import('jspdf') as unknown as { default: typeof jsPDFType }
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF()
      const dateStr = new Date().toLocaleDateString('pt-BR')
      const HEADER_COLOR: [number, number, number] = [245, 194, 0]
      const TEXT_DARK: [number, number, number] = [17, 17, 17]

      // Cabeçalho
      doc.setFillColor(...HEADER_COLOR)
      doc.rect(0, 0, 210, 18, 'F')
      doc.setFontSize(13)
      doc.setTextColor(...TEXT_DARK)
      doc.setFont('helvetica', 'bold')
      doc.text('Relatório de Adesão — Instituto Alana', 14, 12)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text(`Gerado em ${dateStr}  •  Dados de participação apenas (sem dados de risco)`, 14, 22)

      // Resumo
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...TEXT_DARK)
      doc.text('Resumo Geral', 14, 32)

      autoTable(doc, {
        startY: 36,
        head: [['Total de Colaboradores', 'Responderam', 'Taxa de Adesão']],
        body: [[data.summary.total, data.summary.answered, `${data.summary.pct}%`]],
        headStyles: { fillColor: HEADER_COLOR, textColor: TEXT_DARK, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 },
      })

      const addSection = (title: string, rows: { name: string; total: number; answered: number; pct: number }[]) => {
        const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...TEXT_DARK)
        doc.text(title, 14, lastY + 10)
        autoTable(doc, {
          startY: lastY + 14,
          head: [['Categoria', 'Total', 'Responderam', 'Adesão (%)']],
          body: rows.map((r) => [r.name, r.total, r.answered, `${r.pct}%`]),
          headStyles: { fillColor: HEADER_COLOR, textColor: TEXT_DARK, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          alternateRowStyles: { fillColor: [248, 248, 248] },
          margin: { left: 14, right: 14 },
        })
      }

      addSection('Por Área', data.by_area)
      addSection('Por Cargo', data.by_role)
      addSection('Por Vínculo', data.by_employment_type)
      addSection('Por Gênero', data.by_gender)
      addSection('Por Raça/Cor', data.by_race_color)

      // Linha do tempo
      const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...TEXT_DARK)
      doc.text('Linha do Tempo de Respostas', 14, lastY + 10)
      autoTable(doc, {
        startY: lastY + 14,
        head: [['Data', 'Respostas no Dia']],
        body: data.responses_by_day.map((r: { date: string; count: number }) => [r.date, r.count]),
        headStyles: { fillColor: HEADER_COLOR, textColor: TEXT_DARK, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 248, 248] },
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
    window.open('/api/dashboard/report?format=xlsx', '_blank')
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
    setFilters({ area: '', role: '', gender: '', race_color: '', employment_type: '' })
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

          {/* Botão Relatório de Adesão */}
          <div className="relative" ref={reportMenuRef}>
            <button
              onClick={() => setReportMenuOpen((v) => !v)}
              disabled={reportLoading}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: T.surface, border: `1px solid ${T.adminBorder}`, color: T.adminText, opacity: reportLoading ? 0.6 : 1 }}
              onMouseEnter={(e) => { if (!reportLoading) { e.currentTarget.style.color = '#F5C200'; e.currentTarget.style.borderColor = '#F5C200' } }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.adminText; e.currentTarget.style.borderColor = T.adminBorder }}
            >
              {reportLoading ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              )}
              {reportLoading ? 'Gerando...' : 'Relatório'}
            </button>
            {reportMenuOpen && (
              <div
                className="absolute right-0 mt-1 w-48 rounded-xl shadow-lg py-1 z-50"
                style={{ backgroundColor: T.menuBg, border: `1px solid ${T.border}` }}
              >
                <p className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Exportar Relatório de Adesão</p>
                <button
                  onClick={handleDownloadXLSX}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
                  style={{ color: T.text }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  Baixar Excel (.xlsx)
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
                  style={{ color: T.text }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.menuHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <rect x="8" y="12" width="8" height="6" />
                  </svg>
                  Baixar PDF
                </button>
              </div>
            )}
          </div>
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
                <button
                  onClick={() => { setMobileMenuOpen(false); handleDownloadXLSX() }}
                  className="w-full text-left flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg"
                  style={{ color: T.adminText }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  Relatório Excel
                </button>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleDownloadPDF() }}
                  disabled={reportLoading}
                  className="w-full text-left flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg"
                  style={{ color: T.adminText, opacity: reportLoading ? 0.6 : 1 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <rect x="8" y="12" width="8" height="6" />
                  </svg>
                  {reportLoading ? 'Gerando PDF...' : 'Relatório PDF'}
                </button>
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
      <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-3 border-b" style={{ borderColor: T.border, backgroundColor: T.surface }}>
        {(['area', 'role', 'employment_type', 'gender', 'race_color'] as const).map((key) => {
          const LABELS: Record<string, string> = { area: 'Área', role: 'Cargo', employment_type: 'Vínculo', gender: 'Gênero', race_color: 'Raça/Cor' }
          return (
            <FilterDropdown
              key={key}
              label={LABELS[key]}
              value={filters[key]}
              options={filterOptions[key]}
              onChange={(v) => handleFilter(key, v)}
              T={T}
            />
          )
        })}
      </div>

      {/* Abas */}
      <div className="px-4 sm:px-6 pt-4 border-b overflow-x-auto" style={{ borderColor: T.border }}>
        <div className="relative flex gap-1 min-w-max">
          {/* Indicador deslizante */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 0,
              left: tabIndicator.left,
              width: tabIndicator.width,
              height: '100%',
              backgroundColor: '#F5C200',
              borderRadius: '6px 6px 0 0',
              transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 0,
            }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el }}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-2 text-sm font-medium rounded-t-md whitespace-nowrap flex-shrink-0 transition-colors"
              style={{
                color: activeTab === tab.id ? '#111111' : T.textMuted,
                backgroundColor: 'transparent',
                zIndex: 1,
              }}
              onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = T.text }}
              onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = T.textMuted }}
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
