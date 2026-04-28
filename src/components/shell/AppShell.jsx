import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { RailNav } from './RailNav.jsx'
import { MobileShell } from './MobileShell.jsx'

export function AppShell() {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <MobileShell />
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-[56px_1fr] grid-rows-[1fr] h-screen">
        <RailNav />
        <main className="overflow-auto">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
