export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#111111', color: '#FFFFFF' }}>
      {children}
    </div>
  )
}
