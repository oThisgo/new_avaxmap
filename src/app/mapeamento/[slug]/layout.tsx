import { ThemeProvider } from '@/components/ThemeProvider'

export default function MappingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <ThemeProvider>{children}</ThemeProvider>
}
