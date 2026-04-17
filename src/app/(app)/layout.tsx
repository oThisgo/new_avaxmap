export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#111111] text-white overflow-hidden">
      {children}
    </div>
  )
}
