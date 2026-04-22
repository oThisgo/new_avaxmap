import { ThemeProvider } from '@/components/ThemeProvider'

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  )
}

