'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'dark' | 'light'
const THEME_KEY = 'beetouch-theme'
const LEGACY_MANAGER_THEME_KEY = 'manager-theme'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_MANAGER_THEME_KEY)) as Theme | null
    if (stored === 'light' || stored === 'dark') setTheme(stored)
  }, [])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(LEGACY_MANAGER_THEME_KEY, theme)
  }, [theme])

  function toggle() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  const contextValue = useMemo(() => ({ theme, toggle }), [theme])

  return (
    <ThemeContext.Provider value={contextValue}>
      <div data-theme={theme} className={theme === 'dark' ? 'dark' : ''} style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
