import { ThemeProvider } from '@/components/ThemeProvider'

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ThemeProvider>{children}</ThemeProvider>
  )
}
