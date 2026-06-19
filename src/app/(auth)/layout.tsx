import { ThemeProvider } from '@/components/ThemeProvider'

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ThemeProvider>{children}</ThemeProvider>
  )
}
