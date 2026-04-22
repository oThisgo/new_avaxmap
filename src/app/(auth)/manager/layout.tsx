import { ThemeProvider } from '@/components/ThemeProvider'

export default function ManagerAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflowY: 'auto' }}>
      <ThemeProvider>{children}</ThemeProvider>
    </div>
  )
}
